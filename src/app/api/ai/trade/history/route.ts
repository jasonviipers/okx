import { NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import {
  buildTradePerformanceSnapshot,
  refreshTradeExecutionOutcomes,
} from "@/lib/persistence/history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const [trades, performance] = await Promise.all([
    refreshTradeExecutionOutcomes(limit),
    buildTradePerformanceSnapshot(),
  ]);

  return NextResponse.json({
    data: {
      entries: trades,
      count: trades.length,
      performance,
    },
    sourceHealth: {
      history: makeSourceHealth("local_store"),
    },
    timestamp: new Date().toISOString(),
  });
}
