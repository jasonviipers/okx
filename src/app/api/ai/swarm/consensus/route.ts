import { type NextRequest, NextResponse } from "next/server";
import { getCachedSwarmResult } from "@/lib/redis/swarm-cache";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? "BTC-USDT";
    const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";
    const consensus = await getCachedSwarmResult(symbol, timeframe);

    if (!consensus) {
      return NextResponse.json(
        {
          error: "No cached consensus available yet.",
          symbol,
          timeframe,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ consensus, cached: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
