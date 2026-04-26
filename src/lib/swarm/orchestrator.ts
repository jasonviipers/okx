import { performance } from "node:perf_hooks";
import { env } from "@/env";
import { createAgent } from "@/lib/agents/create-agent";
import {
  ACTIVE_SWARM_MODELS,
  type AIModel,
  aiModelSchema,
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
import { parseNumber } from "@/lib/runtime-utils";
import { buildSwarmDecision } from "@/lib/swarm/pipeline";
import {
  incrementCounter,
  info,
  observeHistogram,
  warn,
  withTelemetrySpan,
} from "@/lib/telemetry/server";
import type { MarketContext } from "@/types/market";
import type { AgentVote, SwarmRunResult } from "@/types/swarm";

const DEFAULT_DIAGNOSTIC_VOTE_TIMEOUT_MS = 25_000;
const DEFAULT_DIAGNOSTIC_COLLECTION_TIMEOUT_MS = 35_000;
const DEFAULT_DIAGNOSTIC_MIN_VOTES = 3;

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

function getDiagnosticCollectionTimeoutMs() {
  return parseNumber(
    env.SWARM_DIAGNOSTIC_COLLECTION_TIMEOUT_MS,
    DEFAULT_DIAGNOSTIC_COLLECTION_TIMEOUT_MS,
  );
}

function getDiagnosticMinVotes(activeModelCount: number) {
  const configured = parseNumber(
    env.SWARM_DIAGNOSTIC_MIN_VOTES,
    DEFAULT_DIAGNOSTIC_MIN_VOTES,
  );

  return Math.max(1, Math.min(activeModelCount, Math.trunc(configured)));
}

function getDisabledDiagnosticModels(): Set<AIModel> {
  const raw = env.SWARM_DIAGNOSTIC_DISABLED_MODELS;
  if (!raw) {
    return new Set();
  }

  const disabled = new Set<AIModel>();
  const activeModelIds = new Set<string>(ACTIVE_SWARM_MODELS);

  for (const candidate of raw.split(",")) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }

    const parsed = aiModelSchema.safeParse(normalized);
    if (parsed.success && activeModelIds.has(parsed.data)) {
      disabled.add(parsed.data);
    }
  }

  return disabled;
}

function getDiagnosticModelTimeoutOverrides(): Partial<
  Record<AIModel, number>
> {
  const raw = env.SWARM_DIAGNOSTIC_MODEL_TIMEOUTS_MS;
  if (!raw) {
    return {};
  }
  const activeModelIds = new Set<string>(ACTIVE_SWARM_MODELS);

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([modelId, timeoutMs]) => {
        const model = aiModelSchema.safeParse(modelId);
        const timeout = Number(timeoutMs);

        if (
          !model.success ||
          !activeModelIds.has(model.data) ||
          !Number.isFinite(timeout) ||
          timeout <= 0
        ) {
          return [];
        }

        return [[model.data, Math.trunc(timeout)]];
      }),
    );
  } catch {
    warn(
      "swarm.orchestrator",
      "Failed to parse SWARM_DIAGNOSTIC_MODEL_TIMEOUTS_MS; using defaults.",
      {
        raw,
      },
    );
    return {};
  }
}

function getActiveDiagnosticModels(): AIModel[] {
  const disabledModels = getDisabledDiagnosticModels();
  return ACTIVE_SWARM_MODELS.filter((modelId) => !disabledModels.has(modelId));
}

function getPerModelDiagnosticTimeoutMs(
  modelId: AIModel,
  collectionTimeoutMs: number,
  overrides: Partial<Record<AIModel, number>>,
) {
  const override = overrides[modelId];
  const defaultTimeoutMs = getDiagnosticVoteTimeoutMs();
  const resolvedTimeoutMs =
    override && Number.isFinite(override) && override > 0
      ? override
      : defaultTimeoutMs;

  return Math.min(resolvedTimeoutMs, collectionTimeoutMs);
}

async function withVoteTimeout<T>(
  modelId: string,
  task: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  controller = new AbortController(),
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
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
      const shouldUseCache =
        !options?.forceFresh && options?.budgetRemainingUsd === undefined;
      const cached = !shouldUseCache
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
      if (shouldUseCache) {
        await setCachedSwarmResult(ctx.symbol, ctx.timeframe, consensus);
      }

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
      const activeModels = getActiveDiagnosticModels();
      const disabledModels = ACTIVE_SWARM_MODELS.filter(
        (modelId) => !activeModels.includes(modelId),
      );
      const collectionTimeoutMs = getDiagnosticCollectionTimeoutMs();
      const minVotes = getDiagnosticMinVotes(activeModels.length);
      const perModelTimeouts = getDiagnosticModelTimeoutOverrides();

      if (activeModels.length === 0) {
        return {
          votes: [],
          errors: ["No active diagnostic voters are enabled."],
        };
      }

      const votes: AgentVote[] = [];
      const errors: string[] = [];
      const settledModels = new Set<AIModel>();
      const controllers = new Map<AIModel, AbortController>();
      const tasks = activeModels.map((modelId) => {
        const controller = new AbortController();
        controllers.set(modelId, controller);
        const roleConfig = getRoleForModel(modelId);
        const startedAt = performance.now();
        const timeoutMs = getPerModelDiagnosticTimeoutMs(
          modelId,
          collectionTimeoutMs,
          perModelTimeouts,
        );

        return withVoteTimeout(
          modelId,
          (abortSignal) =>
            createAgent(modelId, roleConfig)(ctx, resolvedMemorySummary, {
              abortSignal,
            }),
          timeoutMs,
          controller,
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
            return { status: "fulfilled" as const, modelId, vote };
          })
          .catch((caughtError) => {
            const durationMs = Number(
              (performance.now() - startedAt).toFixed(3),
            );
            const errorMessage =
              caughtError instanceof Error
                ? caughtError.message
                : String(caughtError);

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
              error: errorMessage,
            });
            return { status: "rejected" as const, modelId, errorMessage };
          });
      });

      await new Promise<void>((resolve) => {
        let finished = false;

        const finish = (deadlineError?: string) => {
          if (finished) {
            return;
          }

          finished = true;
          if (deadlineError) {
            errors.push(deadlineError);
          }
          const abortReason = deadlineError
            ? deadlineError
            : "Diagnostic quorum reached before this voter completed.";

          for (const modelId of activeModels) {
            if (!settledModels.has(modelId)) {
              controllers
                .get(modelId)
                ?.abort(new Error(`${abortReason} (${modelId})`));
            }
          }

          resolve();
        };

        const deadlineHandle = setTimeout(() => {
          finish(
            `Diagnostic vote collection deadline reached after ${collectionTimeoutMs}ms.`,
          );
        }, collectionTimeoutMs);
        deadlineHandle.unref?.();

        for (const task of tasks) {
          void task.then((result) => {
            if (finished) {
              return;
            }

            settledModels.add(result.modelId);
            if (result.status === "fulfilled") {
              votes.push(result.vote);
            } else {
              errors.push(result.errorMessage);
            }

            if (
              votes.length >= minVotes ||
              settledModels.size === activeModels.length
            ) {
              clearTimeout(deadlineHandle);
              finish();
            }
          });
        }
      });

      const vetoModels = activeModels.filter(
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
          collectionTimeoutMs,
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

      const quorumMet = votes.length >= minVotes;
      if (!quorumMet) {
        const summary = `Diagnostic quorum not met: received ${votes.length}/${activeModels.length} votes, required ${minVotes}.`;
        warn("swarm.orchestrator", "Diagnostic vote quorum not met", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          activeModels,
          disabledModels,
          votesReceived: votes.length,
          minVotes,
          collectionTimeoutMs,
          errors,
        });
        errors.push(summary);
      }

      if (disabledModels.length > 0) {
        info("swarm.orchestrator", "Diagnostic voters disabled by config", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          disabledModels,
        });
      }

      if (errors.length > 0) {
        warn("swarm.orchestrator", "Diagnostic vote collection had failures", {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          activeModels,
          disabledModels,
          minVotes,
          collectionTimeoutMs,
          errors,
        });
      }

      return { votes, errors };
    },
  );
}
