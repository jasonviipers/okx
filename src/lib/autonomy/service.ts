import "server-only";

import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import {
  getMarketSnapshot,
  getRealtimeMarketContext,
} from "@/lib/market-data/service";
import { getAccountOverview } from "@/lib/okx/account";
import { OkxRequestError } from "@/lib/okx/client";
import {
  getAutonomousSymbolUniverse,
  getConfiguredAutonomousQuoteCurrencies,
  getQuoteCurrenciesFromBalances,
} from "@/lib/okx/instruments";
import type {
  AutonomySelectionMode,
  StoredAutonomyState,
  StoredAutonomySuppressedSymbol,
} from "@/lib/persistence/autonomy-state";
import {
  readAutonomyState,
  updateAutonomyState,
  writeAutonomyState,
} from "@/lib/persistence/autonomy-state";
import { getHistory } from "@/lib/persistence/history";
import { autoExecuteConsensus } from "@/lib/swarm/autoExecute";
import { runSwarm } from "@/lib/swarm/orchestrator";
import {
  incrementCounter,
  info,
  observeHistogram,
  setGauge,
  error as telemetryError,
  warn,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
import type {
  AutonomyCandidateScore,
  AutonomyStatus,
  AutonomySuppressedSymbol,
} from "@/types/api";
import type { Timeframe } from "@/types/market";
import type { ExecutionResult, SwarmRunResult } from "@/types/swarm";
import type { AccountAssetBalance, AccountOverview } from "@/types/trade";

const WORKER_LEASE_TIMEOUT_MS = 5 * 60_000;
const AUTONOMY_SCHEDULER_TICK_MS = 5_000;
const DEFAULT_MAX_SYMBOL_ALLOCATION_PCT = 0.35;
const DEFAULT_PORTFOLIO_BUFFER_PCT = 0.9;
const DEFAULT_MIN_TRADE_NOTIONAL_USD = 5;
const DEFAULT_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD = 10;
const DEFAULT_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS = 30 * 60_000;

declare global {
  var __okxAutonomyScheduler: NodeJS.Timeout | undefined;
}

function autoStartEnabledByEnv(): boolean {
  const val = process.env.AUTONOMOUS_TRADING_ENABLED?.toLowerCase();
  return val !== "false";
}

function toAutonomySymbolKey(symbol: string) {
  return symbol.trim().toUpperCase();
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDegradedSnapshotSuppressionThreshold(): number {
  return Math.max(
    1,
    Math.trunc(
      parseNumber(
        process.env.AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD,
        DEFAULT_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD,
      ),
    ),
  );
}

function getDegradedSnapshotSuppressionWindowMs(): number {
  return Math.max(
    60_000,
    Math.trunc(
      parseNumber(
        process.env.AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS,
        DEFAULT_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS,
      ),
    ),
  );
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

function normalizeDegradedSnapshotCounts(
  counts?: StoredAutonomyState["degradedSnapshotCounts"],
): Record<string, number> {
  const entries = Object.entries(counts ?? {}).filter((entry) => {
    const value = entry[1];
    return (
      Number.isFinite(value) &&
      value !== undefined &&
      Math.trunc(value) > 0 &&
      entry[0].trim().length > 0
    );
  });

  return Object.fromEntries(
    entries.map(([symbol, value]) => [
      toAutonomySymbolKey(symbol),
      Math.trunc(value),
    ]),
  );
}

function normalizeSuppressedSymbols(
  suppressed?: StoredAutonomyState["suppressedSymbols"],
): Record<string, StoredAutonomySuppressedSymbol> {
  const now = Date.now();
  const entries = Object.entries(suppressed ?? {}).filter((entry) => {
    const [symbol, value] = entry;
    if (!symbol || !value?.until) {
      return false;
    }

    const until = new Date(value.until).getTime();
    return Number.isFinite(until) && until > now;
  });

  return Object.fromEntries(
    entries.map(([symbol, value]) => [
      toAutonomySymbolKey(symbol),
      {
        until: value.until,
        reason: value.reason,
        consecutiveDegradedSnapshots: Math.max(
          1,
          Math.trunc(value.consecutiveDegradedSnapshots),
        ),
      },
    ]),
  );
}

function areNumberRecordsEqual(
  left?: Record<string, number>,
  right?: Record<string, number>,
) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right?.[key] === value);
}

function areSuppressedRecordsEqual(
  left?: Record<string, StoredAutonomySuppressedSymbol>,
  right?: Record<string, StoredAutonomySuppressedSymbol>,
) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => {
    const other = right?.[key];
    return (
      other?.until === value.until &&
      other?.reason === value.reason &&
      other?.consecutiveDegradedSnapshots === value.consecutiveDegradedSnapshots
    );
  });
}

function normalizeAutonomyState(
  state: StoredAutonomyState,
): StoredAutonomyState {
  const withLeaseState = normalizeWorkerLeaseState(state);
  const degradedSnapshotCounts = normalizeDegradedSnapshotCounts(
    withLeaseState.degradedSnapshotCounts,
  );
  const suppressedSymbols = normalizeSuppressedSymbols(
    withLeaseState.suppressedSymbols,
  );

  if (
    withLeaseState === state &&
    areNumberRecordsEqual(
      state.degradedSnapshotCounts,
      degradedSnapshotCounts,
    ) &&
    areSuppressedRecordsEqual(state.suppressedSymbols, suppressedSymbols)
  ) {
    return state;
  }

  return {
    ...withLeaseState,
    degradedSnapshotCounts,
    suppressedSymbols,
  };
}

function toSuppressedSymbols(
  state: StoredAutonomyState,
): AutonomySuppressedSymbol[] {
  return Object.entries(state.suppressedSymbols ?? {})
    .map(([symbol, value]) => ({
      symbol,
      until: value.until,
      reason: value.reason,
      consecutiveDegradedSnapshots: value.consecutiveDegradedSnapshots,
    }))
    .sort(
      (left, right) =>
        new Date(left.until).getTime() - new Date(right.until).getTime(),
    );
}

function isSymbolSuppressed(
  state: StoredAutonomyState,
  symbol: string,
): boolean {
  const symbolKey = toAutonomySymbolKey(symbol);
  const suppressedUntil = state.suppressedSymbols?.[symbolKey]?.until;
  if (!suppressedUntil) {
    return false;
  }

  const ts = new Date(suppressedUntil).getTime();
  return Number.isFinite(ts) && ts > Date.now();
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

function resolveInternalBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  // Fallback for local development
  return "http://localhost:3000";
}

function toAutonomyStatus(
  state: StoredAutonomyState,
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
    suppressedSymbols: toSuppressedSymbols(state),
  };
}

function shouldRunNow(state: StoredAutonomyState) {
  return (
    state.running &&
    (!state.nextRunAt || new Date(state.nextRunAt).getTime() <= Date.now())
  );
}

function ensureAutonomyScheduler() {
  if (globalThis.__okxAutonomyScheduler) {
    return;
  }

  info("autonomy", "Starting autonomy scheduler", {
    tickMs: AUTONOMY_SCHEDULER_TICK_MS,
  });
  setGauge(
    "autonomy_scheduler_active",
    "Whether the autonomy scheduler loop is active.",
    1,
  );
  const timer = setInterval(() => {
    void maybeDispatchDueAutonomyRun("scheduler").catch((error) => {
      incrementCounter(
        "autonomy_scheduler_errors_total",
        "Total autonomy scheduler dispatch errors.",
      );
      telemetryError("autonomy", "Failed to dispatch due autonomy run", {
        error,
      });
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
    info("autonomy", "Autonomy boot skipped because env disables auto-start");
    return;
  }

  const rawState = await readAutonomyState();
  const state = normalizeAutonomyState(rawState);
  if (state !== rawState) {
    await writeAutonomyState(state);
  }
  if (state.running) {
    setGauge(
      "autonomy_running",
      "Whether autonomy is currently marked as running.",
      1,
    );
    return;
  }

  await writeAutonomyState({
    ...state,
    running: true,
    nextRunAt: state.nextRunAt ?? new Date().toISOString(),
    lastError: undefined,
  });
  setGauge(
    "autonomy_running",
    "Whether autonomy is currently marked as running.",
    1,
  );
  info("autonomy", "Autonomy boot state initialized", {
    symbol: state.symbol,
    timeframe: state.timeframe,
  });
}

export async function getAutonomyStatus(): Promise<AutonomyStatus> {
  ensureAutonomyScheduler();

  const [rawState, usedBudgetUsd] = await Promise.all([
    readAutonomyState(),
    getTodayExecutedNotionalUsd(),
  ]);
  const state = normalizeAutonomyState(rawState);
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
  setGauge(
    "autonomy_running",
    "Whether autonomy is currently marked as running.",
    1,
  );
  info("autonomy", "Autonomy loop started", {
    symbol: config?.symbol,
    timeframe: config?.timeframe,
    selectionMode: config?.selectionMode,
  });

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
  state: StoredAutonomyState,
  accountOverview: AccountOverview,
): Promise<string[]> {
  if (state.selectionMode === "fixed") {
    return isSymbolSuppressed(state, state.symbol) ? [] : [state.symbol];
  }
  const balanceQuotes = getQuoteCurrenciesFromBalances(
    accountOverview.tradingBalances,
  );
  const quoteCurrencies = [
    ...balanceQuotes,
    ...getConfiguredAutonomousQuoteCurrencies(),
  ];

  const symbols = await getAutonomousSymbolUniverse({
    quoteCurrencies,
    balances: accountOverview.tradingBalances,
  });

  return symbols.filter((symbol) => !isSymbolSuppressed(state, symbol));
}

async function evaluateAutonomyCandidate(
  symbol: string,
  timeframe: Timeframe,
  budgetRemainingUsd: number,
  accountOverview: AccountOverview,
): Promise<AutonomySymbolEvaluation> {
  return withTelemetrySpan(
    {
      name: "autonomy.evaluate_candidate",
      source: "autonomy",
      attributes: {
        symbol,
        timeframe,
      },
    },
    async (span) => {
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
      span.addAttributes({
        decision: result.consensus.decision ?? result.consensus.signal,
        blocked: result.consensus.blocked,
        score,
        portfolioFitScore,
      });
      incrementCounter(
        "autonomy_candidate_evaluations_total",
        "Total autonomy candidate evaluations.",
        1,
        {
          timeframe,
          decision: result.consensus.decision ?? result.consensus.signal,
          blocked: result.consensus.blocked,
        },
      );

      return {
        symbol,
        snapshot,
        result,
        score,
        portfolioState,
        portfolioFitScore,
      };
    },
  );
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
  state: StoredAutonomyState,
  symbol: string,
): number | null {
  const iso = state.symbolThrottleUntil?.[symbol];
  if (!iso) {
    return null;
  }

  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : null;
}

type AutonomySelectionResult = {
  best: AutonomySymbolEvaluation | null;
  symbols: string[];
  errors: string[];
  candidateScores: AutonomyCandidateScore[];
  degradedSnapshotCounts: Record<string, number>;
  suppressedSymbols: Record<string, StoredAutonomySuppressedSymbol>;
  reason?: string;
};

function createMarketHealthState(state: StoredAutonomyState) {
  return {
    degradedSnapshotCounts: { ...(state.degradedSnapshotCounts ?? {}) },
    suppressedSymbols: { ...(state.suppressedSymbols ?? {}) },
  };
}

function recordHealthySymbolSnapshot(
  marketHealthState: ReturnType<typeof createMarketHealthState>,
  symbol: string,
) {
  const symbolKey = toAutonomySymbolKey(symbol);
  delete marketHealthState.degradedSnapshotCounts[symbolKey];
  delete marketHealthState.suppressedSymbols[symbolKey];
}

function recordDegradedSymbolSnapshot(
  marketHealthState: ReturnType<typeof createMarketHealthState>,
  symbol: string,
  reason: string,
) {
  const symbolKey = toAutonomySymbolKey(symbol);
  const nextCount =
    (marketHealthState.degradedSnapshotCounts[symbolKey] ?? 0) + 1;
  marketHealthState.degradedSnapshotCounts[symbolKey] = nextCount;

  if (nextCount < getDegradedSnapshotSuppressionThreshold()) {
    return;
  }

  const until = new Date(
    Date.now() + getDegradedSnapshotSuppressionWindowMs(),
  ).toISOString();
  const previousSuppression = marketHealthState.suppressedSymbols[symbolKey];
  marketHealthState.suppressedSymbols[symbolKey] = {
    until,
    reason,
    consecutiveDegradedSnapshots: nextCount,
  };
  if (!previousSuppression) {
    warn(
      "autonomy",
      "Suppressing symbol after consecutive degraded snapshots",
      {
        symbol,
        until,
        consecutiveDegradedSnapshots: nextCount,
        reason,
      },
    );
  }
}

function getDegradedSnapshotReason(
  evaluation: AutonomySymbolEvaluation,
): string {
  return (
    evaluation.snapshot.status.warnings[0] ??
    `Market data remained degraded for ${evaluation.symbol}.`
  );
}

function summarizeAutonomyCandidateBlockers(
  candidateScores: AutonomyCandidateScore[],
): string | undefined {
  const summary = candidateScores
    .slice(0, 3)
    .map((candidate) => {
      const rejectionSummary = candidate.rejectionReasons
        .slice(0, 2)
        .map((reason) => reason.summary)
        .join(" | ");
      return rejectionSummary
        ? `${candidate.symbol} (${candidate.decision}, score=${candidate.score.toFixed(3)}): ${rejectionSummary}`
        : `${candidate.symbol} (${candidate.decision}, score=${candidate.score.toFixed(3)})`;
    })
    .join("; ");

  return summary || undefined;
}

function isMarketDataEvaluationError(reason: unknown): reason is Error {
  if (!(reason instanceof Error)) {
    return false;
  }

  if (reason instanceof OkxRequestError) {
    return true;
  }

  const message = reason.message.toLowerCase();
  return (
    message.includes("market data unavailable") ||
    message.includes("live ticker unavailable") ||
    message.includes("live order book unavailable") ||
    message.includes("live candles unavailable")
  );
}

async function selectAutonomyRun(
  state: StoredAutonomyState,
  budgetRemainingUsd: number,
): Promise<AutonomySelectionResult> {
  return withTelemetrySpan(
    {
      name: "autonomy.select_run",
      source: "autonomy",
      attributes: {
        timeframe: state.timeframe,
        selectionMode: state.selectionMode,
      },
    },
    async (span) => {
      const accountOverview = await getAccountOverview();
      const symbols = await resolveAutonomySymbols(state, accountOverview);
      const marketHealthState = createMarketHealthState(state);

      if (symbols.length === 0) {
        const reason =
          state.selectionMode === "auto"
            ? "All automatically selected symbols are temporarily suppressed due to degraded market data."
            : "Autonomy has no symbol available to evaluate.";
        span.addAttributes({
          candidateCount: 0,
          errors: 0,
          reason,
        });
        warn("autonomy", "Autonomy skipped candidate selection", {
          timeframe: state.timeframe,
          selectionMode: state.selectionMode,
          reason,
          suppressedSymbols: toSuppressedSymbols(state),
        });
        return {
          best: null,
          symbols,
          errors: [],
          candidateScores: [],
          degradedSnapshotCounts: marketHealthState.degradedSnapshotCounts,
          suppressedSymbols: marketHealthState.suppressedSymbols,
          reason,
        };
      }

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
          if (
            evaluation.snapshot.status.tradeable &&
            evaluation.snapshot.status.realtime
          ) {
            recordHealthySymbolSnapshot(marketHealthState, symbol);
          } else {
            recordDegradedSymbolSnapshot(
              marketHealthState,
              symbol,
              getDegradedSnapshotReason(evaluation),
            );
          }
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

        if (isMarketDataEvaluationError(settledResult.reason)) {
          recordDegradedSymbolSnapshot(
            marketHealthState,
            symbol,
            settledResult.reason.message,
          );
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
        const reason =
          errors.length > 0
            ? `Autonomy could not evaluate any symbols. ${errors.join("; ")}`
            : "Autonomy could not evaluate any symbols.";
        span.addAttributes({
          candidateCount: 0,
          errors: errors.length,
          reason,
        });
        return {
          best: null,
          symbols,
          errors,
          candidateScores: [],
          degradedSnapshotCounts: marketHealthState.degradedSnapshotCounts,
          suppressedSymbols: marketHealthState.suppressedSymbols,
          reason,
        };
      }

      const rankedEvaluations = [...evaluations].sort(
        (left, right) => right.score - left.score,
      );
      const best =
        rankedEvaluations.find((evaluation) => evaluation.score > 0) ?? null;
      const candidateScores = rankedEvaluations
        .map(toAutonomyCandidateScore)
        .sort((left, right) => right.score - left.score);
      const topCandidate = candidateScores[0];

      span.addAttributes({
        candidateCount: candidateScores.length,
        bestSymbol: best?.symbol,
        bestScore: best?.score ?? 0,
        errors: errors.length,
      });
      if (!best) {
        const blockerSummary =
          summarizeAutonomyCandidateBlockers(candidateScores) ??
          "No candidate blocker summary was available.";
        const reason = `Autonomy evaluated ${candidateScores.length} candidate(s), but none were execution-eligible. Top blockers: ${blockerSummary}`;
        warn("autonomy", "Autonomy found no executable candidate", {
          bestSymbol: topCandidate?.symbol,
          timeframe: state.timeframe,
          candidateScores: candidateScores.slice(0, 3),
          errors,
          reason,
        });
        span.addAttributes({
          reason,
        });

        return {
          best: null,
          symbols,
          errors,
          candidateScores,
          degradedSnapshotCounts: marketHealthState.degradedSnapshotCounts,
          suppressedSymbols: marketHealthState.suppressedSymbols,
          reason,
        };
      }

      return {
        best,
        symbols,
        errors,
        candidateScores,
        degradedSnapshotCounts: marketHealthState.degradedSnapshotCounts,
        suppressedSymbols: marketHealthState.suppressedSymbols,
      };
    },
  );
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
  setGauge(
    "autonomy_running",
    "Whether autonomy is currently marked as running.",
    0,
  );
  setGauge(
    "autonomy_inflight",
    "Whether an autonomy worker lease is currently active.",
    0,
  );
  info("autonomy", "Autonomy loop stopped");

  return getAutonomyStatus();
}

export async function dispatchAutonomyWorker(options?: {
  force?: boolean;
  trigger?: "manual_start" | "status_poll" | "scheduler" | "manual";
}) {
  ensureAutonomyScheduler();

  return withTelemetrySpan(
    {
      name: "autonomy.dispatch_worker",
      source: "autonomy",
      attributes: {
        trigger: options?.trigger ?? "manual",
        force: options?.force ?? false,
      },
    },
    async (span) => {
      const workerStartedAt = Date.now();
      const rawState = await readAutonomyState();
      const state = normalizeAutonomyState(rawState);
      if (state !== rawState) {
        await writeAutonomyState(state);
      }
      setGauge(
        "autonomy_running",
        "Whether autonomy is currently marked as running.",
        state.running ? 1 : 0,
      );
      setGauge(
        "autonomy_inflight",
        "Whether an autonomy worker lease is currently active.",
        state.inFlight ? 1 : 0,
      );

      if (!state.running) {
        incrementCounter(
          "autonomy_worker_skips_total",
          "Total skipped autonomy worker dispatches.",
          1,
          {
            reason: "autonomy_stopped",
            trigger: options?.trigger ?? "manual",
          },
        );
        return { executed: false, reason: "autonomy stopped" } as const;
      }

      if (!options?.force && !shouldRunNow(state)) {
        incrementCounter(
          "autonomy_worker_skips_total",
          "Total skipped autonomy worker dispatches.",
          1,
          {
            reason: "not_due_yet",
            trigger: options?.trigger ?? "manual",
          },
        );
        return { executed: false, reason: "not due yet" } as const;
      }

      if (state.inFlight && isLeaseActive(state.leaseAcquiredAt)) {
        incrementCounter(
          "autonomy_worker_skips_total",
          "Total skipped autonomy worker dispatches.",
          1,
          {
            reason: "lease_active",
            trigger: options?.trigger ?? "manual",
          },
        );
        return { executed: false, reason: "worker already in flight" } as const;
      }

      const leaseId = makeLeaseId();
      const leasedRaw = await updateAutonomyState((current) => {
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
      const leased = normalizeAutonomyState(leasedRaw);
      if (leased !== leasedRaw) {
        await writeAutonomyState(leased);
      }

      if (leased.leaseId !== leaseId) {
        incrementCounter(
          "autonomy_worker_skips_total",
          "Total skipped autonomy worker dispatches.",
          1,
          {
            reason: "lease_not_acquired",
            trigger: options?.trigger ?? "manual",
          },
        );
        return {
          executed: false,
          reason: "failed to acquire worker lease",
        } as const;
      }
      setGauge(
        "autonomy_inflight",
        "Whether an autonomy worker lease is currently active.",
        1,
      );

      const startedAt = new Date().toISOString();
      const baseUrl = resolveInternalBaseUrl();
      let execution: ExecutionResult | undefined;

      try {
        const budgetRemainingUsd =
          leased.budgetUsd && leased.budgetUsd > 0
            ? Math.max(
                0,
                leased.budgetUsd - (await getTodayExecutedNotionalUsd()),
              )
            : 0;
        const {
          best,
          symbols,
          errors,
          candidateScores,
          degradedSnapshotCounts,
          suppressedSymbols,
          reason: selectionReason,
        } = await selectAutonomyRun(leased, budgetRemainingUsd);
        const selectedCandidate = best
          ? toAutonomyCandidateScore(best)
          : undefined;
        const result = best?.result;
        const decision = result
          ? (result.consensus.decision ?? result.consensus.signal)
          : "HOLD";
        const selectedSymbol = result?.consensus.symbol ?? leased.symbol;
        const positionAwareCooldownActive =
          best !== null &&
          leased.lastTradeAt !== undefined &&
          Date.now() - leased.lastTradeAt < leased.cooldownMs &&
          leased.symbol === result?.consensus.symbol &&
          decision === "BUY" &&
          best.portfolioState.positionState === "long";

        span.addAttributes({
          budgetRemainingUsd,
          selectedSymbol,
          selectedDecision: decision,
          candidateCount: candidateScores.length,
        });

        if (!best) {
          execution = {
            status: "hold",
            timestamp: new Date().toISOString(),
            symbol: leased.symbol,
            decision: "HOLD",
            size: 0,
            reason:
              selectionReason ??
              "Autonomy did not find a candidate to execute.",
            response: {
              suppressedSymbols: Object.entries(suppressedSymbols).map(
                ([symbol, value]) => ({
                  symbol,
                  until: value.until,
                  consecutiveDegradedSnapshots:
                    value.consecutiveDegradedSnapshots,
                }),
              ),
            },
            rejectionReasons: [
              {
                layer: "autonomy",
                code: "autonomy_no_candidate_available",
                summary: "Autonomy did not find an executable candidate.",
                detail:
                  selectionReason ??
                  "The symbol universe was exhausted by degraded market data or evaluation failures.",
                metrics: {
                  suppressedSymbols: Object.keys(suppressedSymbols).length,
                  partialErrors: errors.length,
                },
              },
            ],
          };
        } else if (positionAwareCooldownActive) {
          execution = {
            status: "hold",
            timestamp: new Date().toISOString(),
            symbol: best.result.consensus.symbol,
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
                    (
                      best.portfolioState.portfolioConcentrationPct * 100
                    ).toFixed(4),
                  ),
                  positionState: best.portfolioState.positionState,
                },
              },
            ],
          };
        } else if (
          (!best.snapshot.status.tradeable || !best.snapshot.status.realtime) &&
          decision !== "HOLD"
        ) {
          execution = {
            status: "hold",
            timestamp: new Date().toISOString(),
            symbol: best.result.consensus.symbol,
            decision,
            size: 0,
            reason: "market data not healthy",
            response: {
              marketStatus: best.snapshot.status,
            },
            rejectionReasons: [
              {
                layer: "market_data",
                code: "autonomy_market_not_tradeable",
                summary:
                  "Autonomy rejected the candidate because market data was not healthy enough to execute.",
                detail:
                  "The worker will not execute on stale, degraded, or non-realtime market data.",
                metrics: {
                  realtime: best.snapshot.status.realtime,
                  tradeable: best.snapshot.status.tradeable,
                  connectionState: best.snapshot.status.connectionState,
                },
              },
            ],
          };
        } else {
          execution = await autoExecuteConsensus(
            best.result.consensus,
            baseUrl,
          );
        }

        await updateAutonomyState((current) => ({
          ...current,
          symbolThrottleUntil:
            result && selectedSymbol
              ? {
                  ...(current.symbolThrottleUntil ?? {}),
                  [selectedSymbol]:
                    result.consensus.symbolThrottleMs &&
                    result.consensus.symbolThrottleMs > 0
                      ? new Date(
                          Date.now() + result.consensus.symbolThrottleMs,
                        ).toISOString()
                      : (current.symbolThrottleUntil?.[selectedSymbol] ??
                        new Date().toISOString()),
                }
              : current.symbolThrottleUntil,
          degradedSnapshotCounts,
          suppressedSymbols,
          inFlight: false,
          leaseId: undefined,
          leaseAcquiredAt: undefined,
          symbol: result ? selectedSymbol : current.symbol,
          candidateSymbols:
            leased.selectionMode === "auto"
              ? symbols
              : current.candidateSymbols,
          lastRunAt: startedAt,
          nextRunAt: current.running
            ? new Date(Date.now() + current.intervalMs).toISOString()
            : undefined,
          lastDecision: decision,
          lastExecutionStatus: execution?.status,
          lastError:
            execution?.status === "error" ? execution.error : undefined,
          lastReason:
            execution?.reason ??
            execution?.error ??
            selectionReason ??
            (errors.length > 0
              ? `Partial scan issues: ${errors.join("; ")}`
              : undefined),
          lastCandidateScores: candidateScores,
          lastSelectedCandidate: selectedCandidate,
          lastRejectedReasons:
            execution?.rejectionReasons ??
            result?.consensus.rejectionReasons ??
            current.lastRejectedReasons,
          iterationCount: current.iterationCount + 1,
          lastTradeAt:
            execution?.status === "success" ? Date.now() : current.lastTradeAt,
        }));

        const workerDurationMs = Date.now() - workerStartedAt;
        observeHistogram(
          "autonomy_worker_duration_ms",
          "Duration of autonomy worker dispatches in milliseconds.",
          workerDurationMs,
          {
            labels: {
              trigger: options?.trigger ?? "manual",
              status: execution?.status ?? "unknown",
            },
          },
        );
        incrementCounter(
          "autonomy_worker_runs_total",
          "Total executed autonomy worker runs.",
          1,
          {
            trigger: options?.trigger ?? "manual",
            status: execution?.status ?? "unknown",
            decision,
          },
        );
        setGauge(
          "autonomy_inflight",
          "Whether an autonomy worker lease is currently active.",
          0,
        );

        if (execution?.status !== "success") {
          warn("autonomy", "Autonomy worker completed without a trade", {
            trigger: options?.trigger ?? "manual",
            execution,
            selectedCandidate,
            partialErrors: errors,
          });
        } else {
          info("autonomy", "Autonomy worker executed a trade", {
            trigger: options?.trigger ?? "manual",
            execution,
            selectedCandidate,
          });
        }

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
        setGauge(
          "autonomy_inflight",
          "Whether an autonomy worker lease is currently active.",
          0,
        );
        incrementCounter(
          "autonomy_worker_errors_total",
          "Total autonomy worker errors.",
          1,
          {
            trigger: options?.trigger ?? "manual",
          },
        );
        telemetryError("autonomy", "Autonomy worker failed", {
          trigger: options?.trigger ?? "manual",
          error,
        });

        return {
          executed: false,
          trigger: options?.trigger ?? "manual",
          reason: message,
        } as const;
      }
    },
  );
}

export async function maybeDispatchDueAutonomyRun(
  trigger: "status_poll" | "scheduler" = "status_poll",
) {
  const rawState = await readAutonomyState();
  const state = normalizeAutonomyState(rawState);
  if (state !== rawState) {
    await writeAutonomyState(state);
  }
  const due = shouldRunNow(state);
  info("autonomy", "Autonomy scheduler heartbeat", {
    trigger,
    running: state.running,
    due,
    intervalMs: state.intervalMs,
    nextRunAt: state.nextRunAt,
    lastRunAt: state.lastRunAt,
    inFlight: state.inFlight,
    leaseId: state.leaseId,
  });
  if (!due) {
    return false;
  }

  await dispatchAutonomyWorker({ trigger });
  return true;
}
