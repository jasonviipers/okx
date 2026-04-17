import { type NextRequest, NextResponse } from "next/server";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";
import { getRecentTelemetryEvents } from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

function parseLimit(request: NextRequest, fallback: number) {
  const raw = request.nextUrl.searchParams.get("limit");
  if (raw === null || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(500, Math.trunc(value)));
}

export async function GET(request: NextRequest) {
  if (!isOperatorAuthorized(request)) {
    return getOperatorUnauthorizedResponse();
  }

  const limit = parseLimit(request, 100);

  return NextResponse.json(
    {
      data: {
        entries: await getRecentTelemetryEvents(limit),
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
