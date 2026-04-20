import { MARKET_DATA_QUALITY_THRESHOLDS } from "@/lib/market-data/thresholds";
import type { ReplayOutcome, ReplaySnapshot } from "@/lib/replay/types";
import { applyDecisionPolicy } from "@/lib/swarm/decision-policy";
import { buildDeterministicConsensus } from "@/lib/swarm/deterministic-engine";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";

function computeSimulatedPnl(
  direction: ReplayOutcome["decision"]["decision"],
  entryPrice: number,
  exitPrice: number,
): number | null {
  if (entryPrice <= 0 || exitPrice <= 0 || direction === "HOLD") {
    return null;
  }

  return Number(
    (direction === "BUY"
      ? exitPrice - entryPrice
      : entryPrice - exitPrice
    ).toFixed(8),
  );
}

function computeSimulatedSlippageBps(snapshot: ReplaySnapshot): number | null {
  if (snapshot.ticker.last <= 0) {
    return null;
  }

  return Number(
    (
      ((snapshot.ticker.ask - snapshot.ticker.bid) / snapshot.ticker.last) *
      5_000
    ).toFixed(4),
  );
}

function buildReplayMemorySummary(snapshot: ReplaySnapshot): MemorySummary {
  return {
    symbol: snapshot.symbol,
    timeframe: snapshot.timeframe,
    totalMemories: 0,
    effectiveSampleSize: 0,
    blockedRatio: 0,
    averageConfidence: 0,
    directionalWeights: {
      BUY: 0,
      SELL: 0,
      HOLD: 0,
    },
    dominantSignal: "HOLD",
    topRecalls: [],
    generatedAt: new Date(snapshot.timestampMs).toISOString(),
  };
}

/**
 * Runs the deterministic engine over an array of historical snapshots.
 * Does NOT touch the database, does NOT call OKX APIs.
 * Pure function: same input always produces same output.
 */
export async function runReplay(
  snapshots: ReplaySnapshot[],
  config?: Partial<typeof MARKET_DATA_QUALITY_THRESHOLDS>,
): Promise<ReplayOutcome[]> {
  const effectiveConfig = {
    ...MARKET_DATA_QUALITY_THRESHOLDS,
    ...config,
  };

  return Promise.all(
    snapshots.map(async (snapshot, index) => {
      const ctx: MarketContext = {
        symbol: snapshot.symbol,
        timeframe: snapshot.timeframe,
        candles: snapshot.candles,
        ticker: snapshot.ticker,
        orderbook: snapshot.orderbook,
      };
      const memorySummary = buildReplayMemorySummary(snapshot);
      const decision = await applyDecisionPolicy({
        consensus: buildDeterministicConsensus({
          ctx,
          accountOverview: snapshot.accountOverview,
          memorySummary,
        }),
        ctx,
        memorySummary,
      });
      const nextSnapshot = snapshots
        .slice(index + 1)
        .find(
          (candidate) =>
            candidate.symbol === snapshot.symbol &&
            candidate.timeframe === snapshot.timeframe,
        );
      const simulatedPnl =
        effectiveConfig.allowSyntheticFallback === false && !nextSnapshot
          ? null
          : computeSimulatedPnl(
              decision.decision,
              snapshot.ticker.last,
              nextSnapshot?.ticker.last ?? 0,
            );

      return {
        snapshot,
        decision,
        simulatedPnl,
        simulatedSlippageBps:
          decision.decision === "HOLD"
            ? null
            : computeSimulatedSlippageBps(snapshot),
      };
    }),
  );
}
