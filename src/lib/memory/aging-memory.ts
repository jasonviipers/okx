import "server-only";

import { getMemoryDb } from "@/lib/memory/sqlite";
import type { MarketContext } from "@/types/market";
import type { MemoryRecall, MemoryRecord, MemorySummary } from "@/types/memory";
import type { SwarmRunResult, TradeSignal } from "@/types/swarm";

const MEMORY_HALF_LIFE_HOURS = 72;
const MAX_RECALL_CANDIDATES = 120;

type RawMemoryRow = {
  id: number;
  created_at: string;
  symbol: string;
  timeframe: string;
  signal: TradeSignal;
  confidence: number;
  agreement: number;
  blocked: number;
  block_reason: string | null;
  price: number;
  change24h: number;
  spread_bps: number;
  volatility_pct: number;
  imbalance: number;
  summary: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
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

function buildMemorySummaryLine(result: SwarmRunResult): string {
  const consensus = result.consensus;
  const topVote = [...consensus.votes].sort(
    (left, right) => right.confidence - left.confidence,
  )[0];

  return [
    `${consensus.signal} ${(consensus.confidence * 100).toFixed(0)}%`,
    `agree ${(consensus.agreement * 100).toFixed(0)}%`,
    consensus.blocked
      ? `blocked: ${consensus.blockReason ?? "validator"}`
      : null,
    topVote ? `lead ${topVote.role}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function mapRow(row: RawMemoryRow): MemoryRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    symbol: row.symbol,
    timeframe: row.timeframe as MemoryRecord["timeframe"],
    signal: row.signal,
    confidence: row.confidence,
    agreement: row.agreement,
    blocked: row.blocked === 1,
    blockReason: row.block_reason ?? undefined,
    price: row.price,
    change24h: row.change24h,
    spreadBps: row.spread_bps,
    volatilityPct: row.volatility_pct,
    imbalance: row.imbalance,
    summary: row.summary,
  };
}

function computeAgeHours(createdAt: string): number {
  return Math.max(
    0,
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60),
  );
}

function computeDecayWeight(ageHours: number): number {
  return 0.5 ** (ageHours / MEMORY_HALF_LIFE_HOURS);
}

function computeSimilarity(record: MemoryRecord, ctx: MarketContext): number {
  const priceChangeSimilarity =
    1 - Math.min(1, Math.abs(record.change24h - ctx.ticker.change24h) / 8);
  const spreadSimilarity =
    1 - Math.min(1, Math.abs(record.spreadBps - spreadBps(ctx)) / 40);
  const volatilitySimilarity =
    1 - Math.min(1, Math.abs(record.volatilityPct - volatilityPct(ctx)) / 4);
  const imbalanceSimilarity =
    1 - Math.min(1, Math.abs(record.imbalance - orderbookImbalance(ctx)) / 1.2);

  return clamp(
    priceChangeSimilarity * 0.35 +
      spreadSimilarity * 0.2 +
      volatilitySimilarity * 0.25 +
      imbalanceSimilarity * 0.2,
  );
}

export async function storeSwarmMemory(result: SwarmRunResult): Promise<void> {
  const db = getMemoryDb();
  const { marketContext, consensus } = result;

  db.prepare(
    `
      INSERT INTO swarm_memory (
        created_at, symbol, timeframe, signal, confidence, agreement, blocked,
        block_reason, price, change24h, spread_bps, volatility_pct, imbalance, summary
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `,
  ).run(
    new Date().toISOString(),
    marketContext.symbol,
    marketContext.timeframe,
    consensus.signal,
    consensus.confidence,
    consensus.agreement,
    consensus.blocked ? 1 : 0,
    consensus.blockReason ?? null,
    marketContext.ticker.last,
    marketContext.ticker.change24h,
    spreadBps(marketContext),
    volatilityPct(marketContext),
    orderbookImbalance(marketContext),
    buildMemorySummaryLine(result),
  );
}

export async function getRecentMemories(
  symbol?: string,
  timeframe?: string,
  limit = 50,
): Promise<MemoryRecord[]> {
  const db = getMemoryDb();

  if (symbol && timeframe) {
    const rows = db
      .prepare(
        `
          SELECT *
          FROM swarm_memory
          WHERE symbol = ? AND timeframe = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .all(symbol, timeframe, limit) as RawMemoryRow[];
    return rows.map(mapRow);
  }

  const rows = db
    .prepare(
      `
        SELECT *
        FROM swarm_memory
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(limit) as RawMemoryRow[];
  return rows.map(mapRow);
}

export async function getMemorySummary(
  ctx: MarketContext,
): Promise<MemorySummary> {
  const db = getMemoryDb();
  const rows = db
    .prepare(
      `
        SELECT *
        FROM swarm_memory
        WHERE symbol = ? AND timeframe = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(ctx.symbol, ctx.timeframe, MAX_RECALL_CANDIDATES) as RawMemoryRow[];

  const records = rows.map(mapRow);
  const recalls: MemoryRecall[] = records.map((record) => {
    const ageHours = computeAgeHours(record.createdAt);
    const decayWeight = computeDecayWeight(ageHours);
    const similarity = computeSimilarity(record, ctx);
    const weightedInfluence =
      decayWeight * similarity * record.confidence * (record.blocked ? 0.7 : 1);

    return {
      id: record.id,
      createdAt: record.createdAt,
      signal: record.signal,
      confidence: record.confidence,
      agreement: record.agreement,
      blocked: record.blocked,
      summary: record.summary,
      ageHours: Number(ageHours.toFixed(2)),
      decayWeight: Number(decayWeight.toFixed(3)),
      similarity: Number(similarity.toFixed(3)),
      weightedInfluence: Number(weightedInfluence.toFixed(3)),
    };
  });

  const effectiveSampleSize = recalls.reduce(
    (sum, recall) => sum + recall.weightedInfluence,
    0,
  );
  const blockedWeight = recalls
    .filter((recall) => recall.blocked)
    .reduce((sum, recall) => sum + recall.weightedInfluence, 0);
  const averageConfidence =
    effectiveSampleSize > 0
      ? recalls.reduce(
          (sum, recall) => sum + recall.confidence * recall.weightedInfluence,
          0,
        ) / effectiveSampleSize
      : 0;

  const directionalWeights: Record<TradeSignal, number> = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };

  for (const recall of recalls) {
    directionalWeights[recall.signal] += recall.weightedInfluence;
  }

  const dominantSignal =
    (Object.entries(directionalWeights).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] as TradeSignal | undefined) ?? "HOLD";

  return {
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    totalMemories: records.length,
    effectiveSampleSize: Number(effectiveSampleSize.toFixed(3)),
    blockedRatio:
      effectiveSampleSize > 0
        ? Number((blockedWeight / effectiveSampleSize).toFixed(3))
        : 0,
    averageConfidence: Number(averageConfidence.toFixed(3)),
    directionalWeights: {
      BUY: Number(directionalWeights.BUY.toFixed(3)),
      SELL: Number(directionalWeights.SELL.toFixed(3)),
      HOLD: Number(directionalWeights.HOLD.toFixed(3)),
    },
    dominantSignal,
    topRecalls: recalls
      .sort((left, right) => right.weightedInfluence - left.weightedInfluence)
      .slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

export function buildMemoryPrompt(summary: MemorySummary): string {
  if (summary.totalMemories === 0) {
    return "Memory context: no prior aged memories found for this symbol/timeframe.";
  }

  const recalls = summary.topRecalls
    .map(
      (recall) =>
        `- ${recall.signal} ${(recall.confidence * 100).toFixed(0)}% | ${recall.ageHours.toFixed(1)}h old | sim ${recall.similarity.toFixed(2)} | ${recall.summary}`,
    )
    .join("\n");

  return [
    "Aging memory context:",
    `- effective sample: ${summary.effectiveSampleSize.toFixed(2)}`,
    `- blocked ratio: ${(summary.blockedRatio * 100).toFixed(0)}%`,
    `- dominant memory signal: ${summary.dominantSignal}`,
    `- directional weights: BUY ${summary.directionalWeights.BUY.toFixed(2)}, SELL ${summary.directionalWeights.SELL.toFixed(2)}, HOLD ${summary.directionalWeights.HOLD.toFixed(2)}`,
    "Top recalls:",
    recalls,
    "Use this memory as advisory context only. Prefer live market data if memory conflicts with the current tape.",
  ].join("\n");
}
