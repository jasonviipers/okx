import { type NextRequest, NextResponse } from "next/server";
import { getTicker } from "@/lib/okx/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required parameter: symbol" },
        { status: 400 },
      );
    }

    const ticker = await getTicker(symbol);

    return NextResponse.json({
      ticker,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/market/ticker error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
