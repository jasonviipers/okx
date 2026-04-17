import { ensureAutonomyBootState } from "@/lib/autonomy/service";
import { info, initTelemetry } from "@/lib/telemetry/server";

export async function registerNodeInstrumentation() {
  await initTelemetry();
  info("instrumentation", "Node instrumentation bootstrapped");
  await ensureAutonomyBootState();
}
