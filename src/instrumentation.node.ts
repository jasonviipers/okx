import { ensureAutonomyBootState } from "@/lib/autonomy/service";
import {
  info,
  initTelemetry,
  error as telemetryError,
} from "@/lib/telemetry/server";

export async function registerNodeInstrumentation() {
  try {
    await initTelemetry();
    info("instrumentation", "Node instrumentation bootstrapped");
  } catch (caughtError) {
    telemetryError("instrumentation", "telemetry init failed", {
      error: caughtError,
    });
  }

  await ensureAutonomyBootState();
}
