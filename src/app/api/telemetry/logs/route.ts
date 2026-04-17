import { type NextRequest, NextResponse } from "next/server";
import { getRecentTelemetryEvents } from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

function parseLimit(request: NextRequest, fallback: number) {
  const value = Number(request.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(500, Math.trunc(value)));
}

export async function GET(request: NextRequest) {
  const limit = parseLimit(request, 100);

  return NextResponse.json({
    data: {
      entries: await getRecentTelemetryEvents(limit),
    },
    timestamp: new Date().toISOString(),
  });
}
