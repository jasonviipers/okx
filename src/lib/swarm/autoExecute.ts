import "server-only";

import { performance } from "node:perf_hooks";
import { env } from "@/env";
import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import { getMarketSnapshot } from "@/lib/market-data/service";
import { clamp } from "@/lib/math-utils";
import { getAccountOverview } from "@/lib/okx/account";
import { getInstrumentRules, normalizeOrderSize } from "@/lib/okx/instruments";
import { getTicker } from "@/lib/okx/market";
import { getPositions } from "@/lib/okx/orders";
import {
  createExecutionIntent,
  finalizeExecutionIntent,
  updateExecutionIntent,
} from "@/lib/persistence/execution-intents";
import { getHistory, upsertOutcomeWindow } from "@/lib/persistence/history";
import { cacheGet, cacheIncrement, cacheSet } from "@/lib/redis/client";
import { nowIso, parseBoolean, parseNumber } from "@/lib/runtime-utils";
import { upsertOpenPosition } from "@/lib/store/open-positions";
import { SWARM_THRESHOLDS } from "@/lib/swarm/thresholds";
import { getTrailingStopDistancePct } from "@/lib/swarm/trailing-stop";
import {
  incrementCounter,
  observeHistogram,
  error as telemetryError,
  info as telemetryInfo,
  warn as telemetryWarn,
  withTelemetrySpan,
} from "@/lib/observability/telemetry";
import type {
  DecisionResult,
  ExecutionResult,
  RejectionReason,
  TradeSignal,
} from "@/types/swarm";
import type { TradeDecisionSnapshot } from "@/types/trade";

const DEFAULT_LIVE_TRADING_BUDGET_USD = 0;
const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_ERROR_LIMIT = 3;
const CIRCUIT_BREAKER_TTL_SECONDS = 120;
const EXECUTION_RESULT_CACHE_MAX_SIZE = 64;

const localCircuitOpenUntil = new Map<string, number>();
const executionErrorTimestamps = new Map<string, number[]>();
const executionResults = new Map<
  string,
  {
    decision: TradeSignal;
    recordedAt: number;
    result: ExecutionResult;
    validatedAt: string;
  }
>();

type ExitPlan = {
  stopLoss: number | null;
  takeProfitLevels: number[];
};

type ExitPlanPayload = {
  stop_loss?: number | null;
  stopLoss?: number | null;
  take_profit?: number[] | null;
  takeProfitLevels?: number[] | null;
  exitPlan?: {
    stop_loss?: number | null;
    stopLoss?: number | null;
    take_profit?: number[] | null;
    takeProfitLevels?: number[] | null;
  } | null;
};

function normalizeDecision(consensus: DecisionResult): TradeSignal {
  return consensus.decision ?? consensus.signal;
}

function confidencePercent(consensus: DecisionResult): number {
  return consensus.confidence <= 1
    ? consensus.confidence * 100
    : consensus.confidence;
}

function deriveSize(confidence: number, maxPositionUsd: number): number {
  return Number(((confidence / 100) * maxPositionUsd).toFixed(8));
}

function buildTradeDecisionSnapshot(
  consensus: DecisionResult,
): TradeDecisionSnapshot {
  return {
    signal: consensus.signal,
    directionalSignal: consensus.directionalSignal,
    decision: consensus.decision ?? consensus.signal,
    confidence: consensus.confidence,
    agreement: consensus.agreement,
    executionEligible: consensus.executionEligible,
    decisionSource: consensus.decisionSource,
    expectedNetEdgeBps: consensus.expectedNetEdgeBps,
    marketQualityScore: consensus.marketQualityScore,
    riskFlags: consensus.riskFlags,
    featureSummary: consensus.featureSummary,
    rejectionReasons: consensus.rejectionReasons,
    validatedAt: consensus.validatedAt,
  };
}

function mergeRejectionReasons(
  base: RejectionReason[],
  extra: RejectionReason[],
): RejectionReason[] {
  const seen = new Set<string>();

  return [...base, ...extra].filter((reason) => {
    const key = `${reason.layer}:${reason.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sanitizeTakeProfitLevels(
  direction: TradeSignal,
  levels: number[] | null | undefined,
): number[] {
  const directionLabel = direction === "SELL" ? "SELL" : "BUY";
  const validLevels = (levels ?? []).filter(
    (level) => Number.isFinite(level) && level > 0,
  );
  const uniqueLevels = [
    ...new Set(validLevels.map((level) => level.toFixed(8))),
  ].map((level) => Number(level));

  return uniqueLevels
    .sort((left, right) =>
      directionLabel === "BUY" ? left - right : right - left,
    )
    .slice(0, 3);
}

function deriveFallbackExitPlan(
  consensus: DecisionResult,
  decision: TradeSignal,
  referencePrice: number,
): ExitPlan {
  const direction = decision === "SELL" ? "SELL" : "BUY";
  const volatilityLongBps =
    consensus.featureSummary?.volatilityLongBps ??
    consensus.featureSummary?.volatilityShortBps ??
    80;
  const marketQualityScore = consensus.marketQualityScore ?? 0.6;
  const volatilityPct = Math.max(0.4, volatilityLongBps / 100);
  const stopDistancePct = clamp(
    volatilityPct * (marketQualityScore >= 0.7 ? 1.4 : 1.8),
    0.75,
    3,
  );
  const rewardMultipliers = [1, 1.8, 2.6];
  const stopLoss =
    direction === "BUY"
      ? Number((referencePrice * (1 - stopDistancePct / 100)).toFixed(8))
      : Number((referencePrice * (1 + stopDistancePct / 100)).toFixed(8));
  const takeProfitLevels = rewardMultipliers.map((multiplier) => {
    const movePct = (stopDistancePct * multiplier) / 100;
    return direction === "BUY"
      ? Number((referencePrice * (1 + movePct)).toFixed(8))
      : Number((referencePrice * (1 - movePct)).toFixed(8));
  });

  return {
    stopLoss,
    takeProfitLevels: sanitizeTakeProfitLevels(direction, takeProfitLevels),
  };
}

function getOptionalFiniteNumber(
  value: object,
  key: keyof ExitPlanPayload["exitPlan"] | keyof ExitPlanPayload,
): number | null | undefined {
  const candidate = Reflect.get(value, key);
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : candidate === null
      ? null
      : undefined;
}

function getOptionalNumberArray(
  value: object,
  key: keyof ExitPlanPayload["exitPlan"] | keyof ExitPlanPayload,
): number[] | null | undefined {
  const candidate = Reflect.get(value, key);
  if (candidate === null) {
    return null;
  }
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  return candidate.filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isFinite(entry),
  );
}

function getExitPlanPayload(
  consensus: DecisionResult,
): ExitPlanPayload["exitPlan"] | null {
  const exitPlan = Reflect.get(consensus, "exitPlan");
  return exitPlan && typeof exitPlan === "object"
    ? (exitPlan as ExitPlanPayload["exitPlan"])
    : null;
}

function resolveExitPlan(
  consensus: DecisionResult,
  decision: TradeSignal,
  referencePrice: number,
): ExitPlan {
  const nestedExitPlan = getExitPlanPayload(consensus);
  const explicitStopLoss =
    getOptionalFiniteNumber(consensus, "stopLoss") ??
    getOptionalFiniteNumber(consensus, "stop_loss") ??
    (nestedExitPlan
      ? (getOptionalFiniteNumber(nestedExitPlan, "stopLoss") ??
        getOptionalFiniteNumber(nestedExitPlan, "stop_loss"))
      : undefined) ??
    null;
  const explicitTakeProfits = sanitizeTakeProfitLevels(
    decision,
    getOptionalNumberArray(consensus, "takeProfitLevels") ??
      getOptionalNumberArray(consensus, "take_profit") ??
      (nestedExitPlan
        ? (getOptionalNumberArray(nestedExitPlan, "takeProfitLevels") ??
          getOptionalNumberArray(nestedExitPlan, "take_profit"))
        : undefined) ??
      null,
  );
  const fallbackPlan = deriveFallbackExitPlan(
    consensus,
    decision,
    referencePrice,
  );

  return {
    stopLoss:
      explicitStopLoss !== null &&
      Number.isFinite(explicitStopLoss) &&
      explicitStopLoss > 0
        ? explicitStopLoss
        : fallbackPlan.stopLoss,
    takeProfitLevels:
      explicitTakeProfits.length > 0
        ? explicitTakeProfits
        : fallbackPlan.takeProfitLevels,
  };
}

async function persistManagedOpenPosition(input: {
  consensus: DecisionResult;
  decision: TradeSignal;
  order: NonNullable<ExecutionResult["order"]>;
  normalizedSize: number;
  entryPrice: number;
  exitPlan: ExitPlan;
}) {
  if (input.decision !== "BUY" || input.normalizedSize <= 0) {
    return;
  }

  const timestamp = Date.now();
  const orderId = input.order.okxOrderId ?? input.order.id;
  await upsertOpenPosition({
    orderId,
    instId: input.consensus.symbol,
    direction: input.decision,
    entryPrice: input.entryPrice,
    size: input.normalizedSize,
    remainingSize: input.normalizedSize,
    stopLoss: input.exitPlan.stopLoss,
    takeProfitLevels: input.exitPlan.takeProfitLevels,
    tpHitCount: 0,
    trailingStopActive: false,
    trailingStopPrice: null,
    trailingStopAnchorPrice: null,
    trailingStopDistancePct: getTrailingStopDistancePct(),
    exchangePositionMissingCount: 0,
    lastKnownPrice: input.entryPrice,
    lastCheckedAt: timestamp,
    timestamp,
    updatedAt: timestamp,
  });
  telemetryInfo(
    "swarm.auto_execute",
    "Persisted managed open position for automated exits",
    {
      entryPrice: input.entryPrice,
      orderId,
      size: input.normalizedSize,
      stopLoss: input.exitPlan.stopLoss,
      symbol: input.consensus.symbol,
      takeProfitLevels: input.exitPlan.takeProfitLevels,
    },
  );
}

async function persistOutcomeWindowEntry(input: {
  consensus: DecisionResult;
  decision: TradeSignal;
  order: NonNullable<ExecutionResult["order"]>;
  entryPrice: number;
}) {
  if (input.decision === "HOLD") {
    return;
  }

  const orderId = input.order.okxOrderId ?? input.order.id;
  await upsertOutcomeWindow({
    orderId,
    symbol: input.consensus.symbol,
    direction: input.decision,
    entryPrice: input.entryPrice,
    entryTime:
      input.order.filledAt ?? input.order.createdAt ?? new Date().toISOString(),
    returnAt5m: null,
    returnAt15m: null,
    returnAt1h: null,
    returnAt4h: null,
    exitPrice: null,
    exitTime: null,
    realizedPnl: null,
    realizedSlippageBps: null,
    featureSnapshot: input.consensus.featureSummary ?? {},
    decisionConfidence: input.consensus.confidence,
    expectedNetEdgeBps: input.consensus.expectedNetEdgeBps ?? 0,
    regime: input.consensus.regime.regime,
    selectedEngine: input.consensus.metaSelection.selectedEngine,
    updatedAt: new Date().toISOString(),
  });
}

function buildHoldResult(input: {
  timestamp: string;
  symbol: string;
  decision: TradeSignal;
  size: number;
  reason: string;
  response?: Record<string, unknown>;
  rejectionReasons?: RejectionReason[];
}): ExecutionResult {
  return {
    status: "hold",
    timestamp: input.timestamp,
    symbol: input.symbol,
    decision: input.decision,
    size: input.size,
    reason: input.reason,
    response: input.response,
    rejectionReasons: input.rejectionReasons,
  };
}

function buildErrorResult(input: {
  timestamp: string;
  symbol: string;
  decision: TradeSignal;
  size: number;
  error: string;
  response?: Record<string, unknown>;
  circuitOpen?: boolean;
  rejectionReasons?: RejectionReason[];
}): ExecutionResult {
  return {
    status: "error",
    timestamp: input.timestamp,
    symbol: input.symbol,
    decision: input.decision,
    size: input.size,
    error: input.error,
    response: input.response,
    circuitOpen: input.circuitOpen,
    rejectionReasons: input.rejectionReasons,
  };
}

async function deriveExecutableSize(
  decision: TradeSignal,
  symbol: string,
  targetNotionalUsd: number,
): Promise<{
  size: number;
  reason?: string;
  response: Record<string, unknown>;
}> {
  const [overview, ticker] = await Promise.all([
    getAccountOverview(symbol),
    getTicker(symbol),
  ]);
  const maxBalanceUsagePct = parseNumber(
    env.MAX_BALANCE_USAGE_PCT,
    SWARM_THRESHOLDS.DEFAULT_MAX_BALANCE_USAGE_PCT,
  );
  const minTradeNotional = parseNumber(
    env.MIN_TRADE_NOTIONAL,
    SWARM_THRESHOLDS.DEFAULT_MIN_TRADE_NOTIONAL,
  );

  if (decision === "BUY") {
    const availableQuote = overview.buyingPower.buy * maxBalanceUsagePct;
    const notional = Math.min(targetNotionalUsd, availableQuote);
    if (notional < minTradeNotional || ticker.ask <= 0) {
      return {
        size: 0,
        reason: "insufficient quote buying power for live buy",
        response: {
          availableQuote,
          minTradeNotional,
          quoteCurrency: overview.buyingPower.quoteCurrency,
        },
      };
    }

    return {
      size: Number((notional / ticker.ask).toFixed(8)),
      response: {
        availableQuote,
        notional,
        quoteCurrency: overview.buyingPower.quoteCurrency,
        derivedFrom: "quote-buying-power",
      },
    };
  }

  const availableBase = overview.buyingPower.sell * maxBalanceUsagePct;
  const targetBaseSize = ticker.bid > 0 ? targetNotionalUsd / ticker.bid : 0;
  const size = Math.min(availableBase, targetBaseSize);
  const notional = size * ticker.bid;

  if (notional < minTradeNotional || size <= 0) {
    return {
      size: 0,
      reason: "insufficient base inventory for live sell",
      response: {
        availableBase,
        minTradeNotional,
        baseCurrency: overview.buyingPower.baseCurrency,
      },
    };
  }

  return {
    size: Number(size.toFixed(8)),
    response: {
      availableBase,
      notional,
      baseCurrency: overview.buyingPower.baseCurrency,
      derivedFrom: "base-inventory",
    },
  };
}

async function checkExecutionRiskGuards(
  consensus: DecisionResult,
  decision: TradeSignal,
): Promise<{
  allowed: boolean;
  reason?: string;
  response?: Record<string, unknown>;
}> {
  const maxDailyTrades = parseNumber(
    env.MAX_DAILY_TRADES,
    SWARM_THRESHOLDS.DEFAULT_MAX_DAILY_TRADES,
  );
  const history = await getHistory(200);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const dailyTrades = history.filter(
    (entry) =>
      entry.type === "trade_execution" &&
      new Date(entry.timestamp).getTime() >= since,
  ).length;

  if (dailyTrades >= maxDailyTrades) {
    return {
      allowed: false,
      reason: "daily trade limit reached",
      response: { dailyTrades, maxDailyTrades },
    };
  }

  const liveTradingBudgetUsd = parseNumber(
    env.LIVE_TRADING_BUDGET_USD,
    DEFAULT_LIVE_TRADING_BUDGET_USD,
  );
  if (getOkxAccountModeLabel() === "live" && liveTradingBudgetUsd > 0) {
    const usedBudgetUsd = history.reduce((sum, entry) => {
      if (
        entry.type !== "trade_execution" ||
        new Date(entry.timestamp).getTime() < since
      ) {
        return sum;
      }

      return sum + (entry.order.notionalUsd ?? 0);
    }, 0);

    if (usedBudgetUsd >= liveTradingBudgetUsd) {
      return {
        allowed: false,
        reason: "live trading budget exhausted",
        response: {
          liveTradingBudgetUsd,
          usedBudgetUsd: Number(usedBudgetUsd.toFixed(2)),
        },
      };
    }
  }

  const positions = await getPositions().catch(() => []);
  const existing = positions.find(
    (position) => position.symbol === consensus.symbol,
  );
  if (
    existing &&
    ((existing.side === "buy" && decision === "BUY") ||
      (existing.side === "sell" && decision === "SELL"))
  ) {
    return {
      allowed: false,
      reason: "existing same-direction position already open",
      response: {
        existingSide: existing.side,
        size: existing.size,
      },
    };
  }

  return { allowed: true };
}

function getExecutionCircuitKey(symbol: string): string {
  return `circuit:execution:${symbol}`;
}

function getExecutionCircuitErrorKey(symbol: string): string {
  return `circuit:execution-errors:${symbol}`;
}

function isLocalCircuitOpen(symbol: string): boolean {
  const openUntil = localCircuitOpenUntil.get(symbol);
  if (!openUntil) {
    return false;
  }

  if (openUntil <= Date.now()) {
    localCircuitOpenUntil.delete(symbol);
    return false;
  }

  return true;
}

async function openExecutionCircuit(symbol: string) {
  localCircuitOpenUntil.set(
    symbol,
    Date.now() + CIRCUIT_BREAKER_TTL_SECONDS * 1_000,
  );
  await cacheSet(
    getExecutionCircuitKey(symbol),
    "open",
    CIRCUIT_BREAKER_TTL_SECONDS,
  );
}

async function recordExecutionError(
  symbol: string,
  timestamp: number,
): Promise<void> {
  const recentErrors = (executionErrorTimestamps.get(symbol) ?? []).filter(
    (value) => timestamp - value <= CIRCUIT_BREAKER_WINDOW_MS,
  );
  recentErrors.push(timestamp);
  executionErrorTimestamps.set(symbol, recentErrors);
  incrementCounter(
    "auto_execution_errors_total",
    "Total autonomous execution errors.",
  );

  const sharedErrorCount = await cacheIncrement(
    getExecutionCircuitErrorKey(symbol),
    Math.ceil(CIRCUIT_BREAKER_WINDOW_MS / 1_000),
  );

  if (
    recentErrors.length >= CIRCUIT_BREAKER_ERROR_LIMIT ||
    sharedErrorCount >= CIRCUIT_BREAKER_ERROR_LIMIT
  ) {
    await openExecutionCircuit(symbol);
    telemetryError(
      "swarm.auto_execute",
      "Circuit breaker opened after repeated execution errors",
      {
        errorsInWindow: Math.max(recentErrors.length, sharedErrorCount),
        symbol,
        windowMs: CIRCUIT_BREAKER_WINDOW_MS,
      },
    );
    console.error(
      `[${nowIso()}] [AutoExec] CRITICAL: circuit breaker opened for ${symbol} after ${Math.max(recentErrors.length, sharedErrorCount)} execution errors within 60 seconds`,
    );
  }
}

export async function isExecutionCircuitOpen(symbol: string): Promise<boolean> {
  if (isLocalCircuitOpen(symbol)) {
    return true;
  }

  const sharedState = await cacheGet(getExecutionCircuitKey(symbol));
  if (sharedState === "open") {
    localCircuitOpenUntil.set(
      symbol,
      Date.now() + CIRCUIT_BREAKER_TTL_SECONDS * 1_000,
    );
    return true;
  }

  return false;
}

export async function recordExecutionCircuitError(symbol: string) {
  await recordExecutionError(symbol, Date.now());
}

function logResult(result: ExecutionResult) {
  const payload = {
    symbol: result.symbol,
    decision: result.decision,
    size: result.size,
    status: result.status,
    reason: result.reason,
    error: result.error,
    response: result.response,
    order: result.order,
    rejectionReasons: result.rejectionReasons,
  };

  if (result.status === "success") {
    telemetryInfo(
      "swarm.auto_execute",
      "Autonomous execution completed",
      payload,
    );
  } else if (result.status === "hold") {
    telemetryWarn("swarm.auto_execute", "Autonomous execution held", payload);
  } else {
    telemetryError(
      "swarm.auto_execute",
      "Autonomous execution failed",
      payload,
    );
  }

  console.log(
    `[${result.timestamp}] [AutoExec] symbol=${result.symbol} decision=${result.decision} size=${result.size} status=${result.status} response=${JSON.stringify(result.response ?? result.order ?? result.reason ?? result.error ?? null)}`,
  );
}

function getExecutionResultCacheKey(consensus: DecisionResult): string {
  return `${consensus.symbol}:${consensus.timeframe}`;
}

function pruneExecutionResults(now = Date.now()) {
  for (const [key, entry] of executionResults.entries()) {
    if (now - entry.recordedAt > CIRCUIT_BREAKER_WINDOW_MS) {
      executionResults.delete(key);
    }
  }

  if (executionResults.size <= EXECUTION_RESULT_CACHE_MAX_SIZE) {
    return;
  }

  const oldestFirst = [...executionResults.entries()].sort(
    (left, right) => left[1].recordedAt - right[1].recordedAt,
  );
  while (executionResults.size > EXECUTION_RESULT_CACHE_MAX_SIZE) {
    const oldest = oldestFirst.shift();
    if (!oldest) {
      break;
    }

    executionResults.delete(oldest[0]);
  }
}

function getDuplicateExecutionResult(
  consensus: DecisionResult,
  decision: TradeSignal,
) {
  pruneExecutionResults();
  const cached = executionResults.get(getExecutionResultCacheKey(consensus));
  if (!cached) {
    return undefined;
  }

  if (
    cached.validatedAt !== consensus.validatedAt ||
    cached.decision !== decision
  ) {
    return undefined;
  }

  return cached.result;
}

function cacheExecutionResult(
  consensus: DecisionResult,
  decision: TradeSignal,
  result: ExecutionResult,
) {
  pruneExecutionResults();
  executionResults.set(getExecutionResultCacheKey(consensus), {
    decision,
    recordedAt: Date.now(),
    result,
    validatedAt: consensus.validatedAt,
  });
}

function mapExecutionGuardReason(
  reason: string | undefined,
  response?: Record<string, unknown>,
): RejectionReason[] {
  switch (reason) {
    case "daily trade limit reached":
      return [
        {
          layer: "execution",
          code: "daily_trade_limit_reached",
          summary: "Daily trade limit reached.",
          detail: "The execution guard rejected the trade due to daily limits.",
          metrics: response,
        },
      ];
    case "live trading budget exhausted":
      return [
        {
          layer: "execution",
          code: "live_budget_exhausted",
          summary: "Live trading budget exhausted.",
          detail:
            "The execution guard rejected the trade due to budget limits.",
          metrics: response,
        },
      ];
    case "existing same-direction position already open":
      return [
        {
          layer: "execution",
          code: "same_direction_position_exists",
          summary: "A same-direction position is already open.",
          detail:
            "Execution was skipped to avoid stacking the same spot exposure.",
          metrics: response,
        },
      ];
    case "insufficient quote buying power for live buy":
      return [
        {
          layer: "execution",
          code: "insufficient_quote_buying_power",
          summary: "Insufficient quote buying power for BUY.",
          detail: "Available quote balance cannot support the target order.",
          metrics: response,
        },
      ];
    case "insufficient base inventory for live sell":
      return [
        {
          layer: "execution",
          code: "insufficient_base_inventory",
          summary: "Insufficient base inventory for SELL.",
          detail:
            "Spot execution cannot sell more base inventory than is available.",
          metrics: response,
        },
      ];
    case "instrument rules rejected the order size":
      return [
        {
          layer: "execution",
          code: "instrument_rules_rejected_size",
          summary: "Instrument rules rejected the order size.",
          detail:
            "Requested order size did not satisfy lot size, min size, or instrument state constraints.",
          metrics: response,
        },
      ];
    default:
      return reason
        ? [
            {
              layer: "execution",
              code: "execution_guard_rejected",
              summary: reason,
              metrics: response,
            },
          ]
        : [];
  }
}

export async function autoExecuteConsensus(
  consensus: DecisionResult,
  baseUrl: string,
): Promise<ExecutionResult> {
  return withTelemetrySpan(
    {
      name: "execution.auto_execute",
      source: "swarm.auto_execute",
      attributes: {
        symbol: consensus.symbol,
        timeframe: consensus.timeframe,
        decision: consensus.decision ?? consensus.signal,
      },
    },
    async (span) => {
      const startedAt = performance.now();
      const timestamp = nowIso();
      const decision = normalizeDecision(consensus);
      const confidence = confidencePercent(consensus);
      const autoExecuteEnabled = parseBoolean(env.AUTO_EXECUTE_ENABLED, true);
      const maxPositionUsd = parseNumber(
        env.MAX_POSITION_USD,
        SWARM_THRESHOLDS.DEFAULT_MAX_POSITION_USD,
      );
      const liveTradingBudgetUsd = parseNumber(
        env.LIVE_TRADING_BUDGET_USD,
        DEFAULT_LIVE_TRADING_BUDGET_USD,
      );
      const minConfidenceThreshold = parseNumber(
        env.MIN_CONFIDENCE_THRESHOLD,
        SWARM_THRESHOLDS.DEFAULT_MIN_CONFIDENCE_THRESHOLD,
      );
      const minTradeNotionalUsd = parseNumber(
        env.MIN_TRADE_NOTIONAL,
        SWARM_THRESHOLDS.DEFAULT_MIN_TRADE_NOTIONAL,
      );
      const accountMode = getOkxAccountModeLabel();
      const cappedMaxPositionUsd =
        accountMode === "live" && liveTradingBudgetUsd > 0
          ? Math.min(maxPositionUsd, liveTradingBudgetUsd)
          : maxPositionUsd;
      const targetNotionalUsd = deriveSize(confidence, cappedMaxPositionUsd);
      telemetryInfo(
        "swarm.auto_execute",
        "Autonomous execution evaluation started",
        {
          symbol: consensus.symbol,
          timeframe: consensus.timeframe,
          consensus,
          executionConfig: {
            autoExecuteEnabled,
            accountMode,
            maxPositionUsd,
            liveTradingBudgetUsd,
            cappedMaxPositionUsd,
            minConfidenceThreshold,
            minTradeNotionalUsd,
            requireRealtimeMarketData: parseBoolean(
              env.REQUIRE_REALTIME_MARKET_DATA,
              true,
            ),
          },
        },
      );
      const executionIntent = await createExecutionIntent(
        consensus,
        targetNotionalUsd,
      );

      incrementCounter(
        "auto_execution_attempts_total",
        "Total autonomous execution attempts.",
        1,
        {
          symbol: consensus.symbol,
          decision,
          accountMode,
        },
      );
      span.addAttributes({
        accountMode,
        confidence,
        minConfidenceThreshold,
        targetNotionalUsd,
      });

      const finalizeResult = (
        result: ExecutionResult,
        extraLabels?: {
          duplicate?: boolean;
        },
      ) => {
        const durationMs = Number((performance.now() - startedAt).toFixed(3));
        observeHistogram(
          "auto_execution_duration_ms",
          "Duration of autonomous execution attempts in milliseconds.",
          durationMs,
          {
            labels: {
              decision,
              status: result.status,
              accountMode,
              duplicate: extraLabels?.duplicate ?? false,
            },
          },
        );
        incrementCounter(
          "auto_execution_results_total",
          "Final results of autonomous execution attempts.",
          1,
          {
            decision,
            status: result.status,
            accountMode,
            duplicate: extraLabels?.duplicate ?? false,
          },
        );
        span.addAttributes({
          status: result.status,
          resultReason: result.reason,
          resultError: result.error,
          duplicate: extraLabels?.duplicate ?? false,
          resultSize: result.size,
          circuitOpen: result.circuitOpen ?? false,
        });
        logResult(result);
        return result;
      };

      const priorResult = getDuplicateExecutionResult(consensus, decision);
      if (priorResult) {
        telemetryWarn(
          "swarm.auto_execute",
          "Duplicate consensus detected; reusing prior execution result",
          {
            symbol: consensus.symbol,
            decision,
            timeframe: consensus.timeframe,
            validatedAt: consensus.validatedAt,
          },
        );
        await finalizeExecutionIntent(executionIntent.id, priorResult);
        return finalizeResult(priorResult, { duplicate: true });
      }

      if (!autoExecuteEnabled) {
        const result = buildHoldResult({
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: targetNotionalUsd,
          reason: "auto execution disabled",
          response: { autoExecuteEnabled: false },
          rejectionReasons: [
            {
              layer: "execution",
              code: "auto_execute_disabled",
              summary: "Auto execution is disabled.",
              detail:
                "AUTO_EXECUTE_ENABLED is false, so the decision was not routed.",
            },
          ],
        });
        await finalizeExecutionIntent(executionIntent.id, result);
        cacheExecutionResult(consensus, decision, result);
        return finalizeResult(result);
      }

      if (await isExecutionCircuitOpen(consensus.symbol)) {
        const result = buildErrorResult({
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: targetNotionalUsd,
          error: "circuit breaker open",
          response: { circuitOpen: true },
          circuitOpen: true,
          rejectionReasons: [
            {
              layer: "execution",
              code: "circuit_breaker_open",
              summary: "Circuit breaker is open.",
              detail:
                "Execution errors exceeded the configured tolerance window.",
            },
          ],
        });
        await finalizeExecutionIntent(executionIntent.id, result);
        return finalizeResult(result);
      }

      if (!consensus.executionEligible || decision === "HOLD") {
        const result = buildHoldResult({
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: 0,
          reason: "consensus not execution eligible",
          response: {
            executionEligible: consensus.executionEligible,
          },
          rejectionReasons:
            consensus.rejectionReasons.length > 0
              ? consensus.rejectionReasons
              : [
                  {
                    layer: "execution",
                    code: "directional_hold",
                    summary: "The decision engine returned HOLD.",
                    detail:
                      "No executable directional edge was available for this setup.",
                  },
                ],
        });
        await finalizeExecutionIntent(executionIntent.id, result);
        cacheExecutionResult(consensus, decision, result);
        return finalizeResult(result);
      }

      if (confidence < minConfidenceThreshold) {
        const result = buildHoldResult({
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: targetNotionalUsd,
          reason: `confidence ${confidence.toFixed(2)} below threshold ${minConfidenceThreshold.toFixed(2)}`,
          response: {
            confidence,
            minConfidenceThreshold,
          },
          rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
            {
              layer: "execution",
              code: "execution_confidence_below_min",
              summary: "Execution confidence is below the minimum threshold.",
              detail: `Confidence ${confidence.toFixed(2)} is below ${minConfidenceThreshold.toFixed(2)}.`,
              metrics: {
                confidence: Number(confidence.toFixed(4)),
                minConfidenceThreshold: Number(
                  minConfidenceThreshold.toFixed(4),
                ),
              },
            },
          ]),
        });
        await finalizeExecutionIntent(executionIntent.id, result);
        cacheExecutionResult(consensus, decision, result);
        return finalizeResult(result);
      }

      try {
        const marketSnapshot = await getMarketSnapshot(
          consensus.symbol,
          consensus.timeframe,
        );
        const executionReferencePrice = marketSnapshot.context.ticker.last;
        const exitPlan = resolveExitPlan(
          consensus,
          decision,
          executionReferencePrice,
        );

        if (accountMode === "live" && !marketSnapshot.status.realtime) {
          const result = buildHoldResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: 0,
            reason: "live trading requires realtime websocket market data",
            response: {
              marketStatus: marketSnapshot.status,
            },
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              [
                {
                  layer: "market_data",
                  code: "realtime_market_data_required",
                  summary:
                    "Live trading requires realtime websocket market data.",
                  detail:
                    "The execution path rejected the trade because market data was not realtime.",
                  metrics: {
                    realtime: marketSnapshot.status.realtime,
                    connectionState: marketSnapshot.status.connectionState,
                  },
                },
              ],
            ),
          });
          await finalizeExecutionIntent(executionIntent.id, result, {
            response: {
              marketStatus: marketSnapshot.status,
            },
          });
          cacheExecutionResult(consensus, decision, result);
          return finalizeResult(result);
        }

        if (!marketSnapshot.status.tradeable) {
          const result = buildHoldResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: 0,
            reason: "market data not tradeable",
            response: {
              marketStatus: marketSnapshot.status,
            },
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              [
                {
                  layer: "market_data",
                  code: "market_not_tradeable",
                  summary: "Market data status is not tradeable.",
                  detail:
                    "The execution path rejected the trade because the market snapshot was not eligible for trading.",
                  metrics: {
                    realtime: marketSnapshot.status.realtime,
                    stale: marketSnapshot.status.stale,
                    connectionState: marketSnapshot.status.connectionState,
                  },
                },
              ],
            ),
          });
          await finalizeExecutionIntent(executionIntent.id, result, {
            response: {
              marketStatus: marketSnapshot.status,
            },
          });
          cacheExecutionResult(consensus, decision, result);
          return finalizeResult(result);
        }

        const riskGuard = await checkExecutionRiskGuards(consensus, decision);
        if (!riskGuard.allowed) {
          const result = buildHoldResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: 0,
            reason:
              riskGuard.reason ?? "execution risk guard rejected the trade",
            response: riskGuard.response,
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              mapExecutionGuardReason(riskGuard.reason, riskGuard.response),
            ),
          });
          await finalizeExecutionIntent(executionIntent.id, result);
          cacheExecutionResult(consensus, decision, result);
          return finalizeResult(result);
        }

        const executionPlan = await deriveExecutableSize(
          decision,
          consensus.symbol,
          targetNotionalUsd,
        );
        if (executionPlan.size <= 0) {
          const result = buildHoldResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: 0,
            reason: executionPlan.reason ?? "no executable size available",
            response: executionPlan.response,
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              mapExecutionGuardReason(
                executionPlan.reason,
                executionPlan.response,
              ),
            ),
          });
          await finalizeExecutionIntent(executionIntent.id, result);
          cacheExecutionResult(consensus, decision, result);
          return finalizeResult(result);
        }

        const instrumentRules = await getInstrumentRules(consensus.symbol);
        const normalizedSize = normalizeOrderSize(
          executionPlan.size,
          instrumentRules.lotSize,
        );
        if (
          instrumentRules.state !== "live" ||
          normalizedSize < instrumentRules.minSize ||
          normalizedSize <= 0
        ) {
          const response = {
            instrumentRules,
            requestedSize: executionPlan.size,
            normalizedSize,
          };
          const result = buildHoldResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: 0,
            reason: "instrument rules rejected the order size",
            response,
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              mapExecutionGuardReason(
                "instrument rules rejected the order size",
                response,
              ),
            ),
          });
          await finalizeExecutionIntent(executionIntent.id, result, {
            normalizedSize,
            response,
          });
          cacheExecutionResult(consensus, decision, result);
          return finalizeResult(result);
        }

        const url = `${baseUrl}/api/ai/trade/execute`;
        await updateExecutionIntent(executionIntent.id, {
          status: "submitted",
          normalizedSize,
          response: {
            marketStatus: marketSnapshot.status,
            instrumentRules,
          },
        });
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            signal: decision,
            action: decision,
            symbol: consensus.symbol,
            size: Number(normalizedSize.toFixed(8)),
            mode: "ai_only",
            confirmed: true,
            source: "swarm_auto",
            decisionSnapshot: buildTradeDecisionSnapshot(consensus),
            executionContext: {
              referencePrice: executionReferencePrice,
              targetNotionalUsd: Number(targetNotionalUsd.toFixed(8)),
              normalizedSize: Number(normalizedSize.toFixed(8)),
              expectedNetEdgeBps: consensus.expectedNetEdgeBps,
              marketQualityScore: consensus.marketQualityScore,
              stopLoss: exitPlan.stopLoss,
              takeProfitLevels: exitPlan.takeProfitLevels,
              trailingStopDistancePct: getTrailingStopDistancePct(),
            },
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          data?: {
            order?: ExecutionResult["order"];
            simulated?: boolean;
            accountMode?: ExecutionResult["accountMode"];
          };
          error?: string;
        } | null;

        if (!response.ok) {
          await recordExecutionError(consensus.symbol, Date.now());
          const result = buildErrorResult({
            timestamp,
            symbol: consensus.symbol,
            decision,
            size: Number(normalizedSize.toFixed(8)),
            error:
              payload?.error ?? `Execution request failed: ${response.status}`,
            response: {
              ...executionPlan.response,
              instrumentRules,
              normalizedSize,
              payload,
            },
            circuitOpen: await isExecutionCircuitOpen(consensus.symbol),
            rejectionReasons: mergeRejectionReasons(
              consensus.rejectionReasons,
              [
                {
                  layer: "execution",
                  code: "execution_request_failed",
                  summary: "Execution request failed.",
                  detail:
                    payload?.error ??
                    `Execution request failed: ${response.status}`,
                  metrics: {
                    status: response.status,
                    normalizedSize: Number(normalizedSize.toFixed(8)),
                  },
                },
              ],
            ),
          });
          console.error(
            `[${timestamp}] [AutoExec] execution error for ${decision} ${consensus.symbol}: ${JSON.stringify(payload)}`,
          );
          await finalizeExecutionIntent(executionIntent.id, result, {
            normalizedSize,
            response: {
              ...executionPlan.response,
              instrumentRules,
              normalizedSize,
              payload,
            },
          });
          return finalizeResult(result);
        }

        const result: ExecutionResult = {
          status: "success",
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: Number(normalizedSize.toFixed(8)),
          order: payload?.data?.order,
          simulated: payload?.data?.simulated,
          accountMode: payload?.data?.accountMode,
          response: {
            ...executionPlan.response,
            instrumentRules,
            normalizedSize,
            payload,
          },
        };
        telemetryInfo("swarm.auto_execute", "Execution request succeeded", {
          symbol: consensus.symbol,
          decision,
          normalizedSize,
          payload,
        });
        if (payload?.data?.order) {
          const entryPrice =
            payload.data.order.filledPrice ??
            payload.data.order.referencePrice ??
            executionReferencePrice;
          await persistOutcomeWindowEntry({
            consensus,
            decision,
            order: payload.data.order,
            entryPrice,
          });
          await persistManagedOpenPosition({
            consensus,
            decision,
            order: payload.data.order,
            normalizedSize: Number(normalizedSize.toFixed(8)),
            entryPrice,
            exitPlan,
          });
        }
        await finalizeExecutionIntent(executionIntent.id, result, {
          normalizedSize,
          response: {
            ...executionPlan.response,
            instrumentRules,
            normalizedSize,
            payload,
          },
        });
        cacheExecutionResult(consensus, decision, result);
        return finalizeResult(result);
      } catch (caughtError) {
        await recordExecutionError(consensus.symbol, Date.now());
        const result = buildErrorResult({
          timestamp,
          symbol: consensus.symbol,
          decision,
          size: targetNotionalUsd,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Unknown execution error",
          response: {
            message:
              caughtError instanceof Error
                ? caughtError.message
                : "Unknown execution error",
          },
          circuitOpen: await isExecutionCircuitOpen(consensus.symbol),
          rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
            {
              layer: "execution",
              code: "unexpected_execution_error",
              summary: "Unexpected execution error.",
              detail:
                caughtError instanceof Error
                  ? caughtError.message
                  : "Unknown execution error",
            },
          ]),
        });
        console.error(
          `[${timestamp}] [AutoExec] execution error for ${decision} ${consensus.symbol}:`,
          caughtError,
        );
        await finalizeExecutionIntent(executionIntent.id, result);
        cacheExecutionResult(consensus, decision, result);
        return finalizeResult(result);
      }
    },
  );
}
