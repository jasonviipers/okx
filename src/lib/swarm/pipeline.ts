import { getMemorySummary } from "@/lib/memory/aging-memory";
import { computeConsensus } from "@/lib/swarm/consensus";
import { buildStrategyEngineReports } from "@/lib/swarm/engines";
import { applyExpectedValueGate } from "@/lib/swarm/expected-value";
import { applyDecisionHarness } from "@/lib/swarm/harness";
import { applyMetaSelection } from "@/lib/swarm/meta-selector";
import { classifyMarketRegime } from "@/lib/swarm/regime";
import { applyReliabilityWeighting } from "@/lib/swarm/reliability";
import { validateConsensus } from "@/lib/swarm/validator";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, ConsensusResult } from "@/types/swarm";

export async function buildSwarmDecision(
  ctx: MarketContext,
  votes: AgentVote[],
  memorySummary?: MemorySummary,
): Promise<{ consensus: ConsensusResult; memorySummary: MemorySummary }> {
  const resolvedMemorySummary = memorySummary ?? (await getMemorySummary(ctx));
  const regime = classifyMarketRegime(ctx);
  const engineReports = buildStrategyEngineReports(ctx, votes);

  const reliabilityWeighted = await applyReliabilityWeighting(
    applyExpectedValueGate(
      applyMetaSelection({
        ...computeConsensus(votes, ctx),
        regime,
        engineReports,
      }),
      ctx,
    ),
  );

  const consensus = applyDecisionHarness(
    validateConsensus(reliabilityWeighted, ctx),
    ctx,
    resolvedMemorySummary,
  );

  return {
    consensus: {
      ...consensus,
      decision: consensus.signal,
    },
    memorySummary: resolvedMemorySummary,
  };
}
