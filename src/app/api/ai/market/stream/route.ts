import type { NextRequest } from "next/server";
import { getMarketSnapshot } from "@/lib/market-data/service";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

type MarketStreamPayload = {
  type: "market";
  timestamp: string;
  symbol: string;
  timeframe: Timeframe;
  snapshot: Awaited<ReturnType<typeof getMarketSnapshot>>;
};

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "BTC-USDT")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";
  const intervalMs = Number(searchParams.get("intervalMs") ?? "2000");

  const readable = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = async () => {
        try {
          const snapshots = await Promise.all(
            symbols.map((symbol) => getMarketSnapshot(symbol, timeframe)),
          );

          for (const snapshot of snapshots) {
            const payload: MarketStreamPayload = {
              type: "market",
              timestamp: new Date().toISOString(),
              symbol: snapshot.context.symbol,
              timeframe,
              snapshot,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                timestamp: new Date().toISOString(),
                message:
                  error instanceof Error
                    ? error.message
                    : "Unknown market stream error",
              })}\n\n`,
            ),
          );
        }
      };

      void send();
      const timer = setInterval(() => {
        if (!closed) {
          void send();
        }
      }, intervalMs);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        controller.close();
      });
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
