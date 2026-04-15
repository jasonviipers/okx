import type { SwarmRole } from "@/lib/configs/roles";
import type { MarketContext, Timeframe } from "@/types/market";

export type TradeSignal = "BUY" | "SELL" | "HOLD";

export interface AgentVote {
  model: string;
  role: SwarmRole;
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  elapsedMs: number;
  voteWeight: number;
}

export interface ConsensusResult {
  symbol: string;
  timeframe: Timeframe;
  signal: TradeSignal;
  confidence: number;
  agreement: number;
  votes: AgentVote[];
  weightedScores: Record<TradeSignal, number>;
  validatedAt: string;
  blocked: boolean;
  blockReason?: string;
}

export interface SwarmRunResult {
  consensus: ConsensusResult;
  marketContext: MarketContext;
  totalElapsedMs: number;
  cached: boolean;
}

export interface SwarmStreamEvent {
  type: "status" | "vote" | "consensus" | "heartbeat" | "error";
  timestamp: string;
  symbol?: string;
  timeframe?: Timeframe;
  message?: string;
  vote?: AgentVote;
  consensus?: ConsensusResult;
}
