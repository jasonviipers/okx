import type { MarketContext } from "@/types/market";
import type {
  AgentVote,
  ConsensusResearchSummary,
  ConsensusResult,
  TradeSignal,
} from "@/types/swarm";

function sumVotes(votes: AgentVote[], signal: TradeSignal): number {
  return votes
    .filter((vote) => vote.signal === signal)
    .reduce((sum, vote) => sum + vote.confidence * vote.voteWeight, 0);
}

function takeTopEntries(
  values: Array<string | null | undefined>,
  limit = 2,
): string[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function buildResearchSummary(votes: AgentVote[]): ConsensusResearchSummary {
  const traces = votes
    .map((vote) => vote.researchTrace)
    .filter((trace): trace is NonNullable<AgentVote["researchTrace"]> =>
      Boolean(trace),
    );

  return {
    searchedAgents: traces.filter((trace) => trace.searched).length,
    totalAgents: votes.length,
    completedAgents: traces.filter((trace) => trace.status === "completed")
      .length,
    skippedAgents: traces.filter((trace) => trace.status === "skipped").length,
    failedAgents: traces.filter(
      (trace) => trace.status === "failed" || trace.status === "unavailable",
    ).length,
    topFocuses: takeTopEntries(
      traces.map((trace) => trace.focus),
      2,
    ),
    topRationales: takeTopEntries(
      traces.map((trace) => trace.rationale),
      2,
    ),
  };
}

export function computeConsensus(
  votes: AgentVote[],
  ctx: MarketContext,
): ConsensusResult {
  const directionalVotes = votes.filter((vote) => !vote.isVetoLayer);
  const scoringVotes = directionalVotes.length > 0 ? directionalVotes : votes;

  const weightedScores = {
    BUY: sumVotes(scoringVotes, "BUY"),
    SELL: sumVotes(scoringVotes, "SELL"),
    HOLD: sumVotes(scoringVotes, "HOLD"),
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
    scoringVotes.length > 0 && finalSignal
      ? scoringVotes.filter((vote) => vote.signal === finalSignal).length /
        scoringVotes.length
      : 0;

  return {
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    signal: finalSignal ?? "HOLD",
    directionalSignal: finalSignal ?? "HOLD",
    directionalConfidence: Number(confidence.toFixed(3)),
    directionalAgreement: Number(agreement.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    agreement: Number(agreement.toFixed(3)),
    decision: finalSignal ?? "HOLD",
    votes,
    weightedScores,
    validatedAt: new Date().toISOString(),
    blocked: false,
    executionEligible: (finalSignal ?? "HOLD") !== "HOLD",
    rejectionReasons: [],
    researchSummary: buildResearchSummary(votes),
  };
}
