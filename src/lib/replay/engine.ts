import { MARKET_DATA_QUALITY_THRESHOLDS } from "@/lib/market-data/service";
import type { ReplayOutcome, ReplaySnapshot } from "@/lib/replay/types";
import { buildDeterministicConsensus } from "@/lib/swarm/deterministic-engine";

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

/**
 * Runs the deterministic engine over an array of historical snapshots.
 * Does NOT touch the database, does NOT call OKX APIs.
 * Pure function: same input always produces same output.
 */
export function runReplay(
  snapshots: ReplaySnapshot[],
  config?: Partial<typeof MARKET_DATA_QUALITY_THRESHOLDS>,
): ReplayOutcome[] {
  const effectiveConfig = {
    ...MARKET_DATA_QUALITY_THRESHOLDS,
    ...config,
  };

  return snapshots.map((snapshot, index) => {
    const decision = buildDeterministicConsensus({
      ctx: {
        symbol: snapshot.symbol,
        timeframe: snapshot.timeframe,
        candles: snapshot.candles,
        ticker: snapshot.ticker,
        orderbook: snapshot.orderbook,
      },
      accountOverview: snapshot.accountOverview,
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
  });
}
