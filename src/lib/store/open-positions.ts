import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { openPositions } from "@/db/schema";

export interface OpenPositionRecord {
  orderId: string;
  instId: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  size: number;
  remainingSize: number;
  stopLoss: number | null;
  takeProfitLevels: number[];
  tpHitCount: number;
  trailingStopActive: boolean;
  trailingStopPrice: number | null;
  trailingStopAnchorPrice: number | null;
  trailingStopDistancePct: number;
  exchangePositionMissingCount: number;
  lastKnownPrice: number | null;
  lastCheckedAt: number | null;
  timestamp: number;
  updatedAt: number;
}

const DEFAULT_TRAILING_STOP_DISTANCE_PCT = 1.5;

let writeQueue: Promise<void> = Promise.resolve();

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullablePositiveNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeTakeProfitLevels(
  value: unknown,
  direction: OpenPositionRecord["direction"],
): number[] {
  const levels = Array.isArray(value)
    ? value
        .map((item) => toFiniteNumber(item, Number.NaN))
        .filter((item) => Number.isFinite(item) && item > 0)
    : [];

  const uniqueLevels = [
    ...new Set(levels.map((level) => level.toFixed(8))),
  ].map((level) => Number(level));

  return uniqueLevels
    .sort((left, right) => (direction === "BUY" ? left - right : right - left))
    .slice(0, 3);
}

function sanitizeOpenPositionRecord(
  value: OpenPositionRecord | Partial<OpenPositionRecord>,
): OpenPositionRecord {
  const now = Date.now();
  const direction = value.direction === "SELL" ? "SELL" : "BUY";
  const size = Math.max(0, toFiniteNumber(value.size, 0));
  const remainingSize = Math.min(
    size,
    Math.max(0, toFiniteNumber(value.remainingSize, size)),
  );
  const takeProfitLevels = sanitizeTakeProfitLevels(
    value.takeProfitLevels,
    direction,
  );
  const tpHitCount = Math.max(
    0,
    Math.min(
      takeProfitLevels.length,
      Math.trunc(toFiniteNumber(value.tpHitCount, 0)),
    ),
  );
  const trailingStopPrice = toNullablePositiveNumber(value.trailingStopPrice);
  const trailingStopAnchorPrice = toNullablePositiveNumber(
    value.trailingStopAnchorPrice,
  );

  return {
    orderId:
      typeof value.orderId === "string" && value.orderId.trim().length > 0
        ? value.orderId
        : `position_${now}`,
    instId:
      typeof value.instId === "string" && value.instId.trim().length > 0
        ? value.instId
        : "UNKNOWN",
    direction,
    entryPrice: Math.max(0, toFiniteNumber(value.entryPrice, 0)),
    size,
    remainingSize,
    stopLoss: toNullablePositiveNumber(value.stopLoss),
    takeProfitLevels,
    tpHitCount,
    trailingStopActive: value.trailingStopActive === true,
    trailingStopPrice,
    trailingStopAnchorPrice,
    trailingStopDistancePct: Math.max(
      0.1,
      toFiniteNumber(
        value.trailingStopDistancePct,
        DEFAULT_TRAILING_STOP_DISTANCE_PCT,
      ),
    ),
    exchangePositionMissingCount: Math.max(
      0,
      Math.trunc(toFiniteNumber(value.exchangePositionMissingCount, 0)),
    ),
    lastKnownPrice: toNullablePositiveNumber(value.lastKnownPrice),
    lastCheckedAt: Number.isFinite(
      toFiniteNumber(value.lastCheckedAt, Number.NaN),
    )
      ? toFiniteNumber(value.lastCheckedAt, now)
      : null,
    timestamp: Math.trunc(toFiniteNumber(value.timestamp, now)),
    updatedAt: Math.trunc(toFiniteNumber(value.updatedAt, now)),
  };
}

function mapRow(row: typeof openPositions.$inferSelect): OpenPositionRecord {
  return sanitizeOpenPositionRecord({
    orderId: row.orderId,
    instId: row.instId,
    direction: row.direction,
    entryPrice: row.entryPrice,
    size: row.size,
    remainingSize: row.remainingSize,
    stopLoss: row.stopLoss ?? null,
    takeProfitLevels: row.takeProfitLevels,
    tpHitCount: row.tpHitCount,
    trailingStopActive: row.trailingStopActive,
    trailingStopPrice: row.trailingStopPrice ?? null,
    trailingStopAnchorPrice: row.trailingStopAnchorPrice ?? null,
    trailingStopDistancePct: row.trailingStopDistancePct,
    exchangePositionMissingCount: row.exchangePositionMissingCount,
    lastKnownPrice: row.lastKnownPrice ?? null,
    lastCheckedAt: row.lastCheckedAt ?? null,
    timestamp: row.timestamp,
    updatedAt: row.updatedAt,
  });
}

async function upsertOpenPositionRecord(position: OpenPositionRecord) {
  await getDb()
    .insert(openPositions)
    .values({
      orderId: position.orderId,
      instId: position.instId,
      direction: position.direction,
      entryPrice: position.entryPrice,
      size: position.size,
      remainingSize: position.remainingSize,
      stopLoss: position.stopLoss,
      takeProfitLevels: position.takeProfitLevels,
      tpHitCount: position.tpHitCount,
      trailingStopActive: position.trailingStopActive,
      trailingStopPrice: position.trailingStopPrice,
      trailingStopAnchorPrice: position.trailingStopAnchorPrice,
      trailingStopDistancePct: position.trailingStopDistancePct,
      exchangePositionMissingCount: position.exchangePositionMissingCount,
      lastKnownPrice: position.lastKnownPrice,
      lastCheckedAt: position.lastCheckedAt,
      timestamp: position.timestamp,
      updatedAt: position.updatedAt,
    })
    .onConflictDoUpdate({
      target: openPositions.orderId,
      set: {
        instId: position.instId,
        direction: position.direction,
        entryPrice: position.entryPrice,
        size: position.size,
        remainingSize: position.remainingSize,
        stopLoss: position.stopLoss,
        takeProfitLevels: position.takeProfitLevels,
        tpHitCount: position.tpHitCount,
        trailingStopActive: position.trailingStopActive,
        trailingStopPrice: position.trailingStopPrice,
        trailingStopAnchorPrice: position.trailingStopAnchorPrice,
        trailingStopDistancePct: position.trailingStopDistancePct,
        exchangePositionMissingCount: position.exchangePositionMissingCount,
        lastKnownPrice: position.lastKnownPrice,
        lastCheckedAt: position.lastCheckedAt,
        timestamp: position.timestamp,
        updatedAt: position.updatedAt,
      },
    });
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = writeQueue.then(operation, operation);
  writeQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );
  return nextOperation;
}

async function waitForPendingWrites() {
  await writeQueue;
}

export async function getOpenPositions(): Promise<OpenPositionRecord[]> {
  await waitForPendingWrites();
  const rows = await getDb()
    .select()
    .from(openPositions)
    .orderBy(desc(openPositions.timestamp));

  return rows.map(mapRow);
}

export async function getOpenPosition(
  orderId: string,
): Promise<OpenPositionRecord | undefined> {
  await waitForPendingWrites();
  const [row] = await getDb()
    .select()
    .from(openPositions)
    .where(eq(openPositions.orderId, orderId))
    .limit(1);

  return row ? mapRow(row) : undefined;
}

export async function upsertOpenPosition(
  position: OpenPositionRecord,
): Promise<OpenPositionRecord> {
  return enqueueWrite(async () => {
    const nextPosition = sanitizeOpenPositionRecord({
      ...position,
      updatedAt: Date.now(),
    });
    await upsertOpenPositionRecord(nextPosition);
    return nextPosition;
  });
}

export async function updateOpenPosition(
  orderId: string,
  updater: (
    position: OpenPositionRecord,
  ) => OpenPositionRecord | Partial<OpenPositionRecord> | null,
): Promise<OpenPositionRecord | undefined> {
  return enqueueWrite(async () => {
    const [row] = await getDb()
      .select()
      .from(openPositions)
      .where(eq(openPositions.orderId, orderId))
      .limit(1);

    if (!row) {
      return undefined;
    }

    const current = mapRow(row);
    const updated = updater(current);
    if (updated === null) {
      await getDb()
        .delete(openPositions)
        .where(eq(openPositions.orderId, orderId));
      return undefined;
    }

    const nextPosition = sanitizeOpenPositionRecord({
      ...current,
      ...updated,
      orderId,
      updatedAt: Date.now(),
    });
    await upsertOpenPositionRecord(nextPosition);
    return nextPosition;
  });
}

export async function removeOpenPosition(orderId: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const [existingRow] = await getDb()
      .select()
      .from(openPositions)
      .where(eq(openPositions.orderId, orderId))
      .limit(1);

    if (!existingRow) {
      return false;
    }

    await getDb()
      .delete(openPositions)
      .where(eq(openPositions.orderId, orderId));
    return true;
  });
}

export async function removeOpenPositionsForInstrument(
  instId: string,
): Promise<number> {
  return enqueueWrite(async () => {
    const rows = await getDb()
      .select()
      .from(openPositions)
      .where(eq(openPositions.instId, instId));

    if (rows.length === 0) {
      return 0;
    }

    for (const row of rows) {
      await getDb()
        .delete(openPositions)
        .where(eq(openPositions.orderId, row.orderId));
    }

    return rows.length;
  });
}
