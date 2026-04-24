import "server-only";

import { env } from "@/env";
import type { Timeframe } from "@/types/market";
import type { MarginMode, MarketType, PositionSide } from "@/types/trade";

export const OKX_ACCOUNT_MODES = ["live", "demo", "paper"] as const;
export type OkxAccountMode = (typeof OKX_ACCOUNT_MODES)[number];
export const OKX_API_REGIONS = ["global", "us", "eu", "au"] as const;
export type OkxApiRegion = (typeof OKX_API_REGIONS)[number];
export const OKX_DERIVATIVES_TD_MODES = ["cross", "isolated"] as const;
export type OkxDerivativesTdMode = (typeof OKX_DERIVATIVES_TD_MODES)[number];
export const OKX_POSITION_MODES = ["net", "long_short"] as const;
export type OkxPositionMode = (typeof OKX_POSITION_MODES)[number];

function normalizeAccountMode(mode: string | undefined): OkxAccountMode {
  if (mode === "demo" || mode === "paper") {
    return mode;
  }

  return "live";
}

function normalizeRegion(region: string | undefined): OkxApiRegion {
  if (region === "us" || region === "eu" || region === "au") {
    return region;
  }

  return "global";
}

function normalizeDerivativesTdMode(
  mode: string | undefined,
): OkxDerivativesTdMode {
  return mode === "isolated" ? "isolated" : "cross";
}

function normalizePositionMode(mode: string | undefined): OkxPositionMode {
  return mode === "long_short" ? "long_short" : "net";
}

function getRegionalRestBaseUrl(region: OkxApiRegion): string {
  switch (region) {
    case "eu":
      return "https://eea.okx.com";
    case "us":
    case "au":
      return "https://us.okx.com";
    default:
      return "https://www.okx.com";
  }
}

// REST: https://www.okx.com
// Public WebSocket: wss://wspap.okx.com:8443/ws/v5/public
// Private WebSocket: wss://wspap.okx.com:8443/ws/v5/private
// Business WebSocket: wss://wspap.okx.com:8443/ws/v5/business

function getRegionalWsBaseUrl(region: OkxApiRegion): string {
  switch (region) {
    case "eu":
      return "wss://wspap.okx.com:8443/ws/v5/public";
    case "us":
    case "au":
      return "wss://wspap.okx.com:8443/ws/v5/public";
    default:
      return "wss://wspap.okx.com:8443/ws/v5/public";
  }
}

const okxApiRegion = normalizeRegion(env.OKX_API_REGION);

export const OKX_CONFIG = {
  apiRegion: okxApiRegion,
  baseUrl: env.OKX_BASE_URL || getRegionalRestBaseUrl(okxApiRegion),
  wsUrl: env.OKX_WS_URL || getRegionalWsBaseUrl(okxApiRegion),
  apiKey: env.OKX_API_KEY || "",
  secret: env.OKX_SECRET || "",
  passphrase: env.OKX_PASSPHRASE || "",
  accountMode: normalizeAccountMode(env.OKX_ACCOUNT_MODE),
  derivativesTdMode: normalizeDerivativesTdMode(env.OKX_DERIVATIVES_TD_MODE),
  positionMode: normalizePositionMode(env.OKX_POSITION_MODE),
};

export const OKX_ENDPOINTS = {
  balance: "/api/v5/account/balance",
  fundingBalances: "/api/v5/asset/balances",
  maxAvailSize: "/api/v5/account/max-avail-size",
  maxSize: "/api/v5/account/max-size",
  instruments: "/api/v5/public/instruments",
  ticker: "/api/v5/market/ticker",
  tickers: "/api/v5/market/tickers",
  candles: "/api/v5/market/candles",
  orderbook: "/api/v5/market/books",
  placeOrder: "/api/v5/trade/order",
  cancelOrder: "/api/v5/trade/cancel-order",
  pendingOrders: "/api/v5/trade/orders-pending",
  fills: "/api/v5/trade/fills",
  fillsHistory: "/api/v5/trade/fills-history",
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

export function isOkxDemoMode(): boolean {
  return (
    OKX_CONFIG.accountMode === "demo" || OKX_CONFIG.accountMode === "paper"
  );
}

export function getOkxAccountModeLabel(): "live" | "paper" {
  return isOkxDemoMode() ? "paper" : "live";
}

export function getOkxTradeModeForMarketType(
  marketType: MarketType,
): MarginMode {
  return marketType === "spot" ? "cash" : OKX_CONFIG.derivativesTdMode;
}

export function getOkxPositionMode(): OkxPositionMode {
  return OKX_CONFIG.positionMode;
}

export function getConfiguredPosSideForOrder(input: {
  marketType: MarketType;
  side: "buy" | "sell";
  reduceOnly?: boolean;
  currentPositionSide?: PositionSide;
}): PositionSide | undefined {
  if (input.marketType === "spot") {
    return undefined;
  }

  if (OKX_CONFIG.positionMode === "net") {
    return "net";
  }

  if (input.reduceOnly) {
    return input.currentPositionSide === "short" ? "short" : "long";
  }

  return input.side === "buy" ? "long" : "short";
}

export function getOkxPrivateAuthHint(): string {
  return [
    `Current OKX base URL: ${OKX_CONFIG.baseUrl}`,
    "If your account was registered on my.okx.com, use https://eea.okx.com.",
    "If your account was registered on app.okx.com (US/AU), use https://us.okx.com.",
    "Demo or paper trading also requires OKX_ACCOUNT_MODE=demo or paper so x-simulated-trading: 1 is sent.",
    `Derivatives orders currently use tdMode=${OKX_CONFIG.derivativesTdMode} and positionMode=${OKX_CONFIG.positionMode}.`,
  ].join(" ");
}
