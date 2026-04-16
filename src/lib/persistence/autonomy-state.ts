import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Timeframe } from "@/types/market";

export interface StoredAutonomyState {
  running: boolean;
  symbol: string;
  timeframe: Timeframe;
  intervalMs: number;
  cooldownMs: number;
  budgetUsd?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastDecision?: string;
  lastExecutionStatus?: "success" | "hold" | "error";
  lastError?: string;
  lastReason?: string;
  iterationCount: number;
  lastTradeAt?: number;
  inFlight: boolean;
  leaseId?: string;
  leaseAcquiredAt?: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const AUTONOMY_FILE = path.join(DATA_DIR, "autonomy-state.json");

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDefaultAutonomyState(): StoredAutonomyState {
  return {
    running: false,
    symbol: process.env.AUTONOMOUS_SYMBOL || "BTC-USDT",
    timeframe: (process.env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H",
    intervalMs: parseNumber(process.env.AUTONOMOUS_INTERVAL_MS, 60_000),
    cooldownMs: parseNumber(process.env.AUTONOMOUS_COOLDOWN_MS, 120_000),
    budgetUsd: parseNumber(process.env.LIVE_TRADING_BUDGET_USD, 0),
    iterationCount: 0,
    inFlight: false,
  };
}

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(AUTONOMY_FILE, "utf8");
  } catch {
    await writeFile(
      AUTONOMY_FILE,
      JSON.stringify(getDefaultAutonomyState(), null, 2),
      "utf8",
    );
  }
}

export async function readAutonomyState(): Promise<StoredAutonomyState> {
  await ensureFile();
  const raw = await readFile(AUTONOMY_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAutonomyState>;
    return {
      ...getDefaultAutonomyState(),
      ...parsed,
    };
  } catch {
    return getDefaultAutonomyState();
  }
}

export async function writeAutonomyState(state: StoredAutonomyState) {
  await ensureFile();
  await writeFile(AUTONOMY_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function updateAutonomyState(
  updater: (state: StoredAutonomyState) => StoredAutonomyState,
): Promise<StoredAutonomyState> {
  const current = await readAutonomyState();
  const next = updater(current);
  await writeAutonomyState(next);
  return next;
}
