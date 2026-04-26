"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/features/dashboard/dashboard-context";
import { useMemoryRecent, useMemorySummary } from "@/hooks/use-terminal-data";
import type { MemoryRecord } from "@/types/memory";
import type { TradeSignal } from "@/types/swarm";

function signalColor(signal: TradeSignal): string {
  switch (signal) {
    case "BUY":
      return "text-terminal-green";
    case "SELL":
      return "text-terminal-red";
    case "HOLD":
      return "text-terminal-amber";
  }
}

/**
 * Strips the redundant "BUY 42% | agree 52% | blocked: " prefix that the
 * memory engine prepends to the summary string, leaving only the reason text.
 */
function cleanSummary(raw: string): string {
  // Remove leading "SIGNAL XX% | agree XX% | blocked: " or "SIGNAL XX% | agree XX% | "
  return raw
    .replace(
      /^(BUY|SELL|HOLD)\s+\d+%\s*\|\s*agree\s+\d+%\s*\|\s*(blocked:\s*)?/i,
      "",
    )
    .trim();
}

export function MemoryPanel() {
  const { selectedSymbol, selectedTimeframe } = useDashboard();
  const memoryRecent = useMemoryRecent(selectedSymbol, selectedTimeframe, 15);
  const memorySummary = useMemorySummary(selectedSymbol, selectedTimeframe);

  const entries: MemoryRecord[] = memoryRecent.data?.entries ?? [];
  const summary = memorySummary.data?.summary;

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>Memory</span>
          <span className="text-[0.5625rem] text-terminal-dim font-mono">
            {summary
              ? `${summary.totalMemories} entries · ${summary.effectiveSampleSize.toFixed(1)} ESS`
              : "---"}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-0">
        {summary && (
          <div className="grid grid-cols-3 gap-px bg-border text-[0.5625rem] font-mono border-b border-border">
            <div className="bg-card px-2 py-1">
              <div className="text-terminal-dim uppercase">Dominant</div>
              <div className={signalColor(summary.dominantSignal)}>
                {summary.dominantSignal}
              </div>
            </div>
            <div className="bg-card px-2 py-1">
              <div className="text-terminal-dim uppercase">Avg Conf</div>
              <div>{(summary.averageConfidence * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-card px-2 py-1">
              <div className="text-terminal-dim uppercase">Blocked</div>
              <div className="text-terminal-red">
                {(summary.blockedRatio * 100).toFixed(0)}%
              </div>
            </div>
            {summary.directionalWeights && (
              <>
                <div className="bg-card px-2 py-1">
                  <div className="text-terminal-dim uppercase">W:BUY</div>
                  <div className="text-terminal-green">
                    {(summary.directionalWeights.BUY * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-card px-2 py-1">
                  <div className="text-terminal-dim uppercase">W:SELL</div>
                  <div className="text-terminal-red">
                    {(summary.directionalWeights.SELL * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="bg-card px-2 py-1">
                  <div className="text-terminal-dim uppercase">W:HOLD</div>
                  <div className="text-terminal-amber">
                    {(summary.directionalWeights.HOLD * 100).toFixed(0)}%
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="text-[0.5rem] uppercase tracking-wider text-terminal-dim px-2 py-0.5 border-b border-border bg-secondary sticky top-0">
          Recent Decisions
        </div>

        {entries.length === 0 ? (
          <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
            No memory entries
          </div>
        ) : (
          entries.map((entry: MemoryRecord) => {
            const reason = cleanSummary(entry.summary);
            return (
              <div
                key={entry.id}
                className="grid grid-cols-[3.5rem_2rem_2.5rem_2.5rem_auto] items-center gap-x-1.5 px-2 py-0.5 text-[0.5625rem] font-mono border-b border-border/30 hover:bg-secondary/50"
              >
                {/* Time */}
                <span className="text-terminal-dim tabular-nums">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>

                {/* Signal badge */}
                <span className={`font-semibold ${signalColor(entry.signal)}`}>
                  {entry.signal}
                </span>

                {/* Confidence */}
                <span className="text-terminal-dim tabular-nums">
                  {(entry.confidence * 100).toFixed(0)}%
                  <span className="text-terminal-dim/60"> cf</span>
                </span>

                {/* Agreement */}
                <span className="text-terminal-dim tabular-nums">
                  {(entry.agreement * 100).toFixed(0)}%
                  <span className="text-terminal-dim/60"> ag</span>
                </span>

                {/* Reason — truncated, blocked label inline */}
                <span className="truncate text-terminal-dim min-w-0">
                  {entry.blocked && (
                    <span className="text-terminal-red mr-1 text-[0.5rem] font-semibold">
                      BLK
                    </span>
                  )}
                  {reason || "—"}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
