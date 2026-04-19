import Link from "next/link";

export default function TelemetryPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 border border-border bg-card p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-terminal-cyan">
            Observability
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-primary">
            AI Trading Swarm Console
          </h1>
          <p className="mt-2 text-sm text-terminal-dim">
            The legacy in-app telemetry dashboard has been replaced by the
            Docker observability stack.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/grafana/"
            className="border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            Open Grafana
          </Link>
          <Link
            href="/jaeger/"
            className="border border-border px-4 py-3 text-sm hover:bg-secondary"
          >
            Open Jaeger
          </Link>
        </div>

        <p className="text-xs text-terminal-dim">
          MinIO console remains available on port <code>9001</code> for operator
          bootstrap and storage inspection.
        </p>
      </div>
    </main>
  );
}
