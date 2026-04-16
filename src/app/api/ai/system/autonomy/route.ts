import { type NextRequest, NextResponse } from "next/server";
import {
  ensureAutonomyLoopStarted,
  getAutonomyStatus,
  startAutonomyLoop,
  stopAutonomyLoop,
} from "@/lib/autonomy/service";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureAutonomyLoopStarted();
  return NextResponse.json({
    data: {
      autonomy: getAutonomyStatus(),
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "start" | "stop";
    symbol?: string;
    timeframe?: Timeframe;
    intervalMs?: number;
  };

  if (body.action === "stop") {
    stopAutonomyLoop();
  } else {
    startAutonomyLoop({
      symbol: body.symbol,
      timeframe: body.timeframe,
      intervalMs: body.intervalMs,
    });
  }

  return NextResponse.json({
    data: {
      autonomy: getAutonomyStatus(),
    },
    timestamp: new Date().toISOString(),
  });
}
