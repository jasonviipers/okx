import { NextResponse } from "next/server";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { getMemorySummary } from "@/lib/memory/aging-memory";
import { makeSourceHealth } from "@/lib/observability/source-health";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "BTC-USDT";
  const timeframe = (searchParams.get("timeframe") as Timeframe) ?? "1H";
  const ctx = await getRealtimeMarketContext(symbol, timeframe);
  const summary = await getMemorySummary(ctx);

  return NextResponse.json({
    data: { summary },
    sourceHealth: {
      memory: makeSourceHealth("local_store"),
    },
    timestamp: new Date().toISOString(),
  });
}
