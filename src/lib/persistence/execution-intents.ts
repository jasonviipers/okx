import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { executionIntents } from "@/db/schema";
import type { StoredExecutionIntent } from "@/types/history";
import type { DecisionResult, ExecutionResult } from "@/types/swarm";

export type ExecutionIntentRecord = StoredExecutionIntent;

function makeId() {
  return `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapRow(
  row: typeof executionIntents.$inferSelect,
): ExecutionIntentRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    symbol: row.symbol,
    timeframe: row.timeframe,
    decision: row.decision,
    confidence: row.confidence,
    targetSize: row.targetSize,
    normalizedSize: row.normalizedSize ?? undefined,
    status: row.status,
    reason: row.reason ?? undefined,
    response: row.response,
    decisionSnapshot: row.decisionSnapshot,
  };
}

export async function createExecutionIntent(
  consensus: DecisionResult,
  targetSize: number,
): Promise<ExecutionIntentRecord> {
  const timestamp = new Date().toISOString();
  const record: ExecutionIntentRecord = {
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    symbol: consensus.symbol,
    timeframe: consensus.timeframe,
    decision: consensus.decision ?? consensus.signal,
    confidence: consensus.confidence,
    targetSize,
    status: "created",
    decisionSnapshot: {
      signal: consensus.signal,
      directionalSignal: consensus.directionalSignal,
      decision: consensus.decision ?? consensus.signal,
      confidence: consensus.confidence,
      agreement: consensus.agreement,
      executionEligible: consensus.executionEligible,
      decisionSource: consensus.decisionSource,
      expectedNetEdgeBps: consensus.expectedNetEdgeBps,
      marketQualityScore: consensus.marketQualityScore,
      riskFlags: consensus.riskFlags,
      featureSummary: consensus.featureSummary,
      rejectionReasons: consensus.rejectionReasons,
    },
  };

  await getDb()
    .insert(executionIntents)
    .values({
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      symbol: record.symbol,
      timeframe: record.timeframe,
      decision: record.decision,
      confidence: record.confidence,
      targetSize: record.targetSize,
      normalizedSize: record.normalizedSize ?? null,
      status: record.status,
      reason: record.reason ?? null,
      response: record.response,
      decisionSnapshot: record.decisionSnapshot,
    });

  return record;
}

export async function getExecutionIntents(
  limit = 100,
): Promise<ExecutionIntentRecord[]> {
  const rows = await getDb()
    .select()
    .from(executionIntents)
    .orderBy(desc(executionIntents.createdAt))
    .limit(limit);

  return rows.map(mapRow);
}

export async function updateExecutionIntent(
  id: string,
  patch: Partial<ExecutionIntentRecord>,
) {
  const [currentRow] = await getDb()
    .select()
    .from(executionIntents)
    .where(eq(executionIntents.id, id))
    .limit(1);

  if (!currentRow) {
    return;
  }

  const current = mapRow(currentRow);
  const next: ExecutionIntentRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await getDb()
    .update(executionIntents)
    .set({
      updatedAt: next.updatedAt,
      symbol: next.symbol,
      timeframe: next.timeframe,
      decision: next.decision,
      confidence: next.confidence,
      targetSize: next.targetSize,
      normalizedSize: next.normalizedSize ?? null,
      status: next.status,
      reason: next.reason ?? null,
      response: next.response,
      decisionSnapshot: next.decisionSnapshot,
    })
    .where(eq(executionIntents.id, id));
}

export async function finalizeExecutionIntent(
  id: string,
  result: ExecutionResult,
  extras?: {
    normalizedSize?: number;
    response?: unknown;
  },
) {
  await updateExecutionIntent(id, {
    status: result.status,
    reason: result.reason ?? result.error,
    normalizedSize: extras?.normalizedSize ?? result.size,
    response: extras?.response ?? result.response ?? result.order,
  });
}
