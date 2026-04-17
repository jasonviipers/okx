import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerNodeInstrumentation } = await import(
    "./instrumentation.node"
  );
  await registerNodeInstrumentation();
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { onTelemetryRequestError } = await import("./lib/telemetry/server");
  await onTelemetryRequestError(err, request, context);
};
