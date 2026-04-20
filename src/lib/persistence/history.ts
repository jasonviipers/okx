import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { average } from "@/lib/math-utils";
import { getTicker } from "@/lib/okx/market";
import { getTradeUpdates, type OkxTradeUpdateRow } from "@/lib/okx/orders";
import { normalizeConsensusResult } from "@/lib/swarm/normalize-consensus";
import type {
  OutcomeWindow,
  StoredHistoryEntry,
  StoredTradeExecution,
  StrategyPerformanceSummary,
} from "@/types/history";
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
const OUTCOME_WINDOWS_FILE = path.join(DATA_DIR, "outcome-windows.json");
const OUTCOME_HORIZON_MINUTES = [5, 15, 60, 240, 1440] as const;
let outcomeWindowWriteQueue: Promise<void> = Promise.resolve();

async function ensureHistoryFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(HISTORY_FILE, "utf8");
  } catch {
    await writeFile(HISTORY_FILE, "[]", "utf8");
  }
}

async function ensureOutcomeWindowsFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(OUTCOME_WINDOWS_FILE, "utf8");
  } catch {
    await writeFile(OUTCOME_WINDOWS_FILE, "[]", "utf8");
  }
}

async function readHistory(): Promise<StoredHistoryEntry[]> {
  await ensureHistoryFile();
  const raw = await readFile(HISTORY_FILE, "utf8");
  try {
    const entries = JSON.parse(raw) as StoredHistoryEntry[];
    const normalized: StoredHistoryEntry[] = [];

    for (const entry of entries) {
      if (entry.type !== "swarm_run") {
        normalized.push(entry);
        continue;
      }

      try {
        normalized.push({
          ...entry,
          consensus: normalizeConsensusResult(entry.consensus),
        });
      } catch {}
    }

    return normalized;
  } catch {
    return [];
  }
}

async function writeHistory(entries: StoredHistoryEntry[]) {
  await ensureHistoryFile();
  await writeFile(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableFiniteNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeOutcomeWindow(value: Partial<OutcomeWindow>): OutcomeWindow {
  const now = new Date().toISOString();
  const toOutcomeReturn = (candidate: unknown) =>
    toNullableFiniteNumber(candidate);

  return {
    orderId:
      typeof value.orderId === "string" && value.orderId.trim().length > 0
        ? value.orderId
        : `outcome_${Date.now()}`,
    symbol:
      typeof value.symbol === "string" && value.symbol.trim().length > 0
        ? value.symbol
        : "UNKNOWN",
    direction: value.direction === "SELL" ? "SELL" : "BUY",
    entryPrice: Math.max(0, toFiniteNumber(value.entryPrice, 0)),
    entryTime:
      typeof value.entryTime === "string" && value.entryTime.trim().length > 0
        ? value.entryTime
        : now,
    returnAt5m: toOutcomeReturn(value.returnAt5m),
    returnAt15m: toOutcomeReturn(value.returnAt15m),
    returnAt1h: toOutcomeReturn(value.returnAt1h),
    returnAt4h: toOutcomeReturn(value.returnAt4h),
    exitPrice: toNullableFiniteNumber(value.exitPrice),
    exitTime:
      typeof value.exitTime === "string" && value.exitTime.trim().length > 0
        ? value.exitTime
        : null,
    realizedPnl: toNullableFiniteNumber(value.realizedPnl),
    realizedSlippageBps: toNullableFiniteNumber(value.realizedSlippageBps),
    featureSnapshot: Object.fromEntries(
      Object.entries(value.featureSnapshot ?? {}).filter(
        (entry): entry is [string, number] =>
          Number.isFinite(entry[1]) && entry[0].trim().length > 0,
      ),
    ),
    decisionConfidence: Math.max(
      0,
      toFiniteNumber(value.decisionConfidence, 0),
    ),
    expectedNetEdgeBps: toFiniteNumber(value.expectedNetEdgeBps, 0),
    regime:
      typeof value.regime === "string" && value.regime.trim().length > 0
        ? value.regime
        : "unknown",
    selectedEngine:
      typeof value.selectedEngine === "string" &&
      value.selectedEngine.trim().length > 0
        ? value.selectedEngine
        : "none",
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim().length > 0
        ? value.updatedAt
        : now,
  };
}

async function readOutcomeWindowsFile(): Promise<OutcomeWindow[]> {
  await ensureOutcomeWindowsFile();
  const raw = await readFile(OUTCOME_WINDOWS_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as Partial<OutcomeWindow>[];
    return Array.isArray(parsed)
      ? parsed.map((entry) => sanitizeOutcomeWindow(entry))
      : [];
  } catch {
    return [];
  }
}

async function writeOutcomeWindowsFile(entries: OutcomeWindow[]) {
  await ensureOutcomeWindowsFile();
  const sanitized = entries
    .map((entry) => sanitizeOutcomeWindow(entry))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  await writeFile(
    OUTCOME_WINDOWS_FILE,
    JSON.stringify(sanitized, null, 2),
    "utf8",
  );
}

function enqueueOutcomeWindowWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = outcomeWindowWriteQueue.then(operation, operation);
  outcomeWindowWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function mergeOutcomeWindow(
  existing: OutcomeWindow | undefined,
  next: OutcomeWindow,
): OutcomeWindow {
  if (!existing) {
    return next;
  }

  return sanitizeOutcomeWindow({
    ...existing,
    ...next,
    returnAt5m: next.returnAt5m ?? existing.returnAt5m,
    returnAt15m: next.returnAt15m ?? existing.returnAt15m,
    returnAt1h: next.returnAt1h ?? existing.returnAt1h,
    returnAt4h: next.returnAt4h ?? existing.returnAt4h,
    exitPrice: next.exitPrice ?? existing.exitPrice,
    exitTime: next.exitTime ?? existing.exitTime,
    realizedPnl: next.realizedPnl ?? existing.realizedPnl,
    realizedSlippageBps:
      next.realizedSlippageBps ?? existing.realizedSlippageBps,
    featureSnapshot:
      Object.keys(next.featureSnapshot).length > 0
        ? next.featureSnapshot
        : existing.featureSnapshot,
    decisionConfidence:
      next.decisionConfidence > 0
        ? next.decisionConfidence
        : existing.decisionConfidence,
    expectedNetEdgeBps:
      next.expectedNetEdgeBps !== 0
        ? next.expectedNetEdgeBps
        : existing.expectedNetEdgeBps,
    regime: next.regime !== "unknown" ? next.regime : existing.regime,
    selectedEngine:
      next.selectedEngine !== "none"
        ? next.selectedEngine
        : existing.selectedEngine,
    updatedAt: next.updatedAt,
  });
}

function computeWindowReturn(
  direction: OutcomeWindow["direction"],
  entryPrice: number,
  currentPrice: number,
): number | null {
  if (entryPrice <= 0 || currentPrice <= 0) {
    return null;
  }

  const rawReturn =
    direction === "BUY"
      ? (currentPrice - entryPrice) / entryPrice
      : (entryPrice - currentPrice) / entryPrice;

  return round(rawReturn, 6);
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

function mapOkxOrderType(ordType?: string): Order["type"] {
  return ordType === "limit" ? "limit" : "market";
}

function getTradeUpdateSortValue(update: OkxTradeUpdateRow): number {
  const filledAt = parseOkxTimestamp(update.fillTime);
  return filledAt ? new Date(filledAt).getTime() : 0;
}

function getTradeEntrySortValue(entry: StoredHistoryEntry): number {
  return new Date(entry.timestamp).getTime();
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

function buildBackfilledTradeExecution(
  update: OkxTradeUpdateRow,
): StoredTradeExecution | null {
  const status = mapOkxStateToOrderStatus(update.state) ?? "filled";
  const filledPrice =
    parseOkxNumber(update.avgPx) ?? parseOkxNumber(update.fillPx);
  const size =
    parseOkxNumber(update.accFillSz) ?? parseOkxNumber(update.fillSz);
  const filledAt = parseOkxTimestamp(update.fillTime);

  if (!filledAt || !size || size <= 0) {
    return null;
  }

  const notionalUsd =
    parseOkxNumber(update.fillNotionalUsd) ??
    (filledPrice ? Number((filledPrice * size).toFixed(8)) : undefined);
  const order: Order = {
    id: update.ordId,
    symbol: update.instId,
    side: update.side,
    type: mapOkxOrderType(update.ordType),
    size,
    notionalUsd,
    filledPrice,
    referencePrice: filledPrice,
    status,
    createdAt: filledAt,
    filledAt,
    okxOrderId: update.ordId,
  };
  const entry: StoredTradeExecution = {
    id: `trade_backfill_${update.ordId}`,
    type: "trade_execution",
    timestamp: filledAt,
    symbol: update.instId,
    order,
    success: status !== "cancelled" && status !== "rejected",
  };

  return {
    ...entry,
    performance: buildInitialPerformance(order),
  };
}

async function getHistoryTradeUpdates(
  limit: number,
): Promise<Map<string, OkxTradeUpdateRow>> {
  const updates = await getTradeUpdates();
  const byOrderId = new Map<string, OkxTradeUpdateRow>();

  for (const update of updates) {
    if (!update.ordId || !update.instId) {
      continue;
    }

    const previous = byOrderId.get(update.ordId);
    if (
      !previous ||
      getTradeUpdateSortValue(update) >= getTradeUpdateSortValue(previous)
    ) {
      byOrderId.set(update.ordId, update);
    }
  }

  return new Map(
    [...byOrderId.entries()]
      .sort(
        (left, right) =>
          getTradeUpdateSortValue(right[1]) - getTradeUpdateSortValue(left[1]),
      )
      .slice(0, Math.max(limit, 200)),
  );
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

export async function upsertOutcomeWindow(
  window: OutcomeWindow,
): Promise<void> {
  await enqueueOutcomeWindowWrite(async () => {
    const nextWindow = sanitizeOutcomeWindow({
      ...window,
      updatedAt: new Date().toISOString(),
    });
    const entries = await readOutcomeWindowsFile();
    const index = entries.findIndex(
      (entry) => entry.orderId === nextWindow.orderId,
    );

    if (index >= 0) {
      entries[index] = mergeOutcomeWindow(entries[index], nextWindow);
    } else {
      entries.unshift(nextWindow);
    }

    await writeOutcomeWindowsFile(entries.slice(0, 1_000));
  });
}

export async function getOutcomeWindows(limit = 100): Promise<OutcomeWindow[]> {
  await outcomeWindowWriteQueue;
  const entries = await readOutcomeWindowsFile();
  return entries.slice(0, limit);
}

export async function refreshOutcomeWindows(
  limit = 200,
): Promise<OutcomeWindow[]> {
  const windows = await getOutcomeWindows(limit);
  if (windows.length === 0) {
    return [];
  }

  const symbols = [...new Set(windows.map((window) => window.symbol))];
  const tickerResults = await Promise.allSettled(
    symbols.map(async (symbol) => [symbol, await getTicker(symbol)] as const),
  );
  const tickerMap = new Map<string, number>();

  for (const result of tickerResults) {
    if (result.status === "fulfilled") {
      tickerMap.set(result.value[0], result.value[1].last);
    }
  }

  const now = Date.now();
  const refreshed = windows.map((window) => {
    const markPrice = tickerMap.get(window.symbol);
    if (!markPrice || markPrice <= 0) {
      return window;
    }

    const entryTimeMs = new Date(window.entryTime).getTime();
    const resolved = {
      returnAt5m:
        window.returnAt5m ??
        (now - entryTimeMs >= 5 * 60_000
          ? computeWindowReturn(window.direction, window.entryPrice, markPrice)
          : null),
      returnAt15m:
        window.returnAt15m ??
        (now - entryTimeMs >= 15 * 60_000
          ? computeWindowReturn(window.direction, window.entryPrice, markPrice)
          : null),
      returnAt1h:
        window.returnAt1h ??
        (now - entryTimeMs >= 60 * 60_000
          ? computeWindowReturn(window.direction, window.entryPrice, markPrice)
          : null),
      returnAt4h:
        window.returnAt4h ??
        (now - entryTimeMs >= 4 * 60 * 60_000
          ? computeWindowReturn(window.direction, window.entryPrice, markPrice)
          : null),
    };

    return mergeOutcomeWindow(
      window,
      sanitizeOutcomeWindow({
        ...window,
        ...resolved,
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  await enqueueOutcomeWindowWrite(async () => {
    await writeOutcomeWindowsFile(refreshed);
  });

  return refreshed;
}

export async function refreshTradeExecutionOutcomes(
  limit = 100,
): Promise<StoredTradeExecution[]> {
  const entries = await readHistory();
  const trades = entries.filter(
    (entry): entry is StoredTradeExecution => entry.type === "trade_execution",
  );
  const shouldFetchTradeUpdates =
    trades.length === 0 ||
    trades.length < limit ||
    trades.some((trade) => trade.order.status === "pending");
  const okxTradeUpdates = shouldFetchTradeUpdates
    ? await getHistoryTradeUpdates(limit).catch(
        () => new Map<string, OkxTradeUpdateRow>(),
      )
    : new Map<string, OkxTradeUpdateRow>();

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

  const knownOrderIds = new Set(
    nextEntries.flatMap((entry) =>
      entry.type === "trade_execution" && entry.order.okxOrderId
        ? [entry.order.okxOrderId]
        : [],
    ),
  );
  const backfilledEntries = [...okxTradeUpdates.values()]
    .filter((update) => !knownOrderIds.has(update.ordId))
    .map(buildBackfilledTradeExecution)
    .filter((entry): entry is StoredTradeExecution => entry !== null);

  if (backfilledEntries.length > 0) {
    changed = true;
    nextEntries = [...backfilledEntries, ...nextEntries]
      .sort(
        (left, right) =>
          getTradeEntrySortValue(right) - getTradeEntrySortValue(left),
      )
      .slice(0, 500);
  }

  const tradeEntries = nextEntries.filter(
    (entry): entry is StoredTradeExecution => entry.type === "trade_execution",
  );
  if (tradeEntries.length === 0) {
    if (changed) {
      await writeHistory(nextEntries);
    }
    return [];
  }
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

export async function buildStrategyPerformanceSummary(
  regime?: string,
): Promise<StrategyPerformanceSummary[]> {
  const [outcomeWindows, history] = await Promise.all([
    getOutcomeWindows(1_000),
    getHistory(1_000),
  ]);
  const tradeExecutions = history.filter(
    (entry): entry is StoredTradeExecution => entry.type === "trade_execution",
  );
  const swarmRuns = history.filter(
    (entry): entry is Exclude<StoredHistoryEntry, StoredTradeExecution> =>
      entry.type === "swarm_run",
  );
  const entryTradesByOrderId = new Map(
    tradeExecutions.map((entry) => [
      entry.order.okxOrderId ?? entry.order.id,
      entry,
    ]),
  );
  const relevantOutcomes = outcomeWindows.filter(
    (window) =>
      window.realizedPnl !== null && (!regime || window.regime === regime),
  );
  const groups = new Map<string, OutcomeWindow[]>();

  for (const window of relevantOutcomes) {
    const key = `${window.regime}::${window.selectedEngine}`;
    const group = groups.get(key) ?? [];
    group.push(window);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, windows]) => {
    const [groupRegime, selectedEngine] = key.split("::");
    const actualNetEdgeBpsValues = windows.map((window) => {
      const tradeEntry = entryTradesByOrderId.get(window.orderId);
      const notionalUsd = tradeEntry?.order.notionalUsd ?? 0;
      return notionalUsd > 0 && window.realizedPnl !== null
        ? (window.realizedPnl / notionalUsd) * 10_000
        : 0;
    });
    const realizedPnls = windows
      .map((window) => window.realizedPnl)
      .filter((value): value is number => value !== null);
    const slippages = windows
      .map((window) => window.realizedSlippageBps)
      .filter((value): value is number => value !== null);
    const expectedEdges = windows.map((window) => window.expectedNetEdgeBps);
    const missedTradeCount = swarmRuns.filter(
      (entry) =>
        entry.consensus.blocked &&
        entry.consensus.regime.regime === groupRegime &&
        entry.consensus.metaSelection.selectedEngine === selectedEngine &&
        (entry.consensus.expectedNetEdgeBps ?? 0) > 0,
    ).length;
    const avgActualNetEdgeBps = average(actualNetEdgeBpsValues);
    const avgExpectedNetEdgeBps = average(expectedEdges);

    return {
      regime: groupRegime ?? "unknown",
      selectedEngine: selectedEngine ?? "none",
      sampleSize: windows.length,
      tradeCount: realizedPnls.length,
      winRate:
        realizedPnls.length > 0
          ? Number(
              (
                realizedPnls.filter((value) => value > 0).length /
                realizedPnls.length
              ).toFixed(4),
            )
          : 0,
      avgRealizedPnl: Number(average(realizedPnls).toFixed(4)),
      avgSlippageBps: Number(average(slippages).toFixed(4)),
      avgExpectedNetEdgeBps: Number(avgExpectedNetEdgeBps.toFixed(4)),
      avgActualNetEdgeBps: Number(avgActualNetEdgeBps.toFixed(4)),
      edgePredictionError: Number(
        (avgExpectedNetEdgeBps - avgActualNetEdgeBps).toFixed(4),
      ),
      missedTradeCount,
      generatedAt: new Date().toISOString(),
    };
  });
}
