import "server-only";

import { headers } from "next/headers";
import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import { getMarketSnapshot } from "@/lib/market-data/service";
import { getAccountOverview } from "@/lib/okx/account";
import { getInstrumentRules, normalizeOrderSize } from "@/lib/okx/instruments";
import { getTicker } from "@/lib/okx/market";
import { getPositions } from "@/lib/okx/orders";
import {
  createExecutionIntent,
  finalizeExecutionIntent,
  updateExecutionIntent,
} from "@/lib/persistence/execution-intents";
import { getHistory } from "@/lib/persistence/history";
import type {
  ConsensusResult,
  ExecutionResult,
  RejectionReason,
  TradeSignal,
} from "@/types/swarm";

const DEFAULT_MAX_POSITION_USD = 100;
const DEFAULT_MIN_CONFIDENCE_THRESHOLD = 60;
const DEFAULT_MAX_BALANCE_USAGE_PCT = 0.9;
const DEFAULT_MIN_TRADE_NOTIONAL = 5;
const DEFAULT_MAX_DAILY_TRADES = 20;
const DEFAULT_LIVE_TRADING_BUDGET_USD = 0;
const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_ERROR_LIMIT = 3;

let CIRCUIT_OPEN = false;
let executionErrorTimestamps: number[] = [];
const executionResults = new Map<string, ExecutionResult>();

function nowIso(): string {
  return new Date().toISOString();
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDecision(consensus: ConsensusResult): TradeSignal {
  return consensus.decision ?? consensus.signal;
}

function confidencePercent(consensus: ConsensusResult): number {
  return consensus.confidence <= 1
    ? consensus.confidence * 100
    : consensus.confidence;
}

function deriveSize(confidence: number, maxPositionUsd: number): number {
  return Number(((confidence / 100) * maxPositionUsd).toFixed(8));
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
    process.env.MAX_BALANCE_USAGE_PCT,
    DEFAULT_MAX_BALANCE_USAGE_PCT,
  );
  const minTradeNotional = parseNumber(
    process.env.MIN_TRADE_NOTIONAL,
    DEFAULT_MIN_TRADE_NOTIONAL,
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
  consensus: ConsensusResult,
  decision: TradeSignal,
): Promise<{
  allowed: boolean;
  reason?: string;
  response?: Record<string, unknown>;
}> {
  const maxDailyTrades = parseNumber(
    process.env.MAX_DAILY_TRADES,
    DEFAULT_MAX_DAILY_TRADES,
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
    process.env.LIVE_TRADING_BUDGET_USD,
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

function recordExecutionError(timestamp: number) {
  executionErrorTimestamps = executionErrorTimestamps.filter(
    (value) => timestamp - value <= CIRCUIT_BREAKER_WINDOW_MS,
  );
  executionErrorTimestamps.push(timestamp);

  if (executionErrorTimestamps.length >= CIRCUIT_BREAKER_ERROR_LIMIT) {
    CIRCUIT_OPEN = true;
    console.error(
      `[${nowIso()}] [AutoExec] CRITICAL: circuit breaker opened after ${executionErrorTimestamps.length} execution errors within 60 seconds`,
    );
  }
}

async function getExecutionUrl() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}/api/ai/trade/execute`;
}

function logResult(result: ExecutionResult) {
  console.log(
    `[${result.timestamp}] [AutoExec] symbol=${result.symbol} decision=${result.decision} size=${result.size} status=${result.status} response=${JSON.stringify(result.response ?? result.order ?? result.reason ?? result.error ?? null)}`,
  );
}

function getConsensusKey(
  consensus: ConsensusResult,
  decision: TradeSignal,
): string {
  return [
    consensus.symbol,
    consensus.timeframe,
    consensus.validatedAt,
    decision,
    consensus.confidence,
    consensus.agreement,
  ].join(":");
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
          detail: "The execution guard rejected the trade due to budget limits.",
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
  consensus: ConsensusResult,
): Promise<ExecutionResult> {
  const timestamp = nowIso();
  const decision = normalizeDecision(consensus);
  const confidence = confidencePercent(consensus);
  const maxPositionUsd = parseNumber(
    process.env.MAX_POSITION_USD,
    DEFAULT_MAX_POSITION_USD,
  );
  const liveTradingBudgetUsd = parseNumber(
    process.env.LIVE_TRADING_BUDGET_USD,
    DEFAULT_LIVE_TRADING_BUDGET_USD,
  );
  const minConfidenceThreshold = parseNumber(
    process.env.MIN_CONFIDENCE_THRESHOLD,
    DEFAULT_MIN_CONFIDENCE_THRESHOLD,
  );
  const accountMode = getOkxAccountModeLabel();
  const cappedMaxPositionUsd =
    accountMode === "live" && liveTradingBudgetUsd > 0
      ? Math.min(maxPositionUsd, liveTradingBudgetUsd)
      : maxPositionUsd;
  const targetNotionalUsd = deriveSize(confidence, cappedMaxPositionUsd);
  const consensusKey = getConsensusKey(consensus, decision);
  const executionIntent = await createExecutionIntent(
    consensus,
    targetNotionalUsd,
  );

  const priorResult = executionResults.get(consensusKey);
  if (priorResult) {
    console.log(
      `[${timestamp}] [AutoExec] duplicate consensus detected for ${consensus.symbol} - reusing prior execution result`,
    );
    await finalizeExecutionIntent(executionIntent.id, priorResult);
    return priorResult;
  }

  if (!parseBoolean(process.env.AUTO_EXECUTE_ENABLED, true)) {
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
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result);
    executionResults.set(consensusKey, result);
    return result;
  }

  if (CIRCUIT_OPEN) {
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
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result);
    return result;
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
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result);
    executionResults.set(consensusKey, result);
    return result;
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
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result);
    executionResults.set(consensusKey, result);
    return result;
  }

  try {
    const marketSnapshot = await getMarketSnapshot(
      consensus.symbol,
      consensus.timeframe,
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
        rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
          {
            layer: "market_data",
            code: "realtime_market_data_required",
            summary: "Live trading requires realtime websocket market data.",
            detail:
              "The execution path rejected the trade because market data was not realtime.",
            metrics: {
              realtime: marketSnapshot.status.realtime,
              connectionState: marketSnapshot.status.connectionState,
            },
          },
        ]),
      });
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result, {
        response: {
          marketStatus: marketSnapshot.status,
        },
      });
      executionResults.set(consensusKey, result);
      return result;
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
        rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
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
        ]),
      });
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result, {
        response: {
          marketStatus: marketSnapshot.status,
        },
      });
      executionResults.set(consensusKey, result);
      return result;
    }

    const riskGuard = await checkExecutionRiskGuards(consensus, decision);
    if (!riskGuard.allowed) {
      const result = buildHoldResult({
        timestamp,
        symbol: consensus.symbol,
        decision,
        size: 0,
        reason: riskGuard.reason ?? "execution risk guard rejected the trade",
        response: riskGuard.response,
        rejectionReasons: mergeRejectionReasons(
          consensus.rejectionReasons,
          mapExecutionGuardReason(riskGuard.reason, riskGuard.response),
        ),
      });
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result);
      executionResults.set(consensusKey, result);
      return result;
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
          mapExecutionGuardReason(executionPlan.reason, executionPlan.response),
        ),
      });
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result);
      executionResults.set(consensusKey, result);
      return result;
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
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result, {
        normalizedSize,
        response,
      });
      executionResults.set(consensusKey, result);
      return result;
    }

    const url = await getExecutionUrl();
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
      recordExecutionError(Date.now());
      const result = buildErrorResult({
        timestamp,
        symbol: consensus.symbol,
        decision,
        size: Number(normalizedSize.toFixed(8)),
        error: payload?.error ?? `Execution request failed: ${response.status}`,
        response: {
          ...executionPlan.response,
          instrumentRules,
          normalizedSize,
          payload,
        },
        circuitOpen: CIRCUIT_OPEN,
        rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
          {
            layer: "execution",
            code: "execution_request_failed",
            summary: "Execution request failed.",
            detail:
              payload?.error ?? `Execution request failed: ${response.status}`,
            metrics: {
              status: response.status,
              normalizedSize: Number(normalizedSize.toFixed(8)),
            },
          },
        ]),
      });
      console.error(
        `[${timestamp}] [AutoExec] execution error for ${decision} ${consensus.symbol}: ${JSON.stringify(payload)}`,
      );
      logResult(result);
      await finalizeExecutionIntent(executionIntent.id, result, {
        normalizedSize,
        response: {
          ...executionPlan.response,
          instrumentRules,
          normalizedSize,
          payload,
        },
      });
      return result;
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
    console.log(
      `[${timestamp}] [AutoExec] ${decision} executed: ${JSON.stringify(payload)}`,
    );
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result, {
      normalizedSize,
      response: {
        ...executionPlan.response,
        instrumentRules,
        normalizedSize,
        payload,
      },
    });
    executionResults.set(consensusKey, result);
    return result;
  } catch (error) {
    recordExecutionError(Date.now());
    const result = buildErrorResult({
      timestamp,
      symbol: consensus.symbol,
      decision,
      size: targetNotionalUsd,
      error: error instanceof Error ? error.message : "Unknown execution error",
      response: {
        message:
          error instanceof Error ? error.message : "Unknown execution error",
      },
      circuitOpen: CIRCUIT_OPEN,
      rejectionReasons: mergeRejectionReasons(consensus.rejectionReasons, [
        {
          layer: "execution",
          code: "unexpected_execution_error",
          summary: "Unexpected execution error.",
          detail:
            error instanceof Error ? error.message : "Unknown execution error",
        },
      ]),
    });
    console.error(
      `[${timestamp}] [AutoExec] execution error for ${decision} ${consensus.symbol}:`,
      error,
    );
    logResult(result);
    await finalizeExecutionIntent(executionIntent.id, result);
    executionResults.set(consensusKey, result);
    return result;
  }
}
