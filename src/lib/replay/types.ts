import type { MarketDataStatus } from "@/types/api";
import type { Candle, OKXTicker, OrderBook, Timeframe } from "@/types/market";
import type { DecisionResult } from "@/types/swarm";
import type { AccountOverview } from "@/types/trade";

export type ReplaySnapshot = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  ticker: OKXTicker;
  orderbook: OrderBook;
  accountOverview: AccountOverview;
  timestampMs: number;
  marketStatus?: MarketDataStatus;
};

export type ReplayOutcome = {
  snapshot: ReplaySnapshot;
  decision: DecisionResult;
  simulatedPnl: number | null;
  simulatedSlippageBps: number | null;
};
