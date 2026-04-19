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

export interface StoredAutonomySuppressedSymbol {
  until: string;
  reason: string;
  consecutiveDegradedSnapshots: number;
}

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
  degradedSnapshotCounts?: Record<string, number>;
  suppressedSymbols?: Record<string, StoredAutonomySuppressedSymbol>;
  leaseId?: string;
  leaseAcquiredAt?: string;
}

const AUTONOMY_STATE_ID = "autonomy";

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
    running: true,
    symbol: env.AUTONOMOUS_SYMBOL || "BTC-USDT",
    selectionMode: parseSelectionMode(env.AUTONOMOUS_SYMBOL_SELECTION),
    candidateSymbols: parseSymbolList(env.AUTONOMOUS_SYMBOLS),
    timeframe: (env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H",
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
  return {
    ...getDefaultAutonomyState(),
    ...(state ?? {}),
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
