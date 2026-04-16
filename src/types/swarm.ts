import type { SwarmRole } from "@/lib/configs/roles";
import type { MarketContext, Timeframe } from "@/types/market";
import type { DecisionHarnessReport, MemorySummary } from "@/types/memory";
import type { Order } from "@/types/trade";

export type TradeSignal = "BUY" | "SELL" | "HOLD";
export type MarketRegime =
  | "trend"
  | "breakout"
  | "mean_reversion"
  | "stress"
  | "illiquid";
export type StrategyEngine =
  | "trend_continuation"
  | "breakout"
  | "mean_reversion"
  | "microstructure"
  | "none";

export interface StrategyEngineReport {
  engine: StrategyEngine;
  signal: TradeSignal;
  confidence: number;
  supportScore: number;
  reasons: string[];
  supportingRoles: SwarmRole[];
}

export interface AgentVote {
  model: string;
  role: SwarmRole;
  modelRole: string;
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  elapsedMs: number;
  voteWeight: number;
  isVetoLayer: boolean;
  researchTrace?: AgentResearchTrace;
}

export interface AgentResearchTrace {
  status:
    | "not_allowed"
    | "skipped"
    | "requested"
    | "completed"
    | "unavailable"
    | "failed";
  searched: boolean;
  focus?: string | null;
  rationale?: string | null;
}

export interface ConsensusResearchSummary {
  searchedAgents: number;
  totalAgents: number;
  completedAgents: number;
  skippedAgents: number;
  failedAgents: number;
  topFocuses: string[];
  topRationales: string[];
}

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  trendScore: number;
  breakoutScore: number;
  meanReversionScore: number;
  volatilityScore: number;
  liquidityScore: number;
  notes: string[];
  generatedAt: string;
}

export interface MetaSelectionReport {
  selectedEngine: StrategyEngine;
  suitability: number;
  actionBias: TradeSignal;
  engineScores: Record<StrategyEngine, number>;
  notes: string[];
  generatedAt: string;
}

export interface ExpectedValueReport {
  grossEdgeBps: number;
  estimatedFeeBps: number;
  estimatedSlippageBps: number;
  netEdgeBps: number;
  rewardRiskRatio: number;
  tradeAllowed: boolean;
  notes: string[];
  generatedAt: string;
}

export interface ReliabilityReport {
  regime: MarketRegime;
  selectedEngine: StrategyEngine;
  sampleSize: number;
  reliabilityScore: number;
  blockedRate: number;
  notes: string[];
  generatedAt: string;
}

export interface ConsensusResult {
  symbol: string;
  timeframe: Timeframe;
  signal: TradeSignal;
  decision?: TradeSignal;
  confidence: number;
  agreement: number;
  votes: AgentVote[];
  weightedScores: Record<TradeSignal, number>;
  validatedAt: string;
  blocked: boolean;
  blockReason?: string;
  memory?: MemorySummary;
  harness?: DecisionHarnessReport;
  regime?: RegimeAnalysis;
  engineReports?: StrategyEngineReport[];
  metaSelection?: MetaSelectionReport;
  expectedValue?: ExpectedValueReport;
  reliability?: ReliabilityReport;
  researchSummary?: ConsensusResearchSummary;
}

export interface ExecutionResult {
  status: "success" | "hold" | "error";
  timestamp: string;
  symbol: string;
  decision: TradeSignal;
  size: number;
  reason?: string;
  order?: Order;
  simulated?: boolean;
  accountMode?: "live" | "paper";
  response?: unknown;
  error?: string;
  circuitOpen?: boolean;
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
