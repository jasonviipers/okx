import { ensureAutonomyBootState } from "@/lib/autonomy/service";
import {
  error as telemetryError,
  info,
  registerOpenTelemetry,
} from "@/lib/observability/telemetry";
import { ensurePositionMonitorBootState } from "@/lib/swarm/position-monitor";

export async function registerNodeInstrumentation() {
  try {
    await registerOpenTelemetry();
    info("instrumentation", "Node instrumentation bootstrapped");
  } catch (caughtError) {
    telemetryError("instrumentation", "telemetry init failed", {
      error: caughtError,
    });
  }

  await ensureAutonomyBootState();
  ensurePositionMonitorBootState();
}
