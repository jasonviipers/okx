import { NextResponse } from "next/server";
import { getOpenTelemetryPrometheusMetrics } from "@/lib/telemetry";
import { getPrometheusMetrics } from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [appMetrics, otelMetrics] = await Promise.all([
    Promise.resolve(getPrometheusMetrics()),
    getOpenTelemetryPrometheusMetrics(),
  ]);

  const payload = [appMetrics.trim(), otelMetrics.trim()]
    .filter((section) => section.length > 0)
    .join("\n\n");

  return new NextResponse(`${payload}\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
