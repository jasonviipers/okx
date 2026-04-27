import {
  DEFAULT_TRADING_MODE,
  type TradingMode,
} from "@/lib/configs/trading-modes";
import { getMemorySummary } from "@/lib/memory/aging-memory";
import { withTelemetrySpan } from "@/lib/observability/telemetry";
import { getAccountOverview } from "@/lib/okx/account";
import { buildDeterministicConsensus } from "@/lib/swarm/deterministic-engine";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, DecisionResult } from "@/types/swarm";

export async function buildSwarmDecision(
  ctx: MarketContext,
  votes: AgentVote[],
  memorySummary?: MemorySummary,
  budgetRemainingUsd?: number,
  tradingMode: TradingMode = DEFAULT_TRADING_MODE,
): Promise<{ consensus: DecisionResult; memorySummary: MemorySummary }> {
  return withTelemetrySpan(
    {
      name: "swarm.build_decision",
      source: "swarm.pipeline",
      attributes: {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        voteCount: votes.length,
        tradingMode,
      },
    },
    async (span) => {
      const resolvedMemorySummary =
        memorySummary ?? (await getMemorySummary(ctx));
      const accountOverview = await getAccountOverview(ctx.symbol);
      const consensus = buildDeterministicConsensus({
        ctx,
        accountOverview,
        votes,
        memorySummary: resolvedMemorySummary,
        budgetRemainingUsd,
        tradingMode,
      });
      span.addAttributes({
        decision: consensus.decision ?? consensus.signal,
        blocked: consensus.blocked,
        executionEligible: consensus.executionEligible,
        confidence: consensus.confidence,
        agreement: consensus.agreement,
      });

      return {
        consensus,
        memorySummary: resolvedMemorySummary,
      };
    },
  );
}
