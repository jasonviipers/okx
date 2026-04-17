"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  TelemetryEventRecord,
  TelemetryMetricsSnapshot,
  TelemetrySpanRecord,
} from "@/lib/telemetry/types";
import { cn } from "@/lib/utils";
import type { RuntimeStatus } from "@/types/api";
import type {
  StoredExecutionIntent,
  StoredHistoryEntry,
} from "@/types/history";

type TelemetrySummaryPayload = {
  runtime: RuntimeStatus;
  metrics: TelemetryMetricsSnapshot;
  logs: TelemetryEventRecord[];
  spans: TelemetrySpanRecord[];
  executionIntents: StoredExecutionIntent[];
  history: StoredHistoryEntry[];
};

function formatTimestamp(value?: string) {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function metricTotal(
  metrics: TelemetryMetricsSnapshot | null,
  name: string,
  filters?: Record<string, string>,
) {
  if (!metrics) {
    return 0;
  }

  const matches = (labels: Record<string, string>) =>
    Object.entries(filters ?? {}).every(
      ([key, value]) => labels[key] === value,
    );

  return [...metrics.counters, ...metrics.gauges]
    .filter((point) => point.name === name && matches(point.labels))
    .reduce((sum, point) => sum + point.value, 0);
}

function levelColor(level: TelemetryEventRecord["level"]) {
  switch (level) {
    case "error":
      return "text-terminal-red";
    case "warn":
      return "text-terminal-amber";
    case "info":
      return "text-terminal-green";
    default:
      return "text-terminal-dim";
  }
}

function spanStatusColor(status: TelemetrySpanRecord["status"]) {
  return status === "error" ? "text-terminal-red" : "text-terminal-green";
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function TelemetryStatCard(props: {
  title: string;
  value: string;
  detail: string;
  accent?: "green" | "amber" | "red" | "cyan";
}) {
  const accentClass =
    props.accent === "red"
      ? "text-terminal-red"
      : props.accent === "amber"
        ? "text-terminal-amber"
        : props.accent === "cyan"
          ? "text-terminal-cyan"
          : "text-terminal-green";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 py-3">
        <div className={cn("text-xl font-semibold", accentClass)}>
          {props.value}
        </div>
        <div className="mt-1 text-[0.625rem] text-terminal-dim">
          {props.detail}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TelemetryPage() {
  const [payload, setPayload] = useState<TelemetrySummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [operatorToken, setOperatorToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem(
      "telemetry.operator_token",
    );
    if (storedToken) {
      setOperatorToken(storedToken);
    }
    setTokenReady(true);
  }, []);

  useEffect(() => {
    if (!tokenReady) {
      return;
    }

    const normalizedToken = operatorToken.trim();
    if (normalizedToken) {
      window.sessionStorage.setItem(
        "telemetry.operator_token",
        normalizedToken,
      );
      startTransition(() => {
        setError(null);
        setLoading(true);
      });
      return;
    }

    window.sessionStorage.removeItem("telemetry.operator_token");
    startTransition(() => {
      setPayload(null);
      setLastUpdated(null);
      setLoading(false);
      setError("Enter the operator bearer token to load telemetry.");
    });
  }, [operatorToken, tokenReady]);

  const refresh = useEffectEvent(async () => {
    const normalizedToken = operatorToken.trim();
    if (!normalizedToken) {
      return;
    }

    try {
      const response = await fetch(
        "/api/telemetry/summary?logs=80&traces=80&intents=20&history=20",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${normalizedToken}`,
          },
        },
      );
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Telemetry API unauthorized. Verify the operator bearer token.",
          );
        }

        throw new Error(
          `Telemetry request failed with status ${response.status}`,
        );
      }

      const next = (await response.json()) as {
        data: TelemetrySummaryPayload;
        timestamp: string;
      };

      startTransition(() => {
        setPayload(next.data);
        setLastUpdated(next.timestamp);
        setError(null);
        setLoading(false);
      });
    } catch (caughtError) {
      startTransition(() => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load telemetry",
        );
        setLoading(false);
      });
    }
  });

  const openMetrics = useEffectEvent(async () => {
    const normalizedToken = operatorToken.trim();
    if (!normalizedToken) {
      startTransition(() => {
        setError("Enter the operator bearer token before opening metrics.");
      });
      return;
    }

    try {
      const response = await fetch("/api/telemetry/metrics", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${normalizedToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(
          `Metrics request failed with status ${response.status}`,
        );
      }

      const metricsText = await response.text();
      const blobUrl = URL.createObjectURL(
        new Blob([metricsText], { type: "text/plain;charset=utf-8" }),
      );
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (caughtError) {
      startTransition(() => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load metrics",
        );
      });
    }
  });

  useEffect(() => {
    let timer: number | undefined;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const handleVisibilityChange = () => {
      clearTimer();
      if (
        !tokenReady ||
        document.visibilityState !== "visible" ||
        operatorToken.trim().length === 0
      ) {
        return;
      }

      void refresh();
      timer = window.setInterval(() => {
        void refresh();
      }, 5_000);
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
  }, [operatorToken, tokenReady]);

  const runtime = payload?.runtime ?? null;
  const metrics = payload?.metrics ?? null;
  const logs = payload?.logs ?? [];
  const spans = payload?.spans ?? [];
  const executionIntents = payload?.executionIntents ?? [];

  return (
    <main className="min-h-screen bg-background p-3 font-mono text-foreground md:p-4">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <div className="flex flex-col gap-2 border border-border bg-card p-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[0.625rem] uppercase tracking-[0.25em] text-terminal-cyan">
              Local Telemetry
            </div>
            <h1 className="text-xl font-semibold text-primary">
              Autonomous Trading Trace Console
            </h1>
            <p className="mt-1 text-[0.6875rem] text-terminal-dim">
              Last updated{" "}
              {lastUpdated ? formatTimestamp(lastUpdated) : "loading"}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-[0.625rem] md:items-end">
            <label className="flex items-center gap-2">
              <span className="text-terminal-dim">Operator Token</span>
              <input
                type="password"
                value={operatorToken}
                onChange={(event) => setOperatorToken(event.target.value)}
                placeholder="Bearer token"
                className="w-56 border border-border bg-background px-2 py-1 text-terminal-cyan outline-none placeholder:text-terminal-dim"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openMetrics()}
                className="border border-border px-2 py-1 text-terminal-cyan hover:bg-secondary"
              >
                /metrics
              </button>
              <Link
                href="/"
                className="border border-border px-2 py-1 text-terminal-green hover:bg-secondary"
              >
                Back To Dashboard
              </Link>
            </div>
          </div>
        </div>

        {!operatorToken.trim() && (
          <div className="border border-border bg-card px-3 py-2 text-[0.6875rem] text-terminal-dim">
            Telemetry endpoints are operator-protected. Use the bearer token
            from `TELEMETRY_TOKEN` or `CRON_SECRET`.
          </div>
        )}

        {error && (
          <div className="border border-terminal-red/40 bg-terminal-red/5 px-3 py-2 text-[0.6875rem] text-terminal-red">
            {error}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TelemetryStatCard
            title="Autonomy"
            value={
              runtime?.autonomy.running
                ? runtime.autonomy.inFlight
                  ? "IN FLIGHT"
                  : "RUNNING"
                : "IDLE"
            }
            detail={
              runtime
                ? `${runtime.autonomy.symbol} ${runtime.autonomy.timeframe} | last run ${formatTimestamp(runtime.autonomy.lastRunAt)}`
                : loading
                  ? "Loading autonomy status"
                  : "No autonomy data"
            }
            accent={
              runtime?.autonomy.lastExecutionStatus === "error"
                ? "red"
                : runtime?.autonomy.running
                  ? "green"
                  : "amber"
            }
          />
          <TelemetryStatCard
            title="Market Data"
            value={
              runtime?.marketData.realtime
                ? "REALTIME"
                : runtime?.marketData.available
                  ? "DEGRADED"
                  : "OFFLINE"
            }
            detail={
              runtime
                ? `${runtime.marketData.symbol ?? "n/a"} | ${runtime.marketData.connectionState} | ${runtime.marketData.detail}`
                : "Loading market data"
            }
            accent={
              runtime?.marketData.realtime
                ? "green"
                : runtime?.marketData.available
                  ? "amber"
                  : "red"
            }
          />
          <TelemetryStatCard
            title="Worker Runs"
            value={String(metricTotal(metrics, "autonomy_worker_runs_total"))}
            detail={`${metricTotal(metrics, "autonomy_worker_skips_total")} skips | ${metricTotal(metrics, "autonomy_worker_errors_total")} worker errors`}
            accent="cyan"
          />
          <TelemetryStatCard
            title="Executions"
            value={String(
              metricTotal(metrics, "auto_execution_results_total", {
                status: "success",
              }),
            )}
            detail={`${metricTotal(metrics, "auto_execution_results_total", {
              status: "hold",
            })} holds | ${metricTotal(metrics, "auto_execution_results_total", {
              status: "error",
            })} errors`}
            accent="green"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
          <Card size="sm" className="min-h-[320px]">
            <CardHeader>
              <CardTitle>Recent Execution Intents</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              {executionIntents.length === 0 ? (
                <div className="px-3 py-4 text-[0.6875rem] text-terminal-dim">
                  No execution intents have been recorded yet.
                </div>
              ) : (
                executionIntents.map((intent) => (
                  <div
                    key={intent.id}
                    className="border-b border-border/40 px-3 py-2 text-[0.625rem]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-terminal-cyan">
                        {intent.symbol}
                      </span>
                      <span
                        className={cn(
                          "border px-1",
                          intent.status === "success"
                            ? "border-terminal-green/40 text-terminal-green"
                            : intent.status === "hold"
                              ? "border-terminal-amber/40 text-terminal-amber"
                              : intent.status === "error"
                                ? "border-terminal-red/40 text-terminal-red"
                                : "border-border text-terminal-dim",
                        )}
                      >
                        {intent.status.toUpperCase()}
                      </span>
                      <span>{intent.decision}</span>
                      <span className="text-terminal-dim">
                        confidence {intent.confidence}
                      </span>
                      <span className="text-terminal-dim">
                        updated {formatTimestamp(intent.updatedAt)}
                      </span>
                    </div>
                    {intent.reason && (
                      <div className="mt-1 text-terminal-dim">
                        {intent.reason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card size="sm" className="min-h-[320px]">
            <CardHeader>
              <CardTitle>Current Autonomy Blockers</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              {!runtime ? (
                <div className="px-3 py-4 text-[0.6875rem] text-terminal-dim">
                  Loading blocker snapshot...
                </div>
              ) : runtime.autonomy.lastRejectedReasons &&
                runtime.autonomy.lastRejectedReasons.length > 0 ? (
                runtime.autonomy.lastRejectedReasons.map((reason, index) => (
                  <div
                    key={`${reason.layer}-${reason.code}-${index}`}
                    className="border-b border-border/40 px-3 py-2 text-[0.625rem]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-terminal-amber">
                        {reason.layer}
                      </span>
                      <span className="text-foreground">{reason.summary}</span>
                    </div>
                    {reason.detail && (
                      <div className="mt-1 text-terminal-dim">
                        {reason.detail}
                      </div>
                    )}
                    {reason.metrics && (
                      <div className="mt-1 truncate text-terminal-cyan">
                        {prettyJson(reason.metrics)}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-[0.6875rem] text-terminal-dim">
                  No persisted rejection reasons yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <Card size="sm" className="min-h-[420px]">
            <CardHeader>
              <CardTitle>Recent Spans</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              {spans.length === 0 ? (
                <div className="px-3 py-4 text-[0.6875rem] text-terminal-dim">
                  No spans captured yet.
                </div>
              ) : (
                spans.map((span) => (
                  <div
                    key={`${span.traceId}-${span.id}`}
                    className="border-b border-border/40 px-3 py-2 text-[0.625rem]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={spanStatusColor(span.status)}>
                        {span.status.toUpperCase()}
                      </span>
                      <span className="text-terminal-cyan">{span.name}</span>
                      <span>{span.source}</span>
                      <span className="text-terminal-dim">
                        {span.durationMs.toFixed(1)} ms
                      </span>
                    </div>
                    <div className="mt-1 text-terminal-dim">
                      {formatTimestamp(span.startedAt)} | trace{" "}
                      {span.traceId.slice(0, 16)}
                    </div>
                    {Object.keys(span.attributes).length > 0 && (
                      <div className="mt-1 truncate text-terminal-green">
                        {prettyJson(span.attributes)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card size="sm" className="min-h-[420px]">
            <CardHeader>
              <CardTitle>Recent Logs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              {logs.length === 0 ? (
                <div className="px-3 py-4 text-[0.6875rem] text-terminal-dim">
                  No telemetry logs captured yet.
                </div>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-border/40 px-3 py-2 text-[0.625rem]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={levelColor(entry.level)}>
                        {entry.level.toUpperCase()}
                      </span>
                      <span className="text-terminal-cyan">{entry.source}</span>
                      <span>{entry.message}</span>
                    </div>
                    <div className="mt-1 text-terminal-dim">
                      {formatTimestamp(entry.timestamp)}
                      {entry.traceId
                        ? ` | trace ${entry.traceId.slice(0, 16)}`
                        : ""}
                    </div>
                    {entry.attributes &&
                      Object.keys(entry.attributes).length > 0 && (
                        <div className="mt-1 truncate text-terminal-green">
                          {prettyJson(entry.attributes)}
                        </div>
                      )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
