import "server-only";

import { getHistory } from "@/lib/persistence/history";
import { markConsensusBlocked } from "@/lib/swarm/rejection-utils";
import type { StoredSwarmRun } from "@/types/history";
import type { ConsensusResult, ReliabilityReport } from "@/types/swarm";

const MAX_HISTORY_LOOKBACK = 150;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isStoredSwarmRun(
  entry: Awaited<ReturnType<typeof getHistory>>[number],
): entry is StoredSwarmRun {
  return entry.type === "swarm_run";
}

export async function applyReliabilityWeighting(
  consensus: ConsensusResult,
): Promise<ConsensusResult> {
  if (!consensus.regime || !consensus.metaSelection) {
    return consensus;
  }

  const history = await getHistory(MAX_HISTORY_LOOKBACK);
  const relevantRuns = history.filter(
    (entry): entry is StoredSwarmRun =>
      isStoredSwarmRun(entry) &&
      entry.consensus.regime?.regime === consensus.regime?.regime &&
      entry.consensus.metaSelection?.selectedEngine ===
        consensus.metaSelection?.selectedEngine,
  );

  const sampleSize = relevantRuns.length;
  const blockedCount = relevantRuns.filter(
    (entry) => entry.consensus.blocked,
  ).length;
  const successfulComparableRuns = relevantRuns.filter(
    (entry) => !entry.consensus.blocked,
  );
  const alignedCount = relevantRuns.filter(
    (entry) =>
      !entry.consensus.blocked &&
      entry.consensus.expectedValue?.tradeAllowed !== false,
  ).length;
  const blockedRate = sampleSize > 0 ? blockedCount / sampleSize : 0;
  const hasEnoughComparableSuccesses = successfulComparableRuns.length >= 3;
  const reliabilityScore =
    sampleSize > 0 && hasEnoughComparableSuccesses
      ? clamp01(alignedCount / sampleSize - blockedRate * 0.35)
      : 0.5;

  const notes = [
    sampleSize > 0 && hasEnoughComparableSuccesses
      ? "Reliability estimated from historical swarm runs with the same regime and selected engine."
      : "Not enough successful comparable history yet; using neutral reliability prior.",
  ];

  let nextConfidence = consensus.confidence;
  let nextConsensus = consensus;

  if (
    sampleSize >= 8 &&
    hasEnoughComparableSuccesses &&
    reliabilityScore < 0.35 &&
    consensus.signal !== "HOLD"
  ) {
    nextConfidence = Math.min(nextConfidence, 0.4);
    nextConsensus = markConsensusBlocked(
      nextConsensus,
      {
        layer: "reliability",
        code: "weak_historical_fit",
        summary:
          "Reliability weighting suppressed the setup due to weak historical fit.",
        detail:
          "Comparable historical runs do not provide enough evidence for live deployment.",
        metrics: {
          sampleSize,
          reliabilityScore: Number(reliabilityScore.toFixed(4)),
          blockedRate: Number((blockedRate * 100).toFixed(4)),
        },
      },
      {
        confidence: nextConfidence,
      },
    );
    notes.push("Historical reliability is too weak for live deployment.");
  } else if (
    sampleSize >= 8 &&
    hasEnoughComparableSuccesses &&
    reliabilityScore > 0.65
  ) {
    nextConfidence = clamp01(nextConfidence + 0.05);
    notes.push("Historical reliability modestly boosts conviction.");
  }

  const reliability: ReliabilityReport = {
    regime: consensus.regime.regime,
    selectedEngine: consensus.metaSelection.selectedEngine,
    sampleSize,
    reliabilityScore: Number(reliabilityScore.toFixed(3)),
    blockedRate: Number(blockedRate.toFixed(3)),
    notes,
    generatedAt: new Date().toISOString(),
  };

  return {
    ...nextConsensus,
    confidence: Number(nextConfidence.toFixed(3)),
    reliability,
  };
}
