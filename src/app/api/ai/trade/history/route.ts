import { NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { refreshTradeExecutionOutcomes } from "@/lib/persistence/history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const trades = await refreshTradeExecutionOutcomes(limit);

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
