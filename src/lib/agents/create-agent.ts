import type { AgentRoleConfig } from "@/lib/configs/roles";
import {
  buildAgentPrompt,
  clampConfidence,
  finalizeVote,
} from "@/lib/agents/base-agent";
import type { Candle, MarketContext } from "@/types/market";
import type { AgentVote, TradeSignal } from "@/types/swarm";

type SignalScore = {
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
};

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function candleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function spreadPercent(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
    : 0;
}

function priceMove(ctx: MarketContext, lookback = 6): number {
  const candles = ctx.candles.slice(-lookback);
  const first = candles.at(0);
  const last = candles.at(-1);
  if (!first || !last || first.close === 0) {
    return 0;
  }
  return (last.close - first.close) / first.close;
}

function highLowRange(candle: Candle): number {
  return candle.high > 0 ? (candle.high - candle.low) / candle.high : 0;
}

function orderbookImbalance(ctx: MarketContext): number {
  const bidDepth = ctx.orderbook.bids.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const askDepth = ctx.orderbook.asks.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const total = bidDepth + askDepth;
  return total === 0 ? 0 : (bidDepth - askDepth) / total;
}

function detectSignal(score: number, threshold = 0.0025): TradeSignal {
  if (score > threshold) return "BUY";
  if (score < -threshold) return "SELL";
  return "HOLD";
}

function runTrendFollower(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 8);
  const recentCloses = ctx.candles.slice(-5).map((candle) => candle.close);
  const latestClose = recentCloses.at(-1) ?? 0;
  const trendStrength =
    recentCloses.length > 0
      ? (latestClose - average(recentCloses)) / average(recentCloses)
      : 0;
  const composite = move * 0.7 + trendStrength * 0.3;
  const signal = detectSignal(composite);
  return {
    signal,
    confidence: Math.abs(composite) * 16 + 0.35,
    reasoning:
      signal === "HOLD"
        ? "Trend structure is mixed across the recent candle sequence."
        : `${signal === "BUY" ? "Uptrend" : "Downtrend"} remains intact across the latest bars with closing prices confirming direction.`,
  };
}

function runMomentumAnalyst(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 5);
  const volumes = ctx.candles.slice(-8).map((candle) => candle.volume);
  const recentVolume = average(volumes.slice(-3));
  const baselineVolume = average(
    volumes.slice(0, Math.max(1, volumes.length - 3)),
  );
  const volumeBoost =
    baselineVolume > 0 ? recentVolume / baselineVolume - 1 : 0;
  const composite = move + volumeBoost * 0.01;
  const signal = detectSignal(composite, 0.003);
  return {
    signal,
    confidence: Math.abs(composite) * 18 + 0.32,
    reasoning:
      signal === "HOLD"
        ? "Momentum is fading or under-confirmed by recent volume."
        : `${signal === "BUY" ? "Upside" : "Downside"} velocity is supported by the latest volume profile.`,
  };
}

function runRiskSentinel(ctx: MarketContext): SignalScore {
  const spread = spreadPercent(ctx);
  const lastCandle = ctx.candles.at(-1);
  const range = lastCandle ? highLowRange(lastCandle) : 0;
  const move = priceMove(ctx, 5);

  if (spread > 0.004 || range > 0.03) {
    return {
      signal: "HOLD",
      confidence: 0.82,
      reasoning:
        "Market quality is poor due to wide spread or elevated intrabar volatility.",
    };
  }

  const signal = detectSignal(move, 0.004);
  return {
    signal,
    confidence: Math.abs(move) * 14 + 0.3,
    reasoning:
      signal === "HOLD"
        ? "Risk-adjusted edge is not strong enough to justify exposure."
        : `Execution risk remains acceptable for a cautious ${signal.toLowerCase()} bias.`,
  };
}

function runSentimentReader(ctx: MarketContext): SignalScore {
  const imbalance = orderbookImbalance(ctx);
  const dailyBias = ctx.ticker.change24h / 100;
  const composite = imbalance * 0.8 + dailyBias * 0.2;
  const signal = detectSignal(composite, 0.03);
  return {
    signal,
    confidence: Math.abs(composite) * 5 + 0.28,
    reasoning:
      signal === "HOLD"
        ? "Order book pressure is balanced and does not offer a clear directional edge."
        : `${signal === "BUY" ? "Bid" : "Ask"} depth is dominating the book and aligns with the broader session bias.`,
  };
}

function runContrarian(ctx: MarketContext): SignalScore {
  const lastClose = ctx.candles.at(-1)?.close ?? ctx.ticker.last;
  const lows = ctx.candles.map((candle) => candle.low);
  const highs = ctx.candles.map((candle) => candle.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const nearHigh = max > 0 ? (max - lastClose) / max : 1;
  const nearLow = lastClose > 0 ? (lastClose - min) / lastClose : 1;
  const recentBodies = ctx.candles.slice(-4).map(candleBody);
  const averageBody = average(recentBodies);
  const latestBody = recentBodies.at(-1) ?? 0;

  if (nearHigh < 0.02 && latestBody < averageBody) {
    return {
      signal: "SELL",
      confidence: 0.68 + (0.02 - nearHigh) * 8,
      reasoning:
        "Price is pressing a recent high while candle bodies are compressing, which supports mean reversion lower.",
    };
  }

  if (nearLow < 0.02 && latestBody < averageBody) {
    return {
      signal: "BUY",
      confidence: 0.68 + (0.02 - nearLow) * 8,
      reasoning:
        "Price is testing a recent low with signs of seller exhaustion, which supports a rebound setup.",
    };
  }

  return {
    signal: "HOLD",
    confidence: 0.44,
    reasoning:
      "Price is not stretched enough toward an extreme for a contrarian trade.",
  };
}

function analyzeRole(
  roleConfig: AgentRoleConfig,
  ctx: MarketContext,
): SignalScore {
  switch (roleConfig.role) {
    case "trend_follower":
      return runTrendFollower(ctx);
    case "momentum_analyst":
      return runMomentumAnalyst(ctx);
    case "risk_sentinel":
      return runRiskSentinel(ctx);
    case "sentiment_reader":
      return runSentimentReader(ctx);
    case "contrarian":
      return runContrarian(ctx);
    default:
      return {
        signal: "HOLD",
        confidence: 0.4,
        reasoning: "This role is reserved for future production-only models.",
      };
  }
}

export function createAgent(modelId: string, roleConfig: AgentRoleConfig) {
  return async function runAgent(ctx: MarketContext): Promise<AgentVote> {
    const startedAt = Date.now();
    const prompt = buildAgentPrompt(ctx, roleConfig);
    const { signal, confidence, reasoning } = analyzeRole(roleConfig, ctx);

    return finalizeVote({
      model: modelId,
      roleConfig,
      signal,
      confidence: clampConfidence(
        confidence + Math.min(prompt.length / 4000, 0.05),
      ),
      reasoning,
      startedAt,
    });
  };
}
