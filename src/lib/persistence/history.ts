import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredHistoryEntry } from "@/types/history";
import type { SwarmRunResult } from "@/types/swarm";
import type { Order } from "@/types/trade";

const DATA_DIR = path.join(process.cwd(), ".data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

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
    return JSON.parse(raw) as StoredHistoryEntry[];
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

export async function recordTradeExecution(order: Order): Promise<void> {
  const entries = await readHistory();
  entries.unshift({
    id: makeId("trade"),
    type: "trade_execution",
    timestamp: new Date().toISOString(),
    symbol: order.symbol,
    order,
    success: true,
  });
  await writeHistory(entries.slice(0, 500));
}

export async function getHistory(limit = 100): Promise<StoredHistoryEntry[]> {
  const entries = await readHistory();
  return entries.slice(0, limit);
}
