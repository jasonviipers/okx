import { average, clamp01 } from "@/lib/math-utils";
import type { MarketContext } from "@/types/market";
import type {
  AgentVote,
  StrategyEngine,
  StrategyEngineReport,
  TradeSignal,
} from "@/types/swarm";

const ENGINE_ORDER: StrategyEngine[] = [
  "trend_continuation",
  "breakout",
  "mean_reversion",
  "microstructure",
];

const ROLE_ENGINE_MAP: Record<AgentVote["role"], StrategyEngine> = {
  trend_follower: "trend_continuation",
  momentum_analyst: "breakout",
  sentiment_reader: "microstructure",
  cross_asset_analyst: "trend_continuation",
  liquidity_specialist: "microstructure",
  macro_filter: "none",
  execution_tactician: "none",
};

function deriveSignalFromWeights(
  weights: Record<TradeSignal, number>,
  threshold = 0.02,
): TradeSignal {
  if (weights.BUY - weights.SELL > threshold) {
    return "BUY";
  }
  if (weights.SELL - weights.BUY > threshold) {
    return "SELL";
  }
  return "HOLD";
}

function buildRoleDrivenEngineReport(
  engine: StrategyEngine,
  votes: AgentVote[],
): StrategyEngineReport | null {
  const engineVotes = votes.filter(
    (vote) => ROLE_ENGINE_MAP[vote.role] === engine,
  );
  if (engineVotes.length === 0) {
    return null;
  }

  const signalWeights: Record<TradeSignal, number> = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  for (const vote of engineVotes) {
    signalWeights[vote.signal] += vote.confidence * vote.voteWeight;
  }

  const supportScore = Object.values(signalWeights).reduce(
    (sum, value) => sum + value,
    0,
  );
  const signal = deriveSignalFromWeights(signalWeights);

  return {
    engine,
    signal,
    confidence: Number(
      clamp01(
        supportScore > 0
          ? signalWeights[signal] / Math.max(supportScore, 1e-6)
          : 0,
      ).toFixed(3),
    ),
    supportScore: Number(supportScore.toFixed(3)),
    reasons: engineVotes.map((vote) => vote.reasoning),
    supportingRoles: engineVotes.map((vote) => vote.role),
  };
}

function buildMeanReversionEngineReport(
  ctx: MarketContext,
): StrategyEngineReport {
  const recentCandles = ctx.candles.slice(-6);
  const meanClose = average(recentCandles.map((candle) => candle.close));
  const last = recentCandles.at(-1)?.close ?? ctx.ticker.last;
  const deviation = meanClose > 0 ? (last - meanClose) / meanClose : 0;
  const spreadPercent =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;

  const signal: TradeSignal =
    Math.abs(deviation) < 0.004 || spreadPercent > 0.004
      ? "HOLD"
      : deviation < 0
        ? "BUY"
        : "SELL";

  const confidence =
    signal === "HOLD"
      ? 0.35
      : clamp01(Math.abs(deviation) * 25 + (1 - spreadPercent / 0.004) * 0.25);

  return {
    engine: "mean_reversion",
    signal,
    confidence: Number(confidence.toFixed(3)),
    supportScore: Number((confidence * 0.9).toFixed(3)),
    reasons: [
      signal === "HOLD"
        ? "Price is not sufficiently stretched away from local fair value."
        : `Price is ${signal === "BUY" ? "below" : "above"} recent average and may mean revert if liquidity remains stable.`,
    ],
    supportingRoles: [],
  };
}

export function buildStrategyEngineReports(
  ctx: MarketContext,
  votes: AgentVote[],
): StrategyEngineReport[] {
  const reports = ENGINE_ORDER.flatMap((engine) => {
    if (engine === "mean_reversion") {
      return [buildMeanReversionEngineReport(ctx)];
    }

    const report = buildRoleDrivenEngineReport(engine, votes);
    return report ? [report] : [];
  });

  return reports;
}
