import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

const DATA_DIR = path.join(process.cwd(), ".data");
const OPEN_POSITIONS_FILE = path.join(DATA_DIR, "open-positions.json");
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

async function ensureOpenPositionsFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(OPEN_POSITIONS_FILE, "utf8");
  } catch {
    await writeFile(OPEN_POSITIONS_FILE, "[]", "utf8");
  }
}

async function readOpenPositionsFile(): Promise<OpenPositionRecord[]> {
  await ensureOpenPositionsFile();
  const raw = await readFile(OPEN_POSITIONS_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.map((entry) =>
          sanitizeOpenPositionRecord(entry as Partial<OpenPositionRecord>),
        )
      : [];
  } catch {
    return [];
  }
}

async function writeOpenPositionsFile(entries: OpenPositionRecord[]) {
  await ensureOpenPositionsFile();
  const sanitizedEntries = entries
    .map((entry) => sanitizeOpenPositionRecord(entry))
    .sort((left, right) => right.timestamp - left.timestamp);
  await writeFile(
    OPEN_POSITIONS_FILE,
    JSON.stringify(sanitizedEntries, null, 2),
    "utf8",
  );
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
  return readOpenPositionsFile();
}

export async function getOpenPosition(
  orderId: string,
): Promise<OpenPositionRecord | undefined> {
  const positions = await getOpenPositions();
  return positions.find((position) => position.orderId === orderId);
}

export async function upsertOpenPosition(
  position: OpenPositionRecord,
): Promise<OpenPositionRecord> {
  return enqueueWrite(async () => {
    const nextPosition = sanitizeOpenPositionRecord({
      ...position,
      updatedAt: Date.now(),
    });
    const positions = await readOpenPositionsFile();
    const index = positions.findIndex(
      (entry) => entry.orderId === nextPosition.orderId,
    );

    if (index >= 0) {
      positions[index] = nextPosition;
    } else {
      positions.unshift(nextPosition);
    }

    await writeOpenPositionsFile(positions);
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
    const positions = await readOpenPositionsFile();
    const index = positions.findIndex((entry) => entry.orderId === orderId);

    if (index < 0) {
      return undefined;
    }

    const updated = updater(positions[index]);
    if (updated === null) {
      positions.splice(index, 1);
      await writeOpenPositionsFile(positions);
      return undefined;
    }

    const nextPosition = sanitizeOpenPositionRecord({
      ...positions[index],
      ...updated,
      orderId,
      updatedAt: Date.now(),
    });
    positions[index] = nextPosition;
    await writeOpenPositionsFile(positions);
    return nextPosition;
  });
}

export async function removeOpenPosition(orderId: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const positions = await readOpenPositionsFile();
    const nextPositions = positions.filter(
      (position) => position.orderId !== orderId,
    );

    if (nextPositions.length === positions.length) {
      return false;
    }

    await writeOpenPositionsFile(nextPositions);
    return true;
  });
}
