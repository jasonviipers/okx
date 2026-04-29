import type { PortfolioState } from "@/types/portfolio";
import type { RejectionReason, TradeSignal } from "@/types/swarm";
import type { MarketType } from "@/types/trade";

export type DataSource =
  | "okx"
  | "okx_private"
  | "fallback"
  | "cache"
  | "computed"
  | "local_store";

export interface SourceHealth {
  source: DataSource;
  cached: boolean;
  timestamp: string;
  warning?: string;
}

export interface SourceHealthMap {
  [key: string]: SourceHealth;
}

export interface ApiEnvelope<T> {
  data: T;
  sourceHealth?: SourceHealthMap;
  warnings?: string[];
  timestamp: string;
}

export interface ServiceStatus {
  configured: boolean;
  available: boolean;
  detail: string;
}

export interface MarketDataStatus {
  configured: boolean;
  available: boolean;
  realtime: boolean;
  stale: boolean;
  connectionState: "idle" | "connecting" | "connected" | "degraded" | "error";
  detail: string;
  symbol?: string;
  timeframe?: string;
  source?: "websocket" | "rest" | "mixed" | "fallback" | "unknown";
  lastEventAt?: string;
}

export interface AutonomyCandidateScore {
  symbol: string;
  timeframe: string;
  marketType?: MarketType;
  score: number;
  tradeable: boolean;
  realtime: boolean;
  blocked: boolean;
  directionalSignal: TradeSignal;
  decision: TradeSignal;
  confidence: number;
  agreement: number;
  expectedNetEdgeBps?: number;
  marketQualityScore?: number;
  riskFlags?: string[];
  decisionCadenceMs?: number;
  symbolThrottleMs?: number;
  portfolioFitScore?: number;
  portfolioConcentrationPct?: number;
  symbolBudgetRemainingUsd?: number;
  quoteBudgetAvailableUsd?: number;
  positionState?: "flat" | "long" | "short";
  rejectionReasons: RejectionReason[];
}

export interface AutonomySuppressedSymbol {
  symbol: string;
  timeframe: string;
  until: string;
  reason: string;
  consecutiveDegradedSnapshots: number;
}

export interface AutonomyStatus {
  enabled: boolean;
  configured: boolean;
  running: boolean;
  detail: string;
  workflowSessionId?: string;
  workflowRunId?: string;
  workflowStatus?: string;
  symbol: string;
  selectionMode?: "fixed" | "auto";
  candidateSymbols?: string[];
  timeframeSelectionMode?: "fixed" | "auto";
  candidateTimeframes?: string[];
  timeframe: string;
  intervalMs: number;
  cooldownMs: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastDecision?: string;
  lastExecutionStatus?: "success" | "hold" | "error";
  lastError?: string;
  lastReason?: string;
  iterationCount: number;
  budgetUsd?: number;
  budgetRemainingUsd?: number;
  inFlight?: boolean;
  lastCandidateScores?: AutonomyCandidateScore[];
  lastSelectedCandidate?: AutonomyCandidateScore;
  lastRejectedReasons?: RejectionReason[];
  suppressedSymbols?: AutonomySuppressedSymbol[];
  portfolioState?: PortfolioState;
}

export interface RuntimeStatus {
  okx: ServiceStatus & {
    accountMode: "live" | "paper";
    baseUrl: string;
  };
  marketData: MarketDataStatus;
  redis: ServiceStatus;
  ollama: ServiceStatus & {
    baseUrl?: string;
  };
  webResearch: ServiceStatus;
  autonomy: AutonomyStatus;
  timestamp: string;
}
