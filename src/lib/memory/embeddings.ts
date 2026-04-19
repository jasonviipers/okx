import type { MarketContext } from "@/types/market";
import type { SwarmRunResult } from "@/types/swarm";

export const MEMORY_EMBEDDING_DIMENSIONS = 1536;
const HASH_OFFSET = 24;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9:_-]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 64);
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function normalizeVector(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return values;
  }

  return values.map((value) => Number((value / norm).toFixed(8)));
}

function spreadBps(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? ((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 10_000
    : 0;
}

function volatilityPct(ctx: MarketContext): number {
  const last = ctx.candles.at(-1);
  if (!last || last.close <= 0) {
    return 0;
  }

  return ((last.high - last.low) / last.close) * 100;
}

function orderbookImbalance(ctx: MarketContext): number {
  const bids = ctx.orderbook.bids.reduce((sum, level) => sum + level.size, 0);
  const asks = ctx.orderbook.asks.reduce((sum, level) => sum + level.size, 0);
  const total = bids + asks;
  return total > 0 ? (bids - asks) / total : 0;
}

function addFeature(vector: number[], index: number, value: number) {
  vector[index] = value;
}

function addToken(vector: number[], token: string, magnitude = 1) {
  const slot =
    HASH_OFFSET +
    (hashToken(token) % (MEMORY_EMBEDDING_DIMENSIONS - HASH_OFFSET));
  vector[slot] += magnitude;
}

export function buildMarketContextEmbedding(
  ctx: MarketContext,
  extras?: {
    blocked?: boolean;
    blockReason?: string | null;
    signal?: string;
    summary?: string;
  },
): number[] {
  const vector = new Array<number>(MEMORY_EMBEDDING_DIMENSIONS).fill(0);

  addFeature(vector, 0, clamp(ctx.ticker.last / 100_000, 0, 2));
  addFeature(vector, 1, clamp(ctx.ticker.change24h / 20, -2, 2));
  addFeature(vector, 2, clamp(spreadBps(ctx) / 100, 0, 2));
  addFeature(vector, 3, clamp(volatilityPct(ctx) / 20, 0, 2));
  addFeature(vector, 4, clamp(orderbookImbalance(ctx), -1, 1));
  addFeature(vector, 5, clamp(ctx.orderbook.bids.length / 50, 0, 1));
  addFeature(vector, 6, clamp(ctx.orderbook.asks.length / 50, 0, 1));
  addFeature(vector, 7, clamp(ctx.candles.length / 200, 0, 1));
  addFeature(vector, 8, extras?.blocked ? 1 : 0);

  addToken(vector, `symbol:${ctx.symbol}`, 3);
  addToken(vector, `timeframe:${ctx.timeframe}`, 2);

  if (extras?.signal) {
    addToken(vector, `signal:${extras.signal}`, 2.5);
  }

  if (extras?.blockReason) {
    for (const token of tokenize(extras.blockReason)) {
      addToken(vector, `block:${token}`, 1.5);
    }
  }

  if (extras?.summary) {
    for (const token of tokenize(extras.summary)) {
      addToken(vector, token, 1);
    }
  }

  return normalizeVector(vector);
}

export function buildSwarmMemoryEmbedding(result: SwarmRunResult): number[] {
  return buildMarketContextEmbedding(result.marketContext, {
    blocked: result.consensus.blocked,
    blockReason: result.consensus.blockReason ?? null,
    signal: result.consensus.signal,
    summary: [
      result.marketContext.symbol,
      result.marketContext.timeframe,
      result.consensus.signal,
      result.consensus.blockReason ?? "",
      Object.keys(result.consensus.featureSummary ?? {}).join(" "),
      ...(result.consensus.votes ?? []).map((vote) => vote.role),
    ]
      .filter(Boolean)
      .join(" "),
  });
}
