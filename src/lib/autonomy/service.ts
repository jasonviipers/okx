import "server-only";

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
import type { AutonomyStatus } from "@/types/api";
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
    consensus.blocked ||
    consensus.signal === "HOLD"
  ) {
    return 0;
  }

  return Number((confidence * 0.7 + agreement * 0.3).toFixed(6));
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
): Promise<AutonomySymbolEvaluation> {
  const snapshot = await getMarketSnapshot(symbol, timeframe);
  const ctx = await getRealtimeMarketContext(symbol, timeframe);
  const result = await runSwarm(ctx);
  return {
    symbol,
    snapshot,
    result,
    score: scoreAutonomyCandidate({ symbol, snapshot, result }),
  };
}

async function selectAutonomyRun(
  state: Awaited<ReturnType<typeof readAutonomyState>>,
) {
  const symbols = await resolveAutonomySymbols(state);
  let best: AutonomySymbolEvaluation | undefined;
  const errors: string[] = [];

  for (const symbol of symbols) {
    try {
      const evaluation = await evaluateAutonomyCandidate(
        symbol,
        state.timeframe,
      );
      if (!best || evaluation.score > best.score) {
        best = evaluation;
      }
    } catch (error) {
      errors.push(
        `${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!best) {
    throw new Error(
      errors.length > 0
        ? `Autonomy could not evaluate any symbols. ${errors.join("; ")}`
        : "Autonomy could not evaluate any symbols.",
    );
  }

  return { best, symbols, errors };
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
    const { best, symbols, errors } = await selectAutonomyRun(leased);
    const snapshot = best.snapshot;
    const result = best.result;

    const inCooldown =
      leased.lastTradeAt !== undefined &&
      Date.now() - leased.lastTradeAt < leased.cooldownMs;

    if (inCooldown && result.consensus.signal !== "HOLD") {
      execution = {
        status: "hold",
        timestamp: new Date().toISOString(),
        symbol: result.consensus.symbol,
        decision: result.consensus.signal,
        size: 0,
        reason: "autonomy cooldown active",
        response: {
          cooldownMs: leased.cooldownMs,
        },
      };
    } else if (
      !snapshot.status.tradeable &&
      result.consensus.signal !== "HOLD"
    ) {
      execution = {
        status: "hold",
        timestamp: new Date().toISOString(),
        symbol: result.consensus.symbol,
        decision: result.consensus.signal,
        size: 0,
        reason: "market data not tradeable",
        response: {
          marketStatus: snapshot.status,
        },
      };
    } else {
      execution = await autoExecuteConsensus(result.consensus);
    }

    await updateAutonomyState((current) => ({
      ...current,
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
      lastDecision: result.consensus.signal,
      lastExecutionStatus: execution?.status,
      lastError: execution?.status === "error" ? execution.error : undefined,
      lastReason:
        execution?.reason ??
        execution?.error ??
        (errors.length > 0
          ? `Partial scan issues: ${errors.join("; ")}`
          : undefined),
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
