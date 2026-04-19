import type { NextRequest } from "next/server";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { getMemorySummary } from "@/lib/memory/aging-memory";
import { collectDiagnosticVotes } from "@/lib/swarm/orchestrator";
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
            stage: "deterministic",
            detail: "Market snapshot loaded and deterministic scoring started",
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
        sendEvent({
          type: "status",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message: "Collecting diagnostic agent commentary",
        });
        const { votes, errors } = await collectDiagnosticVotes(ctx, {
          memorySummary,
        });
        for (const vote of votes) {
          sendEvent({
            type: "vote",
            timestamp: new Date().toISOString(),
            symbol,
            timeframe,
            vote,
          });
        }
        if (errors.length > 0) {
          for (const error of errors) {
            sendEvent({
              type: "pipeline",
              timestamp: new Date().toISOString(),
              symbol,
              timeframe,
              message: error,
              pipeline: {
                stage: "diagnostics",
                detail: error,
              },
            });
          }
        }

        sendEvent({
          type: "status",
          timestamp: new Date().toISOString(),
          symbol,
          timeframe,
          message: "Running deterministic decision engine",
        });
        const { consensus } = await buildSwarmDecision(
          ctx,
          votes,
          memorySummary,
        );
        const pipelineStages: Array<[string, string | undefined]> = [
          ["consensus", "Deterministic decision computed from feature scores"],
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
