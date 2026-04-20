import { getMemorySummary } from "@/lib/memory/aging-memory";
import { getAccountOverview } from "@/lib/okx/account";
import { applyDecisionPolicy } from "@/lib/swarm/decision-policy";
import { buildDeterministicConsensus } from "@/lib/swarm/deterministic-engine";
import { applyReliabilityWeighting } from "@/lib/swarm/reliability";
import { withTelemetrySpan } from "@/lib/telemetry/server";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, DecisionResult } from "@/types/swarm";

export async function buildSwarmDecision(
  ctx: MarketContext,
  votes: AgentVote[],
  memorySummary?: MemorySummary,
  budgetRemainingUsd?: number,
): Promise<{ consensus: DecisionResult; memorySummary: MemorySummary }> {
  return withTelemetrySpan(
    {
      name: "swarm.build_decision",
      source: "swarm.pipeline",
      attributes: {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        voteCount: votes.length,
      },
    },
    async (span) => {
      const resolvedMemorySummary =
        memorySummary ?? (await getMemorySummary(ctx));
      const accountOverview = await getAccountOverview(ctx.symbol);
      const baseConsensus = buildDeterministicConsensus({
        ctx,
        accountOverview,
        votes,
        memorySummary: resolvedMemorySummary,
        budgetRemainingUsd,
      });
      const consensus = await applyDecisionPolicy({
        consensus: baseConsensus,
        ctx,
        memorySummary: resolvedMemorySummary,
        afterExpectedValue: applyReliabilityWeighting,
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
