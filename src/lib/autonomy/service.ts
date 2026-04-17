import "server-only";

import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import {
  getMarketSnapshot,
  getRealtimeMarketContext,
} from "@/lib/market-data/service";
import { getAutonomousSymbolUniverse } from "@/lib/okx/instruments";
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

const WORKER_LEASE_TIMEOUT_MS = 5 * 60_000;

function autoStartEnabledByEnv(): boolean {
  return process.env.AUTONOMOUS_TRADING_ENABLED?.toLowerCase() === "true";
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

export async function ensureAutonomyBootState() {
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

function parseSymbolList(value: string[] | undefined): string[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  return [
    ...new Set(
      value.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ];
}

type AutonomySymbolEvaluation = {
  symbol: string;
  snapshot: Awaited<ReturnType<typeof getMarketSnapshot>>;
  result: SwarmRunResult;
  score: number;
};

function liveExecutionRequiresRealtime() {
  return getOkxAccountModeLabel() === "live";
}

function toAutonomyCandidateScore(
  evaluation: AutonomySymbolEvaluation,
): AutonomyCandidateScore {
  const { symbol, snapshot, result, score } = evaluation;
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
    rejectionReasons: consensus.rejectionReasons,
  };
}

function scoreAutonomyCandidate(
  evaluation: Omit<AutonomySymbolEvaluation, "score">,
): number {
  const { snapshot, result } = evaluation;
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
    return 0;
  }

  const expectedNetEdge =
    consensus.expectedNetEdgeBps !== undefined
      ? Math.max(0, consensus.expectedNetEdgeBps)
      : consensus.expectedValue?.netEdgeBps !== undefined
        ? Math.max(0, consensus.expectedValue.netEdgeBps)
      : 0;
  const marketQuality =
    consensus.marketQualityScore ?? consensus.harness?.marketQualityScore ?? 0.5;

  return Number(
    (
      confidence * 0.45 +
      agreement * 0.15 +
      Math.min(expectedNetEdge / 25, 1) * 0.25 +
      marketQuality * 0.15
    ).toFixed(6),
  );
}

async function resolveAutonomySymbols(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
): Promise<string[]> {
  if (state.selectionMode === "fixed") {
    return [state.symbol];
  }

  const configured = parseSymbolList(state.candidateSymbols);
  if (configured && configured.length > 0) {
    return configured;
  }

  return getAutonomousSymbolUniverse();
}

async function evaluateAutonomyCandidate(
  symbol: string,
  timeframe: Timeframe,
  budgetRemainingUsd: number,
): Promise<AutonomySymbolEvaluation> {
  const snapshot = await getMarketSnapshot(symbol, timeframe);
  const ctx = await getRealtimeMarketContext(symbol, timeframe);
  const result = await runSwarm(ctx, {
    budgetRemainingUsd,
  });
  return {
    symbol,
    snapshot,
    result,
    score: scoreAutonomyCandidate({ symbol, snapshot, result }),
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
  const symbols = await resolveAutonomySymbols(state);
  const evaluations: AutonomySymbolEvaluation[] = [];
  const errors: string[] = [];
  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      evaluateAutonomyCandidate(symbol, state.timeframe, budgetRemainingUsd),
    ),
  );

  for (const [index, settledResult] of settled.entries()) {
    const symbol = symbols[index];
    if (!symbol) {
      continue;
    }

    if (settledResult.status === "fulfilled") {
      let evaluation = settledResult.value;
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

    const inCooldown =
      leased.lastTradeAt !== undefined &&
      Date.now() - leased.lastTradeAt < leased.cooldownMs;

    if (inCooldown && decision !== "HOLD") {
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
            summary: "Autonomy cooldown is active.",
            detail:
              "The worker skipped execution because the symbol is still cooling down after a recent trade.",
            metrics: {
              cooldownMs: leased.cooldownMs,
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
            summary: "Autonomy rejected the candidate because market data was not tradeable.",
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
          result.consensus.symbolThrottleMs && result.consensus.symbolThrottleMs > 0
            ? new Date(
                Date.now() + result.consensus.symbolThrottleMs,
              ).toISOString()
            : current.symbolThrottleUntil?.[result.consensus.symbol] ??
              new Date().toISOString(),
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
        execution?.rejectionReasons ??
        result.consensus.rejectionReasons,
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
