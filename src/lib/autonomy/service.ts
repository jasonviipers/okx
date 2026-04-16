import "server-only";

import {
  getMarketSnapshot,
  getRealtimeMarketContext,
} from "@/lib/market-data/service";
import { autoExecuteConsensus } from "@/lib/swarm/autoExecute";
import { runSwarm } from "@/lib/swarm/orchestrator";
import type { AutonomyStatus } from "@/types/api";
import type { Timeframe } from "@/types/market";
import type { ExecutionResult } from "@/types/swarm";

const DEFAULT_SYMBOL = "BTC-USDT";
const DEFAULT_TIMEFRAME: Timeframe = "1H";
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 120_000;

type LoopState = {
  started: boolean;
  running: boolean;
  inFlight: boolean;
  timeout: NodeJS.Timeout | null;
  symbol: string;
  timeframe: Timeframe;
  intervalMs: number;
  cooldownMs: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastDecision?: string;
  lastExecutionStatus?: ExecutionResult["status"];
  lastError?: string;
  iterationCount: number;
  lastTradeAt?: number;
};

const state: LoopState = {
  started: false,
  running: false,
  inFlight: false,
  timeout: null,
  symbol: process.env.AUTONOMOUS_SYMBOL || DEFAULT_SYMBOL,
  timeframe:
    (process.env.AUTONOMOUS_TIMEFRAME as Timeframe) || DEFAULT_TIMEFRAME,
  intervalMs: Number(process.env.AUTONOMOUS_INTERVAL_MS || DEFAULT_INTERVAL_MS),
  cooldownMs: Number(process.env.AUTONOMOUS_COOLDOWN_MS || DEFAULT_COOLDOWN_MS),
  iterationCount: 0,
};

function autonomyEnabledByEnv(): boolean {
  return process.env.AUTONOMOUS_TRADING_ENABLED?.toLowerCase() === "true";
}

function scheduleNextTick() {
  if (!state.running) {
    state.nextRunAt = undefined;
    return;
  }

  state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();
  state.timeout = setTimeout(() => {
    void tick();
  }, state.intervalMs);
}

async function tick() {
  if (!state.running || state.inFlight) {
    return;
  }

  state.inFlight = true;
  state.lastRunAt = new Date().toISOString();
  state.lastError = undefined;
  state.iterationCount += 1;

  try {
    const snapshot = await getMarketSnapshot(state.symbol, state.timeframe);
    const ctx = await getRealtimeMarketContext(state.symbol, state.timeframe);
    const result = await runSwarm(ctx);
    state.lastDecision = result.consensus.signal;

    let execution: ExecutionResult | undefined;
    const inCooldown =
      state.lastTradeAt !== undefined &&
      Date.now() - state.lastTradeAt < state.cooldownMs;

    if (inCooldown && result.consensus.signal !== "HOLD") {
      execution = {
        status: "hold",
        timestamp: new Date().toISOString(),
        symbol: result.consensus.symbol,
        decision: result.consensus.signal,
        size: 0,
        reason: "autonomy cooldown active",
        response: {
          cooldownMs: state.cooldownMs,
        },
      };
    } else {
      if (!snapshot.status.tradeable && result.consensus.signal !== "HOLD") {
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
        if (execution.status === "success") {
          state.lastTradeAt = Date.now();
        }
      }
    }

    state.lastExecutionStatus = execution.status;
    state.lastError =
      execution.status === "error" ? execution.error : undefined;
  } catch (error) {
    state.lastExecutionStatus = "error";
    state.lastError =
      error instanceof Error ? error.message : "Unknown autonomy error";
  } finally {
    state.inFlight = false;
    scheduleNextTick();
  }
}

export function getAutonomyStatus(): AutonomyStatus {
  return {
    enabled: autonomyEnabledByEnv(),
    configured: autonomyEnabledByEnv(),
    running: state.running,
    detail: state.running
      ? "Autonomous trading loop active"
      : autonomyEnabledByEnv()
        ? "Autonomous trading loop idle"
        : "Autonomous trading disabled by environment",
    symbol: state.symbol,
    timeframe: state.timeframe,
    intervalMs: state.intervalMs,
    cooldownMs: state.cooldownMs,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    lastDecision: state.lastDecision,
    lastExecutionStatus: state.lastExecutionStatus,
    lastError: state.lastError,
    iterationCount: state.iterationCount,
  };
}

export function stopAutonomyLoop() {
  state.running = false;
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  state.nextRunAt = undefined;
}

export function startAutonomyLoop(config?: {
  symbol?: string;
  timeframe?: Timeframe;
  intervalMs?: number;
}) {
  state.symbol = config?.symbol || state.symbol;
  state.timeframe = config?.timeframe || state.timeframe;
  state.intervalMs = config?.intervalMs || state.intervalMs;
  state.started = true;

  if (state.running) {
    return getAutonomyStatus();
  }

  state.running = true;
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  void tick();
  return getAutonomyStatus();
}

export function ensureAutonomyLoopStarted() {
  if (autonomyEnabledByEnv() && !state.running) {
    startAutonomyLoop();
  }
}
