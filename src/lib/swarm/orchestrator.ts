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
import {
  incrementCounter,
  observeHistogram,
  warn,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
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

export async function runSwarm(
  ctx: MarketContext,
  options?: {
    forceFresh?: boolean;
    budgetRemainingUsd?: number;
  },
): Promise<SwarmRunResult> {
  return withTelemetrySpan(
    {
      name: "swarm.run",
      source: "swarm.orchestrator",
      attributes: {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        forceFresh: options?.forceFresh ?? false,
      },
    },
    async (span) => {
      const startedAt = Date.now();
      const cached = options?.forceFresh
        ? null
        : await getCachedSwarmResult(ctx.symbol, ctx.timeframe);
      if (cached) {
        incrementCounter("swarm_runs_total", "Total swarm run attempts.", 1, {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          cached: true,
          decision: cached.decision ?? cached.signal,
        });
        return {
          consensus: cached,
          marketContext: ctx,
          totalElapsedMs: 0,
          cached: true,
        };
      }

      const memorySummary = await getMemorySummary(ctx);
      const { consensus } = await buildSwarmDecision(
        ctx,
        [],
        memorySummary,
        options?.budgetRemainingUsd,
      );
      await setCachedSwarmResult(ctx.symbol, ctx.timeframe, consensus);

      const result = {
        consensus,
        marketContext: ctx,
        totalElapsedMs: Date.now() - startedAt,
        cached: false,
      };

      observeHistogram(
        "swarm_run_duration_ms",
        "Duration of swarm runs in milliseconds.",
        result.totalElapsedMs,
        {
          labels: {
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
            decision: consensus.decision ?? consensus.signal,
            blocked: consensus.blocked,
          },
        },
      );
      incrementCounter("swarm_runs_total", "Total swarm run attempts.", 1, {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        cached: false,
        decision: consensus.decision ?? consensus.signal,
        blocked: consensus.blocked,
      });
      span.addAttributes({
        decision: consensus.decision ?? consensus.signal,
        blocked: consensus.blocked,
        executionEligible: consensus.executionEligible,
        rejectionCount: consensus.rejectionReasons.length,
      });
      if (consensus.blocked || !consensus.executionEligible) {
        warn("swarm.orchestrator", "Swarm result is not executable", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          decision: consensus.decision ?? consensus.signal,
          rejectionReasons: consensus.rejectionReasons,
        });
      }

      await recordSwarmRun(result);
      await storeSwarmMemory(result);
      return result;
    },
  );
}

export async function collectDiagnosticVotes(
  ctx: MarketContext,
  options?: {
    memorySummary?: Awaited<ReturnType<typeof getMemorySummary>>;
  },
): Promise<{ votes: AgentVote[]; errors: string[] }> {
  return withTelemetrySpan(
    {
      name: "swarm.collect_diagnostic_votes",
      source: "swarm.orchestrator",
      attributes: {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        models: ACTIVE_SWARM_MODELS.length,
      },
    },
    async () => {
      const resolvedMemorySummary =
        options?.memorySummary ?? (await getMemorySummary(ctx));
      const settled = await Promise.allSettled(
        ACTIVE_SWARM_MODELS.map((modelId) => {
          const roleConfig = getRoleForModel(modelId);
          return createAgent(modelId, roleConfig)(ctx, resolvedMemorySummary);
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
        warn("swarm.orchestrator", "Diagnostic veto layer did not vote", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          missingVetos,
        });
      }

      return { votes, errors };
    },
  );
}
