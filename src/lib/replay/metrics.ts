import { average } from "@/lib/math-utils";
import type { ReplayOutcome } from "@/lib/replay/types";

export type ReplayMetrics = {
  totalSnapshots: number;
  tradeCount: number;
  winRate: number;
  avgSimulatedPnl: number;
  sharpeProxy: number;
  maxDrawdown: number;
  avgExpectedNetEdgeBps: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
};

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(Math.max(variance, 0));
}

function computeMaxDrawdown(values: number[]): number {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const value of values) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return maxDrawdown;
}

export function computeReplayMetrics(outcomes: ReplayOutcome[]): ReplayMetrics {
  const tradeOutcomes = outcomes.filter(
    (outcome) =>
      outcome.decision.decision !== "HOLD" && outcome.simulatedPnl !== null,
  );
  const simulatedPnls = tradeOutcomes.map(
    (outcome) => outcome.simulatedPnl ?? 0,
  );
  const holdOutcomes = outcomes.filter(
    (outcome) => outcome.decision.decision === "HOLD",
  );
  const profitableHolds = holdOutcomes.filter((outcome, index) => {
    const nextOutcome = outcomes[index + 1];
    if (!nextOutcome || outcome.snapshot.ticker.last <= 0) {
      return false;
    }

    return (
      Math.abs(
        nextOutcome.snapshot.ticker.last - outcome.snapshot.ticker.last,
      ) > 0
    );
  }).length;
  const losingTrades = simulatedPnls.filter((value) => value < 0).length;
  const pnlStdDev = standardDeviation(simulatedPnls);

  return {
    totalSnapshots: outcomes.length,
    tradeCount: tradeOutcomes.length,
    winRate:
      tradeOutcomes.length > 0
        ? Number(
            (
              simulatedPnls.filter((value) => value > 0).length /
              tradeOutcomes.length
            ).toFixed(4),
          )
        : 0,
    avgSimulatedPnl: Number(average(simulatedPnls).toFixed(8)),
    sharpeProxy:
      pnlStdDev > 0
        ? Number((average(simulatedPnls) / pnlStdDev).toFixed(6))
        : 0,
    maxDrawdown: Number(computeMaxDrawdown(simulatedPnls).toFixed(8)),
    avgExpectedNetEdgeBps: Number(
      average(
        tradeOutcomes.map((outcome) => outcome.decision.expectedNetEdgeBps),
      ).toFixed(4),
    ),
    falsePositiveRate:
      tradeOutcomes.length > 0
        ? Number((losingTrades / tradeOutcomes.length).toFixed(4))
        : 0,
    falseNegativeRate:
      holdOutcomes.length > 0
        ? Number((profitableHolds / holdOutcomes.length).toFixed(4))
        : 0,
  };
}
