import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConsensusResult, ExecutionResult } from "@/types/swarm";

type ExecutionIntentStatus =
  | "created"
  | "submitted"
  | "success"
  | "hold"
  | "error";

type ExecutionIntentDecisionSnapshot = {
  signal: ConsensusResult["signal"];
  directionalSignal: ConsensusResult["directionalSignal"];
  decision: string;
  confidence: number;
  agreement: number;
  executionEligible: boolean;
  decisionSource?: ConsensusResult["decisionSource"];
  expectedNetEdgeBps?: ConsensusResult["expectedNetEdgeBps"];
  marketQualityScore?: ConsensusResult["marketQualityScore"];
  riskFlags?: ConsensusResult["riskFlags"];
  featureSummary?: ConsensusResult["featureSummary"];
  rejectionReasons: ConsensusResult["rejectionReasons"];
};

export interface ExecutionIntentRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  timeframe: string;
  decision: string;
  confidence: number;
  targetSize: number;
  normalizedSize?: number;
  status: ExecutionIntentStatus;
  reason?: string;
  response?: unknown;
  decisionSnapshot: ExecutionIntentDecisionSnapshot;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const EXECUTION_INTENTS_FILE = path.join(DATA_DIR, "execution-intents.json");

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(EXECUTION_INTENTS_FILE, "utf8");
  } catch {
    await writeFile(EXECUTION_INTENTS_FILE, "[]", "utf8");
  }
}

async function readIntents(): Promise<ExecutionIntentRecord[]> {
  await ensureFile();
  const raw = await readFile(EXECUTION_INTENTS_FILE, "utf8");
  try {
    return JSON.parse(raw) as ExecutionIntentRecord[];
  } catch {
    return [];
  }
}

async function writeIntents(entries: ExecutionIntentRecord[]) {
  await ensureFile();
  await writeFile(
    EXECUTION_INTENTS_FILE,
    JSON.stringify(entries, null, 2),
    "utf8",
  );
}

function makeId() {
  return `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createExecutionIntent(
  consensus: ConsensusResult,
  targetSize: number,
): Promise<ExecutionIntentRecord> {
  const entries = await readIntents();
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
  entries.unshift(record);
  await writeIntents(entries.slice(0, 500));
  return record;
}

export async function updateExecutionIntent(
  id: string,
  patch: Partial<ExecutionIntentRecord>,
) {
  const entries = await readIntents();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return;
  }

  entries[index] = {
    ...entries[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeIntents(entries.slice(0, 500));
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
