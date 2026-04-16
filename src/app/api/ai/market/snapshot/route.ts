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
    const limit = Number.parseInt(searchParams.get("limit") ?? "80", 10);

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required parameter: symbol" },
        { status: 400 },
      );
    }

    const snapshot = await getMarketSnapshot(symbol, timeframe);

    return NextResponse.json({
      data: {
        symbol,
        timeframe,
        ticker: snapshot.context.ticker,
        orderbook: snapshot.context.orderbook,
        candles: snapshot.context.candles.slice(-limit),
        status: snapshot.status,
      },
      sourceHealth: {
        market: makeSourceHealth(
          snapshot.status.source === "fallback"
            ? "fallback"
            : snapshot.status.source === "websocket"
              ? "okx"
              : "computed",
          {
            warning: snapshot.status.warnings[0],
            timestamp: snapshot.status.lastEventAt ?? new Date().toISOString(),
          },
        ),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/market/snapshot error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
