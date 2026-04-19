import { type NextRequest, NextResponse } from "next/server";
import { buildStrategyPerformanceSummary } from "@/lib/persistence/history";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isOperatorAuthorized(req)) {
    return getOperatorUnauthorizedResponse();
  }

  const { searchParams } = new URL(req.url);
  const regime = searchParams.get("regime") ?? undefined;
  const summary = await buildStrategyPerformanceSummary(regime);

  return NextResponse.json({
    data: summary,
    timestamp: new Date().toISOString(),
  });
}
