"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FeedEntry } from "@/components/dashboard";
import {
  CommandBar,
  FeedPanel,
  MarketPanel,
  PositionsPanel,
  StatusBar,
  SwarmPanel,
  TickerBar,
  VolumeChart,
} from "@/components/dashboard";
import {
  controlAutonomy,
  getAutonomyStatus,
  getConsensus,
  getSwarmHistory,
  getTradeHistory,
} from "@/lib/api/client";
import type { AutonomyStatus } from "@/types/api";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type { ExecutionResult } from "@/types/swarm";

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];

function toFeedTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function historyToFeedEntry(
  entry: StoredSwarmRun | StoredTradeExecution,
): FeedEntry {
  if (entry.type === "swarm_run") {
    return {
      ts: toFeedTime(entry.timestamp),
      type: entry.consensus.blocked ? "WRN" : "SYS",
      msg: `${entry.symbol} ${entry.timeframe} -> ${entry.consensus.signal} ${(entry.consensus.confidence * 100).toFixed(0)}% ${entry.cached ? "[CACHE]" : `[${entry.totalElapsedMs}MS]`}`,
    };
  }

  return {
    ts: toFeedTime(entry.timestamp),
    type: entry.success ? "TRD" : "ERR",
    msg: `${entry.order.side.toUpperCase()} ${entry.symbol} ${entry.order.size} ${entry.order.status.toUpperCase()}`,
  };
}

export default function DashboardPage() {
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [timeframe, setTimeframe] = useState("1H");
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);

  const addFeed = useCallback((type: FeedEntry["type"], msg: string) => {
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setFeedEntries((prev) => [{ ts, type, msg }, ...prev].slice(0, 200));
  }, []);

  const addExecutionFeed = useCallback(
    (execution?: ExecutionResult) => {
      if (!execution) {
        addFeed("WRN", "[AutoExec] No execution result returned");
        return;
      }

      if (execution.status === "success") {
        const price = execution.order?.filledPrice ?? execution.order?.price;
        addFeed(
          "TRD",
          `[AutoExec] ${execution.decision} executed at ${price ?? "market"}`,
        );
        return;
      }

      if (execution.status === "hold") {
        addFeed("SYS", "[AutoExec] HOLD - position maintained");
        return;
      }

      addFeed("ERR", "[AutoExec] ERROR - circuit breaker check logs");
    },
    [addFeed],
  );

  const runAutonomousCycle = useCallback(async () => {
    addFeed("SYS", `Swarm analysis triggered for ${symbol} ${timeframe}`);

    try {
      const response = await getConsensus(symbol, timeframe, "ai_only");
      addExecutionFeed(response.data.execution);
    } catch (error) {
      addFeed(
        "ERR",
        `[AutoExec] ERROR - ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [addExecutionFeed, addFeed, symbol, timeframe]);

  const syncAutonomy = useCallback(async () => {
    try {
      const response = await getAutonomyStatus();
      setAutonomy(response.data.autonomy);
    } catch {}
  }, []);

  const toggleAutonomy = useCallback(
    async (action: "start" | "stop") => {
      try {
        const response = await controlAutonomy({
          action,
          symbol,
          timeframe,
        });
        setAutonomy(response.data.autonomy);
        addFeed(
          "SYS",
          action === "start"
            ? `[AutoLoop] Started ${symbol} ${timeframe}`
            : "[AutoLoop] Stopped",
        );
      } catch (error) {
        addFeed(
          "ERR",
          `[AutoLoop] ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [addFeed, symbol, timeframe],
  );

  const handleCommand = useCallback(
    (cmd: string, args?: string) => {
      addFeed("CMD", `> ${cmd}${args ? ` ${args}` : ""}`);

      switch (cmd) {
        case "analyze":
          void runAutonomousCycle();
          break;
        case "buy":
          void runAutonomousCycle();
          break;
        case "sell":
          void runAutonomousCycle();
          break;
        case "positions":
          addFeed("SYS", "Positions panel refreshed");
          break;
        case "ticker":
          addFeed("MKT", `Fetching latest ticker for ${symbol}`);
          break;
        case "clear":
          setFeedEntries([]);
          break;
        case "help":
          addFeed(
            "SYS",
            "Commands: analyze, buy, sell, positions, ticker, set-symbol <SYM>, set-timeframe <TF>, clear, help",
          );
          break;
        default:
          addFeed(
            "ERR",
            `Unknown command: ${cmd}. Type 'help' for available commands.`,
          );
      }
    },
    [addFeed, runAutonomousCycle, symbol],
  );

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        const [swarmHistory, tradeHistory] = await Promise.all([
          getSwarmHistory(12),
          getTradeHistory(12),
        ]);

        if (!active) {
          return;
        }

        const merged = [
          ...swarmHistory.data.entries,
          ...tradeHistory.data.entries,
        ]
          .sort(
            (left, right) =>
              new Date(right.timestamp).getTime() -
              new Date(left.timestamp).getTime(),
          )
          .slice(0, 20)
          .map(historyToFeedEntry);

        setFeedEntries((prev) => {
          const liveEntries = prev.filter((entry) => entry.type === "CMD");
          return [...liveEntries, ...merged].slice(0, 200);
        });
      } catch {
        if (active) {
          addFeed("WRN", "History unavailable, showing live session feed only");
        }
      }
    };

    loadHistory();
    const interval = setInterval(loadHistory, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [addFeed]);

  useEffect(() => {
    void syncAutonomy();
    const interval = setInterval(() => {
      void syncAutonomy();
    }, 15000);
    return () => clearInterval(interval);
  }, [syncAutonomy]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background scanline">
      <TickerBar />
      <CommandBar
        onCommand={handleCommand}
        symbol={symbol}
        setSymbol={setSymbol}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
      />

      <div className="flex-1 grid grid-cols-[1fr_1fr_1fr] grid-rows-[1fr_1fr] gap-px bg-border overflow-hidden">
        <div className="bg-card overflow-hidden row-span-2">
          <MarketPanel symbol={symbol} timeframe={timeframe} />
        </div>
        <div className="bg-card overflow-hidden row-span-2">
          <SwarmPanel symbol={symbol} timeframe={timeframe} runTrigger={0} />
        </div>
        <div className="bg-card overflow-hidden flex flex-col">
          <PositionsPanel symbol={symbol} />
        </div>
        <div className="bg-card overflow-hidden flex flex-col">
          <div className="bloomberg-panel h-full">
            <div className="bloomberg-header">
              <span>QUICK SELECT</span>
            </div>
            <div className="p-1 flex-1">
              <div className="mb-1">
                <div className="text-[0.5625rem] text-muted-foreground uppercase mb-0.5">
                  Symbol
                </div>
                <div className="flex flex-wrap gap-px">
                  {[
                    "BTC-USDT",
                    "ETH-USDT",
                    "SOL-USDT",
                    "XRP-USDT",
                    "DOGE-USDT",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSymbol(s);
                        addFeed("CMD", `set-symbol ${s}`);
                      }}
                      className={`text-[0.5625rem] px-1 py-0.5 border border-border hover:border-primary transition-colors ${
                        symbol === s
                          ? "bg-primary/10 border-primary text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {s.replace("-USDT", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-1">
                <div className="text-[0.5625rem] text-muted-foreground uppercase mb-0.5">
                  Timeframe
                </div>
                <div className="flex flex-wrap gap-px">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => {
                        setTimeframe(tf);
                        addFeed("CMD", `set-timeframe ${tf}`);
                      }}
                      className={`text-[0.5625rem] px-1 py-0.5 border border-border hover:border-primary transition-colors ${
                        timeframe === tf
                          ? "bg-primary/10 border-primary text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-1 mb-1">
                <div className="text-[0.5625rem] text-muted-foreground uppercase mb-0.5">
                  Commands
                </div>
                <div className="grid grid-cols-2 gap-px text-[0.5625rem]">
                  {[
                    { c: "analyze", d: "Run swarm" },
                    { c: "positions", d: "Open positions" },
                    { c: "ticker", d: "Refresh market" },
                    { c: "help", d: "All commands" },
                  ].map(({ c, d }) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCommand(c)}
                      className="text-left px-1 py-0.5 border border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground"
                    >
                      <span className="text-primary font-bold">{c}</span>
                      <span className="text-muted-foreground ml-1">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-1">
                <div className="text-[0.5625rem] text-muted-foreground uppercase mb-0.5">
                  Autonomy
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <button
                    type="button"
                    onClick={() => void toggleAutonomy("start")}
                    className="inline-flex border border-border px-1 py-0.5 text-[0.5625rem] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    START LOOP
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleAutonomy("stop")}
                    className="inline-flex border border-border px-1 py-0.5 text-[0.5625rem] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                  >
                    STOP LOOP
                  </button>
                </div>
                <div className="text-[0.5625rem] text-muted-foreground mb-1">
                  {autonomy
                    ? `STATUS:${autonomy.running ? " LIVE" : " IDLE"} | ${autonomy.symbol} ${autonomy.timeframe} | ${(autonomy.intervalMs / 1000).toFixed(0)}S`
                    : "STATUS: UNKNOWN"}
                </div>
              </div>
              <div className="border-t border-border pt-1">
                <div className="text-[0.5625rem] text-muted-foreground uppercase mb-0.5">
                  Review
                </div>
                <Link
                  href="/memory"
                  className="inline-flex border border-border px-1 py-0.5 text-[0.5625rem] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Open Aging Memory
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-[2fr_1fr] gap-px bg-border border-t border-border"
        style={{ height: "160px" }}
      >
        <div className="bg-card overflow-hidden">
          <FeedPanel entries={feedEntries} />
        </div>
        <div className="bg-card overflow-hidden">
          <VolumeChart symbol={symbol} timeframe={timeframe} />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
