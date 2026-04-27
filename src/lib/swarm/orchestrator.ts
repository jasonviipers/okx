import { performance } from "node:perf_hooks";
import { env } from "@/env";
import { createAgent } from "@/lib/agents/create-agent";
import type { AIModel } from "@/lib/configs/models";
import {
  ACTIVE_SWARM_MODELS,
  assertCanReason,
  MODEL_ROLES,
  modelCanVote,
} from "@/lib/configs/models";
import { getRoleForModel } from "@/lib/configs/roles";
import {
  resolveTradingMode,
  type TradingMode,
} from "@/lib/configs/trading-modes";
import { getMemorySummary, storeSwarmMemory } from "@/lib/memory/aging-memory";
import {
  incrementCounter,
  info,
  observeHistogram,
  warn,
  withTelemetrySpan,
} from "@/lib/observability/telemetry";
import { recordSwarmRun } from "@/lib/persistence/history";
import {
  getCachedSwarmResult,
  setCachedSwarmResult,
} from "@/lib/redis/swarm-cache";
import { parseNumber } from "@/lib/runtime-utils";
import { buildSwarmDecision } from "@/lib/swarm/pipeline";
import type { MarketContext } from "@/types/market";
import type { AgentVote, SwarmRunResult } from "@/types/swarm";

const DEFAULT_DIAGNOSTIC_VOTE_TIMEOUT_MS = 8_000;

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

function getDiagnosticVoteTimeoutMs() {
  return parseNumber(
    env.SWARM_DIAGNOSTIC_VOTE_TIMEOUT_MS,
    DEFAULT_DIAGNOSTIC_VOTE_TIMEOUT_MS,
  );
}

async function withVoteTimeout<T>(
  modelId: string,
  task: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const controller = new AbortController();
  const promise = task(controller.signal);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const timeoutError = new Error(
            `Diagnostic vote timed out for ${modelId} after ${timeoutMs}ms.`,
          );
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
        timeoutHandle.unref?.();
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runSwarm(
  ctx: MarketContext,
  options?: {
    forceFresh?: boolean;
    budgetRemainingUsd?: number;
    tradingMode?: TradingMode;
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
      const tradingMode = resolveTradingMode(
        options?.tradingMode ?? env.TRADING_MODE,
      );
      const cached = options?.forceFresh
        ? null
        : await getCachedSwarmResult(ctx.symbol, ctx.timeframe, tradingMode);
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
        tradingMode,
      );
      await setCachedSwarmResult(
        ctx.symbol,
        ctx.timeframe,
        consensus,
        tradingMode,
      );

      const result = {
        consensus,
        marketContext: ctx,
        totalElapsedMs: Date.now() - startedAt,
        cached: false,
      };
      const decisionLabel = consensus.decision ?? consensus.signal;

      observeHistogram(
        "swarm_run_duration_ms",
        "Duration of swarm runs in milliseconds.",
        result.totalElapsedMs,
        {
          labels: {
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
            decision: decisionLabel,
            blocked: consensus.blocked,
          },
        },
      );
      incrementCounter("swarm_runs_total", "Total swarm run attempts.", 1, {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        cached: false,
        decision: decisionLabel,
        blocked: consensus.blocked,
      });
      span.addAttributes({
        decision: decisionLabel,
        blocked: consensus.blocked,
        executionEligible: consensus.executionEligible,
        rejectionCount: consensus.rejectionReasons.length,
      });
      if (consensus.blocked || !consensus.executionEligible) {
        warn("swarm.orchestrator", "Swarm result is not executable", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          decision: decisionLabel,
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
    tradingMode?: TradingMode;
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
      const tradingMode = resolveTradingMode(
        options?.tradingMode ?? env.TRADING_MODE,
      );
      const timeoutMs = getDiagnosticVoteTimeoutMs();
      const settled = await Promise.allSettled(
        ACTIVE_SWARM_MODELS.map((modelId) => {
          const roleConfig = getRoleForModel(modelId);
          const startedAt = performance.now();
          return withVoteTimeout(
            modelId,
            (abortSignal) =>
              createAgent(modelId, roleConfig)(ctx, resolvedMemorySummary, {
                abortSignal,
                tradingMode,
              }),
            timeoutMs,
          )
            .then((vote) => {
              const durationMs = Number(
                (performance.now() - startedAt).toFixed(3),
              );
              observeHistogram(
                "swarm_diagnostic_vote_duration_ms",
                "Duration of individual diagnostic voter runs in milliseconds.",
                durationMs,
                {
                  labels: {
                    symbol: ctx.symbol,
                    timeframe: ctx.timeframe,
                    model: modelId,
                    status: "success",
                  },
                },
              );
              info("swarm.orchestrator", "Diagnostic voter completed", {
                symbol: ctx.symbol,
                timeframe: ctx.timeframe,
                model: modelId,
                timeoutMs,
                durationMs,
              });
              return vote;
            })
            .catch((caughtError) => {
              const durationMs = Number(
                (performance.now() - startedAt).toFixed(3),
              );
              observeHistogram(
                "swarm_diagnostic_vote_duration_ms",
                "Duration of individual diagnostic voter runs in milliseconds.",
                durationMs,
                {
                  labels: {
                    symbol: ctx.symbol,
                    timeframe: ctx.timeframe,
                    model: modelId,
                    status: "error",
                  },
                },
              );
              warn("swarm.orchestrator", "Diagnostic voter failed", {
                symbol: ctx.symbol,
                timeframe: ctx.timeframe,
                model: modelId,
                timeoutMs,
                durationMs,
                error:
                  caughtError instanceof Error
                    ? caughtError.message
                    : String(caughtError),
              });
              throw caughtError;
            });
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
        const diagnostic = {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          timeoutMs,
          missingVetos,
          errors,
        };
        warn("swarm.orchestrator", "Diagnostic veto layer did not vote", {
          ...diagnostic,
        });
        errors.push(
          `Diagnostic veto commentary unavailable from ${missingVetos.join(", ")}; continuing with partial diagnostics.`,
        );
      }

      if (errors.length > 0) {
        warn("swarm.orchestrator", "Diagnostic vote collection had failures", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          timeoutMs,
          errors,
        });
      }

      return { votes, errors };
    },
  );
}
