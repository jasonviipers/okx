import type { MarketContext } from "@/types/market";
import type { AgentVote, ConsensusResult, TradeSignal } from "@/types/swarm";

function sumVotes(votes: AgentVote[], signal: TradeSignal): number {
  return votes
    .filter((vote) => vote.signal === signal)
    .reduce((sum, vote) => sum + vote.confidence * vote.voteWeight, 0);
}

export function computeConsensus(
  votes: AgentVote[],
  ctx: MarketContext,
): ConsensusResult {
  const weightedScores = {
    BUY: sumVotes(votes, "BUY"),
    SELL: sumVotes(votes, "SELL"),
    HOLD: sumVotes(votes, "HOLD"),
  };

  const orderedSignals = Object.entries(weightedScores).sort(
    (a, b) => b[1] - a[1],
  );
  const finalSignal = orderedSignals[0]?.[0] as TradeSignal | undefined;
  const totalWeight = Object.values(weightedScores).reduce(
    (sum, score) => sum + score,
    0,
  );
  const confidence =
    totalWeight > 0 ? weightedScores[finalSignal ?? "HOLD"] / totalWeight : 0;
  const agreement =
    votes.length > 0 && finalSignal
      ? votes.filter((vote) => vote.signal === finalSignal).length /
        votes.length
      : 0;

  return {
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    signal: finalSignal ?? "HOLD",
    confidence: Number(confidence.toFixed(3)),
    agreement: Number(agreement.toFixed(3)),
    votes,
    weightedScores,
    validatedAt: new Date().toISOString(),
    blocked: false,
  };
}
