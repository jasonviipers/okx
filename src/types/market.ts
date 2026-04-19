export interface OKXTicker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  change24h: number; // percentage
  open24h?: number;
  timestamp: string; // ISO timestamp
}

export interface Candle {
  timestamp: string; // ISO timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
}

export interface OrderBookEntry {
  price: number;
  size: number;
  count?: number; // number of orders at this level
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[]; // sorted descending by price
  asks: OrderBookEntry[]; // sorted ascending by price
  timestamp: string; // ISO timestamp
}

export type Timeframe =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1H"
  | "2H"
  | "4H"
  | "6H"
  | "12H"
  | "1D"
  | "1W";

export interface MarketContext {
  symbol: string;
  candles: Candle[]; // last 20 bars, OHLCV
  ticker: OKXTicker; // price, 24h change, spread
  orderbook: OrderBook; // top 10 bids + asks
  timeframe: Timeframe;
}

export type MarketDataSource =
  | "websocket"
  | "rest"
  | "mixed"
  | "fallback"
  | "unknown";
export type FeedConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "degraded"
  | "error";

export interface MarketFeedStatus {
  symbol: string;
  timeframe: Timeframe;
  source: MarketDataSource;
  synthetic: boolean;
  realtime: boolean;
  stale: boolean;
  tradeable: boolean;
  connectionState: FeedConnectionState;
  lastTickerAt?: string;
  lastOrderBookAt?: string;
  lastCandlesAt?: string;
  lastEventAt?: string;
  warnings: string[];
}

export interface MarketSnapshot {
  context: MarketContext;
  status: MarketFeedStatus;
}
