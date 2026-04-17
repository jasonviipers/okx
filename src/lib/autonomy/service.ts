import "server-only";

import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import {
  getMarketSnapshot,
  getRealtimeMarketContext,
} from "@/lib/market-data/service";
import { getAccountOverview } from "@/lib/okx/account";
import {
  getAutonomousSymbolUniverse,
  getConfiguredAutonomousQuoteCurrencies,
  getQuoteCurrenciesFromBalances,
} from "@/lib/okx/instruments";
import type { AutonomySelectionMode } from "@/lib/persistence/autonomy-state";
import {
  readAutonomyState,
  updateAutonomyState,
  writeAutonomyState,
} from "@/lib/persistence/autonomy-state";
import { getHistory } from "@/lib/persistence/history";
import { autoExecuteConsensus } from "@/lib/swarm/autoExecute";
import { runSwarm } from "@/lib/swarm/orchestrator";
import type { AutonomyCandidateScore, AutonomyStatus } from "@/types/api";
import type { Timeframe } from "@/types/market";
import type { ExecutionResult, SwarmRunResult } from "@/types/swarm";
import type { AccountAssetBalance, AccountOverview } from "@/types/trade";

const WORKER_LEASE_TIMEOUT_MS = 5 * 60_000;
const AUTONOMY_SCHEDULER_TICK_MS = 5_000;
const DEFAULT_MAX_SYMBOL_ALLOCATION_PCT = 0.35;
const DEFAULT_PORTFOLIO_BUFFER_PCT = 0.9;
const DEFAULT_MIN_TRADE_NOTIONAL_USD = 5;

declare global {
  var __okxAutonomyScheduler: NodeJS.Timeout | undefined;
}

function autoStartEnabledByEnv(): boolean {
  const val = process.env.AUTONOMOUS_TRADING_ENABLED?.toLowerCase();
  return val !== "false";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeLeaseId() {
  return `lease_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isLeaseActive(leaseAcquiredAt?: string) {
  if (!leaseAcquiredAt) {
    return false;
  }

  return (
    Date.now() - new Date(leaseAcquiredAt).getTime() < WORKER_LEASE_TIMEOUT_MS
  );
}

function normalizeWorkerLeaseState(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
) {
  if (!state.inFlight || isLeaseActive(state.leaseAcquiredAt)) {
    return state;
  }

  return {
    ...state,
    inFlight: false,
    leaseId: undefined,
    leaseAcquiredAt: undefined,
  };
}

async function getTodayExecutedNotionalUsd() {
  const history = await getHistory(200);
  const since = Date.now() - 24 * 60 * 60 * 1000;

  return history.reduce((sum, entry) => {
    if (
      entry.type !== "trade_execution" ||
      new Date(entry.timestamp).getTime() < since
    ) {
      return sum;
    }

    return sum + (entry.order.notionalUsd ?? 0);
  }, 0);
}

function toAutonomyStatus(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
  budgetRemainingUsd: number,
): AutonomyStatus {
  const selectionModeLabel =
    state.selectionMode === "auto"
      ? "symbol selection is automatic."
      : "symbol is fixed.";

  return {
    enabled: true,
    configured: autoStartEnabledByEnv(),
    running: state.running,
    detail: state.running
      ? `Autonomous worker is armed and awaiting schedule triggers; ${selectionModeLabel}`
      : autoStartEnabledByEnv()
        ? "Autonomy is configured for durable startup but currently stopped."
        : "Autonomy is available and requires an explicit start.",
    symbol: state.symbol,
    selectionMode: state.selectionMode,
    candidateSymbols: state.candidateSymbols,
    timeframe: state.timeframe,
    intervalMs: state.intervalMs,
    cooldownMs: state.cooldownMs,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastDecision: state.lastDecision,
    lastExecutionStatus: state.lastExecutionStatus,
    lastError: state.lastError,
    lastReason: state.lastReason,
    iterationCount: state.iterationCount,
    budgetUsd: state.budgetUsd ?? 0,
    budgetRemainingUsd,
    inFlight: state.inFlight,
    lastCandidateScores: state.lastCandidateScores,
    lastSelectedCandidate: state.lastSelectedCandidate,
    lastRejectedReasons: state.lastRejectedReasons,
  };
}

function shouldRunNow(state: Awaited<ReturnType<typeof readAutonomyState>>) {
  return (
    state.running &&
    (!state.nextRunAt || new Date(state.nextRunAt).getTime() <= Date.now())
  );
}

function ensureAutonomyScheduler() {
  if (globalThis.__okxAutonomyScheduler) {
    return;
  }

  const timer = setInterval(() => {
    void maybeDispatchDueAutonomyRun().catch((error) => {
      console.error(
        "[AutonomyScheduler] Failed to dispatch due autonomy run:",
        error,
      );
    });
  }, AUTONOMY_SCHEDULER_TICK_MS);

  timer.unref?.();
  globalThis.__okxAutonomyScheduler = timer;
}

export async function ensureAutonomyBootState() {
  ensureAutonomyScheduler();

  if (!autoStartEnabledByEnv()) {
    return;
  }

  const state = await readAutonomyState();
  if (state.running) {
    return;
  }

  await writeAutonomyState({
    ...state,
    running: true,
    nextRunAt: state.nextRunAt ?? new Date().toISOString(),
    lastError: undefined,
  });
}

export async function getAutonomyStatus(): Promise<AutonomyStatus> {
  ensureAutonomyScheduler();

  const [rawState, usedBudgetUsd] = await Promise.all([
    readAutonomyState(),
    getTodayExecutedNotionalUsd(),
  ]);
  const state = normalizeWorkerLeaseState(rawState);
  if (state !== rawState) {
    await writeAutonomyState(state);
  }
  const budgetUsd = state.budgetUsd ?? 0;
  const budgetRemainingUsd =
    budgetUsd > 0 ? Math.max(0, budgetUsd - usedBudgetUsd) : 0;

  return toAutonomyStatus(state, Number(budgetRemainingUsd.toFixed(2)));
}

export async function startAutonomyLoop(config?: {
  symbol?: string;
  selectionMode?: AutonomySelectionMode;
  candidateSymbols?: string[];
  timeframe?: Timeframe;
  intervalMs?: number;
}) {
  ensureAutonomyScheduler();

  await updateAutonomyState((state) => ({
    ...state,
    running: true,
    selectionMode: config?.selectionMode ?? state.selectionMode,
    candidateSymbols:
      config?.candidateSymbols && config.candidateSymbols.length > 0
        ? config.candidateSymbols
        : state.candidateSymbols,
    symbol: config?.symbol || state.symbol,
    timeframe: config?.timeframe || state.timeframe,
    intervalMs: config?.intervalMs || state.intervalMs,
    nextRunAt: new Date().toISOString(),
    lastError: undefined,
  }));

  return getAutonomyStatus();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseSpotSymbol(
  symbol: string,
): { baseCurrency: string; quoteCurrency: string } | null {
  const parts = symbol.split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    baseCurrency: parts[0],
    quoteCurrency: parts[1],
  };
}

function approximateAvailableUsd(balance?: AccountAssetBalance): number {
  if (!balance) {
    return 0;
  }

  if (balance.availableBalance <= 0) {
    return 0;
  }

  if (balance.equity > 0 && balance.usdValue > 0) {
    return balance.usdValue * (balance.availableBalance / balance.equity);
  }

  return balance.availableBalance;
}

function findTradingBalance(
  accountOverview: AccountOverview,
  currency?: string,
): AccountAssetBalance | undefined {
  if (!currency) {
    return undefined;
  }

  return accountOverview.tradingBalances.find(
    (balance) => balance.currency === currency,
  );
}

type PortfolioState = {
  baseCurrency?: string;
  quoteCurrency?: string;
  positionState: "flat" | "long";
  totalTradingEquityUsd: number;
  currentBaseInventoryUsd: number;
  availableBaseInventoryUsd: number;
  baseInventoryUnits: number;
  quoteAvailableBalance: number;
  quoteBudgetAvailableUsd: number;
  portfolioConcentrationPct: number;
  symbolBudgetCapUsd: number;
  symbolBudgetRemainingUsd: number;
  minimumTradeNotionalUsd: number;
};

type AutonomySymbolEvaluation = {
  symbol: string;
  snapshot: Awaited<ReturnType<typeof getMarketSnapshot>>;
  result: SwarmRunResult;
  score: number;
  portfolioState: PortfolioState;
  portfolioFitScore: number;
};

function liveExecutionRequiresRealtime() {
  return getOkxAccountModeLabel() === "live";
}

function buildPortfolioState(
  accountOverview: AccountOverview,
  symbol: string,
  budgetRemainingUsd: number,
): PortfolioState {
  const symbolParts = parseSpotSymbol(symbol);
  const totalTradingEquityUsd = Math.max(
    accountOverview.tradingBalances.reduce(
      (sum, balance) =>
        sum + Math.max(balance.usdValue, approximateAvailableUsd(balance)),
      0,
    ),
    accountOverview.totalEquity,
  );
  const maxSymbolAllocationPct = parseNumber(
    process.env.AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT,
    DEFAULT_MAX_SYMBOL_ALLOCATION_PCT,
  );
  const baseBalance = findTradingBalance(
    accountOverview,
    symbolParts?.baseCurrency,
  );
  const quoteBalance = findTradingBalance(
    accountOverview,
    symbolParts?.quoteCurrency,
  );
  const minimumTradeNotionalUsd = parseNumber(
    process.env.MIN_TRADE_NOTIONAL,
    DEFAULT_MIN_TRADE_NOTIONAL_USD,
  );
  const currentBaseInventoryUsd = Math.max(baseBalance?.usdValue ?? 0, 0);
  const availableBaseInventoryUsd = approximateAvailableUsd(baseBalance);
  const symbolBudgetCapUsd =
    totalTradingEquityUsd > 0
      ? totalTradingEquityUsd * maxSymbolAllocationPct
      : parseNumber(process.env.MAX_POSITION_USD, 100);
  const budgetCapUsd =
    budgetRemainingUsd > 0 ? budgetRemainingUsd : Number.POSITIVE_INFINITY;
  const symbolBudgetRemainingUsd = Math.max(
    0,
    Math.min(symbolBudgetCapUsd, budgetCapUsd) - currentBaseInventoryUsd,
  );
  const quoteBudgetAvailableUsd = Math.max(
    0,
    Math.min(
      approximateAvailableUsd(quoteBalance) * DEFAULT_PORTFOLIO_BUFFER_PCT,
      symbolBudgetRemainingUsd,
      budgetCapUsd,
    ),
  );

  return {
    baseCurrency: symbolParts?.baseCurrency,
    quoteCurrency: symbolParts?.quoteCurrency,
    positionState: (baseBalance?.availableBalance ?? 0) > 0 ? "long" : "flat",
    totalTradingEquityUsd,
    currentBaseInventoryUsd,
    availableBaseInventoryUsd,
    baseInventoryUnits: Math.max(baseBalance?.availableBalance ?? 0, 0),
    quoteAvailableBalance: Math.max(quoteBalance?.availableBalance ?? 0, 0),
    quoteBudgetAvailableUsd,
    portfolioConcentrationPct:
      totalTradingEquityUsd > 0
        ? currentBaseInventoryUsd / totalTradingEquityUsd
        : 0,
    symbolBudgetCapUsd,
    symbolBudgetRemainingUsd,
    minimumTradeNotionalUsd,
  };
}

function computePortfolioFitScore(
  decision: "BUY" | "SELL" | "HOLD",
  portfolioState: PortfolioState,
): number {
  const symbolBudgetCapacity =
    portfolioState.symbolBudgetCapUsd > 0
      ? clamp01(
          portfolioState.symbolBudgetRemainingUsd /
            portfolioState.symbolBudgetCapUsd,
        )
      : 0;
  const quoteCoverage =
    portfolioState.symbolBudgetCapUsd > 0
      ? clamp01(
          portfolioState.quoteBudgetAvailableUsd /
            portfolioState.symbolBudgetCapUsd,
        )
      : 0;
  const concentrationHeadroom = clamp01(
    1 - portfolioState.portfolioConcentrationPct,
  );
  const availableInventoryShare =
    portfolioState.currentBaseInventoryUsd > 0
      ? clamp01(
          portfolioState.availableBaseInventoryUsd /
            portfolioState.currentBaseInventoryUsd,
        )
      : 0;
  const exposureNeed = clamp01(
    portfolioState.portfolioConcentrationPct /
      DEFAULT_MAX_SYMBOL_ALLOCATION_PCT,
  );

  if (decision === "BUY") {
    return Number(
      (
        symbolBudgetCapacity * 0.4 +
        quoteCoverage * 0.3 +
        concentrationHeadroom * 0.2 +
        (portfolioState.positionState === "flat" ? 1 : 0.6) * 0.1
      ).toFixed(3),
    );
  }

  if (decision === "SELL") {
    return Number(
      (
        availableInventoryShare * 0.45 +
        Math.max(exposureNeed, 0.25) * 0.35 +
        concentrationHeadroom * 0.2
      ).toFixed(3),
    );
  }

  return Number(
    (
      concentrationHeadroom * 0.5 +
      symbolBudgetCapacity * 0.25 +
      quoteCoverage * 0.25
    ).toFixed(3),
  );
}

function toAutonomyCandidateScore(
  evaluation: AutonomySymbolEvaluation,
): AutonomyCandidateScore {
  const { symbol, snapshot, result, score, portfolioState, portfolioFitScore } =
    evaluation;
  const consensus = result.consensus;

  return {
    symbol,
    score,
    tradeable: snapshot.status.tradeable,
    realtime: snapshot.status.realtime,
    blocked: consensus.blocked,
    directionalSignal: consensus.signal,
    decision: consensus.decision ?? consensus.signal,
    confidence: consensus.confidence,
    agreement: consensus.agreement,
    expectedNetEdgeBps:
      consensus.expectedNetEdgeBps ?? consensus.expectedValue?.netEdgeBps,
    marketQualityScore:
      consensus.marketQualityScore ?? consensus.harness?.marketQualityScore,
    riskFlags: consensus.riskFlags,
    decisionCadenceMs: consensus.decisionCadenceMs,
    symbolThrottleMs: consensus.symbolThrottleMs,
    portfolioFitScore,
    portfolioConcentrationPct: portfolioState.portfolioConcentrationPct,
    symbolBudgetRemainingUsd: portfolioState.symbolBudgetRemainingUsd,
    quoteBudgetAvailableUsd: portfolioState.quoteBudgetAvailableUsd,
    positionState: portfolioState.positionState,
    rejectionReasons: consensus.rejectionReasons,
  };
}

function scoreAutonomyCandidate(
  evaluation: Omit<AutonomySymbolEvaluation, "score" | "portfolioFitScore">,
): { score: number; portfolioFitScore: number } {
  const { snapshot, result, portfolioState } = evaluation;
  const consensus = result.consensus;
  const confidence =
    consensus.confidence <= 1
      ? consensus.confidence
      : consensus.confidence / 100;
  const agreement =
    consensus.agreement <= 1 ? consensus.agreement : consensus.agreement / 100;

  if (
    !snapshot.status.tradeable ||
    (liveExecutionRequiresRealtime() && !snapshot.status.realtime) ||
    !consensus.executionEligible
  ) {
    return {
      score: 0,
      portfolioFitScore: computePortfolioFitScore(
        consensus.decision ?? consensus.signal,
        portfolioState,
      ),
    };
  }

  const expectedNetEdge =
    consensus.expectedNetEdgeBps !== undefined
      ? Math.max(0, consensus.expectedNetEdgeBps)
      : consensus.expectedValue?.netEdgeBps !== undefined
        ? Math.max(0, consensus.expectedValue.netEdgeBps)
        : 0;
  const marketQuality =
    consensus.marketQualityScore ??
    consensus.harness?.marketQualityScore ??
    0.5;
  const portfolioFitScore = computePortfolioFitScore(
    consensus.decision ?? consensus.signal,
    portfolioState,
  );

  return {
    score: Number(
      (
        confidence * 0.28 +
        agreement * 0.05 +
        Math.min(expectedNetEdge / 25, 1) * 0.28 +
        marketQuality * 0.14 +
        portfolioFitScore * 0.25
      ).toFixed(6),
    ),
    portfolioFitScore,
  };
}

async function resolveAutonomySymbols(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
  accountOverview: AccountOverview,
): Promise<string[]> {
  if (state.selectionMode === "fixed") {
    return [state.symbol];
  }
  const balanceQuotes = getQuoteCurrenciesFromBalances(
    accountOverview.tradingBalances,
  );
  const quoteCurrencies = [
    ...balanceQuotes,
    ...getConfiguredAutonomousQuoteCurrencies(),
  ];

  return getAutonomousSymbolUniverse({
    quoteCurrencies,
    balances: accountOverview.tradingBalances,
  });
}

async function evaluateAutonomyCandidate(
  symbol: string,
  timeframe: Timeframe,
  budgetRemainingUsd: number,
  accountOverview: AccountOverview,
): Promise<AutonomySymbolEvaluation> {
  const snapshot = await getMarketSnapshot(symbol, timeframe);
  const ctx = await getRealtimeMarketContext(symbol, timeframe);
  const result = await runSwarm(ctx, {
    budgetRemainingUsd,
  });
  const portfolioState = buildPortfolioState(
    accountOverview,
    symbol,
    budgetRemainingUsd,
  );
  const { score, portfolioFitScore } = scoreAutonomyCandidate({
    symbol,
    snapshot,
    result,
    portfolioState,
  });

  return {
    symbol,
    snapshot,
    result,
    score,
    portfolioState,
    portfolioFitScore,
  };
}

function appendAutonomyRejection(
  evaluation: AutonomySymbolEvaluation,
  reason: {
    code: string;
    summary: string;
    detail: string;
    metrics?: Record<string, unknown>;
  },
): AutonomySymbolEvaluation {
  return {
    ...evaluation,
    score: 0,
    result: {
      ...evaluation.result,
      consensus: {
        ...evaluation.result.consensus,
        decision: "HOLD",
        blocked: true,
        executionEligible: false,
        blockReason: reason.summary,
        confidence: Math.min(evaluation.result.consensus.confidence, 0.49),
        rejectionReasons: [
          ...evaluation.result.consensus.rejectionReasons,
          {
            layer: "autonomy",
            code: reason.code,
            summary: reason.summary,
            detail: reason.detail,
            metrics: reason.metrics,
          },
        ],
      },
    },
  };
}

function applyPortfolioConstraints(
  evaluation: AutonomySymbolEvaluation,
): AutonomySymbolEvaluation {
  const decision =
    evaluation.result.consensus.decision ?? evaluation.result.consensus.signal;
  const { portfolioState } = evaluation;
  let nextEvaluation = evaluation;

  if (decision === "BUY") {
    if (
      portfolioState.symbolBudgetRemainingUsd <
      portfolioState.minimumTradeNotionalUsd
    ) {
      nextEvaluation = appendAutonomyRejection(nextEvaluation, {
        code: "symbol_budget_exhausted",
        summary: "Symbol allocation budget is exhausted for a new buy.",
        detail:
          "The candidate already consumes its allowed portfolio allocation, so autonomy will not add more exposure.",
        metrics: {
          symbolBudgetRemainingUsd: Number(
            portfolioState.symbolBudgetRemainingUsd.toFixed(4),
          ),
          minimumTradeNotionalUsd: portfolioState.minimumTradeNotionalUsd,
          portfolioConcentrationPct: Number(
            (portfolioState.portfolioConcentrationPct * 100).toFixed(4),
          ),
        },
      });
    }

    if (
      portfolioState.quoteBudgetAvailableUsd <
      portfolioState.minimumTradeNotionalUsd
    ) {
      nextEvaluation = appendAutonomyRejection(nextEvaluation, {
        code: "quote_budget_unavailable",
        summary: "The available quote budget is too small for a new buy.",
        detail:
          "Autonomy rejected the buy because the quote balance and symbol allocation headroom do not support the minimum trade size.",
        metrics: {
          quoteBudgetAvailableUsd: Number(
            portfolioState.quoteBudgetAvailableUsd.toFixed(4),
          ),
          quoteCurrency: portfolioState.quoteCurrency,
          minimumTradeNotionalUsd: portfolioState.minimumTradeNotionalUsd,
        },
      });
    }
  }

  if (
    decision === "SELL" &&
    portfolioState.availableBaseInventoryUsd <
      portfolioState.minimumTradeNotionalUsd
  ) {
    nextEvaluation = appendAutonomyRejection(nextEvaluation, {
      code: "base_inventory_too_small",
      summary: "Available inventory is too small to execute a spot sell.",
      detail:
        "Autonomy rejected the sell because the available base inventory does not clear the minimum trade size after portfolio buffers.",
      metrics: {
        availableBaseInventoryUsd: Number(
          portfolioState.availableBaseInventoryUsd.toFixed(4),
        ),
        baseCurrency: portfolioState.baseCurrency,
        minimumTradeNotionalUsd: portfolioState.minimumTradeNotionalUsd,
      },
    });
  }

  return nextEvaluation;
}

function getSymbolThrottleUntil(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
  symbol: string,
): number | null {
  const iso = state.symbolThrottleUntil?.[symbol];
  if (!iso) {
    return null;
  }

  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : null;
}

async function selectAutonomyRun(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
  budgetRemainingUsd: number,
) {
  const accountOverview = await getAccountOverview();
  const symbols = await resolveAutonomySymbols(state, accountOverview);
  const evaluations: AutonomySymbolEvaluation[] = [];
  const errors: string[] = [];
  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      evaluateAutonomyCandidate(
        symbol,
        state.timeframe,
        budgetRemainingUsd,
        accountOverview,
      ),
    ),
  );

  for (const [index, settledResult] of settled.entries()) {
    const symbol = symbols[index];
    if (!symbol) {
      continue;
    }

    if (settledResult.status === "fulfilled") {
      let evaluation = applyPortfolioConstraints(settledResult.value);
      const throttleUntil = getSymbolThrottleUntil(state, symbol);
      if (throttleUntil && throttleUntil > Date.now()) {
        evaluation = appendAutonomyRejection(evaluation, {
          code: "symbol_throttle_active",
          summary: "Symbol-specific decision throttle is active.",
          detail:
            "This symbol was recently selected and remains inside its throttle window.",
          metrics: {
            throttleUntil: new Date(throttleUntil).toISOString(),
          },
        });
      }

      evaluations.push(evaluation);
      continue;
    }

    errors.push(
      `${symbol}: ${
        settledResult.reason instanceof Error
          ? settledResult.reason.message
          : String(settledResult.reason)
      }`,
    );
  }

  if (evaluations.length === 0) {
    throw new Error(
      errors.length > 0
        ? `Autonomy could not evaluate any symbols. ${errors.join("; ")}`
        : "Autonomy could not evaluate any symbols.",
    );
  }

  const best =
    evaluations
      .filter((evaluation) => evaluation.score > 0)
      .sort((left, right) => right.score - left.score)[0] ??
    evaluations.sort((left, right) => right.score - left.score)[0];

  const candidateScores = evaluations
    .map(toAutonomyCandidateScore)
    .sort((left, right) => right.score - left.score);

  return { best, symbols, errors, candidateScores };
}

export async function stopAutonomyLoop() {
  ensureAutonomyScheduler();

  await updateAutonomyState((state) => ({
    ...state,
    running: false,
    nextRunAt: undefined,
    inFlight: false,
    leaseId: undefined,
    leaseAcquiredAt: undefined,
  }));

  return getAutonomyStatus();
}

export async function dispatchAutonomyWorker(options?: {
  force?: boolean;
  trigger?: "manual_start" | "status_poll" | "scheduler" | "manual";
}) {
  ensureAutonomyScheduler();

  const rawState = await readAutonomyState();
  const state = normalizeWorkerLeaseState(rawState);
  if (state !== rawState) {
    await writeAutonomyState(state);
  }
  if (!state.running) {
    return { executed: false, reason: "autonomy stopped" } as const;
  }

  if (!options?.force && !shouldRunNow(state)) {
    return { executed: false, reason: "not due yet" } as const;
  }

  if (state.inFlight && isLeaseActive(state.leaseAcquiredAt)) {
    return { executed: false, reason: "worker already in flight" } as const;
  }

  const leaseId = makeLeaseId();
  const leased = await updateAutonomyState((current) => {
    if (!current.running) {
      return current;
    }

    if (current.inFlight && isLeaseActive(current.leaseAcquiredAt)) {
      return current;
    }

    return {
      ...current,
      inFlight: true,
      leaseId,
      leaseAcquiredAt: new Date().toISOString(),
      lastError: undefined,
    };
  });

  if (leased.leaseId !== leaseId) {
    return {
      executed: false,
      reason: "failed to acquire worker lease",
    } as const;
  }

  const startedAt = new Date().toISOString();
  let execution: ExecutionResult | undefined;

  try {
    const budgetRemainingUsd =
      leased.budgetUsd && leased.budgetUsd > 0
        ? Math.max(0, leased.budgetUsd - (await getTodayExecutedNotionalUsd()))
        : 0;
    const { best, symbols, errors, candidateScores } = await selectAutonomyRun(
      leased,
      budgetRemainingUsd,
    );
    const snapshot = best.snapshot;
    const result = best.result;
    const decision = result.consensus.decision ?? result.consensus.signal;
    const positionAwareCooldownActive =
      leased.lastTradeAt !== undefined &&
      Date.now() - leased.lastTradeAt < leased.cooldownMs &&
      leased.symbol === result.consensus.symbol &&
      decision === "BUY" &&
      best.portfolioState.positionState === "long";

    if (positionAwareCooldownActive) {
      execution = {
        status: "hold",
        timestamp: new Date().toISOString(),
        symbol: result.consensus.symbol,
        decision,
        size: 0,
        reason: "autonomy cooldown active",
        response: {
          cooldownMs: leased.cooldownMs,
        },
        rejectionReasons: [
          {
            layer: "autonomy",
            code: "autonomy_cooldown_active",
            summary: "Position-aware autonomy cooldown is active.",
            detail:
              "The worker skipped the buy because the same symbol already has active spot inventory and remains inside its cooldown window.",
            metrics: {
              cooldownMs: leased.cooldownMs,
              portfolioConcentrationPct: Number(
                (best.portfolioState.portfolioConcentrationPct * 100).toFixed(
                  4,
                ),
              ),
              positionState: best.portfolioState.positionState,
            },
          },
        ],
      };
    } else if (
      (!snapshot.status.tradeable ||
        (liveExecutionRequiresRealtime() && !snapshot.status.realtime)) &&
      decision !== "HOLD"
    ) {
      execution = {
        status: "hold",
        timestamp: new Date().toISOString(),
        symbol: result.consensus.symbol,
        decision,
        size: 0,
        reason: "market data not tradeable",
        response: {
          marketStatus: snapshot.status,
        },
        rejectionReasons: [
          {
            layer: "market_data",
            code: "autonomy_market_not_tradeable",
            summary:
              "Autonomy rejected the candidate because market data was not tradeable.",
            detail:
              "The worker will not execute on stale or degraded market data.",
            metrics: {
              realtime: snapshot.status.realtime,
              tradeable: snapshot.status.tradeable,
              connectionState: snapshot.status.connectionState,
            },
          },
        ],
      };
    } else {
      execution = await autoExecuteConsensus(result.consensus);
    }

    await updateAutonomyState((current) => ({
      ...current,
      symbolThrottleUntil: {
        ...(current.symbolThrottleUntil ?? {}),
        [result.consensus.symbol]:
          result.consensus.symbolThrottleMs &&
          result.consensus.symbolThrottleMs > 0
            ? new Date(
                Date.now() + result.consensus.symbolThrottleMs,
              ).toISOString()
            : (current.symbolThrottleUntil?.[result.consensus.symbol] ??
              new Date().toISOString()),
      },
      inFlight: false,
      leaseId: undefined,
      leaseAcquiredAt: undefined,
      symbol: result.consensus.symbol,
      candidateSymbols:
        leased.selectionMode === "auto" ? symbols : current.candidateSymbols,
      lastRunAt: startedAt,
      nextRunAt: current.running
        ? new Date(Date.now() + current.intervalMs).toISOString()
        : undefined,
      lastDecision: decision,
      lastExecutionStatus: execution?.status,
      lastError: execution?.status === "error" ? execution.error : undefined,
      lastReason:
        execution?.reason ??
        execution?.error ??
        (errors.length > 0
          ? `Partial scan issues: ${errors.join("; ")}`
          : undefined),
      lastCandidateScores: candidateScores,
      lastSelectedCandidate: toAutonomyCandidateScore(best),
      lastRejectedReasons:
        execution?.rejectionReasons ?? result.consensus.rejectionReasons,
      iterationCount: current.iterationCount + 1,
      lastTradeAt:
        execution?.status === "success" ? Date.now() : current.lastTradeAt,
    }));

    return {
      executed: true,
      trigger: options?.trigger ?? "manual",
      execution,
    } as const;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown autonomy error";

    await updateAutonomyState((current) => ({
      ...current,
      inFlight: false,
      leaseId: undefined,
      leaseAcquiredAt: undefined,
      lastRunAt: startedAt,
      nextRunAt: current.running
        ? new Date(Date.now() + current.intervalMs).toISOString()
        : undefined,
      lastExecutionStatus: "error",
      lastError: message,
      lastReason: message,
      iterationCount: current.iterationCount + 1,
    }));

    return {
      executed: false,
      trigger: options?.trigger ?? "manual",
      reason: message,
    } as const;
  }
}

export async function maybeDispatchDueAutonomyRun() {
  const state = await readAutonomyState();
  if (!shouldRunNow(state)) {
    return false;
  }

  await dispatchAutonomyWorker({ trigger: "status_poll" });
  return true;
}
