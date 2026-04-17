import type { SwarmRunResult } from "@/types/swarm";
import type {
  Order,
  TradeDecisionSnapshot,
  TradeExecutionContext,
  TradePerformanceMetrics,
} from "@/types/trade";

export type StoredSwarmRun = {
  id: string;
  type: "swarm_run";
  timestamp: string;
  symbol: string;
  timeframe: string;
  cached: boolean;
  totalElapsedMs: number;
  consensus: SwarmRunResult["consensus"];
};

export type StoredTradeExecution = {
  id: string;
  type: "trade_execution";
  timestamp: string;
  symbol: string;
  order: Order;
  success: boolean;
  decisionSnapshot?: TradeDecisionSnapshot;
  executionContext?: TradeExecutionContext;
  performance?: TradePerformanceMetrics;
};

export type StoredHistoryEntry = StoredSwarmRun | StoredTradeExecution;
