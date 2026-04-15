import type { Timeframe } from "@/types/market";

export const OKX_CONFIG = {
  baseUrl: process.env.OKX_BASE_URL || "https://www.okx.com",
  wsUrl: process.env.OKX_WS_URL || "wss://ws.okx.com:8443/ws/v5/public",
  apiKey: process.env.OKX_API_KEY || "",
  secret: process.env.OKX_SECRET || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
};

export const OKX_ENDPOINTS = {
  ticker: "/api/v5/market/ticker",
  candles: "/api/v5/market/candles",
  orderbook: "/api/v5/market/books",
  placeOrder: "/api/v5/trade/order",
  cancelOrder: "/api/v5/trade/cancel-order",
  pendingOrders: "/api/v5/trade/orders-pending",
  positions: "/api/v5/account/positions",
} as const;

export const OKX_TIMEFRAME_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1H",
  "2H": "2H",
  "4H": "4H",
  "6H": "6H",
  "12H": "12H",
  "1D": "1D",
  "1W": "1W",
};

export function hasOkxTradingCredentials(): boolean {
  return Boolean(
    OKX_CONFIG.apiKey && OKX_CONFIG.secret && OKX_CONFIG.passphrase,
  );
}
