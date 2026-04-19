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

  const { onObservabilityRequestError } = await import(
    "./lib/observability/telemetry"
  );
  await onObservabilityRequestError(
    err as Error & { digest?: string },
    request,
    context,
  );
};
