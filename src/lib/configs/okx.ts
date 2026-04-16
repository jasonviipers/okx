import type { Timeframe } from "@/types/market";

export const OKX_ACCOUNT_MODES = ["live", "demo", "paper"] as const;
export type OkxAccountMode = (typeof OKX_ACCOUNT_MODES)[number];
export const OKX_API_REGIONS = ["global", "us", "eu", "au"] as const;
export type OkxApiRegion = (typeof OKX_API_REGIONS)[number];

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

function getRegionalWsBaseUrl(region: OkxApiRegion): string {
  switch (region) {
    case "eu":
      return "wss://wseea.okx.com:8443/ws/v5/public";
    case "us":
    case "au":
      return "wss://wsus.okx.com:8443/ws/v5/public";
    default:
      return "wss://ws.okx.com:8443/ws/v5/public";
  }
}

const okxApiRegion = normalizeRegion(process.env.OKX_API_REGION);

export const OKX_CONFIG = {
  apiRegion: okxApiRegion,
  baseUrl: process.env.OKX_BASE_URL || getRegionalRestBaseUrl(okxApiRegion),
  wsUrl: process.env.OKX_WS_URL || getRegionalWsBaseUrl(okxApiRegion),
  apiKey: process.env.OKX_API_KEY || "",
  secret: process.env.OKX_SECRET || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
  accountMode: normalizeAccountMode(process.env.OKX_ACCOUNT_MODE),
};

export const OKX_ENDPOINTS = {
  balance: "/api/v5/account/balance",
  fundingBalances: "/api/v5/asset/balances",
  maxAvailSize: "/api/v5/account/max-avail-size",
  instruments: "/api/v5/public/instruments",
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

export function isOkxDemoMode(): boolean {
  return (
    OKX_CONFIG.accountMode === "demo" || OKX_CONFIG.accountMode === "paper"
  );
}

export function getOkxAccountModeLabel(): "live" | "paper" {
  return isOkxDemoMode() ? "paper" : "live";
}

export function getOkxPrivateAuthHint(): string {
  return [
    `Current OKX base URL: ${OKX_CONFIG.baseUrl}`,
    "If your account was registered on my.okx.com, use https://eea.okx.com.",
    "If your account was registered on app.okx.com (US/AU), use https://us.okx.com.",
    "Demo or paper trading also requires OKX_ACCOUNT_MODE=demo or paper so x-simulated-trading: 1 is sent.",
  ].join(" ");
}
