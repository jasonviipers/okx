import { createAgent } from "@/lib/agents/create-agent";
import type { AIModel } from "@/lib/configs/models";
import {
  ACTIVE_SWARM_MODELS,
  assertCanReason,
  MODEL_ROLES,
  modelCanVote,
} from "@/lib/configs/models";
import { getRoleForModel } from "@/lib/configs/roles";
import { getMemorySummary, storeSwarmMemory } from "@/lib/memory/aging-memory";
import { recordSwarmRun } from "@/lib/persistence/history";
import {
  getCachedSwarmResult,
  setCachedSwarmResult,
} from "@/lib/redis/swarm-cache";
import { buildSwarmDecision } from "@/lib/swarm/pipeline";
import type { MarketContext } from "@/types/market";
import type { AgentVote, SwarmRunResult } from "@/types/swarm";

for (const modelId of ACTIVE_SWARM_MODELS) {
  assertCanReason(modelId);

  if (!modelCanVote(modelId)) {
    throw new Error(
      `ACTIVE_SWARM_MODELS contains "${modelId}" (role: ${MODEL_ROLES[modelId]}) which is not permitted to vote. Remove orchestrator/execution models from ACTIVE_SWARM_MODELS.`,
    );
  }

  try {
    getRoleForModel(modelId);
  } catch {
    throw new Error(
      `ACTIVE_SWARM_MODELS contains "${modelId}" which has no SwarmRole in MODEL_SWARM_ROLE_MAP. Assign a SwarmRole or remove the model from ACTIVE_SWARM_MODELS.`,
    );
  }
}

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
  const memorySummary = await getMemorySummary(ctx);

  const settled = await Promise.allSettled(
    ACTIVE_SWARM_MODELS.map((modelId) => {
      const roleConfig = getRoleForModel(modelId);
      return createAgent(modelId, roleConfig)(ctx, memorySummary);
    }),
  );

  const votes: AgentVote[] = [];
  const errors: string[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      votes.push(result.value);
    } else {
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
    }
  }

  if (votes.length === 0) {
    throw new Error(
      `Swarm analysis failed; no agent votes were produced. Errors: ${errors.join("; ")}`,
    );
  }

  const vetoModels = ACTIVE_SWARM_MODELS.filter(
    (modelId) =>
      MODEL_ROLES[modelId as AIModel] === "risk" ||
      MODEL_ROLES[modelId as AIModel] === "validator",
  );
  const votingModels = votes.map((vote) => vote.model);
  const missingVetos = vetoModels.filter(
    (modelId) => !votingModels.includes(modelId),
  );
  if (missingVetos.length > 0) {
    console.warn(
      `[Orchestrator] Veto layer(s) did not vote: ${missingVetos.join(", ")}. Consensus will proceed without full veto coverage.`,
    );
  }

  const { consensus } = await buildSwarmDecision(ctx, votes, memorySummary);
  await setCachedSwarmResult(ctx.symbol, ctx.timeframe, consensus);

  const result = {
    consensus,
    marketContext: ctx,
    totalElapsedMs: Date.now() - startedAt,
    cached: false,
  };

  await recordSwarmRun(result);
  await storeSwarmMemory(result);
  return result;
}
