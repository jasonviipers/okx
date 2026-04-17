import { type NextRequest, NextResponse } from "next/server";
import { getExecutionIntents } from "@/lib/persistence/execution-intents";
import { getHistory } from "@/lib/persistence/history";
import { getRuntimeStatus } from "@/lib/runtime-status";
import {
  getOperatorUnauthorizedResponse,
  isOperatorAuthorized,
} from "@/lib/telemetry/auth";
import {
  getRecentTelemetryEvents,
  getRecentTelemetrySpans,
  getTelemetryMetricsSnapshot,
} from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

function parseLimit(request: NextRequest, key: string, fallback: number) {
  const raw = request.nextUrl.searchParams.get(key);
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

  const logLimit = parseLimit(request, "logs", 80);
  const traceLimit = parseLimit(request, "traces", 80);
  const intentLimit = parseLimit(request, "intents", 20);
  const historyLimit = parseLimit(request, "history", 20);

  const [runtime, metrics, logs, spans, executionIntents, history] =
    await Promise.all([
      getRuntimeStatus(),
      Promise.resolve(getTelemetryMetricsSnapshot()),
      getRecentTelemetryEvents(logLimit),
      getRecentTelemetrySpans(traceLimit),
      getExecutionIntents(intentLimit),
      getHistory(historyLimit),
    ]);

  return NextResponse.json(
    {
      data: {
        runtime,
        metrics,
        logs,
        spans,
        executionIntents,
        history,
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
