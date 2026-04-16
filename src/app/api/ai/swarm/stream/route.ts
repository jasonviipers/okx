import type { NextRequest } from "next/server";
import { createAgent } from "@/lib/agents/create-agent";
import { ACTIVE_SWARM_MODELS } from "@/lib/configs/models";
import { getRoleForModel } from "@/lib/configs/roles";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { getMemorySummary } from "@/lib/memory/aging-memory";
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
      const sendEvent = (data: SwarmStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
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
          const { consensus } = await buildSwarmDecision(
            ctx,
            votes,
            memorySummary,
          );
          sendEvent({
            type: "consensus",
            timestamp: new Date().toISOString(),
            symbol,
            timeframe,
            consensus,
          });
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
