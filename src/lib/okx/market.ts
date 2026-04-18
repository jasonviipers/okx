import "server-only";

import { OKX_ENDPOINTS, OKX_TIMEFRAME_MAP } from "@/lib/configs/okx";
import { OkxRequestError, okxPublicGet } from "@/lib/okx/client";
import { getCachedJson, setCachedJson } from "@/lib/redis/swarm-cache";
import type {
  Candle,
  MarketContext,
  OKXTicker,
  OrderBook,
  OrderBookEntry,
  Timeframe,
} from "@/types/market";

function allowSyntheticMarketFallback() {
  const value = process.env.ALLOW_SYNTHETIC_MARKET_FALLBACK;
  if (value !== undefined) {
    return value.toLowerCase() === "true";
  }

  return process.env.NODE_ENV !== "production";
}

interface OkxTickerRow {
  instId: string;
  last: string;
  bidPx: string;
  askPx: string;
  bidSz: string;
  askSz: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  sodUtc0: string;
  ts: string;
}

type OkxCandleRow = [string, string, string, string, string, string, string?];

interface OkxBookRow {
  asks: [string, string, string, string][];
  bids: [string, string, string, string][];
  ts: string;
}

function toIso(ts: string): string {
  return new Date(Number(ts)).toISOString();
}

function parseNumber(value: string | undefined): number {
  return Number(value ?? "0");
}

function rethrowLiveMarketError(
  resource: "ticker" | "candles" | "order book",
  symbol: string,
  timeframeOrSize: Timeframe | number | undefined,
  caughtError: unknown,
): never {
  if (caughtError instanceof OkxRequestError) {
    throw caughtError;
  }

  if (resource === "candles") {
    throw new Error(
      `Live candles unavailable for ${symbol} ${timeframeOrSize as Timeframe} and synthetic fallback is disabled.`,
      {
        cause: caughtError instanceof Error ? caughtError : undefined,
      },
    );
  }

  if (resource === "order book") {
    throw new Error(
      `Live order book unavailable for ${symbol} and synthetic fallback is disabled.`,
      {
        cause: caughtError instanceof Error ? caughtError : undefined,
      },
    );
  }

  throw new Error(
    `Live ticker unavailable for ${symbol} and synthetic fallback is disabled.`,
    {
      cause: caughtError instanceof Error ? caughtError : undefined,
    },
  );
}

function buildFallbackCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
): Candle[] {
  const now = Date.now();
  const intervalMinutes =
    timeframe === "1D"
      ? 1440
      : timeframe === "4H"
        ? 240
        : timeframe === "1H"
          ? 60
          : 15;
  const base = symbol.includes("BTC") ? 68000 : 3200;

  return Array.from({ length: limit }, (_, index) => {
    const progress = index - limit;
    const drift = progress * base * 0.0006;
    const noise = Math.sin(index * 0.7) * base * 0.0015;
    const open = base + drift + noise;
    const close = open + Math.cos(index * 0.9) * base * 0.0009;
    const high = Math.max(open, close) + base * 0.0008;
    const low = Math.min(open, close) - base * 0.0008;
    return {
      timestamp: new Date(
        now + progress * intervalMinutes * 60_000,
      ).toISOString(),
      open,
      high,
      low,
      close,
      volume: 12 + index * 0.4,
      quoteVolume: (12 + index * 0.4) * close,
    };
  });
}

function buildFallbackTicker(symbol: string): OKXTicker {
  const last = symbol.includes("BTC") ? 68420 : 3210;
  return {
    symbol,
    last,
    bid: last - 4,
    ask: last + 4,
    bidSize: 4.8,
    askSize: 4.1,
    high24h: last * 1.028,
    low24h: last * 0.972,
    vol24h: 18000,
    change24h: 1.84,
    timestamp: new Date().toISOString(),
  };
}

function buildFallbackOrderBook(symbol: string): OrderBook {
  const ticker = buildFallbackTicker(symbol);
  const makeSide = (direction: "bid" | "ask"): OrderBookEntry[] =>
    Array.from({ length: 10 }, (_, index) => {
      const offset = index + 1;
      const price =
        direction === "bid" ? ticker.bid - offset * 2 : ticker.ask + offset * 2;
      return {
        price,
        size: Number((3.2 + Math.abs(5 - index) * 0.7).toFixed(4)),
        count: 1 + (index % 3),
      };
    });

  return {
    symbol,
    bids: makeSide("bid").sort((a, b) => b.price - a.price),
    asks: makeSide("ask").sort((a, b) => a.price - b.price),
    timestamp: new Date().toISOString(),
  };
}

function mapTicker(row: OkxTickerRow): OKXTicker {
  const open24h = parseNumber(row.sodUtc0);
  const last = parseNumber(row.last);
  const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

  return {
    symbol: row.instId,
    last,
    bid: parseNumber(row.bidPx),
    ask: parseNumber(row.askPx),
    bidSize: parseNumber(row.bidSz),
    askSize: parseNumber(row.askSz),
    high24h: parseNumber(row.high24h),
    low24h: parseNumber(row.low24h),
    vol24h: parseNumber(row.vol24h),
    change24h,
    timestamp: toIso(row.ts),
  };
}

function mapCandle(row: OkxCandleRow): Candle {
  return {
    timestamp: toIso(row[0]),
    open: parseNumber(row[1]),
    high: parseNumber(row[2]),
    low: parseNumber(row[3]),
    close: parseNumber(row[4]),
    volume: parseNumber(row[5]),
    quoteVolume: parseNumber(row[6]),
  };
}

function mapOrderBook(symbol: string, row: OkxBookRow): OrderBook {
  const mapEntry = (
    level: [string, string, string, string],
  ): OrderBookEntry => ({
    price: parseNumber(level[0]),
    size: parseNumber(level[1]),
    count: parseNumber(level[3]),
  });

  return {
    symbol,
    bids: row.bids.map(mapEntry).sort((a, b) => b.price - a.price),
    asks: row.asks.map(mapEntry).sort((a, b) => a.price - b.price),
    timestamp: toIso(row.ts),
  };
}

export async function getTicker(symbol: string): Promise<OKXTicker> {
  const cacheKey = `okx:ticker:${symbol}`;
  const cached = await getCachedJson<OKXTicker>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await okxPublicGet<OkxTickerRow>(
      OKX_ENDPOINTS.ticker,
      new URLSearchParams({ instId: symbol }),
    );
    const ticker = mapTicker(rows[0]);
    await setCachedJson(cacheKey, ticker, 5);
    return ticker;
  } catch (caughtError) {
    if (!allowSyntheticMarketFallback()) {
      rethrowLiveMarketError("ticker", symbol, undefined, caughtError);
    }

    const ticker = buildFallbackTicker(symbol);
    await setCachedJson(cacheKey, ticker, 5);
    return ticker;
  }
}

export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
  limit = 20,
): Promise<Candle[]> {
  const cacheKey = `okx:candles:${symbol}:${timeframe}:${limit}`;
  const cached = await getCachedJson<Candle[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await okxPublicGet<OkxCandleRow>(
      OKX_ENDPOINTS.candles,
      new URLSearchParams({
        instId: symbol,
        bar: OKX_TIMEFRAME_MAP[timeframe],
        limit: String(limit),
      }),
    );
    const candles = rows.map(mapCandle).reverse();
    await setCachedJson(cacheKey, candles, 60);
    return candles;
  } catch (caughtError) {
    if (!allowSyntheticMarketFallback()) {
      rethrowLiveMarketError("candles", symbol, timeframe, caughtError);
    }

    const candles = buildFallbackCandles(symbol, timeframe, limit);
    await setCachedJson(cacheKey, candles, 60);
    return candles;
  }
}

export async function getOrderBook(
  symbol: string,
  size = 10,
): Promise<OrderBook> {
  const cacheKey = `okx:books:${symbol}:${size}`;
  const cached = await getCachedJson<OrderBook>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await okxPublicGet<OkxBookRow>(
      OKX_ENDPOINTS.orderbook,
      new URLSearchParams({ instId: symbol, sz: String(size) }),
    );
    const book = mapOrderBook(symbol, rows[0]);
    await setCachedJson(cacheKey, book, 5);
    return book;
  } catch (caughtError) {
    if (!allowSyntheticMarketFallback()) {
      rethrowLiveMarketError("order book", symbol, size, caughtError);
    }

    const book = buildFallbackOrderBook(symbol);
    await setCachedJson(cacheKey, book, 5);
    return book;
  }
}

export async function getMarketContext(
  symbol: string,
  timeframe: Timeframe,
): Promise<MarketContext> {
  const [ticker, candles, orderbook] = await Promise.all([
    getTicker(symbol),
    getCandles(symbol, timeframe, 20),
    getOrderBook(symbol, 10),
  ]);

  return {
    symbol,
    timeframe,
    ticker,
    candles,
    orderbook,
  };
}
