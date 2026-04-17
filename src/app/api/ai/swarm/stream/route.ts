import type { NextRequest } from "next/server";
import { createAgent } from "@/lib/agents/create-agent";
import { ACTIVE_SWARM_MODELS } from "@/lib/configs/models";
import { getRoleForModel } from "@/lib/configs/roles";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { getMemorySummary, storeSwarmMemory } from "@/lib/memory/aging-memory";
import { recordSwarmRun } from "@/lib/persistence/history";
import { setCachedSwarmResult } from "@/lib/redis/swarm-cache";
import { buildSwarmDecision } from "@/lib/swarm/pipeline";
import type { Timeframe } from "@/types/market";
import type { SwarmStreamEvent } from "@/types/swarm";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "BTC-USDT";
  const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";

  const readable = new ReadableStream({
    async start(controller) {
      let eventCounter = 0;
      const sendEvent = (data: SwarmStreamEvent) => {
        eventCounter += 1;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              ...data,
              id:
                data.id ??
                `${symbol}-${timeframe}-${Date.now()}-${eventCounter}-${data.type}`,
            })}\n\n`,
          ),
        );
      };

      try {
        const startedAt = Date.now();
        sendEvent({
          type: "status",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message: "Fetching market context",
        });

        const ctx = await getRealtimeMarketContext(symbol, timeframe);
        sendEvent({
          type: "pipeline",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message: "Market context ready",
          pipeline: {
            stage: "agents",
            detail: "Market snapshot loaded and agent voting started",
          },
        });

        sendEvent({
          type: "status",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message: "Generating memory summary",
        });
        const memorySummary = await getMemorySummary(ctx);
        const votes = [];

        for (const modelId of ACTIVE_SWARM_MODELS) {
          if (req.signal.aborted) {
            break;
          }

          const vote = await createAgent(modelId, getRoleForModel(modelId))(
            ctx,
            memorySummary,
          );
          votes.push(vote);
          sendEvent({
            type: "vote",
            timestamp: new Date().toISOString(),
            symbol,
            timeframe,
            vote,
          });
        }

        if (votes.length > 0) {
          sendEvent({
            type: "status",
            timestamp: new Date().toISOString(),
            symbol,
            timeframe,
            message: "Running consensus pipeline",
          });
          const { consensus } = await buildSwarmDecision(
            ctx,
            votes,
            memorySummary,
          );
          const pipelineStages: Array<[string, string | undefined]> = [
            ["consensus", "Votes aggregated into a provisional decision"],
            [
              "regime",
              consensus.regime
                ? `Regime classified as ${consensus.regime.regime}`
                : undefined,
            ],
            [
              "meta",
              consensus.metaSelection
                ? `Selected ${consensus.metaSelection.selectedEngine}`
                : undefined,
            ],
            [
              "ev",
              consensus.expectedValue
                ? `Net edge ${consensus.expectedValue.netEdgeBps.toFixed(2)} bps`
                : undefined,
            ],
            [
              "reliability",
              consensus.reliability
                ? `Reliability ${consensus.reliability.reliabilityScore.toFixed(2)}`
                : undefined,
            ],
            [
              "validator",
              consensus.blocked
                ? `Blocked: ${consensus.blockReason ?? "validator veto"}`
                : "Validator passed",
            ],
            [
              "harness",
              consensus.harness
                ? `Memory alignment ${consensus.harness.memoryAlignmentScore.toFixed(2)}`
                : undefined,
            ],
          ];

          for (const [stage, detail] of pipelineStages) {
            if (!detail) continue;
            sendEvent({
              type: "pipeline",
              timestamp: new Date().toISOString(),
              symbol,
              timeframe,
              message: detail,
              pipeline: {
                stage,
                detail,
              },
            });
          }

          for (const rejectionReason of consensus.rejectionReasons) {
            sendEvent({
              type: "pipeline",
              timestamp: new Date().toISOString(),
              symbol,
              timeframe,
              message: rejectionReason.summary,
              pipeline: {
                stage: rejectionReason.layer,
                detail: rejectionReason.summary,
              },
            });
          }

          sendEvent({
            type: "consensus",
            timestamp: new Date().toISOString(),
            symbol,
            timeframe,
            consensus,
          });

          const result = {
            consensus,
            marketContext: ctx,
            totalElapsedMs: Date.now() - startedAt,
            cached: false,
          };
          await Promise.all([
            setCachedSwarmResult(symbol, timeframe, consensus),
            recordSwarmRun(result),
            storeSwarmMemory(result),
          ]);
        }
      } catch (error) {
        sendEvent({
          type: "error",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message:
            error instanceof Error ? error.message : "Unknown stream error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
