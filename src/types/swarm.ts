import type { SwarmRole } from "@/lib/configs/roles";
import type { MarketContext, Timeframe } from "@/types/market";
import type { DecisionHarnessReport, MemorySummary } from "@/types/memory";
import type { Order } from "@/types/trade";

export type TradeSignal = "BUY" | "SELL" | "HOLD";
export type RejectionLayer =
  | "validator"
  | "meta_selector"
  | "expected_value"
  | "reliability"
  | "harness"
  | "market_data"
  | "execution"
  | "autonomy";
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
export type DecisionSource =
  | "deterministic"
  | "diagnostic"
  | "diagnostic_swarm";
export type ExecutionDecisionSource = Exclude<
  DecisionSource,
  "diagnostic_swarm"
>;

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

export interface RejectionReason {
  layer: RejectionLayer;
  code: string;
  summary: string;
  detail?: string;
  metrics?: Record<string, unknown>;
}

/**
 * Execution-ready deterministic decision. Supersedes ConsensusResult for
 * all execution-critical consumers.
 */
export type DecisionResult = {
  symbol: string;
  timeframe: Timeframe;
  signal: TradeSignal;
  directionalSignal: TradeSignal;
  directionalConfidence: number;
  directionalAgreement: number;
  decision: TradeSignal;
  confidence: number;
  agreement: number;
  executionEligible: boolean;
  blocked: boolean;
  blockReason?: string;
  rejectionReasons: RejectionReason[];
  riskFlags: string[];
  featureSummary: Record<string, number>;
  directionalEdgeScore: number;
  executionQualityScore: number;
  riskPenaltyScore: number;
  expectedNetEdgeBps: number;
  marketQualityScore: number;
  decisionSource: ExecutionDecisionSource;
  decisionCadenceMs: number;
  symbolThrottleMs: number;
  validatedAt: string;
  regime: RegimeAnalysis;
  engineReports: StrategyEngineReport[];
  metaSelection: MetaSelectionReport;
  expectedValue: ExpectedValueReport;
  harness: DecisionHarnessReport;
  memory?: MemorySummary;
  reliability?: ReliabilityReport;
  votes?: AgentVote[];
  weightedScores?: Record<TradeSignal, number>;
  researchSummary?: ConsensusResearchSummary;
};

/**
 * @deprecated Use DecisionResult for execution-critical flows.
 */
export interface ConsensusResult {
  symbol: string;
  timeframe: Timeframe;
  signal: TradeSignal;
  directionalSignal: TradeSignal;
  directionalConfidence: number;
  directionalAgreement: number;
  decision?: TradeSignal;
  confidence: number;
  agreement: number;
  decisionSource?: DecisionSource;
  featureSummary?: Record<string, number>;
  riskFlags?: string[];
  directionalEdgeScore?: number;
  executionQualityScore?: number;
  riskPenaltyScore?: number;
  expectedNetEdgeBps?: number;
  marketQualityScore?: number;
  decisionCadenceMs?: number;
  symbolThrottleMs?: number;
  votes: AgentVote[];
  weightedScores: Record<TradeSignal, number>;
  validatedAt: string;
  blocked: boolean;
  executionEligible: boolean;
  blockReason?: string;
  rejectionReasons: RejectionReason[];
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
  rejectionReasons?: RejectionReason[];
}

export interface SwarmRunResult {
  consensus: DecisionResult;
  marketContext: MarketContext;
  totalElapsedMs: number;
  cached: boolean;
}

export interface SwarmStreamEvent {
  id?: string;
  type: "status" | "vote" | "consensus" | "heartbeat" | "error" | "pipeline";
  timestamp: string;
  symbol?: string;
  timeframe?: Timeframe;
  message?: string;
  vote?: AgentVote;
  consensus?: DecisionResult | ConsensusResult;
  pipeline?: {
    stage: string;
    detail: string;
    model?: string;
  };
}
