import "server-only";

import {
  getMarketSnapshot,
  getRealtimeMarketContext,
} from "@/lib/market-data/service";
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
import type { ExecutionResult } from "@/types/swarm";

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
  return {
    enabled: true,
    configured: autoStartEnabledByEnv(),
    running: state.running,
    detail: state.running
      ? "Autonomous worker is armed and awaiting schedule triggers."
      : autoStartEnabledByEnv()
        ? "Autonomy is configured for durable startup but currently stopped."
        : "Autonomy is available and requires an explicit start.",
    symbol: state.symbol,
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
  const [state, usedBudgetUsd] = await Promise.all([
    readAutonomyState(),
    getTodayExecutedNotionalUsd(),
  ]);
  const budgetUsd = state.budgetUsd ?? 0;
  const budgetRemainingUsd =
    budgetUsd > 0 ? Math.max(0, budgetUsd - usedBudgetUsd) : 0;

  return toAutonomyStatus(state, Number(budgetRemainingUsd.toFixed(2)));
}

export async function startAutonomyLoop(config?: {
  symbol?: string;
  timeframe?: Timeframe;
  intervalMs?: number;
}) {
  await updateAutonomyState((state) => ({
    ...state,
    running: true,
    symbol: config?.symbol || state.symbol,
    timeframe: config?.timeframe || state.timeframe,
    intervalMs: config?.intervalMs || state.intervalMs,
    nextRunAt: new Date().toISOString(),
    lastError: undefined,
  }));

  return getAutonomyStatus();
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
  const state = await readAutonomyState();
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
    const snapshot = await getMarketSnapshot(leased.symbol, leased.timeframe);
    const ctx = await getRealtimeMarketContext(leased.symbol, leased.timeframe);
    const result = await runSwarm(ctx);

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
      lastRunAt: startedAt,
      nextRunAt: current.running
        ? new Date(Date.now() + current.intervalMs).toISOString()
        : undefined,
      lastDecision: result.consensus.signal,
      lastExecutionStatus: execution?.status,
      lastError: execution?.status === "error" ? execution.error : undefined,
      lastReason: execution?.reason ?? execution?.error,
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
