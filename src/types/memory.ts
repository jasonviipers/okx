import type { Timeframe } from "@/types/market";
import type { TradeSignal } from "@/types/swarm";

export interface MemoryRecord {
  id: number;
  createdAt: string;
  symbol: string;
  timeframe: Timeframe;
  signal: TradeSignal;
  confidence: number;
  agreement: number;
  blocked: boolean;
  blockReason?: string;
  price: number;
  change24h: number;
  spreadBps: number;
  volatilityPct: number;
  imbalance: number;
  summary: string;
}

export interface MemoryRecall {
  id: number;
  createdAt: string;
  signal: TradeSignal;
  confidence: number;
  agreement: number;
  blocked: boolean;
  summary: string;
  ageHours: number;
  decayWeight: number;
  similarity: number;
  weightedInfluence: number;
}

export interface MemorySummary {
  symbol: string;
  timeframe: Timeframe;
  totalMemories: number;
  effectiveSampleSize: number;
  blockedRatio: number;
  averageConfidence: number;
  directionalWeights: Record<TradeSignal, number>;
  dominantSignal: TradeSignal;
  topRecalls: MemoryRecall[];
  generatedAt: string;
}

export interface DecisionHarnessReport {
  generatedAt: string;
  marketQualityScore: number;
  liquidityScore: number;
  volatilityPenalty: number;
  memoryAlignmentScore: number;
  confidenceAdjustment: number;
  blockedByHarness: boolean;
  notes: string[];
}
