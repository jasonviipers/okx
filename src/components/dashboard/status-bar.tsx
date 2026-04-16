"use client";

import { useEffect, useState } from "react";
import { getRuntimeSystemStatus } from "@/lib/api/client";
import type { RuntimeStatus } from "@/types/api";

export function StatusBar() {
  const [time, setTime] = useState<Date | null>(null);
  const [colorScheme, setColorScheme] = useState("phosphor");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(
    null,
  );

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const scheme = document.documentElement.getAttribute("data-color-scheme");
    if (scheme) {
      setColorScheme(scheme);
    }
  }, []);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const nextStatus = await getRuntimeSystemStatus();
        setRuntimeStatus(nextStatus);
      } catch {}
    };

    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const cycleScheme = () => {
    const schemes = [
      "phosphor",
      "arctic",
      "amber",
      "crimson",
      "matrix",
      "synthwave",
    ];
    const idx = schemes.indexOf(colorScheme);
    const next = schemes[(idx + 1) % schemes.length];
    setColorScheme(next);
    document.documentElement.setAttribute("data-color-scheme", next);
  };

  const fmt = (n: number) => n.toString().padStart(2, "0");
  const timeValue = time
    ? {
        utc: `${fmt(time.getUTCHours())}:${fmt(time.getUTCMinutes())}:${fmt(time.getUTCSeconds())}`,
        local: `${fmt(time.getHours())}:${fmt(time.getMinutes())}:${fmt(time.getSeconds())}`,
      }
    : {
        utc: "--:--:--",
        local: "--:--:--",
      };

  return (
    <div className="flex items-center border-t border-border bg-secondary h-6 text-[0.5625rem] font-mono select-none">
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="data-positive animate-pulse-soft">●</span>
        <span className="text-muted-foreground">CONNECTED</span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">NET:</span>
        <span
          className={
            runtimeStatus?.okx.available ? "data-positive" : "data-negative"
          }
        >
          OKX {runtimeStatus?.okx.accountMode?.toUpperCase() ?? ""}
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">MKT:</span>
        <span
          className={
            runtimeStatus?.marketData.realtime
              ? "data-positive"
              : runtimeStatus?.marketData.available
                ? "text-terminal-amber"
                : "data-negative"
          }
        >
          {runtimeStatus?.marketData.realtime
            ? "LIVE"
            : runtimeStatus?.marketData.available
              ? "SYNC"
              : "DOWN"}
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">AI:</span>
        <span
          className={
            runtimeStatus?.ollama.available
              ? "text-terminal-amber"
              : "data-negative"
          }
        >
          OLLAMA
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">REDIS:</span>
        <span
          className={
            runtimeStatus?.redis.available ? "data-positive" : "data-negative"
          }
        >
          {runtimeStatus?.redis.available ? "ON" : "FILE"}
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">SEARCH:</span>
        <span
          className={
            runtimeStatus?.webResearch.available
              ? "text-terminal-cyan"
              : "data-negative"
          }
        >
          {runtimeStatus?.webResearch.available ? "WEB" : "OFF"}
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">AUTO:</span>
        <span
          className={
            runtimeStatus?.autonomy.running
              ? "data-positive"
              : runtimeStatus?.autonomy.enabled
                ? "text-terminal-amber"
                : "data-negative"
          }
        >
          {runtimeStatus?.autonomy.running
            ? "LIVE"
            : runtimeStatus?.autonomy.enabled
              ? "ARMED"
              : "OFF"}
        </span>
      </div>
      <div className="px-2 border-r border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">MODE:</span>
        <span className="text-foreground">
          {runtimeStatus?.autonomy.running ? "AI_ONLY" : "AI_ENHANCE"}
        </span>
      </div>
      <button
        type="button"
        onClick={cycleScheme}
        className="px-2 border-r border-border flex items-center gap-1.5 h-full hover:bg-muted cursor-pointer"
      >
        <span className="text-muted-foreground">THEME:</span>
        <span className="text-primary uppercase">{colorScheme}</span>
      </button>
      <div className="flex-1" />
      <div className="px-2 border-l border-border flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">UTC</span>
        <span className="text-foreground tabular-nums">{timeValue.utc}</span>
      </div>
      <div className="px-2 flex items-center gap-1.5 h-full">
        <span className="text-muted-foreground">LOCAL</span>
        <span className="text-foreground tabular-nums">{timeValue.local}</span>
      </div>
    </div>
  );
}
