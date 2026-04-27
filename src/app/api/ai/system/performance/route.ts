import { type NextRequest, NextResponse } from "next/server";
import { buildTradingPerformanceAudit } from "@/lib/performance/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const regime = searchParams.get("regime") ?? undefined;
  const performance = await buildTradingPerformanceAudit(regime);

  return NextResponse.json({
    data: {
      ...performance,
      summary: performance.strategyBreakdown,
    },
    timestamp: new Date().toISOString(),
  });
}
