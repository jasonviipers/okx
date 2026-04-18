import { parseNumber } from "@/lib/runtime-utils";
import type { MarketContext, OrderBookEntry, Timeframe } from "@/types/market";
import type { AccountOverview } from "@/types/trade";

export interface DecisionFeatureVector {
  price: number;
  return1: number;
  return3: number;
  return5: number;
  return10: number;
  realizedVolatilityShort: number;
  realizedVolatilityLong: number;
  spreadBps: number;
  buySlippageBps: number;
  sellSlippageBps: number;
  topBookPressure: number;
  orderBookImbalance: number;
  topBookDepthUsd: number;
  totalBookDepthUsd: number;
  candleBodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  closeLocation: number;
  volumeExpansion: number;
  distanceFromVwap: number;
  distanceFromMean: number;
  breakoutDistance: number;
  compressionScore: number;
  availableQuoteUsd: number;
  availableBaseUsd: number;
  budgetRemainingUsd: number;
  maxExecutableBuyUsd: number;
  maxExecutableSellUsd: number;
  assumedTradeNotionalUsd: number;
  minimumTradeNotionalUsd: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function getReturn(ctx: MarketContext, lookback: number): number {
  const candles = ctx.candles.slice(-lookback);
  const first = candles.at(0);
  const last = candles.at(-1);

  if (!first || !last || first.close <= 0) {
    return 0;
  }

  return (last.close - first.close) / first.close;
}

function computeRealizedVolatility(
  ctx: MarketContext,
  lookback: number,
): number {
  const candles = ctx.candles.slice(-(lookback + 1));
  if (candles.length < 2) {
    return 0;
  }

  const returns = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index]?.close ?? 0;
    return previousClose > 0
      ? (candle.close - previousClose) / previousClose
      : 0;
  });

  const mean = average(returns);
  const variance =
    returns.length > 0
      ? average(returns.map((value) => (value - mean) ** 2))
      : 0;

  return Math.sqrt(Math.max(variance, 0));
}

function computeSpreadBps(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? ((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 10_000
    : 0;
}

function computeBookPressure(levels: OrderBookEntry[]): number {
  const topLevels = levels.slice(0, 3);
  return sum(topLevels.map((level) => level.price * level.size));
}

function computeOrderBookImbalance(ctx: MarketContext): number {
  const bidPressure = computeBookPressure(ctx.orderbook.bids);
  const askPressure = computeBookPressure(ctx.orderbook.asks);
  const totalPressure = bidPressure + askPressure;

  return totalPressure > 0 ? (bidPressure - askPressure) / totalPressure : 0;
}

function computeTopBookPressure(ctx: MarketContext): number {
  const bidPressure = ctx.ticker.bid * ctx.ticker.bidSize;
  const askPressure = ctx.ticker.ask * ctx.ticker.askSize;
  const totalPressure = bidPressure + askPressure;

  return totalPressure > 0 ? (bidPressure - askPressure) / totalPressure : 0;
}

function computeTopBookDepthUsd(ctx: MarketContext): number {
  const bidDepth = ctx.ticker.bid * ctx.ticker.bidSize;
  const askDepth = ctx.ticker.ask * ctx.ticker.askSize;

  return bidDepth + askDepth;
}

function computeTotalBookDepthUsd(ctx: MarketContext): number {
  const bidDepth = sum(
    ctx.orderbook.bids.map((level) => level.price * level.size),
  );
  const askDepth = sum(
    ctx.orderbook.asks.map((level) => level.price * level.size),
  );

  return bidDepth + askDepth;
}

function computeCandleRatios(ctx: MarketContext): {
  candleBodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  closeLocation: number;
} {
  const last = ctx.candles.at(-1);
  if (!last) {
    return {
      candleBodyRatio: 0,
      upperWickRatio: 0,
      lowerWickRatio: 0,
      closeLocation: 0.5,
    };
  }

  const range = Math.max(last.high - last.low, 1e-8);
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  return {
    candleBodyRatio: body / range,
    upperWickRatio: upperWick / range,
    lowerWickRatio: lowerWick / range,
    closeLocation: (last.close - last.low) / range,
  };
}

function computeVolumeExpansion(ctx: MarketContext): number {
  const recentVolumes = ctx.candles.slice(-3).map((candle) => candle.volume);
  const baseVolumes = ctx.candles.slice(-10, -3).map((candle) => candle.volume);
  const recentAverage = average(recentVolumes);
  const baseAverage = average(baseVolumes);

  if (recentAverage <= 0 || baseAverage <= 0) {
    return 1;
  }

  return recentAverage / baseAverage;
}

function computeRollingVwap(ctx: MarketContext): number {
  const candles = ctx.candles.slice(-12);
  const totalVolume = sum(candles.map((candle) => candle.volume));
  if (totalVolume <= 0) {
    return ctx.ticker.last;
  }

  const weightedPrice = sum(
    candles.map((candle) => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      return typicalPrice * candle.volume;
    }),
  );

  return weightedPrice / totalVolume;
}

function computeDistanceFromReference(
  price: number,
  reference: number,
): number {
  return reference > 0 ? (price - reference) / reference : 0;
}

function computeBreakoutDistance(ctx: MarketContext): number {
  const previousCandles = ctx.candles.slice(-12, -1);
  const last = ctx.candles.at(-1);

  if (!last || previousCandles.length === 0) {
    return 0;
  }

  const previousHigh = Math.max(
    ...previousCandles.map((candle) => candle.high),
  );
  const previousLow = Math.min(...previousCandles.map((candle) => candle.low));

  if (last.close > previousHigh && previousHigh > 0) {
    return (last.close - previousHigh) / previousHigh;
  }

  if (last.close < previousLow && previousLow > 0) {
    return -((previousLow - last.close) / previousLow);
  }

  const midpoint = (previousHigh + previousLow) / 2;
  return midpoint > 0 ? (last.close - midpoint) / midpoint : 0;
}

function computeCompressionScore(ctx: MarketContext): number {
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

  if (recentRange <= 0 || baseRange <= 0) {
    return 0;
  }

  return clamp(1 - recentRange / baseRange, 0, 1);
}

function estimateBookImpactBps(
  levels: OrderBookEntry[],
  targetNotionalUsd: number,
  midPrice: number,
  side: "buy" | "sell",
): number {
  if (levels.length === 0 || targetNotionalUsd <= 0 || midPrice <= 0) {
    return 0;
  }

  let remainingNotional = targetNotionalUsd;
  let filledSize = 0;
  let totalFilledNotional = 0;

  for (const level of levels) {
    if (remainingNotional <= 0) {
      break;
    }

    const levelNotional = level.price * level.size;
    const consumedNotional = Math.min(levelNotional, remainingNotional);
    const consumedSize = level.price > 0 ? consumedNotional / level.price : 0;

    totalFilledNotional += consumedNotional;
    filledSize += consumedSize;
    remainingNotional -= consumedNotional;
  }

  if (filledSize <= 0) {
    return 50;
  }

  const averageFillPrice = totalFilledNotional / filledSize;
  const incompletePenalty =
    remainingNotional > 0
      ? clamp(remainingNotional / Math.max(targetNotionalUsd, 1), 0, 1) * 35
      : 0;
  const impactBps =
    side === "buy"
      ? ((averageFillPrice - midPrice) / midPrice) * 10_000
      : ((midPrice - averageFillPrice) / midPrice) * 10_000;

  return Math.max(0, impactBps) + incompletePenalty;
}

function getBudgetCapUsd(budgetRemainingUsd: number): number {
  return budgetRemainingUsd > 0 ? budgetRemainingUsd : Number.POSITIVE_INFINITY;
}

function getDefaultCadenceMs(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1m":
      return 5_000;
    case "3m":
      return 7_500;
    case "5m":
      return 10_000;
    case "15m":
      return 12_500;
    case "30m":
      return 15_000;
    case "1H":
      return 20_000;
    case "2H":
      return 25_000;
    case "4H":
      return 30_000;
    default:
      return 45_000;
  }
}

export function deriveDecisionCadence(
  timeframe: Timeframe,
  marketQualityScore: number,
  compressionScore: number,
  realizedVolatilityLong: number,
): { decisionCadenceMs: number; symbolThrottleMs: number } {
  const baseCadenceMs = getDefaultCadenceMs(timeframe);
  const qualityFactor =
    marketQualityScore >= 0.7 ? 0.85 : marketQualityScore <= 0.45 ? 1.2 : 1;
  const compressionFactor = compressionScore >= 0.55 ? 0.9 : 1.05;
  const volatilityFactor =
    realizedVolatilityLong >= 0.012
      ? 1.15
      : realizedVolatilityLong <= 0.004
        ? 0.95
        : 1;
  const decisionCadenceMs = Math.round(
    clamp(
      baseCadenceMs * qualityFactor * compressionFactor * volatilityFactor,
      5_000,
      60_000,
    ),
  );
  const symbolThrottleMs = Math.round(
    clamp(
      decisionCadenceMs * (marketQualityScore >= 0.7 ? 1.4 : 1.9),
      7_500,
      120_000,
    ),
  );

  return {
    decisionCadenceMs,
    symbolThrottleMs,
  };
}

export function buildDecisionFeatures(input: {
  ctx: MarketContext;
  accountOverview: AccountOverview;
  budgetRemainingUsd?: number;
}): DecisionFeatureVector {
  const maxPositionUsd = parseNumber(process.env.MAX_POSITION_USD, 100);
  const minimumTradeNotionalUsd = parseNumber(
    process.env.MIN_TRADE_NOTIONAL,
    5,
  );
  const budgetCapUsd = getBudgetCapUsd(input.budgetRemainingUsd ?? 0);
  const availableQuoteUsd = Math.max(
    0,
    input.accountOverview.buyingPower.buy * 0.9,
  );
  const availableBaseUsd = Math.max(
    0,
    input.accountOverview.buyingPower.sell * input.ctx.ticker.bid * 0.9,
  );
  const maxExecutableBuyUsd = Math.max(
    0,
    Math.min(maxPositionUsd, availableQuoteUsd, budgetCapUsd),
  );
  const maxExecutableSellUsd = Math.max(
    0,
    Math.min(maxPositionUsd, availableBaseUsd, budgetCapUsd),
  );
  const assumedTradeNotionalUsd = Math.max(
    minimumTradeNotionalUsd,
    Math.min(
      maxPositionUsd,
      Math.max(
        maxExecutableBuyUsd,
        maxExecutableSellUsd,
        minimumTradeNotionalUsd,
      ),
      budgetCapUsd,
    ),
  );
  const rollingVwap = computeRollingVwap(input.ctx);
  const rollingMean = average(
    input.ctx.candles.slice(-10).map((candle) => candle.close),
  );
  const price = input.ctx.ticker.last;

  return {
    price,
    return1: getReturn(input.ctx, 2),
    return3: getReturn(input.ctx, 4),
    return5: getReturn(input.ctx, 6),
    return10: getReturn(input.ctx, 11),
    realizedVolatilityShort: computeRealizedVolatility(input.ctx, 5),
    realizedVolatilityLong: computeRealizedVolatility(input.ctx, 12),
    spreadBps: computeSpreadBps(input.ctx),
    buySlippageBps: estimateBookImpactBps(
      input.ctx.orderbook.asks,
      assumedTradeNotionalUsd,
      price,
      "buy",
    ),
    sellSlippageBps: estimateBookImpactBps(
      input.ctx.orderbook.bids,
      assumedTradeNotionalUsd,
      price,
      "sell",
    ),
    topBookPressure: computeTopBookPressure(input.ctx),
    orderBookImbalance: computeOrderBookImbalance(input.ctx),
    topBookDepthUsd: computeTopBookDepthUsd(input.ctx),
    totalBookDepthUsd: computeTotalBookDepthUsd(input.ctx),
    ...computeCandleRatios(input.ctx),
    volumeExpansion: computeVolumeExpansion(input.ctx),
    distanceFromVwap: computeDistanceFromReference(price, rollingVwap),
    distanceFromMean: computeDistanceFromReference(price, rollingMean),
    breakoutDistance: computeBreakoutDistance(input.ctx),
    compressionScore: computeCompressionScore(input.ctx),
    availableQuoteUsd,
    availableBaseUsd,
    budgetRemainingUsd:
      Number.isFinite(budgetCapUsd) && budgetCapUsd !== Number.POSITIVE_INFINITY
        ? budgetCapUsd
        : 0,
    maxExecutableBuyUsd,
    maxExecutableSellUsd,
    assumedTradeNotionalUsd,
    minimumTradeNotionalUsd,
  };
}

export function buildFeatureSummary(
  features: DecisionFeatureVector,
): Record<string, number> {
  return {
    return3Bps: Number((features.return3 * 10_000).toFixed(4)),
    return10Bps: Number((features.return10 * 10_000).toFixed(4)),
    volatilityShortBps: Number(
      (features.realizedVolatilityShort * 10_000).toFixed(4),
    ),
    volatilityLongBps: Number(
      (features.realizedVolatilityLong * 10_000).toFixed(4),
    ),
    spreadBps: Number(features.spreadBps.toFixed(4)),
    buySlippageBps: Number(features.buySlippageBps.toFixed(4)),
    sellSlippageBps: Number(features.sellSlippageBps.toFixed(4)),
    orderBookImbalancePct: Number(
      (features.orderBookImbalance * 100).toFixed(4),
    ),
    topBookPressurePct: Number((features.topBookPressure * 100).toFixed(4)),
    volumeExpansion: Number(features.volumeExpansion.toFixed(4)),
    distanceFromVwapBps: Number(
      (features.distanceFromVwap * 10_000).toFixed(4),
    ),
    breakoutDistanceBps: Number(
      (features.breakoutDistance * 10_000).toFixed(4),
    ),
    compressionPct: Number((features.compressionScore * 100).toFixed(4)),
    maxExecutableBuyUsd: Number(features.maxExecutableBuyUsd.toFixed(4)),
    maxExecutableSellUsd: Number(features.maxExecutableSellUsd.toFixed(4)),
  };
}
