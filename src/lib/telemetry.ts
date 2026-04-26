import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { env } from "@/env";

const OTEL_PROMETHEUS_PORT = 9464;
const OTEL_PROMETHEUS_ENDPOINT = `http://127.0.0.1:${OTEL_PROMETHEUS_PORT}/metrics`;

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? "platform-app",
  }),
  traceExporter: new OTLPTraceExporter({
    url: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector:4317",
  }),
  metricReader: new PrometheusExporter({
    host: "0.0.0.0",
    port: OTEL_PROMETHEUS_PORT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

let telemetryStarted = false;

export async function startOpenTelemetry() {
  if (telemetryStarted) {
    return;
  }

  telemetryStarted = true;
  await Promise.resolve(sdk.start());
  process.once("SIGTERM", () => {
    void sdk.shutdown();
  });
}

export async function getOpenTelemetryPrometheusMetrics() {
  try {
    const response = await fetch(OTEL_PROMETHEUS_ENDPOINT, {
      cache: "no-store",
    });

    if (!response.ok) {
      return "";
    }

    return await response.text();
  } catch {
    return "";
  }
}

export default sdk;
