import { type NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market-data/service";
import { makeSourceHealth } from "@/lib/observability/source-health";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required parameter: symbol" },
        { status: 400 },
      );
    }

    const snapshot = await getMarketSnapshot(symbol, timeframe);
    const candles = snapshot.context.candles.slice(-limit);

    return NextResponse.json({
      data: {
        candles,
        symbol,
        timeframe,
        count: candles.length,
        status: snapshot.status,
      },
      sourceHealth: {
        candles: makeSourceHealth(
          snapshot.status.source === "fallback"
            ? "fallback"
            : snapshot.status.source === "websocket"
              ? "okx"
              : "computed",
          {
            warning: snapshot.status.warnings[0],
            timestamp:
              snapshot.status.lastCandlesAt ?? new Date().toISOString(),
          },
        ),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/market/candles error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
