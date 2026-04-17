import { NextResponse } from "next/server";
import { makeSourceHealth } from "@/lib/observability/source-health";
import { getExecutionIntents } from "@/lib/persistence/execution-intents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const entries = await getExecutionIntents(limit);

  return NextResponse.json({
    data: {
      entries,
      count: entries.length,
    },
    sourceHealth: {
      intents: makeSourceHealth("local_store"),
    },
    timestamp: new Date().toISOString(),
  });
}
