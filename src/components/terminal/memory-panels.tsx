"use client";

import type { MemoryRecord, MemorySummary } from "@/types/memory";
import { formatTime } from "./swarm-panels";

const SIGNAL_COLORS: Record<string, string> = {
  BUY: "text-terminal-green",
  SELL: "text-terminal-red",
  HOLD: "text-terminal-amber",
};

function MemorySummaryPanel({ summary }: { summary: MemorySummary | null }) {
  if (!summary) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO DATA</div>
    );
  }

  const directionalEntries = Object.entries(summary.directionalWeights);
  const domSignal = summary.dominantSignal;

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="terminal-text text-muted-foreground">SYMBOL</span>
        <span className="terminal-text text-terminal-cyan">
          {summary.symbol}
        </span>
        <span className="terminal-text text-muted-foreground">TF</span>
        <span className="terminal-text">{summary.timeframe}</span>
        <span className="terminal-text text-muted-foreground">MEM</span>
        <span className="terminal-text">{summary.totalMemories}</span>
        <span className="terminal-text text-muted-foreground">EFF N</span>
        <span className="terminal-text tabular-nums">
          {summary.effectiveSampleSize.toFixed(1)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="terminal-text text-muted-foreground">DOMINANT</span>
        <span
          className={`terminal-text font-bold ${SIGNAL_COLORS[domSignal] ?? "text-muted-foreground"}`}
        >
          {domSignal}
        </span>
        <span className="terminal-text text-muted-foreground">AVG CONF</span>
        <span className="terminal-text tabular-nums">
          {(summary.averageConfidence * 100).toFixed(1)}%
        </span>
        <span className="terminal-text text-muted-foreground">BLK RATIO</span>
        <span
          className={`terminal-text tabular-nums ${summary.blockedRatio > 0.4 ? "text-terminal-red" : "text-terminal-amber"}`}
        >
          {(summary.blockedRatio * 100).toFixed(1)}%
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="terminal-text text-muted-foreground">WEIGHTS</span>
        {directionalEntries.map(([sig, w]) => (
          <span
            key={sig}
            className={`terminal-text-xs ${SIGNAL_COLORS[sig] ?? "text-muted-foreground"} tabular-nums`}
          >
            {sig}:{w.toFixed(3)}
          </span>
        ))}
      </div>
      {summary.topRecalls.length > 0 && (
        <div className="mt-1">
          <div className="data-header">TOP RECALLS</div>
          {summary.topRecalls.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="flex items-baseline gap-2 terminal-text-xs"
            >
              <span className="text-muted-foreground">
                {formatTime(r.createdAt)}
              </span>
              <span
                className={SIGNAL_COLORS[r.signal] ?? "text-muted-foreground"}
              >
                {r.signal}
              </span>
              <span className="tabular-nums">
                {(r.confidence * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                sim:{(r.similarity * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                decay:{(r.decayWeight * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground tabular-nums">
                inf:{(r.weightedInfluence * 100).toFixed(0)}%
              </span>
              {r.blocked && <span className="text-terminal-red">BLK</span>}
            </div>
          ))}
        </div>
      )}
      <div className="terminal-text-xxs text-muted-foreground mt-1">
        {formatTime(summary.generatedAt)}
      </div>
    </div>
  );
}

function MemoryRecentPanel({ entries }: { entries: MemoryRecord[] }) {
  if (entries.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">
        NO MEMORIES
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="data-header">RECENT ({entries.length})</div>
      {entries.slice(0, 20).map((m) => (
        <div key={m.id} className="flex items-baseline gap-2 terminal-text-xs">
          <span className="text-muted-foreground">
            {formatTime(m.createdAt)}
          </span>
          <span className="text-terminal-cyan w-[5rem] truncate">
            {m.symbol}
          </span>
          <span className={SIGNAL_COLORS[m.signal] ?? "text-muted-foreground"}>
            {m.signal}
          </span>
          <span className="tabular-nums">
            {(m.confidence * 100).toFixed(0)}%
          </span>
          <span className="text-muted-foreground tabular-nums">
            agr:{(m.agreement * 100).toFixed(0)}%
          </span>
          <span className="text-muted-foreground tabular-nums">
            spr:{m.spreadBps.toFixed(0)}bps
          </span>
          <span className="text-muted-foreground tabular-nums">
            vol:{m.volatilityPct.toFixed(1)}%
          </span>
          {m.blocked && <span className="text-terminal-red">BLK</span>}
          {m.blockReason && (
            <span className="text-terminal-red truncate max-w-[8rem]">
              {m.blockReason}
            </span>
          )}
          <span className="text-muted-foreground truncate max-w-[12rem]">
            {m.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

export { MemorySummaryPanel, MemoryRecentPanel };
