import type { MarketContext } from "@/types/market";
import type { MarketRegime, RegimeAnalysis } from "@/types/swarm";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function spreadPercent(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
    : 0;
}

function priceMove(ctx: MarketContext, lookback = 8): number {
  const candles = ctx.candles.slice(-lookback);
  const first = candles.at(0);
  const last = candles.at(-1);
  if (!first || !last || first.close === 0) {
    return 0;
  }
  return (last.close - first.close) / first.close;
}

function realizedVolatility(ctx: MarketContext): number {
  const values = ctx.candles
    .slice(-8)
    .map((candle) =>
      candle.close > 0 ? (candle.high - candle.low) / candle.close : 0,
    );
  return average(values);
}

function orderbookImbalance(ctx: MarketContext): number {
  const bids = ctx.orderbook.bids.reduce((sum, level) => sum + level.size, 0);
  const asks = ctx.orderbook.asks.reduce((sum, level) => sum + level.size, 0);
  const total = bids + asks;
  return total === 0 ? 0 : (bids - asks) / total;
}

function breakoutCompressionScore(ctx: MarketContext): number {
  const recent = ctx.candles.slice(-4);
  const base = ctx.candles.slice(-12, -4);
  const recentRange = average(
    recent.map((candle) =>
      candle.close > 0 ? (candle.high - candle.low) / candle.close : 0,
    ),
  );
  const baseRange = average(
    base.map((candle) =>
      candle.close > 0 ? (candle.high - candle.low) / candle.close : 0,
    ),
  );

  if (baseRange <= 0) {
    return 0;
  }

  return clamp01(1 - recentRange / baseRange);
}

export function classifyMarketRegime(ctx: MarketContext): RegimeAnalysis {
  const spread = spreadPercent(ctx);
  const move = priceMove(ctx);
  const volatility = realizedVolatility(ctx);
  const imbalance = Math.abs(orderbookImbalance(ctx));
  const compression = breakoutCompressionScore(ctx);

  const liquidityScore = clamp01(1 - spread / 0.006);
  const volatilityScore = clamp01(1 - volatility / 0.03);
  const trendScore = clamp01(Math.abs(move) / 0.015 + imbalance * 0.25);
  const breakoutScore = clamp01(compression * 0.55 + Math.abs(move) / 0.02);
  const meanReversionScore = clamp01(
    (1 - trendScore) * 0.6 + (1 - Math.min(1, Math.abs(move) / 0.01)) * 0.4,
  );

  const notes: string[] = [];

  let regime: MarketRegime = "trend";
  if (liquidityScore < 0.35) {
    regime = "illiquid";
    notes.push("Spread and top-of-book quality imply poor tradability.");
  } else if (volatilityScore < 0.25) {
    regime = "stress";
    notes.push(
      "Recent realized volatility is elevated beyond preferred limits.",
    );
  } else if (breakoutScore > 0.72 && compression > 0.45) {
    regime = "breakout";
    notes.push(
      "Range compression plus directional expansion favors breakout logic.",
    );
  } else if (trendScore > 0.62) {
    regime = "trend";
    notes.push(
      "Directional move and order book alignment favor trend continuation.",
    );
  } else {
    regime = "mean_reversion";
    notes.push(
      "Directional strength is muted; rotational behavior is more likely.",
    );
  }

  return {
    regime,
    confidence: Number(
      clamp01(
        regime === "illiquid"
          ? 1 - liquidityScore
          : regime === "stress"
            ? 1 - volatilityScore
            : regime === "breakout"
              ? breakoutScore
              : regime === "trend"
                ? trendScore
                : meanReversionScore,
      ).toFixed(3),
    ),
    trendScore: Number(trendScore.toFixed(3)),
    breakoutScore: Number(breakoutScore.toFixed(3)),
    meanReversionScore: Number(meanReversionScore.toFixed(3)),
    volatilityScore: Number(volatilityScore.toFixed(3)),
    liquidityScore: Number(liquidityScore.toFixed(3)),
    notes,
    generatedAt: new Date().toISOString(),
  };
}
