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
  source?: "websocket" | "rest" | "fallback" | "unknown";
  lastEventAt?: string;
}

export interface AutonomyStatus {
  enabled: boolean;
  configured: boolean;
  running: boolean;
  detail: string;
  symbol: string;
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
