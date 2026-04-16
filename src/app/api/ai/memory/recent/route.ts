import { NextResponse } from "next/server";
import { getRecentMemories } from "@/lib/memory/aging-memory";
import { makeSourceHealth } from "@/lib/observability/source-health";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? undefined;
  const timeframe =
    (searchParams.get("timeframe") as Timeframe | null) ?? undefined;
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const memories = await getRecentMemories(symbol, timeframe, limit);

  return NextResponse.json({
    data: {
      entries: memories,
      count: memories.length,
    },
    sourceHealth: {
      memory: makeSourceHealth("local_store"),
    },
    timestamp: new Date().toISOString(),
  });
}
