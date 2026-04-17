export type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetrySpanStatus = "ok" | "error";

export interface TelemetryEventRecord {
  id: string;
  timestamp: string;
  level: TelemetryLevel;
  source: string;
  message: string;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, unknown>;
}

export interface TelemetrySpanRecord {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  source: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: TelemetrySpanStatus;
  attributes: Record<string, unknown>;
  error?: string;
}

export interface TelemetryMetricPoint {
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

export interface TelemetryHistogramBucket {
  le: number;
  count: number;
}

export interface TelemetryHistogramPoint {
  name: string;
  help: string;
  labels: Record<string, string>;
  count: number;
  sum: number;
  max: number;
  buckets: TelemetryHistogramBucket[];
}

export interface TelemetryMetricsSnapshot {
  counters: TelemetryMetricPoint[];
  gauges: TelemetryMetricPoint[];
  histograms: TelemetryHistogramPoint[];
}
