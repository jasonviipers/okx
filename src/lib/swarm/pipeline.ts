import { getMemorySummary } from "@/lib/memory/aging-memory";
import { getAccountOverview } from "@/lib/okx/account";
import { buildDeterministicConsensus } from "@/lib/swarm/deterministic-engine";
import type { MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, ConsensusResult } from "@/types/swarm";

export async function buildSwarmDecision(
  ctx: MarketContext,
  votes: AgentVote[],
  memorySummary?: MemorySummary,
  budgetRemainingUsd?: number,
): Promise<{ consensus: ConsensusResult; memorySummary: MemorySummary }> {
  const resolvedMemorySummary = memorySummary ?? (await getMemorySummary(ctx));
  const accountOverview = await getAccountOverview(ctx.symbol);
  const consensus = buildDeterministicConsensus({
    ctx,
    accountOverview,
    votes,
    memorySummary: resolvedMemorySummary,
    budgetRemainingUsd,
  });

  return {
    consensus,
    memorySummary: resolvedMemorySummary,
  };
}
