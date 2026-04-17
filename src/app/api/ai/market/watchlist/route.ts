import { type NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market-data/service";
import { makeSourceHealth } from "@/lib/observability/source-health";
import type { Timeframe } from "@/types/market";

const DEFAULT_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "DOGE-USDT",
  "ADA-USDT",
  "AVAX-USDT",
  "DOT-USDT",
  "LINK-USDT",
  "POL-USDT",
];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = (searchParams.get("timeframe") as Timeframe) || "1H";
    const symbols = (searchParams.get("symbols")?.split(",") ?? DEFAULT_SYMBOLS)
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);

    const settled = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const snapshot = await getMarketSnapshot(symbol, timeframe);
        return {
          symbol,
          ticker: snapshot.context.ticker,
          status: snapshot.status,
        };
      }),
    );

    const items = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const warnings = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            `${symbols[index]}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          ]
        : [],
    );

    return NextResponse.json({
      data: {
        items,
        count: items.length,
        timeframe,
      },
      sourceHealth: {
        watchlist: makeSourceHealth(warnings.length > 0 ? "computed" : "okx", {
          warning: warnings[0],
          timestamp: new Date().toISOString(),
        }),
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] /api/market/watchlist error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
