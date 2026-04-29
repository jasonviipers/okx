import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { autonomyState } from "@/db/schema";
import { env } from "@/env";
import { parseNumber } from "@/lib/runtime-utils";
import type { AutonomyCandidateScore } from "@/types/api";
import type { Timeframe } from "@/types/market";
import type { RejectionReason } from "@/types/swarm";

export type AutonomySelectionMode = "fixed" | "auto";
export type AutonomyTimeframeSelectionMode = "fixed" | "auto";

const VALID_TIMEFRAMES: readonly Timeframe[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "6H",
  "12H",
  "1D",
  "1W",
];
const DEFAULT_AUTONOMOUS_TIMEFRAMES: readonly Timeframe[] = ["15m", "1H", "4H"];

export interface StoredAutonomySuppressedSymbol {
  symbol: string;
  timeframe: Timeframe;
  until: string;
  reason: string;
  consecutiveDegradedSnapshots: number;
}

export interface StoredAutonomyState {
  running: boolean;
  workflowSessionId?: string;
  workflowRunId?: string;
  symbol: string;
  selectionMode: AutonomySelectionMode;
  candidateSymbols?: string[];
  timeframeSelectionMode: AutonomyTimeframeSelectionMode;
  candidateTimeframes?: Timeframe[];
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
  degradedSnapshotCounts?: Record<string, number>;
  suppressedSymbols?: Record<string, StoredAutonomySuppressedSymbol>;
  leaseId?: string;
  leaseAcquiredAt?: string;
}

const AUTONOMY_STATE_ID = "autonomy";

function parseSelectionMode(value: string | undefined): AutonomySelectionMode {
  return value?.toLowerCase() === "fixed" ? "fixed" : "auto";
}

function parseTimeframeSelectionMode(
  value: string | undefined,
): AutonomyTimeframeSelectionMode {
  return value?.toLowerCase() === "fixed" ? "fixed" : "auto";
}

function parseSymbolList(value: string | undefined): string[] | undefined {
  const symbols = (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return symbols.length > 0 ? symbols : undefined;
}

function isTimeframe(value: string): value is Timeframe {
  return (VALID_TIMEFRAMES as readonly string[]).includes(value);
}

function uniqueTimeframes(values: Iterable<Timeframe>): Timeframe[] {
  const seen = new Set<Timeframe>();
  const next: Timeframe[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }

  return next;
}

function parseTimeframeList(
  value: string | undefined,
): Timeframe[] | undefined {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(isTimeframe);

  return entries.length > 0 ? uniqueTimeframes(entries) : undefined;
}

export function getDefaultAutonomyState(): StoredAutonomyState {
  const preferredTimeframe = (env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H";
  const candidateTimeframes =
    parseTimeframeList(env.AUTONOMOUS_TIMEFRAMES) ??
    uniqueTimeframes([preferredTimeframe, ...DEFAULT_AUTONOMOUS_TIMEFRAMES]);

  return {
    running: true,
    workflowSessionId: undefined,
    workflowRunId: undefined,
    symbol: env.AUTONOMOUS_SYMBOL || "BTC-USDT",
    selectionMode: parseSelectionMode(env.AUTONOMOUS_SYMBOL_SELECTION),
    candidateSymbols: parseSymbolList(env.AUTONOMOUS_SYMBOLS),
    timeframeSelectionMode: parseTimeframeSelectionMode(
      env.AUTONOMOUS_TIMEFRAME_SELECTION,
    ),
    candidateTimeframes,
    timeframe: preferredTimeframe,
    intervalMs: parseNumber(env.AUTONOMOUS_INTERVAL_MS, 20_000),
    cooldownMs: parseNumber(env.AUTONOMOUS_COOLDOWN_MS, 120_000),
    budgetUsd: parseNumber(env.LIVE_TRADING_BUDGET_USD, 0),
    iterationCount: 0,
    inFlight: false,
    symbolThrottleUntil: {},
    degradedSnapshotCounts: {},
    suppressedSymbols: {},
  };
}

function normalizeAutonomyState(
  state?: Partial<StoredAutonomyState> | null,
): StoredAutonomyState {
  const defaults = getDefaultAutonomyState();
  const rawState = state ?? {};
  const timeframe = isTimeframe(String(rawState.timeframe ?? ""))
    ? (String(rawState.timeframe) as Timeframe)
    : defaults.timeframe;
  const rawCandidateTimeframes = Array.isArray(rawState.candidateTimeframes)
    ? rawState.candidateTimeframes
        .map((entry) => String(entry))
        .filter(isTimeframe)
    : defaults.candidateTimeframes;
  const normalizedCandidateTimeframes = uniqueTimeframes([
    timeframe,
    ...(rawCandidateTimeframes ?? []),
  ]);

  return {
    ...defaults,
    ...rawState,
    selectionMode: parseSelectionMode(rawState.selectionMode),
    timeframeSelectionMode: parseTimeframeSelectionMode(
      rawState.timeframeSelectionMode,
    ),
    timeframe,
    candidateTimeframes: normalizedCandidateTimeframes,
    // Budget is env-driven operational config, so reconcile it on every read
    // instead of letting an old persisted state silently pin live trading.
    budgetUsd: defaults.budgetUsd,
  };
}

async function upsertState(state: StoredAutonomyState) {
  await getDb()
    .insert(autonomyState)
    .values({
      id: AUTONOMY_STATE_ID,
      state,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: autonomyState.id,
      set: {
        state,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function readAutonomyState(): Promise<StoredAutonomyState> {
  const [row] = await getDb()
    .select()
    .from(autonomyState)
    .where(eq(autonomyState.id, AUTONOMY_STATE_ID))
    .limit(1);

  const normalizedState = normalizeAutonomyState(row?.state);
  if (!row) {
    await upsertState(normalizedState);
  }

  return normalizedState;
}

export async function writeAutonomyState(state: StoredAutonomyState) {
  await upsertState(normalizeAutonomyState(state));
}

export async function updateAutonomyState(
  updater: (state: StoredAutonomyState) => StoredAutonomyState,
): Promise<StoredAutonomyState> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(autonomyState)
      .where(eq(autonomyState.id, AUTONOMY_STATE_ID))
      .for("update")
      .limit(1);

    const current = normalizeAutonomyState(row?.state);
    const next = normalizeAutonomyState(updater(current));

    await tx
      .insert(autonomyState)
      .values({
        id: AUTONOMY_STATE_ID,
        state: next,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: autonomyState.id,
        set: {
          state: next,
          updatedAt: new Date().toISOString(),
        },
      });

    return next;
  });
}
