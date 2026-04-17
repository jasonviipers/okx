import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutonomyCandidateScore } from "@/types/api";
import type { Timeframe } from "@/types/market";
import type { RejectionReason } from "@/types/swarm";

export type AutonomySelectionMode = "fixed" | "auto";

export interface StoredAutonomyState {
  running: boolean;
  symbol: string;
  selectionMode: AutonomySelectionMode;
  candidateSymbols?: string[];
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
  lastCandidateScores?: AutonomyCandidateScore[];
  lastSelectedCandidate?: AutonomyCandidateScore;
  lastRejectedReasons?: RejectionReason[];
  symbolThrottleUntil?: Record<string, string>;
  leaseId?: string;
  leaseAcquiredAt?: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const AUTONOMY_FILE = path.join(DATA_DIR, "autonomy-state.json");

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSelectionMode(value: string | undefined): AutonomySelectionMode {
  return value?.toLowerCase() === "fixed" ? "fixed" : "auto";
}

function parseSymbolList(value: string | undefined): string[] | undefined {
  const symbols = (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return symbols.length > 0 ? symbols : undefined;
}

export function getDefaultAutonomyState(): StoredAutonomyState {
  return {
    running: false,
    symbol: process.env.AUTONOMOUS_SYMBOL || "BTC-USDT",
    selectionMode: parseSelectionMode(process.env.AUTONOMOUS_SYMBOL_SELECTION),
    candidateSymbols: parseSymbolList(process.env.AUTONOMOUS_SYMBOLS),
    timeframe: (process.env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H",
    intervalMs: parseNumber(process.env.AUTONOMOUS_INTERVAL_MS, 20_000),
    cooldownMs: parseNumber(process.env.AUTONOMOUS_COOLDOWN_MS, 120_000),
    budgetUsd: parseNumber(process.env.LIVE_TRADING_BUDGET_USD, 0),
    iterationCount: 0,
    inFlight: false,
    symbolThrottleUntil: {},
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
