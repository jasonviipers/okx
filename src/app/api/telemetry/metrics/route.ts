import { type NextRequest, NextResponse } from "next/server";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";
import { getPrometheusMetrics } from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isOperatorAuthorized(request)) {
    return getOperatorUnauthorizedResponse();
  }

  return new NextResponse(getPrometheusMetrics(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
