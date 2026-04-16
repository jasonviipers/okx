import { type NextRequest, NextResponse } from "next/server";
import {
  dispatchAutonomyWorker,
  ensureAutonomyBootState,
  getAutonomyStatus,
} from "@/lib/autonomy/service";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAutonomyBootState();
  const result = await dispatchAutonomyWorker({ trigger: "scheduler" });

  return NextResponse.json({
    data: {
      result,
      autonomy: await getAutonomyStatus(),
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
