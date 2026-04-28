import "server-only";

import { randomUUID } from "node:crypto";
import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { type Logger, logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { env } from "@/env";
import { putObject } from "@/lib/storage/minio";

type TelemetryLevel = "debug" | "info" | "warn" | "error";
type TelemetryLabels = Record<
  string,
  string | number | boolean | null | undefined
>;
type TelemetryAttributes = Record<string, unknown>;

export interface TelemetrySpanHandle {
  traceId: string;
  spanId: string;
  setAttribute: (key: string, value: unknown) => void;
  addAttributes: (attributes: Record<string, unknown>) => void;
  log: (
    level: TelemetryLevel,
    message: string,
    attributes?: Record<string, unknown>,
  ) => void;
}

const DEFAULT_OTEL_ENDPOINT = "http://otel-collector:4317";
const DEFAULT_SERVICE_NAME = "ai-trading-swarm";
const DEFAULT_SERVICE_VERSION = "2.0.0";
const MAX_ARCHIVE_BATCH_SIZE = 50;
const ARCHIVE_FLUSH_DELAY_MS = 1_000;
const SECRET_KEY_PATTERN =
  /pass|secret|token|auth|key|cookie|signature|credential|session/i;

let sdkStartPromise: Promise<void> | null = null;
let cachedLogger: Logger | null = null;
let archiveFlushTimer: ReturnType<typeof setTimeout> | null = null;
let archiveFlushPromise: Promise<void> | null = null;
let runtimeMetricsTimer: ReturnType<typeof setInterval> | null = null;

const pendingArchiveLines: string[] = [];

const counterInstruments = new Map<string, ReturnType<typeof createCounter>>();
const gaugeInstruments = new Map<string, ReturnType<typeof createGauge>>();
const histogramInstruments = new Map<
  string,
  ReturnType<typeof createHistogram>
>();

function getServiceName() {
  return env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME;
}

function getOtelEndpoint() {
  return env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || DEFAULT_OTEL_ENDPOINT;
}

function getTelemetryArchiveBucket() {
  return env.MINIO_BUCKET_TELEMETRY?.trim() || null;
}

function getMeter() {
  return metrics.getMeter(getServiceName(), DEFAULT_SERVICE_VERSION);
}

function getTracer() {
  return trace.getTracer(getServiceName(), DEFAULT_SERVICE_VERSION);
}

function getLogger(): Logger {
  if (!cachedLogger) {
    cachedLogger = logs.getLogger(getServiceName(), DEFAULT_SERVICE_VERSION);
  }

  return cachedLogger;
}

function createCounter(name: string, help = "") {
  return getMeter().createCounter(name, {
    description: help || undefined,
  });
}

function createGauge(name: string, help = "") {
  return getMeter().createGauge(name, {
    description: help || undefined,
  });
}

function createHistogram(name: string, help = "") {
  return getMeter().createHistogram(name, {
    description: help || undefined,
  });
}

function normalizeLabels(
  labels?: TelemetryLabels,
): Record<string, string | number | boolean> {
  if (!labels) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(labels).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== null,
    ),
  );
}

function sanitizeValue(
  value: unknown,
  options?: {
    depth?: number;
    key?: string;
    visited?: WeakSet<object>;
  },
): unknown {
  const depth = options?.depth ?? 0;
  const visited = options?.visited ?? new WeakSet<object>();

  if (options?.key && SECRET_KEY_PATTERN.test(options.key)) {
    return "[REDACTED]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: "[REDACTED]",
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= 4) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) =>
      sanitizeValue(item, {
        depth: depth + 1,
        visited,
      }),
    );
  }

  if (typeof value === "object") {
    if (visited.has(value)) {
      return "[Circular]";
    }

    visited.add(value);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [
          key,
          sanitizeValue(item, {
            depth: depth + 1,
            key,
            visited,
          }),
        ]),
    );
  }

  return String(value);
}

function sanitizeAttributes(
  attributes?: TelemetryAttributes,
): TelemetryAttributes {
  if (!attributes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, sanitizeValue(value, { key })]),
  );
}

function toSpanAttributeValue(value: unknown): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function getSeverity(level: TelemetryLevel) {
  switch (level) {
    case "debug":
      return SeverityNumber.DEBUG;
    case "warn":
      return SeverityNumber.WARN;
    case "error":
      return SeverityNumber.ERROR;
    default:
      return SeverityNumber.INFO;
  }
}

function buildTelemetryArchiveKey(timestamp: string) {
  const day = timestamp.slice(0, 10);
  const hour = timestamp.slice(11, 13);

  return `events/${day}/${hour}/${timestamp.replace(/[:.]/g, "-")}-${randomUUID()}.ndjson`;
}

async function flushArchivedLogs() {
  if (archiveFlushPromise || pendingArchiveLines.length === 0) {
    return archiveFlushPromise;
  }

  const bucket = getTelemetryArchiveBucket();
  if (!bucket) {
    pendingArchiveLines.length = 0;
    return null;
  }

  const lines = pendingArchiveLines.splice(0, pendingArchiveLines.length);
  const timestamp = new Date().toISOString();
  const key = buildTelemetryArchiveKey(timestamp);
  const payload = `${lines.join("\n")}\n`;

  archiveFlushPromise = putObject(bucket, key, payload, "application/x-ndjson")
    .catch((archiveError) => {
      console.warn("Failed to archive telemetry batch to MinIO.", archiveError);
    })
    .finally(() => {
      archiveFlushPromise = null;

      if (pendingArchiveLines.length > 0) {
        void flushArchivedLogs();
      }
    });

  return archiveFlushPromise;
}

function queueArchivedLog(record: Record<string, unknown>) {
  if (!getTelemetryArchiveBucket()) {
    return;
  }

  pendingArchiveLines.push(JSON.stringify(record));

  if (pendingArchiveLines.length >= MAX_ARCHIVE_BATCH_SIZE) {
    if (archiveFlushTimer) {
      clearTimeout(archiveFlushTimer);
      archiveFlushTimer = null;
    }

    void flushArchivedLogs();
    return;
  }

  if (archiveFlushTimer) {
    return;
  }

  archiveFlushTimer = setTimeout(() => {
    archiveFlushTimer = null;
    void flushArchivedLogs();
  }, ARCHIVE_FLUSH_DELAY_MS);

  archiveFlushTimer.unref?.();
}

function emitLog(
  level: TelemetryLevel,
  source: string,
  message: string,
  attributes?: TelemetryAttributes,
) {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();
  const sanitizedAttributes = sanitizeAttributes(attributes);
  const timestamp = new Date().toISOString();
  const logAttributes = {
    source,
    ...sanitizedAttributes,
    ...(spanContext
      ? {
          "trace.id": spanContext.traceId,
          "span.id": spanContext.spanId,
        }
      : {}),
  };

  getLogger().emit({
    severityNumber: getSeverity(level),
    severityText: level.toUpperCase(),
    body: message,
    attributes: logAttributes,
  });

  queueArchivedLog({
    timestamp,
    level,
    message,
    attributes: logAttributes,
    service: getServiceName(),
  });
}

export async function registerOpenTelemetry() {
  if (sdkStartPromise) {
    return sdkStartPromise;
  }

  const endpoint = getOtelEndpoint();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": getServiceName(),
      "service.version": DEFAULT_SERVICE_VERSION,
    }),
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: endpoint,
      }),
      exportIntervalMillis: 15_000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: endpoint,
        }),
      ),
    ],
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdkStartPromise = Promise.resolve(sdk.start()).then(() => undefined);
  return sdkStartPromise;
}

function recordRuntimeMetrics() {
  const memoryUsage = process.memoryUsage();

  setGauge(
    "app_runtime_heap_used_bytes",
    "Node.js heap used in bytes.",
    memoryUsage.heapUsed,
  );
  setGauge(
    "app_runtime_heap_total_bytes",
    "Node.js heap total in bytes.",
    memoryUsage.heapTotal,
  );
  setGauge(
    "app_runtime_rss_bytes",
    "Node.js RSS memory in bytes.",
    memoryUsage.rss,
  );
  setGauge(
    "app_runtime_external_bytes",
    "Node.js external memory in bytes.",
    memoryUsage.external,
  );
  setGauge(
    "app_runtime_array_buffers_bytes",
    "Node.js array buffer memory in bytes.",
    memoryUsage.arrayBuffers,
  );
  setGauge(
    "app_runtime_uptime_seconds",
    "Node.js process uptime in seconds.",
    process.uptime(),
  );
}

export function startRuntimeMetricsCollection(intervalMs = 15_000) {
  recordRuntimeMetrics();

  if (runtimeMetricsTimer) {
    return;
  }

  runtimeMetricsTimer = setInterval(() => {
    recordRuntimeMetrics();
  }, intervalMs);
  runtimeMetricsTimer.unref?.();
}

export function debug(
  source: string,
  message: string,
  attributes?: TelemetryAttributes,
) {
  emitLog("debug", source, message, attributes);
}

export function info(
  source: string,
  message: string,
  attributes?: TelemetryAttributes,
) {
  emitLog("info", source, message, attributes);
}

export function warn(
  source: string,
  message: string,
  attributes?: TelemetryAttributes,
) {
  emitLog("warn", source, message, attributes);
}

export function error(
  source: string,
  message: string,
  attributes?: TelemetryAttributes,
) {
  emitLog("error", source, message, attributes);
}

export function incrementCounter(
  name: string,
  help: string,
  value = 1,
  labels?: TelemetryLabels,
) {
  let instrument = counterInstruments.get(name);
  if (!instrument) {
    instrument = createCounter(name, help);
    counterInstruments.set(name, instrument);
  }

  instrument.add(value, normalizeLabels(labels));
}

export function setGauge(
  name: string,
  help: string,
  value: number,
  labels?: TelemetryLabels,
) {
  let instrument = gaugeInstruments.get(name);
  if (!instrument) {
    instrument = createGauge(name, help);
    gaugeInstruments.set(name, instrument);
  }

  instrument.record(value, normalizeLabels(labels));
}

export function observeHistogram(
  name: string,
  help: string,
  value: number,
  options?: {
    labels?: TelemetryLabels;
  },
) {
  let instrument = histogramInstruments.get(name);
  if (!instrument) {
    instrument = createHistogram(name, help);
    histogramInstruments.set(name, instrument);
  }

  instrument.record(value, normalizeLabels(options?.labels));
}

export async function withTelemetrySpan<T>(
  options: {
    name: string;
    source: string;
    attributes?: Record<string, unknown>;
  },
  fn: (span: TelemetrySpanHandle) => Promise<T> | T,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(options.name, async (span) => {
    const spanContext = span.spanContext();
    const attributes = sanitizeAttributes(options.attributes);

    span.setAttributes({
      ...Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [
          key,
          toSpanAttributeValue(value),
        ]),
      ),
      "app.source": options.source,
    });

    const handle: TelemetrySpanHandle = {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      setAttribute(key, value) {
        span.setAttribute(
          key,
          toSpanAttributeValue(sanitizeValue(value, { key })),
        );
      },
      addAttributes(nextAttributes) {
        span.setAttributes(
          Object.fromEntries(
            Object.entries(sanitizeAttributes(nextAttributes)).map(
              ([key, value]) => [key, toSpanAttributeValue(value)],
            ),
          ),
        );
      },
      log(level, message, nextAttributes) {
        emitLog(level, options.source, message, nextAttributes);
      },
    };

    try {
      const result = await fn(handle);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (caughtError) {
      span.recordException(caughtError as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
      });
      emitLog("error", options.source, `${options.name} failed`, {
        error: caughtError,
        ...attributes,
      });
      throw caughtError;
    } finally {
      span.end();
    }
  });
}

function stripQueryStringFromUrl(url?: string | URL) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(String(url)).pathname;
  } catch {
    return String(url).split("?")[0];
  }
}

export async function onObservabilityRequestError(
  err: Error & { digest?: string },
  request: {
    method?: string;
    url?: string | URL;
  },
  contextPayload: Record<string, unknown> & {
    routeType?: unknown;
    routerKind?: unknown;
  },
) {
  error("next.request", "Next.js request error captured", {
    context: sanitizeAttributes({
      handler:
        typeof contextPayload.handler === "string"
          ? contextPayload.handler
          : undefined,
      route:
        typeof contextPayload.route === "string"
          ? contextPayload.route
          : undefined,
      routePath:
        typeof contextPayload.routePath === "string"
          ? contextPayload.routePath
          : undefined,
      routeType:
        typeof contextPayload.routeType === "string"
          ? contextPayload.routeType
          : undefined,
      routerKind:
        typeof contextPayload.routerKind === "string"
          ? contextPayload.routerKind
          : undefined,
    }),
    digest: err.digest,
    error: err,
    request: {
      method: request.method,
      path: stripQueryStringFromUrl(request.url),
    },
  });

  incrementCounter(
    "next_request_errors_total",
    "Total Next.js request errors captured by instrumentation.",
    1,
    {
      method: request.method,
      routeType:
        typeof contextPayload.routeType === "string"
          ? contextPayload.routeType
          : undefined,
      routerKind:
        typeof contextPayload.routerKind === "string"
          ? contextPayload.routerKind
          : undefined,
    },
  );
}
