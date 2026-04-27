"use client";

import { useTradingPerformanceAudit } from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";

function formatUsd(value: number | null) {
  if (value === null) {
    return "--";
  }

  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatPct(value: number | null) {
  if (value === null) {
    return "--";
  }

  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatAge(hours: number | null) {
  if (hours === null) {
    return "--";
  }

  if (hours >= 48) {
    return `${(hours / 24).toFixed(1)}d`;
  }

  return `${hours.toFixed(1)}h`;
}

function formatDays(days: number | null) {
  if (days === null) {
    return "--";
  }

  return `${days.toFixed(1)}d`;
}

function stateTone(state: string) {
  switch (state) {
    case "active":
      return "text-terminal-green border-terminal-green/30";
    case "flat":
      return "text-terminal-amber border-terminal-amber/30";
    case "blocked":
      return "text-terminal-red border-terminal-red/30";
    case "disabled":
      return "text-terminal-dim border-border";
    default:
      return "text-terminal-cyan border-terminal-cyan/30";
  }
}

export function PerformanceAuditPanel() {
  const performance = useTradingPerformanceAudit();
  const audit = performance.data?.audit;
  const breakdown = performance.data?.strategyBreakdown ?? [];
  const autonomyLabel = audit
    ? audit.autonomyRunning
      ? "autonomy running"
      : audit.autonomyConfigured
        ? "autonomy idle"
        : "autonomy disabled"
    : "autonomy unknown";

  if (performance.error) {
    return (
      <div className="px-2 py-3 text-[0.625rem] text-terminal-red">
        {performance.error}
      </div>
    );
  }

  if (performance.loading && !audit) {
    return (
      <div className="px-2 py-3 text-[0.625rem] text-terminal-dim">
        Building trading audit...
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="px-2 py-3 text-[0.625rem] text-terminal-dim">
        No audit data available yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col text-[0.5625rem] font-mono">
      <div className="border-b border-border/40 px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "border px-1 uppercase tracking-wide",
                stateTone(audit.state),
              )}
            >
              {audit.state}
            </span>
            <span className="text-terminal-dim">{audit.accountMode}</span>
            <span
              className={cn(
                audit.autonomyRunning
                  ? "text-terminal-green"
                  : "text-terminal-dim",
              )}
            >
              {autonomyLabel}
            </span>
          </div>
          {performance.refreshing && (
            <span className="text-terminal-dim">syncing</span>
          )}
        </div>
        <div className="mt-1 text-[0.625rem] text-foreground">
          {audit.headline}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border/40 bg-border">
        <div className="bg-background px-2 py-2">
          <div className="text-terminal-dim">Equity</div>
          <div className="mt-1 text-[0.6875rem] text-foreground">
            {formatUsd(audit.currentEquityUsd)}
          </div>
          <div className="text-terminal-dim">
            {audit.equitySource === "account"
              ? `Cash ${formatUsd(audit.cashAvailableUsd)}`
              : `Budget ${formatUsd(audit.referenceCapitalUsd)}`}
          </div>
        </div>
        <div className="bg-background px-2 py-2">
          <div className="text-terminal-dim">Net PnL</div>
          <div
            className={cn(
              "mt-1 text-[0.6875rem]",
              audit.netPnlUsd > 0
                ? "text-terminal-green"
                : audit.netPnlUsd < 0
                  ? "text-terminal-red"
                  : "text-foreground",
            )}
          >
            {formatUsd(audit.netPnlUsd)}
          </div>
          <div className="text-terminal-dim">
            {formatPct(audit.netReturnPct)}
          </div>
        </div>
        <div className="bg-background px-2 py-2">
          <div className="text-terminal-dim">Attempts</div>
          <div className="mt-1 text-[0.6875rem] text-foreground">
            {audit.attemptsTotal}
          </div>
          <div className="text-terminal-dim">
            {audit.successfulAttempts} ok / {audit.heldAttempts} held /{" "}
            {audit.failedAttempts} failed
          </div>
        </div>
        <div className="bg-background px-2 py-2">
          <div className="text-terminal-dim">Fills</div>
          <div className="mt-1 text-[0.6875rem] text-foreground">
            {audit.fillsTotal}
          </div>
          <div className="text-terminal-dim">
            {audit.filledBuys} buys / {audit.filledSells} sells
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border/40 px-2 py-2 text-terminal-dim">
        <div>Realized: {formatUsd(audit.realizedPnlUsd)}</div>
        <div>Unrealized: {formatUsd(audit.unrealizedPnlUsd)}</div>
        <div>Open positions: {audit.openPositionCount}</div>
        <div>Open notional: {formatUsd(audit.openPositionNotionalUsd)}</div>
        <div>Observed: {formatDays(audit.observedDays)}</div>
        <div>Since last fill: {formatAge(audit.hoursSinceLastFill)}</div>
        <div>Win rate: {audit.winRate.toFixed(2)}%</div>
        <div>Blocked runs: {audit.blockedSwarmRuns}</div>
      </div>

      <div className="border-b border-border/40 px-2 py-2">
        <div className="mb-1 text-terminal-cyan">Top Blockers</div>
        {audit.topBlockers.length === 0 ? (
          <div className="text-terminal-dim">
            No frequent blockers recorded.
          </div>
        ) : (
          audit.topBlockers.map((reason) => (
            <div
              key={`${reason.layer}:${reason.code}`}
              className="flex items-start justify-between gap-2 py-0.5"
            >
              <div className="min-w-0">
                <span className="text-terminal-amber">{reason.layer}</span>{" "}
                <span className="text-foreground">{reason.summary}</span>
              </div>
              <span className="shrink-0 text-terminal-dim">
                {reason.count}x
              </span>
            </div>
          ))
        )}
      </div>

      <div className="border-b border-border/40 px-2 py-2">
        <div className="mb-1 text-terminal-cyan">Strategy Breakdown</div>
        {breakdown.length === 0 ? (
          <div className="text-terminal-dim">
            No closed outcome windows yet.
          </div>
        ) : (
          breakdown.slice(0, 4).map((row) => (
            <div
              key={`${row.regime}:${row.selectedEngine}`}
              className="grid grid-cols-[1fr_auto_auto] gap-2 py-0.5"
            >
              <div className="min-w-0 truncate">
                {row.regime} / {row.selectedEngine}
              </div>
              <span className="text-terminal-dim">{row.tradeCount} trades</span>
              <span
                className={cn(
                  row.avgRealizedPnl > 0
                    ? "text-terminal-green"
                    : row.avgRealizedPnl < 0
                      ? "text-terminal-red"
                      : "text-terminal-dim",
                )}
              >
                {formatUsd(row.avgRealizedPnl)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-2 py-2">
        <div className="mb-1 text-terminal-cyan">Notes</div>
        {audit.notes.length === 0 ? (
          <div className="text-terminal-dim">No additional notes.</div>
        ) : (
          audit.notes.map((note) => (
            <div key={note} className="py-0.5 text-terminal-dim">
              {note}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
