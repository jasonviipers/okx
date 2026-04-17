import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { Instrumentation } from "next";
import type {
  TelemetryEventRecord,
  TelemetryHistogramBucket,
  TelemetryHistogramPoint,
  TelemetryLevel,
  TelemetryMetricPoint,
  TelemetryMetricsSnapshot,
  TelemetrySpanRecord,
  TelemetrySpanStatus,
} from "@/lib/telemetry/types";
import { nowIso } from "../swarm/autoExecute";

type TelemetryLabels = Record<
  string,
  string | number | boolean | null | undefined
>;

type MetricKind = "counter" | "gauge" | "histogram";

type MetricDefinition = {
  help: string;
  kind: MetricKind;
  buckets?: number[];
};

type HistogramState = {
  count: number;
  sum: number;
  max: number;
  bucketCounts: number[];
};

type TelemetryContext = {
  traceId: string;
  spanId?: string;
};

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

const TELEMETRY_DIR = path.join(process.cwd(), ".data", "telemetry");
const EVENTS_FILE = path.join(TELEMETRY_DIR, "events.ndjson");
const SPANS_FILE = path.join(TELEMETRY_DIR, "spans.ndjson");
const TELEMETRY_FILE_MAX_BYTES = 1_048_576;
const TELEMETRY_FILE_ROTATION_COUNT = 4;
const TELEMETRY_TAIL_CHUNK_BYTES = 65_536;
const MAX_BUFFERED_EVENTS = 400;
const MAX_BUFFERED_SPANS = 400;
const DEFAULT_HISTOGRAM_BUCKETS = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
];
const SECRET_KEY_PATTERN =
  /pass|secret|token|auth|key|cookie|signature|credential|session/i;

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
const asyncTelemetryContext = new AsyncLocalStorage<TelemetryContext>();
const bufferedEvents: TelemetryEventRecord[] = [];
const bufferedSpans: TelemetrySpanRecord[] = [];
const metricDefinitions = new Map<string, MetricDefinition>();
const counterValues = new Map<string, Map<string, number>>();
const gaugeValues = new Map<string, Map<string, number>>();
const histogramValues = new Map<string, Map<string, HistogramState>>();

let telemetryBooted = false;
let telemetryPersistenceEnabled = true;
let telemetryDirReady: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function ensureTelemetryDir(): Promise<void> {
  if (!telemetryPersistenceEnabled) {
    return Promise.resolve();
  }

  if (!telemetryDirReady) {
    telemetryDirReady = mkdir(TELEMETRY_DIR, { recursive: true }).then(
      () => undefined,
    );
  }

  return telemetryDirReady;
}

async function statIfExists(target: string) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

async function renameIfExists(source: string, destination: string) {
  try {
    await rename(source, destination);
  } catch (caughtError) {
    const error = caughtError as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") {
      throw caughtError;
    }
  }
}

async function unlinkIfExists(target: string) {
  try {
    await unlink(target);
  } catch (caughtError) {
    const error = caughtError as NodeJS.ErrnoException;
    if (error.code !== "ENOENT") {
      throw caughtError;
    }
  }
}

async function rotateTelemetryFileIfNeeded(
  target: string,
  incomingBytes: number,
) {
  const fileStat = await statIfExists(target);
  if (!fileStat || fileStat.size + incomingBytes <= TELEMETRY_FILE_MAX_BYTES) {
    return;
  }

  await unlinkIfExists(`${target}.${TELEMETRY_FILE_ROTATION_COUNT}`);
  for (let index = TELEMETRY_FILE_ROTATION_COUNT - 1; index >= 1; index -= 1) {
    await renameIfExists(`${target}.${index}`, `${target}.${index + 1}`);
  }
  await renameIfExists(target, `${target}.1`);
}

function enqueueWrite(target: string, payload: string) {
  if (!telemetryPersistenceEnabled) {
    return;
  }

  const serializedPayload = `${payload}\n`;
  const payloadBytes = Buffer.byteLength(serializedPayload, "utf8");
  writeQueue = writeQueue
    .then(async () => {
      if (!telemetryPersistenceEnabled) {
        return;
      }

      await ensureTelemetryDir();
      await rotateTelemetryFileIfNeeded(target, payloadBytes);
      await appendFile(target, serializedPayload, "utf8");
    })
    .catch((error) => {
      telemetryPersistenceEnabled = false;
      telemetryDirReady = null;
      console.error("[Telemetry] Failed to persist telemetry payload.", error);
    });
}

function pushBufferedEvent(entry: TelemetryEventRecord) {
  bufferedEvents.unshift(entry);
  if (bufferedEvents.length > MAX_BUFFERED_EVENTS) {
    bufferedEvents.length = MAX_BUFFERED_EVENTS;
  }
}

function pushBufferedSpan(entry: TelemetrySpanRecord) {
  bufferedSpans.unshift(entry);
  if (bufferedSpans.length > MAX_BUFFERED_SPANS) {
    bufferedSpans.length = MAX_BUFFERED_SPANS;
  }
}

function sortObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sanitizeValue(
  value: unknown,
  options?: {
    key?: string;
    depth?: number;
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
      name: value.name,
      message: value.message,
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

    return sortObject(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          sanitizeValue(item, {
            key,
            depth: depth + 1,
            visited,
          }),
        ]),
      ),
    );
  }

  return String(value);
}

function sanitizeAttributes(
  attributes?: Record<string, unknown>,
): Record<string, unknown> {
  if (!attributes) {
    return {};
  }

  return sortObject(
    Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        key,
        sanitizeValue(value, { key }),
      ]),
    ),
  );
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

function summarizeTelemetryRequest(request: {
  method?: string;
  url?: string | URL;
}) {
  return sanitizeAttributes({
    method: request.method,
    path: stripQueryStringFromUrl(request.url),
  });
}

function summarizeTelemetryRequestContext(
  context: Record<string, unknown> & {
    routeType?: unknown;
    routerKind?: unknown;
  },
) {
  return sanitizeAttributes({
    routeType:
      typeof context.routeType === "string" ? context.routeType : undefined,
    routerKind:
      typeof context.routerKind === "string" ? context.routerKind : undefined,
    routePath:
      typeof context.routePath === "string"
        ? context.routePath
        : undefined,
    renderSource:
      typeof context.renderSource === "string"
        ? context.renderSource
        : undefined,
    route: typeof context.route === "string" ? context.route : undefined,
    handler:
      typeof context.handler === "string" ? context.handler : undefined,
  });
}

function getLabelKey(labels?: TelemetryLabels): string {
  const normalized = normalizeLabels(labels);
  return JSON.stringify(
    Object.entries(normalized).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function normalizeLabels(labels?: TelemetryLabels): Record<string, string> {
  if (!labels) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function parseLabelKey(key: string): Record<string, string> {
  try {
    return Object.fromEntries(
      JSON.parse(key) as Array<[string, string]>,
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function registerMetric(
  name: string,
  definition: MetricDefinition,
): MetricDefinition {
  const existing = metricDefinitions.get(name);
  if (existing) {
    return existing;
  }

  metricDefinitions.set(name, definition);
  return definition;
}

function updateRuntimeMetrics() {
  const memoryUsage = process.memoryUsage();
  setGauge(
    "nodejs_heap_used_bytes",
    "Node.js heap used bytes.",
    memoryUsage.heapUsed,
  );
  setGauge(
    "nodejs_heap_total_bytes",
    "Node.js heap total bytes.",
    memoryUsage.heapTotal,
  );
  setGauge("nodejs_rss_bytes", "Node.js RSS memory bytes.", memoryUsage.rss);
  setGauge(
    "nodejs_external_memory_bytes",
    "Node.js external memory bytes.",
    memoryUsage.external,
  );
  setGauge(
    "nodejs_eventloop_lag_seconds",
    "Observed mean event loop lag in seconds.",
    Number((eventLoopDelay.mean / 1_000_000_000).toFixed(6)),
  );
  setGauge(
    "nodejs_eventloop_lag_max_seconds",
    "Observed max event loop lag in seconds.",
    Number((eventLoopDelay.max / 1_000_000_000).toFixed(6)),
  );
  setGauge(
    "nodejs_uptime_seconds",
    "Node.js process uptime in seconds.",
    process.uptime(),
  );
}

function buildMetricPoints(
  source: Map<string, Map<string, number>>,
): TelemetryMetricPoint[] {
  const points: TelemetryMetricPoint[] = [];

  for (const [name, values] of source.entries()) {
    const definition = metricDefinitions.get(name);
    if (!definition) {
      continue;
    }

    for (const [labelKey, value] of values.entries()) {
      points.push({
        name,
        help: definition.help,
        labels: parseLabelKey(labelKey),
        value,
      });
    }
  }

  return points.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }

    return JSON.stringify(left.labels).localeCompare(
      JSON.stringify(right.labels),
    );
  });
}

function buildHistogramPoints(): TelemetryHistogramPoint[] {
  const points: TelemetryHistogramPoint[] = [];

  for (const [name, values] of histogramValues.entries()) {
    const definition = metricDefinitions.get(name);
    if (!definition?.buckets) {
      continue;
    }

    for (const [labelKey, state] of values.entries()) {
      const buckets: TelemetryHistogramBucket[] = definition.buckets.map(
        (bucket, index) => ({
          le: bucket,
          count: state.bucketCounts[index] ?? 0,
        }),
      );

      points.push({
        name,
        help: definition.help,
        labels: parseLabelKey(labelKey),
        count: state.count,
        sum: Number(state.sum.toFixed(6)),
        max: Number(state.max.toFixed(6)),
        buckets,
      });
    }
  }

  return points.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }

    return JSON.stringify(left.labels).localeCompare(
      JSON.stringify(right.labels),
    );
  });
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }

  const formatted = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const escaped = value
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n");
      return `${key}="${escaped}"`;
    })
    .join(",");

  return `{${formatted}}`;
}

function emitEventRecord(
  level: TelemetryLevel,
  source: string,
  message: string,
  attributes?: Record<string, unknown>,
  contextOverride?: TelemetryContext,
): TelemetryEventRecord {
  const context = contextOverride ?? asyncTelemetryContext.getStore();
  const entry: TelemetryEventRecord = {
    id: makeId("evt"),
    timestamp: nowIso(),
    level,
    source,
    message,
    traceId: context?.traceId,
    spanId: context?.spanId,
    attributes: sanitizeAttributes(attributes),
  };

  pushBufferedEvent(entry);
  enqueueWrite(EVENTS_FILE, JSON.stringify(entry));
  return entry;
}

function emitSpanRecord(entry: TelemetrySpanRecord) {
  pushBufferedSpan(entry);
  enqueueWrite(SPANS_FILE, JSON.stringify(entry));
}

function getTelemetryReadTargets(target: string) {
  return [
    target,
    ...Array.from(
      { length: TELEMETRY_FILE_ROTATION_COUNT },
      (_, index) => `${target}.${index + 1}`,
    ),
  ];
}

async function readNdjsonTailLines(target: string, limit: number) {
  if (limit <= 0) {
    return [];
  }

  try {
    const handle = await open(target, "r");
    try {
      const fileStat = await handle.stat();
      if (fileStat.size <= 0) {
        return [];
      }

      const rows: string[] = [];
      let remainder = "";
      let position = fileStat.size;

      while (position > 0 && rows.length < limit) {
        const bytesToRead = Math.min(TELEMETRY_TAIL_CHUNK_BYTES, position);
        position -= bytesToRead;

        const buffer = Buffer.allocUnsafe(bytesToRead);
        const { bytesRead } = await handle.read(
          buffer,
          0,
          bytesToRead,
          position,
        );
        const chunk = buffer.toString("utf8", 0, bytesRead);
        const combined = chunk + remainder;
        const segments = combined.split("\n");
        remainder = segments.shift() ?? "";

        for (
          let index = segments.length - 1;
          index >= 0 && rows.length < limit;
          index -= 1
        ) {
          const line = segments[index]?.trim();
          if (line) {
            rows.push(line);
          }
        }
      }

      const firstLine = remainder.trim();
      if (firstLine && rows.length < limit) {
        rows.push(firstLine);
      }

      return rows;
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

async function readNdjsonFile<T>(target: string, limit: number): Promise<T[]> {
  const rows: string[] = [];
  for (const candidate of getTelemetryReadTargets(target)) {
    if (rows.length >= limit) {
      break;
    }

    rows.push(...(await readNdjsonTailLines(candidate, limit - rows.length)));
  }

  return rows.flatMap((line) => {
    try {
      return [JSON.parse(line) as T];
    } catch {
      return [];
    }
  });
}

export async function initTelemetry() {
  try {
    await ensureTelemetryDir();
  } catch (caughtError) {
    telemetryPersistenceEnabled = false;
    telemetryDirReady = null;
    warn("telemetry", "Telemetry directory initialization failed", {
      error: caughtError,
    });
  }

  if (telemetryBooted) {
    return;
  }

  telemetryBooted = true;
  eventLoopDelay.enable();
  setGauge(
    "telemetry_initialized",
    "Whether telemetry has been initialized.",
    1,
  );
  info("telemetry", "Telemetry initialized", {
    pid: process.pid,
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
  });
}

export function debug(
  source: string,
  message: string,
  attributes?: Record<string, unknown>,
) {
  emitEventRecord("debug", source, message, attributes);
}

export function info(
  source: string,
  message: string,
  attributes?: Record<string, unknown>,
) {
  emitEventRecord("info", source, message, attributes);
}

export function warn(
  source: string,
  message: string,
  attributes?: Record<string, unknown>,
) {
  emitEventRecord("warn", source, message, attributes);
}

export function error(
  source: string,
  message: string,
  attributes?: Record<string, unknown>,
) {
  emitEventRecord("error", source, message, attributes);
}

export function incrementCounter(
  name: string,
  help: string,
  value = 1,
  labels?: TelemetryLabels,
) {
  registerMetric(name, { kind: "counter", help });
  const labelKey = getLabelKey(labels);
  const current = counterValues.get(name) ?? new Map<string, number>();
  current.set(labelKey, (current.get(labelKey) ?? 0) + value);
  counterValues.set(name, current);
}

export function setGauge(
  name: string,
  help: string,
  value: number,
  labels?: TelemetryLabels,
) {
  registerMetric(name, { kind: "gauge", help });
  const labelKey = getLabelKey(labels);
  const current = gaugeValues.get(name) ?? new Map<string, number>();
  current.set(labelKey, value);
  gaugeValues.set(name, current);
}

export function observeHistogram(
  name: string,
  help: string,
  value: number,
  options?: {
    labels?: TelemetryLabels;
    buckets?: number[];
  },
) {
  const buckets = [...(options?.buckets ?? DEFAULT_HISTOGRAM_BUCKETS)].sort(
    (left, right) => left - right,
  );
  registerMetric(name, { kind: "histogram", help, buckets });
  const labelKey = getLabelKey(options?.labels);
  const current =
    histogramValues.get(name) ?? new Map<string, HistogramState>();
  const state =
    current.get(labelKey) ??
    ({
      count: 0,
      sum: 0,
      max: 0,
      bucketCounts: buckets.map(() => 0),
    } satisfies HistogramState);

  state.count += 1;
  state.sum += value;
  state.max = Math.max(state.max, value);
  for (const [index, bucket] of buckets.entries()) {
    if (value <= bucket) {
      state.bucketCounts[index] += 1;
    }
  }

  current.set(labelKey, state);
  histogramValues.set(name, current);
}

export async function withTelemetrySpan<T>(
  options: {
    name: string;
    source: string;
    attributes?: Record<string, unknown>;
  },
  fn: (span: TelemetrySpanHandle) => Promise<T> | T,
): Promise<T> {
  void ensureTelemetryDir().catch(() => undefined);

  const parent = asyncTelemetryContext.getStore();
  const traceId = parent?.traceId ?? makeId("trace");
  const spanId = makeId("span");
  const startedAt = nowIso();
  const startedAtMs = performance.now();
  const attributes = sanitizeAttributes(options.attributes);
  const context: TelemetryContext = {
    traceId,
    spanId,
  };

  const span: TelemetrySpanHandle = {
    traceId,
    spanId,
    setAttribute(key, value) {
      attributes[key] = sanitizeValue(value, { key });
    },
    addAttributes(nextAttributes) {
      Object.assign(attributes, sanitizeAttributes(nextAttributes));
    },
    log(level, message, nextAttributes) {
      emitEventRecord(level, options.source, message, nextAttributes, context);
    },
  };

  const finalize = (status: TelemetrySpanStatus, message?: string) => {
    const entry: TelemetrySpanRecord = {
      id: spanId,
      traceId,
      parentSpanId: parent?.spanId,
      name: options.name,
      source: options.source,
      startedAt,
      endedAt: nowIso(),
      durationMs: Number((performance.now() - startedAtMs).toFixed(3)),
      status,
      attributes,
      error: message,
    };

    emitSpanRecord(entry);
    observeHistogram(
      "telemetry_span_duration_ms",
      "Duration of application telemetry spans in milliseconds.",
      entry.durationMs,
      {
        labels: {
          source: options.source,
          name: options.name,
          status,
        },
      },
    );
  };

  return asyncTelemetryContext.run(context, async () => {
    try {
      const result = await fn(span);
      finalize("ok");
      return result;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      attributes.error = message;
      emitEventRecord(
        "error",
        options.source,
        `${options.name} failed`,
        {
          error: caughtError,
          ...attributes,
        },
        context,
      );
      finalize("error", message);
      throw caughtError;
    }
  });
}

export function getTelemetryMetricsSnapshot(): TelemetryMetricsSnapshot {
  updateRuntimeMetrics();

  return {
    counters: buildMetricPoints(counterValues),
    gauges: buildMetricPoints(gaugeValues),
    histograms: buildHistogramPoints(),
  };
}

export function getPrometheusMetrics(): string {
  const snapshot = getTelemetryMetricsSnapshot();
  const chunks: string[] = [];
  const emitted = new Set<string>();

  for (const point of [...snapshot.counters, ...snapshot.gauges]) {
    const definition = metricDefinitions.get(point.name);
    if (!definition) {
      continue;
    }

    if (!emitted.has(point.name)) {
      emitted.add(point.name);
      chunks.push(`# HELP ${point.name} ${definition.help}`);
      chunks.push(`# TYPE ${point.name} ${definition.kind}`);
    }

    chunks.push(`${point.name}${formatLabels(point.labels)} ${point.value}`);
  }

  for (const point of snapshot.histograms) {
    if (!emitted.has(point.name)) {
      emitted.add(point.name);
      chunks.push(`# HELP ${point.name} ${point.help}`);
      chunks.push(`# TYPE ${point.name} histogram`);
    }

    for (const bucket of point.buckets) {
      chunks.push(
        `${point.name}_bucket${formatLabels({
          ...point.labels,
          le: String(bucket.le),
        })} ${bucket.count}`,
      );
    }

    chunks.push(
      `${point.name}_bucket${formatLabels({
        ...point.labels,
        le: "+Inf",
      })} ${point.count}`,
    );
    chunks.push(`${point.name}_sum${formatLabels(point.labels)} ${point.sum}`);
    chunks.push(
      `${point.name}_count${formatLabels(point.labels)} ${point.count}`,
    );
  }

  return `${chunks.join("\n")}\n`;
}

export async function getRecentTelemetryEvents(limit = 100) {
  const persisted = await readNdjsonFile<TelemetryEventRecord>(
    EVENTS_FILE,
    limit,
  );
  if (persisted.length > 0) {
    return persisted;
  }

  return bufferedEvents.slice(0, limit);
}

export async function getRecentTelemetrySpans(limit = 100) {
  const persisted = await readNdjsonFile<TelemetrySpanRecord>(
    SPANS_FILE,
    limit,
  );
  if (persisted.length > 0) {
    return persisted;
  }

  return bufferedSpans.slice(0, limit);
}

export const onTelemetryRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const requestError = err as Error & { digest?: string };
  error("next.request", "Next.js request error captured", {
    digest: requestError.digest,
    error: requestError,
    request: summarizeTelemetryRequest(request),
    context: summarizeTelemetryRequestContext(context),
  });
  incrementCounter(
    "next_request_errors_total",
    "Total Next.js request errors captured by instrumentation.",
    1,
    {
      routeType: context.routeType,
      routerKind: context.routerKind,
      method: request.method,
    },
  );
};
