import { ensureAutonomyBootState } from "@/lib/autonomy/service";
import {
  info,
  registerOpenTelemetry,
  startRuntimeMetricsCollection,
  error as telemetryError,
} from "@/lib/observability/telemetry";
import { ensurePositionMonitorBootState } from "@/lib/swarm/position-monitor";

export async function registerNodeInstrumentation() {
  try {
    await registerOpenTelemetry();
    startRuntimeMetricsCollection();
    info("instrumentation", "Node instrumentation bootstrapped");
  } catch (caughtError) {
    telemetryError("instrumentation", "telemetry init failed", {
      error: caughtError,
    });
  }

  await ensureAutonomyBootState();
  ensurePositionMonitorBootState();
}
