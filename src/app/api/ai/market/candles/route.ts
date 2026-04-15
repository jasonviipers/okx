import { type NextRequest, NextResponse } from "next/server";
import { getCandles } from "@/lib/okx/market";
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

    const candles = await getCandles(symbol, timeframe, limit);

    return NextResponse.json({
      candles,
      symbol,
      timeframe,
      count: candles.length,
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
