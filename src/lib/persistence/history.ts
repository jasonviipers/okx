import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTicker } from "@/lib/okx/market";
import { getTradeUpdates, type OkxTradeUpdateRow } from "@/lib/okx/orders";
import { normalizeConsensusResult } from "@/lib/swarm/normalize-consensus";
import type { StoredHistoryEntry, StoredTradeExecution } from "@/types/history";
import type { SwarmRunResult } from "@/types/swarm";
import type {
  Order,
  TradeDecisionSnapshot,
  TradeExecutionContext,
  TradeOutcomeWindow,
  TradePerformanceMetrics,
} from "@/types/trade";

const DATA_DIR = path.join(process.cwd(), ".data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const OUTCOME_HORIZON_MINUTES = [5, 15, 60, 240, 1440] as const;

async function ensureHistoryFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(HISTORY_FILE, "utf8");
  } catch {
    await writeFile(HISTORY_FILE, "[]", "utf8");
  }
}

async function readHistory(): Promise<StoredHistoryEntry[]> {
  await ensureHistoryFile();
  const raw = await readFile(HISTORY_FILE, "utf8");
  try {
    const entries = JSON.parse(raw) as StoredHistoryEntry[];
    return entries.map((entry) =>
      entry.type === "swarm_run"
        ? {
            ...entry,
            consensus: normalizeConsensusResult(entry.consensus),
          }
        : entry,
    );
  } catch {
    return [];
  }
}

async function writeHistory(entries: StoredHistoryEntry[]) {
  await ensureHistoryFile();
  await writeFile(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function buildOutcomeWindows(anchorTime: string): TradeOutcomeWindow[] {
  const anchorMs = new Date(anchorTime).getTime();
  return OUTCOME_HORIZON_MINUTES.map((horizonMinutes) => ({
    horizonMinutes,
    targetTime: new Date(anchorMs + horizonMinutes * 60_000).toISOString(),
  }));
}

function getEntryReferencePrice(
  order: Order,
  executionContext?: TradeExecutionContext,
): number | undefined {
  return (
    executionContext?.referencePrice ??
    order.filledPrice ??
    order.referencePrice ??
    order.price
  );
}

function parseOkxNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function parseOkxTimestamp(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const millis = Number(value);
  if (Number.isFinite(millis) && millis > 0) {
    return new Date(millis).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function mapOkxStateToOrderStatus(state?: string): Order["status"] | undefined {
  switch (state) {
    case "filled":
      return "filled";
    case "canceled":
    case "mmp_canceled":
      return "cancelled";
    case "rejected":
      return "rejected";
    case "live":
    case "partially_filled":
      return "pending";
    default:
      return undefined;
  }
}

function getTradeUpdateSortValue(update: OkxTradeUpdateRow): number {
  const filledAt = parseOkxTimestamp(update.fillTime);
  return filledAt ? new Date(filledAt).getTime() : 0;
}

function computeSignedReturnBps(
  order: Order,
  entryPrice: number,
  markPrice: number,
): number {
  if (entryPrice <= 0 || markPrice <= 0) {
    return 0;
  }

  const rawReturn =
    order.side === "buy"
      ? (markPrice - entryPrice) / entryPrice
      : (entryPrice - markPrice) / entryPrice;

  return round(rawReturn * 10_000, 2);
}

function computeSignedPnlUsd(
  order: Order,
  entryPrice: number,
  markPrice: number,
): number {
  const direction = order.side === "buy" ? 1 : -1;
  return round((markPrice - entryPrice) * order.size * direction, 4);
}

function buildInitialPerformance(
  order: Order,
  executionContext?: TradeExecutionContext,
): TradePerformanceMetrics {
  const referencePrice = getEntryReferencePrice(order, executionContext);
  const filledPrice = order.filledPrice;
  const realizedSlippageBps =
    referencePrice !== undefined &&
    filledPrice !== undefined &&
    referencePrice > 0
      ? round(
          ((order.side === "buy"
            ? filledPrice - referencePrice
            : referencePrice - filledPrice) /
            referencePrice) *
            10_000,
          2,
        )
      : undefined;
  const realizedSlippageUsd =
    referencePrice !== undefined && filledPrice !== undefined
      ? round(Math.abs(filledPrice - referencePrice) * order.size, 4)
      : undefined;
  const anchorTime = order.filledAt ?? order.createdAt;
  const anchorPrice = filledPrice ?? referencePrice;

  return {
    referencePrice,
    filledPrice,
    realizedSlippageBps,
    realizedSlippageUsd,
    latestMarkPrice: anchorPrice,
    latestObservedAt: anchorTime,
    latestSignedReturnBps: anchorPrice !== undefined ? 0 : undefined,
    latestPnlUsd: anchorPrice !== undefined ? 0 : undefined,
    latestPnlPct: anchorPrice !== undefined ? 0 : undefined,
    outcomeWindows: buildOutcomeWindows(anchorTime),
  };
}

function deriveBasePerformance(
  entry: StoredTradeExecution,
): TradePerformanceMetrics {
  const nextSeed = buildInitialPerformance(entry.order, entry.executionContext);
  if (!entry.performance) {
    return nextSeed;
  }

  const seedChanged =
    entry.performance.referencePrice !== nextSeed.referencePrice ||
    entry.performance.filledPrice !== nextSeed.filledPrice ||
    entry.performance.realizedSlippageBps !== nextSeed.realizedSlippageBps ||
    entry.performance.realizedSlippageUsd !== nextSeed.realizedSlippageUsd;

  if (!seedChanged) {
    return entry.performance;
  }

  const existingWindows = new Map(
    entry.performance.outcomeWindows.map((window) => [
      window.horizonMinutes,
      window,
    ]),
  );

  return {
    ...nextSeed,
    latestMarkPrice:
      entry.performance.latestMarkPrice ?? nextSeed.latestMarkPrice,
    latestObservedAt:
      entry.performance.latestObservedAt ?? nextSeed.latestObservedAt,
    latestSignedReturnBps:
      entry.performance.latestSignedReturnBps ?? nextSeed.latestSignedReturnBps,
    latestPnlUsd: entry.performance.latestPnlUsd ?? nextSeed.latestPnlUsd,
    latestPnlPct: entry.performance.latestPnlPct ?? nextSeed.latestPnlPct,
    outcomeWindows: nextSeed.outcomeWindows.map(
      (window) => existingWindows.get(window.horizonMinutes) ?? window,
    ),
  };
}

function syncTradeEntryWithOkxUpdate(
  entry: StoredTradeExecution,
  update: OkxTradeUpdateRow,
): { entry: StoredTradeExecution; changed: boolean } {
  const nextStatus =
    mapOkxStateToOrderStatus(update.state) ?? entry.order.status;
  const nextFilledPrice =
    parseOkxNumber(update.avgPx) ??
    parseOkxNumber(update.fillPx) ??
    entry.order.filledPrice;
  const nextFilledAt =
    parseOkxTimestamp(update.fillTime) ?? entry.order.filledAt;
  const nextNotionalUsd =
    parseOkxNumber(update.fillNotionalUsd) ?? entry.order.notionalUsd;

  const nextOrder: Order = {
    ...entry.order,
    status: nextStatus,
    filledPrice: nextFilledPrice,
    filledAt: nextFilledAt,
    notionalUsd: nextNotionalUsd,
  };
  const nextSuccess =
    nextStatus === "cancelled" || nextStatus === "rejected"
      ? false
      : entry.success;
  const changed =
    nextOrder.status !== entry.order.status ||
    nextOrder.filledPrice !== entry.order.filledPrice ||
    nextOrder.filledAt !== entry.order.filledAt ||
    nextOrder.notionalUsd !== entry.order.notionalUsd ||
    nextSuccess !== entry.success;

  if (!changed) {
    return { entry, changed: false };
  }

  const nextEntry: StoredTradeExecution = {
    ...entry,
    order: nextOrder,
    success: nextSuccess,
  };

  return {
    entry: {
      ...nextEntry,
      performance: deriveBasePerformance(nextEntry),
    },
    changed: true,
  };
}

function refreshTradeEntryPerformance(
  entry: StoredTradeExecution,
  markPrice?: number,
  observedAt = new Date().toISOString(),
): { entry: StoredTradeExecution; changed: boolean } {
  const basePerformance = deriveBasePerformance(entry);
  const entryPrice =
    basePerformance.filledPrice ??
    basePerformance.referencePrice ??
    getEntryReferencePrice(entry.order, entry.executionContext);

  if (entryPrice === undefined || entryPrice <= 0 || markPrice === undefined) {
    if (entry.performance) {
      return { entry, changed: false };
    }

    return {
      entry: {
        ...entry,
        performance: basePerformance,
      },
      changed: true,
    };
  }

  let changed = entry.performance === undefined;
  const nextOutcomeWindows = basePerformance.outcomeWindows.map((window) => {
    if (
      window.observedAt ||
      new Date(window.targetTime).getTime() > Date.now()
    ) {
      return window;
    }

    changed = true;
    const pnlUsd = computeSignedPnlUsd(entry.order, entryPrice, markPrice);
    const signedReturnBps = computeSignedReturnBps(
      entry.order,
      entryPrice,
      markPrice,
    );

    return {
      ...window,
      observedAt,
      markPrice: round(markPrice, 8),
      signedReturnBps,
      pnlUsd,
      pnlPct: round(
        (pnlUsd / Math.max(entry.order.notionalUsd ?? 0.0001, 0.0001)) * 100,
        4,
      ),
    };
  });

  const latestPnlUsd = computeSignedPnlUsd(entry.order, entryPrice, markPrice);
  const latestSignedReturnBps = computeSignedReturnBps(
    entry.order,
    entryPrice,
    markPrice,
  );
  const latestPnlPct = round(
    (latestPnlUsd / Math.max(entry.order.notionalUsd ?? 0.0001, 0.0001)) * 100,
    4,
  );

  if (
    basePerformance.latestMarkPrice !== markPrice ||
    basePerformance.latestSignedReturnBps !== latestSignedReturnBps ||
    basePerformance.latestPnlUsd !== latestPnlUsd ||
    basePerformance.latestPnlPct !== latestPnlPct
  ) {
    changed = true;
  }

  return {
    entry: {
      ...entry,
      performance: {
        ...basePerformance,
        latestMarkPrice: round(markPrice, 8),
        latestObservedAt: observedAt,
        latestSignedReturnBps,
        latestPnlUsd,
        latestPnlPct,
        outcomeWindows: nextOutcomeWindows,
      },
    },
    changed,
  };
}

export async function recordSwarmRun(result: SwarmRunResult): Promise<void> {
  const entries = await readHistory();
  entries.unshift({
    id: makeId("swarm"),
    type: "swarm_run",
    timestamp: new Date().toISOString(),
    symbol: result.marketContext.symbol,
    timeframe: result.marketContext.timeframe,
    cached: result.cached,
    totalElapsedMs: result.totalElapsedMs,
    consensus: result.consensus,
  });
  await writeHistory(entries.slice(0, 500));
}

export async function recordTradeExecution(
  order: Order,
  options?: {
    decisionSnapshot?: TradeDecisionSnapshot;
    executionContext?: TradeExecutionContext;
  },
): Promise<void> {
  const entries = await readHistory();
  entries.unshift({
    id: makeId("trade"),
    type: "trade_execution",
    timestamp: new Date().toISOString(),
    symbol: order.symbol,
    order,
    success: true,
    decisionSnapshot: options?.decisionSnapshot,
    executionContext: options?.executionContext,
    performance: buildInitialPerformance(order, options?.executionContext),
  });
  await writeHistory(entries.slice(0, 500));
}

export async function getHistory(limit = 100): Promise<StoredHistoryEntry[]> {
  const entries = await readHistory();
  return entries.slice(0, limit);
}

export async function getTradeHistory(
  limit = 100,
): Promise<StoredTradeExecution[]> {
  const entries = await readHistory();
  return entries
    .filter(
      (entry): entry is StoredTradeExecution =>
        entry.type === "trade_execution",
    )
    .slice(0, limit);
}

export async function refreshTradeExecutionOutcomes(
  limit = 100,
): Promise<StoredTradeExecution[]> {
  const entries = await readHistory();
  const trades = entries.filter(
    (entry): entry is StoredTradeExecution => entry.type === "trade_execution",
  );
  if (trades.length === 0) {
    return [];
  }

  const pendingOrdersBySymbol = new Map<string, string[]>();
  for (const trade of trades) {
    if (trade.order.okxOrderId && trade.order.status === "pending") {
      const symbolOrders = pendingOrdersBySymbol.get(trade.symbol) ?? [];
      symbolOrders.push(trade.order.okxOrderId);
      pendingOrdersBySymbol.set(trade.symbol, symbolOrders);
    }
  }

  const okxTradeUpdates = new Map<string, OkxTradeUpdateRow>();
  if (pendingOrdersBySymbol.size > 0) {
    const updateResults = await Promise.allSettled(
      [...pendingOrdersBySymbol.entries()].map(async ([symbol, orderIds]) => {
        const updates = await getTradeUpdates(symbol);
        const orderIdSet = new Set(orderIds);

        return updates.filter((update) => orderIdSet.has(update.ordId));
      }),
    );

    for (const result of updateResults) {
      if (result.status !== "fulfilled") {
        continue;
      }

      for (const update of result.value) {
        const previous = okxTradeUpdates.get(update.ordId);
        if (
          !previous ||
          getTradeUpdateSortValue(update) >= getTradeUpdateSortValue(previous)
        ) {
          okxTradeUpdates.set(update.ordId, update);
        }
      }
    }
  }

  let changed = false;
  let nextEntries = entries.map((entry) => {
    if (entry.type !== "trade_execution" || !entry.order.okxOrderId) {
      return entry;
    }

    const update = okxTradeUpdates.get(entry.order.okxOrderId);
    if (!update) {
      return entry;
    }

    const synced = syncTradeEntryWithOkxUpdate(entry, update);
    changed ||= synced.changed;
    return synced.entry;
  });

  const tradeEntries = nextEntries.filter(
    (entry): entry is StoredTradeExecution => entry.type === "trade_execution",
  );
  const candidateSymbols = [
    ...new Set(
      tradeEntries
        .filter((entry) => {
          const entryPrice =
            entry.performance?.filledPrice ??
            entry.performance?.referencePrice ??
            getEntryReferencePrice(entry.order, entry.executionContext);
          return entryPrice !== undefined && entryPrice > 0;
        })
        .map((entry) => entry.symbol),
    ),
  ];
  const tickerResults = await Promise.allSettled(
    candidateSymbols.map(
      async (symbol) => [symbol, await getTicker(symbol)] as const,
    ),
  );
  const tickerMap = new Map<string, number>();

  for (const result of tickerResults) {
    if (result.status === "fulfilled") {
      tickerMap.set(result.value[0], result.value[1].last);
    }
  }

  const observedAt = new Date().toISOString();
  nextEntries = nextEntries.map((entry) => {
    if (entry.type !== "trade_execution") {
      return entry;
    }

    const refreshed = refreshTradeEntryPerformance(
      entry,
      tickerMap.get(entry.symbol),
      observedAt,
    );
    changed ||= refreshed.changed;
    return refreshed.entry;
  });

  if (changed) {
    await writeHistory(nextEntries);
  }

  return nextEntries
    .filter(
      (entry): entry is StoredTradeExecution =>
        entry.type === "trade_execution",
    )
    .slice(0, limit);
}
