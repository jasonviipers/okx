import { type NextRequest, NextResponse } from "next/server";
import { getRealtimeMarketContext } from "@/lib/market-data/service";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { runSwarm } from "@/lib/swarm/orchestrator";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timeframe = "1H" } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required field: symbol" },
        { status: 400 },
      );
    }

    // Fetch market data
    const ctx = await getRealtimeMarketContext(symbol, timeframe as Timeframe);

    // Run swarm analysis
    const result = await runSwarm(ctx);

    return NextResponse.json({
      data: result,
      sourceHealth: {
        marketContext: makeSourceHealth("computed"),
        consensus: makeSourceHealth(result.cached ? "cache" : "computed", {
          cached: result.cached,
        }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/swarm/analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
