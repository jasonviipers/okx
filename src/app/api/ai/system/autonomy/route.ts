import { after, type NextRequest, NextResponse } from "next/server";
import {
  dispatchAutonomyWorker,
  ensureAutonomyBootState,
  getAutonomyStatus,
  maybeDispatchDueAutonomyRun,
  startAutonomyLoop,
  stopAutonomyLoop,
} from "@/lib/autonomy/service";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureAutonomyBootState();
  after(async () => {
    await maybeDispatchDueAutonomyRun();
  });

  return NextResponse.json({
    data: {
      autonomy: await getAutonomyStatus(),
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
    await stopAutonomyLoop();
  } else {
    await startAutonomyLoop({
      symbol: body.symbol,
      timeframe: body.timeframe,
      intervalMs: body.intervalMs,
    });
    after(async () => {
      await dispatchAutonomyWorker({ force: true, trigger: "manual_start" });
    });
  }

  return NextResponse.json({
    data: {
      autonomy: await getAutonomyStatus(),
    },
    timestamp: new Date().toISOString(),
  });
}
