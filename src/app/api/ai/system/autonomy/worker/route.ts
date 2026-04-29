import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import {
  ensureAutonomyBootState,
  getAutonomyStatus,
} from "@/lib/autonomy/service";
import { ensureAutonomyWorkflowRun } from "@/lib/autonomy/workflow-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAutonomyBootState();
  const result = await ensureAutonomyWorkflowRun("scheduler");

  return NextResponse.json({
    data: {
      result,
      autonomy: await getAutonomyStatus(),
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return GET(req);
}
