import { NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { getHistory } from "@/lib/persistence/history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const entries = await getHistory(limit);
  const trades = entries.filter((entry) => entry.type === "trade_execution");

  return NextResponse.json({
    data: {
      entries: trades,
      count: trades.length,
    },
    sourceHealth: {
      history: makeSourceHealth("local_store"),
    },
    timestamp: new Date().toISOString(),
  });
}
