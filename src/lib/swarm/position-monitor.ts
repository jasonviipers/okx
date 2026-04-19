import "server-only";

import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
} from "@/lib/configs/okx";
import { getInstrumentRules, normalizeOrderSize } from "@/lib/okx/instruments";
import { getTicker } from "@/lib/okx/market";
import { getPositions, placeOrder } from "@/lib/okx/orders";
import { recordTradeExecution } from "@/lib/persistence/history";
import { parseBoolean, parseNumber } from "@/lib/runtime-utils";
import {
  getOpenPositions,
  type OpenPositionRecord,
  removeOpenPosition,
  upsertOpenPosition,
} from "@/lib/store/open-positions";
import {
  activateTrailingStop,
  hasTrailingStopBeenHit,
  updateTrailingStop,
} from "@/lib/swarm/trailing-stop";
import {
  incrementCounter,
  info,
  setGauge,
  error as telemetryError,
  warn as telemetryWarn,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
import type { Position } from "@/types/trade";
import {
  isExecutionCircuitOpen,
  recordExecutionCircuitError,
} from "./autoExecute";

const DEFAULT_POSITION_MONITOR_INTERVAL_MS = 15_000;
const TP_EXIT_RATIOS = [0.5, 0.6, 1] as const;
const TAKE_PROFIT_EXIT_REASONS = [
  "take_profit_1",
  "take_profit_2",
  "take_profit_3",
] as const;

declare global {
  var __okxPositionMonitorTimer: NodeJS.Timeout | undefined;
  var __okxPositionMonitorInFlight: boolean | undefined;
}

function positionMonitorEnabled(): boolean {
  return parseBoolean(process.env.POSITION_MONITOR_ENABLED, true);
}

function getPositionMonitorIntervalMs(): number {
  return Math.max(
    5_000,
    Math.trunc(
      parseNumber(
        process.env.POSITION_MONITOR_INTERVAL_MS,
        DEFAULT_POSITION_MONITOR_INTERVAL_MS,
      ),
    ),
  );
}

function getExitSide(direction: OpenPositionRecord["direction"]) {
  return direction === "BUY" ? "sell" : "buy";
}

function isTakeProfitHit(
  position: OpenPositionRecord,
  currentPrice: number,
  level: number,
): boolean {
  return position.direction === "BUY"
    ? currentPrice >= level
    : currentPrice <= level;
}

function isStopLossHit(
  position: OpenPositionRecord,
  currentPrice: number,
): boolean {
  if (position.stopLoss === null) {
    return false;
  }

  return position.direction === "BUY"
    ? currentPrice <= position.stopLoss
    : currentPrice >= position.stopLoss;
}

function computeRealizedPnl(
  position: OpenPositionRecord,
  exitPrice: number,
  exitSize: number,
): number {
  const direction = position.direction === "BUY" ? 1 : -1;
  return Number(
    ((exitPrice - position.entryPrice) * exitSize * direction).toFixed(8),
  );
}

async function resolveExitSize(
  position: OpenPositionRecord,
  requestedSize: number,
): Promise<number> {
  const instrumentRules = await getInstrumentRules(position.instId);
  const normalizedRemainingSize = normalizeOrderSize(
    position.remainingSize,
    instrumentRules.lotSize,
  );
  const normalizedRequestedSize = normalizeOrderSize(
    Math.min(position.remainingSize, requestedSize),
    instrumentRules.lotSize,
  );
  let normalizedSize = normalizedRequestedSize;

  if (
    normalizedSize <= 0 ||
    normalizedSize < instrumentRules.minSize ||
    normalizedSize > position.remainingSize
  ) {
    normalizedSize = normalizedRemainingSize;
  }

  if (
    instrumentRules.state !== "live" ||
    normalizedSize <= 0 ||
    normalizedSize < instrumentRules.minSize
  ) {
    throw new Error(
      `Instrument rules rejected managed exit size for ${position.instId}.`,
    );
  }

  return Number(normalizedSize.toFixed(8));
}

async function executeManagedExit(input: {
  position: OpenPositionRecord;
  currentPrice: number;
  requestedSize: number;
  exitReason:
    | "take_profit_1"
    | "take_profit_2"
    | "take_profit_3"
    | "stop_loss"
    | "trailing_stop";
  exitTargetIndex?: number;
}): Promise<{ executed: boolean; exitSize?: number }> {
  if (isExecutionCircuitOpen()) {
    telemetryWarn(
      "position.monitor",
      "Managed exit skipped because the execution circuit breaker is open",
      {
        exitReason: input.exitReason,
        instId: input.position.instId,
        orderId: input.position.orderId,
      },
    );
    return { executed: false };
  }

  try {
    const exitSize = await resolveExitSize(input.position, input.requestedSize);
    const order = await placeOrder({
      symbol: input.position.instId,
      side: getExitSide(input.position.direction),
      type: "market",
      size: exitSize,
    });

    const remainingSizeAfterExit = Number(
      Math.max(0, input.position.remainingSize - exitSize).toFixed(8),
    );
    await recordTradeExecution(order, {
      executionContext: {
        referencePrice: input.currentPrice,
        normalizedSize: exitSize,
        stopLoss: input.position.stopLoss,
        takeProfitLevels: input.position.takeProfitLevels,
        trailingStopDistancePct: input.position.trailingStopDistancePct,
        positionOrderId: input.position.orderId,
        exitReason: input.exitReason,
        exitTargetIndex: input.exitTargetIndex,
        remainingSizeAfterExit,
      },
    });

    return {
      executed: true,
      exitSize,
    };
  } catch (caughtError) {
    recordExecutionCircuitError();
    telemetryError("position.monitor", "Managed exit execution failed", {
      currentPrice: input.currentPrice,
      exitReason: input.exitReason,
      instId: input.position.instId,
      orderId: input.position.orderId,
      requestedSize: input.requestedSize,
      error: caughtError,
    });
    throw caughtError;
  }
}

async function handleTakeProfitExit(
  position: OpenPositionRecord,
  currentPrice: number,
  targetIndex: number,
): Promise<{ closed: boolean; position?: OpenPositionRecord }> {
  const exitRatio = TP_EXIT_RATIOS[targetIndex] ?? 1;
  const requestedSize =
    exitRatio >= 1
      ? position.remainingSize
      : position.remainingSize * exitRatio;
  const exitReason =
    TAKE_PROFIT_EXIT_REASONS[targetIndex] ?? TAKE_PROFIT_EXIT_REASONS[2];
  const level = position.takeProfitLevels[targetIndex];
  const result = await executeManagedExit({
    position,
    currentPrice,
    requestedSize,
    exitReason,
    exitTargetIndex: targetIndex,
  });

  if (!result.executed || result.exitSize === undefined) {
    return {
      closed: false,
      position: {
        ...position,
        lastCheckedAt: Date.now(),
        lastKnownPrice: currentPrice,
      },
    };
  }

  const remainingSize = Number(
    Math.max(0, position.remainingSize - result.exitSize).toFixed(8),
  );
  let nextPosition: OpenPositionRecord = {
    ...position,
    remainingSize,
    tpHitCount: Math.min(position.takeProfitLevels.length, targetIndex + 1),
    exchangePositionMissingCount: 0,
    lastCheckedAt: Date.now(),
    lastKnownPrice: currentPrice,
    updatedAt: Date.now(),
  };

  if (nextPosition.tpHitCount === 1) {
    nextPosition = activateTrailingStop(nextPosition, currentPrice);
  } else if (nextPosition.trailingStopActive) {
    nextPosition = updateTrailingStop(nextPosition, currentPrice);
  }

  const closed =
    remainingSize <= 0 ||
    nextPosition.tpHitCount >= nextPosition.takeProfitLevels.length;

  if (closed) {
    await removeOpenPosition(position.orderId);
  } else {
    nextPosition = await upsertOpenPosition(nextPosition);
  }

  const timestamp = new Date().toISOString();
  info("position.monitor", "Take-profit exit executed", {
    exitedSize: result.exitSize,
    instId: position.instId,
    level,
    orderId: position.orderId,
    remainingSize,
    targetIndex,
    timestamp,
  });
  console.log(
    `[${timestamp}] [PositionMonitor] TP${targetIndex + 1} hit for ${position.instId} at ${level}. exited=${result.exitSize} remaining=${remainingSize}`,
  );
  incrementCounter(
    "position_monitor_exits_total",
    "Total managed exits executed by the position monitor.",
    1,
    {
      reason: exitReason,
      symbol: position.instId,
    },
  );

  return closed ? { closed: true } : { closed: false, position: nextPosition };
}

async function handleFullExit(
  position: OpenPositionRecord,
  currentPrice: number,
  exitReason: "stop_loss" | "trailing_stop",
  livePosition?: Position,
): Promise<boolean> {
  const result = await executeManagedExit({
    position,
    currentPrice,
    requestedSize: position.remainingSize,
    exitReason,
  });

  if (!result.executed || result.exitSize === undefined) {
    await upsertOpenPosition({
      ...position,
      lastCheckedAt: Date.now(),
      lastKnownPrice: currentPrice,
      updatedAt: Date.now(),
    });
    return false;
  }

  const timestamp = new Date().toISOString();
  const pnl =
    livePosition?.pnl !== undefined
      ? Number(livePosition.pnl.toFixed(8))
      : computeRealizedPnl(position, currentPrice, result.exitSize);
  info("position.monitor", "Managed protective exit executed", {
    exitPrice: currentPrice,
    exitReason,
    exitedSize: result.exitSize,
    instId: position.instId,
    orderId: position.orderId,
    pnl,
    triggerLevel:
      exitReason === "trailing_stop"
        ? position.trailingStopPrice
        : position.stopLoss,
    timestamp,
  });
  console.log(
    `[${timestamp}] [PositionMonitor] ${exitReason} hit for ${position.instId}. exited=${result.exitSize} pnl=${pnl}`,
  );
  incrementCounter(
    "position_monitor_exits_total",
    "Total managed exits executed by the position monitor.",
    1,
    {
      reason: exitReason,
      symbol: position.instId,
    },
  );

  await removeOpenPosition(position.orderId);

  return true;
}

async function processManagedPosition(
  position: OpenPositionRecord,
  livePosition?: Position,
) {
  const ticker = await getTicker(position.instId);
  let nextPosition = position;

  if (livePosition) {
    nextPosition = {
      ...nextPosition,
      entryPrice:
        livePosition.entryPrice > 0
          ? livePosition.entryPrice
          : nextPosition.entryPrice,
      remainingSize:
        livePosition.size > 0
          ? Number(
              Math.min(nextPosition.remainingSize, livePosition.size).toFixed(
                8,
              ),
            )
          : nextPosition.remainingSize,
      exchangePositionMissingCount: 0,
    };
  } else if (hasOkxTradingCredentials()) {
    const missingCount = nextPosition.exchangePositionMissingCount + 1;
    nextPosition = {
      ...nextPosition,
      exchangePositionMissingCount: missingCount,
    };
    telemetryWarn(
      "position.monitor",
      "Managed position was not present in the latest OKX positions snapshot",
      {
        accountMode: getOkxAccountModeLabel(),
        instId: position.instId,
        missingCount,
        orderId: position.orderId,
      },
    );
  }

  nextPosition = updateTrailingStop(nextPosition, ticker.last);

  if (nextPosition.remainingSize <= 0) {
    return;
  }

  if (hasTrailingStopBeenHit(nextPosition, ticker.last)) {
    const closed = await handleFullExit(
      nextPosition,
      ticker.last,
      "trailing_stop",
      livePosition,
    );
    if (closed) {
      return;
    }
  }

  if (isStopLossHit(nextPosition, ticker.last)) {
    const closed = await handleFullExit(
      nextPosition,
      ticker.last,
      "stop_loss",
      livePosition,
    );
    if (closed) {
      return;
    }
  }

  while (nextPosition.tpHitCount < nextPosition.takeProfitLevels.length) {
    const nextTpLevel = nextPosition.takeProfitLevels[nextPosition.tpHitCount];
    if (
      nextTpLevel === undefined ||
      !isTakeProfitHit(nextPosition, ticker.last, nextTpLevel)
    ) {
      break;
    }

    const tpOutcome = await handleTakeProfitExit(
      nextPosition,
      ticker.last,
      nextPosition.tpHitCount,
    );
    if (tpOutcome.closed) {
      return;
    }

    if (!tpOutcome.position) {
      break;
    }

    nextPosition = tpOutcome.position;
  }

  await upsertOpenPosition({
    ...nextPosition,
    lastCheckedAt: Date.now(),
    lastKnownPrice: ticker.last,
    updatedAt: Date.now(),
  });
}

export async function runPositionMonitorIteration(
  trigger: "boot" | "interval" = "interval",
) {
  if (!positionMonitorEnabled()) {
    setGauge(
      "position_monitor_active",
      "Whether the background position monitor is active.",
      0,
    );
    return false;
  }

  if (globalThis.__okxPositionMonitorInFlight) {
    telemetryWarn(
      "position.monitor",
      "Position monitor iteration skipped because a prior iteration is still running",
      {
        trigger,
      },
    );
    return false;
  }

  globalThis.__okxPositionMonitorInFlight = true;

  try {
    return await withTelemetrySpan(
      {
        name: "position.monitor.iteration",
        source: "position.monitor",
        attributes: {
          trigger,
        },
      },
      async () => {
        const [managedPositions, livePositions] = await Promise.all([
          getOpenPositions(),
          getPositions().catch((caughtError) => {
            telemetryError(
              "position.monitor",
              "Failed to poll OKX positions for the managed position monitor",
              {
                trigger,
                error: caughtError,
              },
            );
            incrementCounter(
              "position_monitor_errors_total",
              "Total managed position monitor errors.",
              1,
              {
                stage: "positions_poll",
              },
            );
            return [] as Position[];
          }),
        ]);
        setGauge(
          "managed_open_positions",
          "Number of managed positions currently tracked by the monitor.",
          managedPositions.length,
        );

        if (managedPositions.length === 0) {
          return true;
        }

        const livePositionMap = new Map(
          livePositions.map((position) => [position.symbol, position]),
        );
        const settled = await Promise.allSettled(
          managedPositions.map(async (position) => {
            await processManagedPosition(
              position,
              livePositionMap.get(position.instId),
            );
          }),
        );

        for (const result of settled) {
          if (result.status === "rejected") {
            incrementCounter(
              "position_monitor_errors_total",
              "Total managed position monitor errors.",
              1,
              {
                stage: "position_check",
              },
            );
            telemetryError(
              "position.monitor",
              "Managed position check failed",
              {
                trigger,
                error: result.reason,
              },
            );
          }
        }

        return true;
      },
    );
  } finally {
    globalThis.__okxPositionMonitorInFlight = false;
  }
}

export function ensurePositionMonitorBootState() {
  if (!positionMonitorEnabled()) {
    setGauge(
      "position_monitor_active",
      "Whether the background position monitor is active.",
      0,
    );
    return;
  }

  if (globalThis.__okxPositionMonitorTimer) {
    return;
  }

  const intervalMs = getPositionMonitorIntervalMs();
  info("position.monitor", "Starting background position monitor", {
    intervalMs,
  });
  setGauge(
    "position_monitor_active",
    "Whether the background position monitor is active.",
    1,
  );
  void runPositionMonitorIteration("boot").catch((caughtError) => {
    incrementCounter(
      "position_monitor_errors_total",
      "Total managed position monitor errors.",
      1,
      {
        stage: "boot",
      },
    );
    telemetryError(
      "position.monitor",
      "Initial managed position monitor iteration failed",
      {
        error: caughtError,
      },
    );
  });

  const timer = setInterval(() => {
    void runPositionMonitorIteration("interval").catch((caughtError) => {
      incrementCounter(
        "position_monitor_errors_total",
        "Total managed position monitor errors.",
        1,
        {
          stage: "interval",
        },
      );
      telemetryError(
        "position.monitor",
        "Background position monitor iteration failed",
        {
          error: caughtError,
        },
      );
    });
  }, intervalMs);

  timer.unref?.();
  globalThis.__okxPositionMonitorTimer = timer;
}
