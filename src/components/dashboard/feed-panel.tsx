"use client";

import { useEffect, useRef } from "react";

interface FeedEntry {
  ts: string;
  type: "SYS" | "MKT" | "TRD" | "WRN" | "ERR" | "CMD";
  msg: string;
}

interface FeedPanelProps {
  entries: FeedEntry[];
}

const TYPE_COLORS: Record<FeedEntry["type"], string> = {
  SYS: "data-positive",
  MKT: "text-terminal-cyan",
  TRD: "text-terminal-amber",
  WRN: "text-terminal-gold",
  ERR: "data-negative",
  CMD: "data-neutral",
};

export function FeedPanel({ entries }: FeedPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="bloomberg-panel h-full">
      <div className="bloomberg-header">
        <span>FEED LOG</span>
        <span className="text-[0.5625rem] text-muted-foreground">
          {entries.length}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-1 bg-background">
        {entries.length === 0 ? (
          <div className="text-[0.5625rem] text-muted-foreground text-center py-2 uppercase">
            AWAITING DATA...
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={`${entry.ts}-${entry.msg}`}
                  className="border-b border-border/30"
                >
                  <td className="data-cell text-muted-foreground w-[60px]">
                    {entry.ts}
                  </td>
                  <td
                    className={`data-cell w-[36px] font-bold ${TYPE_COLORS[entry.type]}`}
                  >
                    {entry.type}
                  </td>
                  <td className="data-cell text-foreground">{entry.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export type { FeedEntry };
