import { ACTIVE_SWARM_MODELS } from "@/lib/configs/models";
import { getRoleForModel } from "@/lib/configs/roles";
import { createAgent } from "@/lib/agents/create-agent";
import {
  getCachedSwarmResult,
  setCachedSwarmResult,
} from "@/lib/redis/swarm-cache";
import { computeConsensus } from "@/lib/swarm/consensus";
import { validateConsensus } from "@/lib/swarm/validator";
import type { MarketContext } from "@/types/market";
import type { AgentVote, SwarmRunResult } from "@/types/swarm";

export async function runSwarm(ctx: MarketContext): Promise<SwarmRunResult> {
  const cached = await getCachedSwarmResult(ctx.symbol, ctx.timeframe);
  if (cached) {
    return {
      consensus: cached,
      marketContext: ctx,
      totalElapsedMs: 0,
      cached: true,
    };
  }

  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    ACTIVE_SWARM_MODELS.map((modelId) =>
      createAgent(modelId, getRoleForModel(modelId))(ctx),
    ),
  );

  const votes = settled
    .filter(
      (result): result is PromiseFulfilledResult<AgentVote> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  if (votes.length === 0) {
    throw new Error("Swarm analysis failed: no agent votes were produced.");
  }

  const consensus = validateConsensus(computeConsensus(votes, ctx), ctx);
  await setCachedSwarmResult(ctx.symbol, ctx.timeframe, consensus);

  return {
    consensus,
    marketContext: ctx,
    totalElapsedMs: Date.now() - startedAt,
    cached: false,
  };
}
