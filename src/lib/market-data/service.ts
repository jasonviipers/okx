import "server-only";

import { performance } from "node:perf_hooks";
import { env } from "@/env";
import { getOkxAccountModeLabel } from "@/lib/configs/okx";
import { MARKET_DATA_QUALITY_THRESHOLDS } from "@/lib/market-data/thresholds";
import { getInstrumentRules } from "@/lib/okx/instruments";
import {
  getCandles as getRestCandles,
  getOrderBook as getRestOrderBook,
  getTicker as getRestTicker,
} from "@/lib/okx/market";
import { getOkxPublicWsClient, type OkxWsChannel } from "@/lib/okx/ws-client";
import { nowIso, parseBoolean, parseNumber } from "@/lib/runtime-utils";
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
  activeChannels: Set<OkxWsChannel>;
  disabledChannels: Set<OkxWsChannel>;
  ticker?: OKXTicker;
  orderbook?: OrderBook;
  lastTickerAt?: string;
  lastOrderBookAt?: string;
  lastEventAt?: string;
  lastError?: string;
  instrumentState?: string;
  instrumentValidatedAt?: string;
  lastResubscribeAt?: string;
  candlesByTimeframe: Map<Timeframe, CandleState>;
  pollTimer: NodeJS.Timeout | null;
};

type CandleState = {
  candles: Candle[];
  updatedAt?: string;
};

const DEFAULT_SYMBOL = env.AUTONOMOUS_SYMBOL || "BTC-USDT";
const DEFAULT_TIMEFRAME = (env.AUTONOMOUS_TIMEFRAME as Timeframe) || "1H";
const DEFAULT_TICKER_STALE_MS = 15_000;
const DEFAULT_ORDERBOOK_STALE_MS = 15_000;
const DEFAULT_REST_REFRESH_MS = 10_000;
const DEFAULT_CANDLE_REFRESH_MS = 30_000;
const DEFAULT_MARKET_WARMUP_TIMEOUT_MS = 5_000;
const DEFAULT_MARKET_RESUBSCRIBE_BACKOFF_MS = 60_000;
const REQUIRED_WEBSOCKET_CHANNELS: OkxWsChannel[] = ["tickers", "books5"];

const states = new Map<string, SymbolState>();
let listenerAttached = false;

function requireRealtimeMarketData() {
  return parseBoolean(env.REQUIRE_REALTIME_MARKET_DATA, false);
}

function getTickerStaleMs() {
  return parseNumber(env.MARKET_TICKER_STALE_MS, DEFAULT_TICKER_STALE_MS);
}

function getOrderBookStaleMs() {
  return parseNumber(env.MARKET_ORDERBOOK_STALE_MS, DEFAULT_ORDERBOOK_STALE_MS);
}

function getRestRefreshMs() {
  return parseNumber(env.MARKET_REST_REFRESH_MS, DEFAULT_REST_REFRESH_MS);
}

function getCandleRefreshMs() {
  return parseNumber(env.MARKET_CANDLE_REFRESH_MS, DEFAULT_CANDLE_REFRESH_MS);
}

function getResubscribeBackoffMs() {
  return Math.max(getRestRefreshMs(), DEFAULT_MARKET_RESUBSCRIBE_BACKOFF_MS);
}

function toIso(ts: string | number | undefined) {
  if (!ts) {
    return nowIso();
  }

  return new Date(Number(ts)).toISOString();
}

function ageMs(timestamp?: string) {
  return timestamp
    ? Date.now() - new Date(timestamp).getTime()
    : Number.POSITIVE_INFINITY;
}

function hasRequiredWebsocketFeeds(state: SymbolState) {
  return REQUIRED_WEBSOCKET_CHANNELS.every(
    (channel) =>
      state.activeChannels.has(channel) && !state.disabledChannels.has(channel),
  );
}

function resolveStreamSource(state: SymbolState): MarketDataSource {
  if (state.source === "fallback") {
    return "fallback";
  }

  const hasMarketData = Boolean(state.ticker || state.orderbook);
  if (hasRequiredWebsocketFeeds(state)) {
    return "websocket";
  }

  if (state.activeChannels.size > 0) {
    return hasMarketData ? "mixed" : "unknown";
  }

  return hasMarketData ? "rest" : "unknown";
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
    activeChannels: new Set(),
    disabledChannels: new Set(),
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
          if (state.connectionState !== "idle") {
            state.connectionState =
              state.activeChannels.size > 0 && state.disabledChannels.size === 0
                ? "connected"
                : state.activeChannels.size > 0
                  ? "degraded"
                  : "connecting";
            state.lastError = undefined;
          }
        }
      } else if (event.event === "disconnected") {
        warn("market.data", "Market data websocket disconnected", {
          message: event.message,
        });
        for (const state of states.values()) {
          state.activeChannels.clear();
          if (state.connectionState !== "idle") {
            state.connectionState = "degraded";
            state.lastError = event.message;
            state.source = resolveStreamSource(state);
          }
        }
      } else if (event.event === "error") {
        warn("market.data", "Market data websocket reported an error", {
          message: event.message,
        });
        for (const state of states.values()) {
          state.activeChannels.clear();
          if (state.connectionState !== "idle") {
            state.connectionState = "error";
            state.lastError = event.message;
            state.source = resolveStreamSource(state);
          }
        }
      } else if (
        event.event === "subscribed" &&
        event.instId &&
        event.channel
      ) {
        const state = states.get(event.instId);
        if (!state) {
          return;
        }
        state.activeChannels.add(event.channel);
        state.connectionState =
          state.disabledChannels.size > 0 ? "degraded" : "connected";
        state.lastError = undefined;
      } else if (event.event === "subscription_error") {
        warn("market.data", "Market data websocket subscription failed", {
          symbol: event.instId,
          channel: event.channel,
          code: event.code,
          message: event.message,
        });
        if (!event.instId) {
          return;
        }
        const state = states.get(event.instId);
        if (!state) {
          return;
        }
        if (event.channel) {
          state.activeChannels.delete(event.channel);
          state.disabledChannels.add(event.channel);
          client.unsubscribe(event.channel, event.instId);
        }
        state.connectionState = "degraded";
        state.lastError = event.message;
        state.source = resolveStreamSource(state);
      }
      return;
    }

    const state = states.get(event.instId);
    if (!state) {
      return;
    }

    state.activeChannels.add(event.channel);
    state.connectionState =
      state.disabledChannels.size > 0 ? "degraded" : "connected";
    state.lastEventAt = nowIso();
    state.lastError = undefined;

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

    state.source = resolveStreamSource(state);
  });
}

async function refreshCandles(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  const candles = await getRestCandles(symbol, timeframe, 20);
  state.candlesByTimeframe.set(timeframe, {
    candles,
    updatedAt: nowIso(),
  });

  if (state.source === "unknown") {
    state.source = "rest";
  }
}

async function ensureTradeableInstrument(state: SymbolState) {
  try {
    const instrument = await getInstrumentRules(state.symbol);
    state.instrumentValidatedAt = nowIso();
    state.instrumentState = instrument.state;

    if (instrument.state === "live") {
      return true;
    }
  } catch {
    state.instrumentValidatedAt = nowIso();
    state.instrumentState = "unavailable";
  }

  state.connectionState = "degraded";
  state.lastError = `Instrument ${state.symbol} is not live on OKX spot.`;
  state.activeChannels.clear();
  state.disabledChannels.clear();
  state.source = resolveStreamSource(state);
  return false;
}

function shouldAttemptResubscribe(state: SymbolState) {
  if (state.disabledChannels.size === 0) {
    return false;
  }

  return ageMs(state.lastResubscribeAt) >= getResubscribeBackoffMs();
}

function attemptChannelRecovery(
  state: SymbolState,
  client = getOkxPublicWsClient(),
) {
  if (!shouldAttemptResubscribe(state) || client.getState() !== "connected") {
    return;
  }

  state.lastResubscribeAt = nowIso();
  const channels = [...state.disabledChannels];
  state.disabledChannels.clear();

  for (const channel of channels) {
    client.subscribe(channel, state.symbol);
  }

  warn("market.data", "Retrying stale websocket subscriptions", {
    symbol: state.symbol,
    channels,
  });
}

async function bootstrapState(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  const bootstrappedAt = new Date().toISOString();
  const [ticker, orderbook, candles] = await Promise.all([
    getRestTicker(symbol),
    getRestOrderBook(symbol, 10),
    getRestCandles(symbol, timeframe, 20),
  ]);

  state.ticker = ticker;
  state.orderbook = orderbook;
  state.lastTickerAt = ticker.timestamp;
  state.lastOrderBookAt = orderbook.timestamp;
  state.lastEventAt = bootstrappedAt;
  state.candlesByTimeframe.set(timeframe, {
    candles,
    updatedAt: bootstrappedAt,
  });
  state.source = "rest";

  info("market.data", "Bootstrapped market state", {
    symbol,
    timeframe,
    source: state.source,
    connectionState: state.connectionState,
  });
}

function ensurePolling(symbol: string, timeframe: Timeframe) {
  const state = getOrCreateState(symbol);
  if (state.pollTimer) {
    return;
  }

  state.pollTimer = setInterval(() => {
    void (async () => {
      try {
        attemptChannelRecovery(state);
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
          state.lastEventAt = nowIso();
          state.source = state.activeChannels.size > 0 ? "mixed" : "rest";
          if (state.connectionState !== "connected") {
            state.connectionState = "degraded";
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
  const client = getOkxPublicWsClient();
  const instrumentTradeable = await ensureTradeableInstrument(state);

  if (!instrumentTradeable) {
    ensurePolling(symbol, timeframe);
    return;
  }

  if (state.connectionState === "idle") {
    state.connectionState = "connecting";
  } else if (
    state.connectionState !== "connected" &&
    client.getState() === "connected"
  ) {
    state.connectionState = "connecting";
  }
  if (!state.disabledChannels.has("tickers")) {
    client.subscribe("tickers", symbol);
  }
  if (!state.disabledChannels.has("books5")) {
    client.subscribe("books5", symbol);
  }
  attemptChannelRecovery(state, client);

  const candleState = state.candlesByTimeframe.get(timeframe);
  if (!state.ticker || !state.orderbook) {
    await bootstrapState(symbol, timeframe);
  } else if (!candleState?.candles?.length) {
    await refreshCandles(symbol, timeframe);
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
  if (state.disabledChannels.size > 0) {
    warnings.add(
      `Websocket subscription rejected for ${[...state.disabledChannels].join(", ")}; using REST for those feeds.`,
    );
  }
  if (state.instrumentState && state.instrumentState !== "live") {
    warnings.add(`Instrument state is ${state.instrumentState}.`);
  }
  if (state.lastError) {
    warnings.add(state.lastError);
  }

  const stale = tickerStale || orderbookStale || candlesStale;
  const realtime =
    state.source === "websocket" &&
    hasRequiredWebsocketFeeds(state) &&
    !tickerStale &&
    !orderbookStale;
  const tradeable =
    !stale &&
    (state.instrumentState === undefined || state.instrumentState === "live") &&
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
    synthetic: state.source === "fallback",
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

export function isLiveQualitySnapshot(snapshot: MarketSnapshot): boolean {
  return (
    (!MARKET_DATA_QUALITY_THRESHOLDS.requireWebsocket ||
      snapshot.status.realtime === true) &&
    snapshot.status.stale === false &&
    (MARKET_DATA_QUALITY_THRESHOLDS.allowSyntheticFallback ||
      snapshot.status.synthetic !== true)
  );
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
            source: state.source || "unknown",
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

export function getAutonomyEvaluationMarketContext(
  snapshot: MarketSnapshot,
): MarketContext | null {
  if (getOkxAccountModeLabel() === "live" && !isLiveQualitySnapshot(snapshot)) {
    return null;
  }

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
    detail: status.realtime
      ? "Realtime market data healthy"
      : status.tradeable
        ? "Market data healthy"
        : (status.warnings[0] ?? "Market data degraded"),
    symbol,
    timeframe,
    source: status.source,
    lastEventAt: status.lastEventAt,
  };
}
