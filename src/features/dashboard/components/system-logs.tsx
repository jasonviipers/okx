"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LogEntry } from "@/features/dashboard/hooks/use-log-store";
import { useLogStore } from "@/features/dashboard/hooks/use-log-store";
import { useSystemStatus } from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";
import type { RuntimeStatus, ServiceStatus } from "@/types/api";

function logLevelColor(level: string): string {
  switch (level) {
    case "ERROR":
      return "text-terminal-red";
    case "WARN":
      return "text-terminal-amber";
    case "INFO":
      return "text-terminal-green";
    case "DEBUG":
      return "text-terminal-dim";
    default:
      return "text-foreground";
  }
}

function statusIndicator(status: { configured: boolean; available: boolean }): {
  color: string;
  label: string;
} {
  if (status.available && status.configured)
    return { color: "bg-terminal-green", label: "ONLINE" };
  if (status.configured && !status.available)
    return { color: "bg-terminal-amber", label: "OFFLINE" };
  return { color: "bg-terminal-dim", label: "N/A" };
}

export function SystemLogs() {
  const { entries, filter, toggleLevel } = useLogStore();

  const virtualRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 18;
  const [containerHeight, setContainerHeight] = useState(300);
  const [scrollTop, setScrollTop] = useState(0);
  const prevEntriesLengthRef = useRef(0);

  const VISIBLE_ROWS = Math.ceil(containerHeight / ROW_HEIGHT);

  useEffect(() => {
    const el = virtualRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = virtualRef.current;
    if (!el) return;
    const prevLen = prevEntriesLengthRef.current;
    if (entries.length > prevLen) {
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < ROW_HEIGHT * 2;
      if (nearBottom) {
        el.scrollTop = el.scrollHeight;
        setScrollTop(el.scrollTop);
      }
    }
    prevEntriesLengthRef.current = entries.length;
  }, [entries.length]);

  const startIdx = Math.floor(scrollTop / ROW_HEIGHT);
  const endIdx = Math.min(startIdx + VISIBLE_ROWS + 5, entries.length);
  const visibleEntries = entries.slice(startIdx, endIdx);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>System Logs</span>
          <span className="text-[0.5625rem] text-terminal-dim">
            {entries.length}
          </span>
        </CardTitle>
        <CardAction>
          <div className="flex gap-0.5">
            {(["INFO", "WARN", "ERROR", "DEBUG"] as const).map((level) => (
              <Button
                key={level}
                variant={filter.levels.has(level) ? "default" : "ghost"}
                size="xs"
                className={cn(
                  "text-[0.5rem]",
                  level === "ERROR"
                    ? "text-terminal-red"
                    : level === "WARN"
                      ? "text-terminal-amber"
                      : level === "INFO"
                        ? "text-terminal-green"
                        : "text-terminal-dim",
                )}
                onClick={() => toggleLevel(level)}
              >
                {level}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={virtualRef}
          className="overflow-auto h-full"
          onScroll={handleScroll}
        >
          <div
            style={{
              height: entries.length * ROW_HEIGHT,
              position: "relative",
            }}
          >
            {visibleEntries.map((entry: LogEntry, i: number) => {
              const actualIdx = startIdx + i;
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 px-2 text-[0.5rem] font-mono border-b border-border/20"
                  style={{
                    position: "absolute",
                    top: actualIdx * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                >
                  <span className="text-terminal-dim shrink-0 w-14">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 w-10 font-semibold",
                      logLevelColor(entry.level),
                    )}
                  >
                    {entry.level}
                  </span>
                  <span className="text-terminal-cyan shrink-0 w-16 truncate">
                    {entry.source}
                  </span>
                  <span className="truncate">{entry.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionStatus() {
  const systemStatus = useSystemStatus();

  const connections = useMemo(() => {
    if (!systemStatus.data) return [];
    const s: RuntimeStatus = systemStatus.data;
    const items: { name: string; status: ServiceStatus; extra?: string }[] = [
      { name: "OKX", status: s.okx, extra: s.okx.accountMode.toUpperCase() },
      {
        name: "Market Data",
        status: s.marketData,
        extra: s.marketData.realtime ? "LIVE" : "REST",
      },
      { name: "Redis", status: s.redis },
      { name: "Ollama", status: s.ollama, extra: s.ollama.baseUrl },
      { name: "Web Research", status: s.webResearch },
    ];
    return items;
  }, [systemStatus.data]);

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        {systemStatus.loading && !systemStatus.data ? (
          <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center animate-pulse-soft">
            Loading...
          </div>
        ) : (
          connections.map((conn) => {
            const ind = statusIndicator(conn.status);
            return (
              <div
                key={conn.name}
                className="flex items-center gap-2 px-2 py-1 text-[0.5625rem] font-mono border-b border-border/30"
              >
                <span
                  className={cn("w-1.5 h-1.5 rounded-full shrink-0", ind.color)}
                />
                <span className="w-24 font-semibold">{conn.name}</span>
                <span
                  className={cn(
                    "w-14",
                    conn.status.available
                      ? "text-terminal-green"
                      : "text-terminal-red",
                  )}
                >
                  {ind.label}
                </span>
                <span className="text-terminal-dim truncate">
                  {conn.status.detail}
                </span>
                {conn.extra && (
                  <span className="text-terminal-cyan shrink-0 text-[0.5rem]">
                    {conn.extra}
                  </span>
                )}
              </div>
            );
          })
        )}

        {systemStatus.data?.autonomy && (
          <div className="border-t border-border mt-1">
            <div className="flex items-center gap-2 px-2 py-1 text-[0.5625rem] font-mono">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  systemStatus.data.autonomy.running
                    ? "bg-terminal-green animate-pulse-soft"
                    : "bg-terminal-dim",
                )}
              />
              <span className="w-24 font-semibold">Autonomy</span>
              <span
                className={
                  systemStatus.data.autonomy.running
                    ? "text-terminal-green"
                    : "text-terminal-dim"
                }
              >
                {systemStatus.data.autonomy.running ? "RUNNING" : "IDLE"}
              </span>
              <span className="text-terminal-dim">
                {systemStatus.data.autonomy.symbol} /{" "}
                {systemStatus.data.autonomy.timeframe}
              </span>
              {systemStatus.data.autonomy.iterationCount > 0 && (
                <span className="text-terminal-dim">
                  #{systemStatus.data.autonomy.iterationCount}
                </span>
              )}
            </div>
          </div>
        )}

        {systemStatus.error && (
          <div className="px-2 py-1 text-[0.5625rem] text-terminal-red">
            Error: {systemStatus.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
