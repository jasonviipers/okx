import "server-only";

import { performance } from "node:perf_hooks";
import {
  getCandles as getRestCandles,
  getOrderBook as getRestOrderBook,
  getTicker as getRestTicker,
} from "@/lib/okx/market";
import { getOkxPublicWsClient } from "@/lib/okx/ws-client";
import {
  error,
  incrementCounter,
  info,
  observeHistogram,
  setGauge,
  warn,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
import type { MarketDataStatus } from "@/types/api";
import type {
  Candle,
  MarketContext,
  MarketDataSource,
  MarketFeedStatus,
  MarketSnapshot,
  OKXTicker,
  OrderBook,
  Timeframe,
} from "@/types/market";

type SymbolState = {
  symbol: string;
  connectionState: MarketFeedStatus["connectionState"];
  source: MarketDataSource;
  ticker?: OKXTicker;
  orderbook?: OrderBook;
  lastTickerAt?: string;
  lastOrderBookAt?: string;
  lastEventAt?: string;
  lastError?: string;
  candlesByTimeframe: Map<Timeframe, CandleState>;
  pollTimer: NodeJS.Timeout | null;
};

type CandleState = {
  candles: Candle[];
  updatedAt?: string;
};

const DEFAULT_SYMBOL = process.env.AUTONOMOUS_SYMBOL || "BTC-USDT";
const DEFAULT_TIMEFRAME =
  (process.env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H";
const DEFAULT_TICKER_STALE_MS = 15_000;
const DEFAULT_ORDERBOOK_STALE_MS = 15_000;
const DEFAULT_REST_REFRESH_MS = 10_000;
const DEFAULT_CANDLE_REFRESH_MS = 30_000;
const DEFAULT_MARKET_WARMUP_TIMEOUT_MS = 5_000;

const states = new Map<string, SymbolState>();
let listenerAttached = false;

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function allowSyntheticFallback() {
  return parseBoolean(
    process.env.ALLOW_SYNTHETIC_MARKET_FALLBACK,
    process.env.NODE_ENV !== "production",
  );
}

function requireRealtimeMarketData() {
  return parseBoolean(process.env.REQUIRE_REALTIME_MARKET_DATA, false);
}

function getTickerStaleMs() {
  return parseNumber(
    process.env.MARKET_TICKER_STALE_MS,
    DEFAULT_TICKER_STALE_MS,
  );
}

function getOrderBookStaleMs() {
  return parseNumber(
    process.env.MARKET_ORDERBOOK_STALE_MS,
    DEFAULT_ORDERBOOK_STALE_MS,
  );
}

function getRestRefreshMs() {
  return parseNumber(
    process.env.MARKET_REST_REFRESH_MS,
    DEFAULT_REST_REFRESH_MS,
  );
}

function getCandleRefreshMs() {
  return parseNumber(
    process.env.MARKET_CANDLE_REFRESH_MS,
    DEFAULT_CANDLE_REFRESH_MS,
  );
}

function toIso(ts: string | number | undefined) {
  if (!ts) {
    return new Date().toISOString();
  }

  return new Date(Number(ts)).toISOString();
}

function ageMs(timestamp?: string) {
  return timestamp
    ? Date.now() - new Date(timestamp).getTime()
    : Number.POSITIVE_INFINITY;
}

function mapWsTicker(symbol: string, data: Record<string, unknown>): OKXTicker {
  const last = Number(data.last ?? 0);
  const open24h = Number(data.sodUtc0 ?? 0);
  const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

  return {
    symbol,
    last,
    bid: Number(data.bidPx ?? 0),
    ask: Number(data.askPx ?? 0),
    bidSize: Number(data.bidSz ?? 0),
    askSize: Number(data.askSz ?? 0),
    high24h: Number(data.high24h ?? 0),
    low24h: Number(data.low24h ?? 0),
    vol24h: Number(data.vol24h ?? 0),
    change24h,
    timestamp: toIso(data.ts as string | number | undefined),
  };
}

function mapWsOrderBook(
  symbol: string,
  data: Record<string, unknown>,
): OrderBook {
  const asks = Array.isArray(data.asks) ? data.asks : [];
  const bids = Array.isArray(data.bids) ? data.bids : [];
  const mapLevel = (level: unknown) => {
    const values = Array.isArray(level) ? level : [];
    return {
      price: Number(values[0] ?? 0),
      size: Number(values[1] ?? 0),
      count: Number(values[3] ?? 0),
    };
  };

  return {
    symbol,
    asks: asks.map(mapLevel).sort((left, right) => left.price - right.price),
    bids: bids.map(mapLevel).sort((left, right) => right.price - left.price),
    timestamp: toIso(data.ts as string | number | undefined),
  };
}

function getOrCreateState(symbol: string): SymbolState {
  const existing = states.get(symbol);
  if (existing) {
    return existing;
  }

  const next: SymbolState = {
    symbol,
    connectionState: "idle",
    source: "unknown",
    candlesByTimeframe: new Map(),
    pollTimer: null,
  };
  states.set(symbol, next);
  return next;
}

function ensureWsListenerAttached() {
  if (listenerAttached) {
    return;
  }

  listenerAttached = true;
  const client = getOkxPublicWsClient();
  client.addListener((event) => {
    if ("event" in event) {
      if (event.event === "connected") {
        info("market.data", "Market data websocket connected");
        for (const state of states.values()) {
          state.connectionState = "connected";
        }
      } else if (event.event === "error") {
        warn("market.data", "Market data websocket reported an error", {
          message: event.message,
        });
        for (const state of states.values()) {
          state.connectionState = "error";
          state.lastError = event.message;
        }
      }
      return;
    }

    const state = states.get(event.instId);
    if (!state) {
      return;
    }

    state.connectionState = "connected";
    state.source = "websocket";
    state.lastEventAt = new Date().toISOString();

    if (event.channel === "tickers") {
      const ticker = mapWsTicker(event.instId, event.data);
      state.ticker = ticker;
      state.lastTickerAt = ticker.timestamp;
    }

    if (event.channel === "books5") {
      const orderbook = mapWsOrderBook(event.instId, event.data);
      state.orderbook = orderbook;
      state.lastOrderBookAt = orderbook.timestamp;
    }
  });
}

async function refreshCandles(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  const candles = await getRestCandles(symbol, timeframe, 20);
  state.candlesByTimeframe.set(timeframe, {
    candles,
    updatedAt: new Date().toISOString(),
  });

  if (state.source === "unknown") {
    state.source = "rest";
  }
}

async function bootstrapState(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  const [ticker, orderbook] = await Promise.all([
    getRestTicker(symbol),
    getRestOrderBook(symbol, 10),
  ]);

  state.ticker = ticker;
  state.orderbook = orderbook;
  state.lastTickerAt = ticker.timestamp;
  state.lastOrderBookAt = orderbook.timestamp;
  state.lastEventAt = new Date().toISOString();
  state.source =
    state.connectionState === "connected"
      ? "websocket"
      : allowSyntheticFallback()
        ? "rest"
        : "rest";

  info("market.data", "Bootstrapped market state", {
    symbol,
    timeframe,
    source: state.source,
    connectionState: state.connectionState,
  });

  await refreshCandles(symbol, timeframe);
}

function ensurePolling(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  if (state.pollTimer) {
    return;
  }

  state.pollTimer = setInterval(() => {
    void (async () => {
      try {
        if (
          !state.ticker ||
          ageMs(state.lastTickerAt) > getTickerStaleMs() ||
          !state.orderbook ||
          ageMs(state.lastOrderBookAt) > getOrderBookStaleMs()
        ) {
          const [ticker, orderbook] = await Promise.all([
            getRestTicker(symbol),
            getRestOrderBook(symbol, 10),
          ]);
          state.ticker = ticker;
          state.orderbook = orderbook;
          state.lastTickerAt = ticker.timestamp;
          state.lastOrderBookAt = orderbook.timestamp;
          state.lastEventAt = new Date().toISOString();
          if (state.connectionState !== "connected") {
            state.connectionState = "degraded";
            state.source = "rest";
          }
        }

        const candleState = state.candlesByTimeframe.get(timeframe);
        if (
          !candleState ||
          ageMs(candleState.updatedAt) > getCandleRefreshMs()
        ) {
          await refreshCandles(symbol, timeframe);
        }
      } catch (caughtError) {
        state.connectionState = "error";
        state.lastError =
          caughtError instanceof Error
            ? caughtError.message
            : "Unknown market refresh error";
        incrementCounter(
          "market_refresh_errors_total",
          "Total market refresh errors.",
          1,
          {
            symbol,
            timeframe,
          },
        );
        error("market.data", "Market refresh failed", {
          symbol,
          timeframe,
          error: caughtError,
        });
      }
    })();
  }, getRestRefreshMs());
}

async function ensureSymbolState(symbol: string, timeframe: Timeframe) {
  ensureWsListenerAttached();
  const state = getOrCreateState(symbol);

  if (state.connectionState === "idle") {
    state.connectionState = "connecting";
    const client = getOkxPublicWsClient();
    client.subscribe("tickers", symbol);
    client.subscribe("books5", symbol);
  }

  const candleState = state.candlesByTimeframe.get(timeframe);
  if (!state.ticker || !state.orderbook || !candleState?.candles?.length) {
    await bootstrapState(symbol, timeframe);
  }

  ensurePolling(symbol, timeframe);
}

function buildStatus(
  symbol: string,
  timeframe: Timeframe,
  state: SymbolState,
): MarketFeedStatus {
  const warnings = new Set<string>();
  const tickerStale = ageMs(state.lastTickerAt) > getTickerStaleMs();
  const orderbookStale = ageMs(state.lastOrderBookAt) > getOrderBookStaleMs();
  const candleState = state.candlesByTimeframe.get(timeframe);
  const candlesStale = ageMs(candleState?.updatedAt) > getCandleRefreshMs() * 2;

  if (tickerStale) {
    warnings.add("Ticker feed is stale.");
  }
  if (orderbookStale) {
    warnings.add("Order book feed is stale.");
  }
  if (candlesStale) {
    warnings.add("Candle feed is stale.");
  }
  if (state.source === "fallback") {
    warnings.add("Synthetic fallback market data is active.");
  }
  if (state.lastError) {
    warnings.add(state.lastError);
  }

  const stale = tickerStale || orderbookStale || candlesStale;
  const realtime =
    state.source === "websocket" && !tickerStale && !orderbookStale;
  const tradeable =
    !stale &&
    state.source !== "fallback" &&
    (!requireRealtimeMarketData() || realtime);

  if (
    !tradeable &&
    requireRealtimeMarketData() &&
    state.source !== "websocket"
  ) {
    warnings.add(
      "Real-time websocket market data is required for live trading.",
    );
  }

  return {
    symbol,
    timeframe,
    source: state.source,
    realtime,
    stale,
    tradeable,
    connectionState: state.connectionState,
    lastTickerAt: state.lastTickerAt,
    lastOrderBookAt: state.lastOrderBookAt,
    lastCandlesAt: candleState?.updatedAt,
    lastEventAt: state.lastEventAt,
    warnings: [...warnings],
  };
}

function reportStatusMetrics(status: MarketFeedStatus) {
  setGauge(
    "market_data_tradeable",
    "Whether market data is currently tradeable for the symbol.",
    status.tradeable ? 1 : 0,
    {
      symbol: status.symbol,
      timeframe: status.timeframe,
    },
  );
  setGauge(
    "market_data_realtime",
    "Whether market data is currently realtime for the symbol.",
    status.realtime ? 1 : 0,
    {
      symbol: status.symbol,
      timeframe: status.timeframe,
    },
  );
  setGauge(
    "market_data_stale",
    "Whether market data is stale for the symbol.",
    status.stale ? 1 : 0,
    {
      symbol: status.symbol,
      timeframe: status.timeframe,
    },
  );
}

export async function getMarketSnapshot(
  symbol: string,
  timeframe: Timeframe,
): Promise<MarketSnapshot> {
  return withTelemetrySpan(
    {
      name: "market.snapshot",
      source: "market.data",
      attributes: {
        symbol,
        timeframe,
      },
    },
    async (span) => {
      const startedAt = performance.now();
      await ensureSymbolState(symbol, timeframe);

      const waitStartedAt = Date.now();
      const state = getOrCreateState(symbol);
      while (
        (!state.ticker ||
          !state.orderbook ||
          !state.candlesByTimeframe.get(timeframe)?.candles.length) &&
        Date.now() - waitStartedAt < DEFAULT_MARKET_WARMUP_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const candleState = state.candlesByTimeframe.get(timeframe);
      if (!state.ticker || !state.orderbook || !candleState?.candles.length) {
        incrementCounter(
          "market_snapshots_total",
          "Total market snapshot requests.",
          1,
          {
            symbol,
            timeframe,
            status: "unavailable",
          },
        );
        throw new Error(`Market data unavailable for ${symbol} ${timeframe}.`);
      }

      const status = buildStatus(symbol, timeframe, state);
      reportStatusMetrics(status);
      const durationMs = Number((performance.now() - startedAt).toFixed(3));
      observeHistogram(
        "market_snapshot_duration_ms",
        "Duration of market snapshot collection in milliseconds.",
        durationMs,
        {
          labels: {
            symbol,
            timeframe,
            source: status.source,
            tradeable: status.tradeable,
          },
        },
      );
      incrementCounter(
        "market_snapshots_total",
        "Total market snapshot requests.",
        1,
        {
          symbol,
          timeframe,
          status: status.tradeable ? "tradeable" : "degraded",
          source: status.source,
        },
      );
      span.addAttributes({
        source: status.source,
        realtime: status.realtime,
        tradeable: status.tradeable,
        stale: status.stale,
        connectionState: status.connectionState,
      });

      if (!status.tradeable) {
        warn("market.data", "Market snapshot is not tradeable", {
          symbol,
          timeframe,
          status,
        });
      }

      return {
        context: {
          symbol,
          timeframe,
          ticker: state.ticker,
          orderbook: state.orderbook,
          candles: candleState.candles,
        },
        status,
      };
    },
  );
}

export async function getRealtimeMarketContext(
  symbol: string,
  timeframe: Timeframe,
): Promise<MarketContext> {
  const snapshot = await getMarketSnapshot(symbol, timeframe);
  return snapshot.context;
}

export function getMarketDataRuntimeStatus(
  symbol = DEFAULT_SYMBOL,
  timeframe = DEFAULT_TIMEFRAME,
): MarketDataStatus {
  const state = states.get(symbol);
  if (!state) {
    return {
      configured: true,
      available: false,
      realtime: false,
      stale: true,
      connectionState: "idle",
      detail: "Market data service idle",
      symbol,
      timeframe,
      source: "unknown",
    };
  }

  const status = buildStatus(symbol, timeframe, state);
  return {
    configured: true,
    available: Boolean(state.ticker && state.orderbook),
    realtime: status.realtime,
    stale: status.stale,
    connectionState: status.connectionState,
    detail: status.tradeable
      ? "Realtime market data healthy"
      : (status.warnings[0] ?? "Market data degraded"),
    symbol,
    timeframe,
    source: status.source,
    lastEventAt: status.lastEventAt,
  };
}
