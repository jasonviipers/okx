"use client";

import { useCallback, useEffect, useState } from "react";
import { WatchlistPanel } from "@/components/terminal/market-panels";
import {
  MemoryRecentPanel,
  MemorySummaryPanel,
} from "@/components/terminal/memory-panels";
import { ConsensusPanel, StreamLog } from "@/components/terminal/swarm-panels";
import { SystemsPanel } from "@/components/terminal/systems-panel";
import {
  AccountPanel,
  PositionsPanel,
  SwarmHistoryPanel,
  TradeHistoryPanel,
} from "@/components/terminal/trade-panels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAccount,
  useAutonomyControl,
  useAutonomyStatus,
  useConsensus,
  useMemoryRecent,
  useMemorySummary,
  usePositions,
  useSwarmHistory,
  useSwarmStream,
  useSystemStatus,
  useTradeHistory,
  useWatchlist,
} from "@/hooks/use-terminal-data";

const DEFAULT_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "DOGE-USDT",
  "ADA-USDT",
  "AVAX-USDT",
  "DOT-USDT",
  "LINK-USDT",
  "MATIC-USDT",
];

type TabId =
  | "consensus"
  | "stream"
  | "memory"
  | "trades"
  | "swarm-history"
  | "positions"
  | "account"
  | "systems"
  | "watchlist";

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[6rem] text-muted-foreground terminal-text">
      <span className="animate-pulse-soft">LOADING {label}...</span>
    </div>
  );
}

function ErrorState({ label, error }: { label: string; error: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[4rem]">
      <span className="terminal-text text-terminal-red">ERR {label}</span>
      <span className="terminal-text-xs text-terminal-red">{error}</span>
    </div>
  );
}

function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      disabled={loading}
      className="text-terminal-cyan"
    >
      {loading ? "..." : "↻"}
    </Button>
  );
}

export default function TerminalDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC-USDT");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1H");
  const [activeTab, setActiveTab] = useState<TabId>("consensus");
  const [activeRightTab, setActiveRightTab] = useState<TabId>("stream");

  const systemStatus = useSystemStatus();
  const autonomy = useAutonomyStatus();
  const watchlistSymbols =
    autonomy.data?.candidateSymbols && autonomy.data.candidateSymbols.length > 0
      ? autonomy.data.candidateSymbols
      : DEFAULT_SYMBOLS;
  const watchlist = useWatchlist(watchlistSymbols);
  const account = useAccount(selectedSymbol);
  const positions = usePositions();
  const consensus = useConsensus(selectedSymbol, selectedTimeframe);
  const swarmStream = useSwarmStream(selectedSymbol, selectedTimeframe);
  const swarmHistory = useSwarmHistory(25);
  const tradeHistory = useTradeHistory(25);
  const memoryRecent = useMemoryRecent(selectedSymbol, selectedTimeframe, 25);
  const memorySummary = useMemorySummary(selectedSymbol, selectedTimeframe);
  const autonomyControl = useAutonomyControl();

  useEffect(() => {
    if (
      watchlistSymbols.length > 0 &&
      !watchlistSymbols.includes(selectedSymbol)
    ) {
      const nextSymbol = watchlistSymbols[0];
      if (nextSymbol) {
        setSelectedSymbol(nextSymbol);
      }
    }
  }, [selectedSymbol, watchlistSymbols]);

  const handleToggleAutonomy = useCallback(async () => {
    if (autonomy.data?.enabled) {
      await autonomyControl.stop();
    } else {
      await autonomyControl.start({
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
      });
    }
    autonomy.refresh();
  }, [autonomy, autonomyControl, selectedSymbol, selectedTimeframe]);

  const LEFT_TABS = [
    { id: "trades" as TabId, label: "TRADES" },
    { id: "swarm-history" as TabId, label: "SWARM" },
    { id: "positions" as TabId, label: "POS" },
  ] as const;

  const TIMEFRAMES = [
    "1m", "3m", "5m", "15m", "30m",
    "1H", "2H", "4H", "6H", "12H", "1D", "1W",
  ];

  const symbolItems = watchlist.data?.items ?? [];

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* HEADER BAR */}
      <header className="flex items-center gap-2 px-2 py-1 border-b border-border bg-secondary min-h-[2rem]">
        <div className="flex items-center gap-1.5 mr-2">
          <span className="text-primary font-bold terminal-text tracking-wider">
            SWARM
          </span>
          <span className="text-terminal-amber terminal-text-xs">v0.1</span>
        </div>
        <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {watchlistSymbols.slice(0, 8).map((sym) => {
            const item = symbolItems.find((i) => i.symbol === sym);
            const change = item?.ticker.change24h;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSymbol(sym)}
                className={`flex items-center gap-1 px-1.5 py-0.5 terminal-text-xs whitespace-nowrap transition-colors ${selectedSymbol === sym
                    ? "bg-primary/20 text-primary border border-primary/50"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                <span className={selectedSymbol === sym ? "font-bold" : ""}>
                  {sym.split("-")[0] ?? sym}
                </span>
                {item && (
                  <span
                    className={
                      change !== undefined && change >= 0
                        ? "text-terminal-green"
                        : "text-terminal-red"
                    }
                  >
                    {change !== undefined
                      ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`
                      : "—"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.slice(5).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-1 py-0.5 terminal-text-xs ${selectedTimeframe === tf
                  ? "text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${swarmStream.connected ? "bg-terminal-green" : "bg-terminal-red"}`}
          />
          <span className="terminal-text-xs text-muted-foreground">
            {swarmStream.connected ? "LIVE" : "OFF"}
          </span>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-[1fr_1fr_1fr] grid-rows-[1fr_1fr] gap-px bg-border overflow-hidden">
        {/* LEFT TOP — CONSENSUS / AGENT DISCUSSION */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <CardTitle>CONSENSUS</CardTitle>
            <CardAction>
              <RefreshButton
                onClick={() => consensus.refresh()}
                loading={consensus.refreshing}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {consensus.loading ? (
              <LoadingState label="CONSENSUS" />
            ) : consensus.error ? (
              <ErrorState label="CONSENSUS" error={consensus.error} />
            ) : (
              <ConsensusPanel
                consensus={consensus.data?.consensus ?? null}
                execution={consensus.data?.execution}
              />
            )}
          </CardContent>
        </Card>

        {/* CENTER TOP — SWARM STREAM / LOGS */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <CardTitle>SWARM LOG</CardTitle>
            <CardAction>
              <div className="flex items-center gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${swarmStream.connected ? "bg-terminal-green animate-pulse-soft" : "bg-terminal-red"}`}
                />
                <span className="terminal-text-xs text-muted-foreground">
                  {swarmStream.events.length}
                </span>
                <Button variant="ghost" size="xs" onClick={swarmStream.clear}>
                  CLR
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {swarmStream.error &&
              !swarmStream.connected &&
              swarmStream.events.length === 0 ? (
              <ErrorState label="STREAM" error={swarmStream.error} />
            ) : (
              <StreamLog events={swarmStream.events} />
            )}
          </CardContent>
        </Card>

        {/* RIGHT TOP — MEMORY */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <CardTitle>MEMORY</CardTitle>
            <CardAction>
              <RefreshButton
                onClick={() => {
                  memorySummary.refresh();
                  memoryRecent.refresh();
                }}
                loading={memorySummary.refreshing || memoryRecent.refreshing}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {memorySummary.loading ? (
              <LoadingState label="MEMORY" />
            ) : memorySummary.error ? (
              <ErrorState label="MEMORY" error={memorySummary.error} />
            ) : (
              <div>
                <div className="data-header">SUMMARY</div>
                <MemorySummaryPanel
                  summary={memorySummary.data?.summary ?? null}
                />
                <div className="data-header mt-1">RECENT</div>
                <MemoryRecentPanel entries={memoryRecent.data?.entries ?? []} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* LEFT BOTTOM — TABS: TRADES / SWARM HISTORY / POSITIONS */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-1">
              {LEFT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-1.5 py-0.5 terminal-text-xs ${activeTab === tab.id
                      ? "text-primary font-bold bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <CardAction>
              <RefreshButton
                onClick={() => {
                  if (activeTab === "trades") tradeHistory.refresh();
                  else if (activeTab === "swarm-history")
                    swarmHistory.refresh();
                  else positions.refresh();
                }}
                loading={
                  activeTab === "trades"
                    ? tradeHistory.refreshing
                    : activeTab === "swarm-history"
                      ? swarmHistory.refreshing
                      : positions.refreshing
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {activeTab === "trades" &&
              (tradeHistory.loading ? (
                <LoadingState label="TRADES" />
              ) : tradeHistory.error ? (
                <ErrorState label="TRADES" error={tradeHistory.error} />
              ) : (
                <TradeHistoryPanel entries={tradeHistory.data?.entries ?? []} />
              ))}
            {activeTab === "swarm-history" &&
              (swarmHistory.loading ? (
                <LoadingState label="SWARM HISTORY" />
              ) : swarmHistory.error ? (
                <ErrorState label="SWARM HISTORY" error={swarmHistory.error} />
              ) : (
                <SwarmHistoryPanel entries={swarmHistory.data?.entries ?? []} />
              ))}
            {activeTab === "positions" &&
              (positions.loading ? (
                <LoadingState label="POSITIONS" />
              ) : positions.error ? (
                <ErrorState label="POSITIONS" error={positions.error} />
              ) : (
                <PositionsPanel positions={positions.data?.positions ?? []} />
              ))}
          </CardContent>
        </Card>

        {/* CENTER BOTTOM — ACCOUNT */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <CardTitle>ACCOUNT</CardTitle>
            <CardAction>
              <RefreshButton
                onClick={() => account.refresh()}
                loading={account.refreshing}
              />
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {account.loading ? (
              <LoadingState label="ACCOUNT" />
            ) : account.error ? (
              <ErrorState label="ACCOUNT" error={account.error} />
            ) : (
              <AccountPanel overview={account.data?.overview ?? null} />
            )}
          </CardContent>
        </Card>

        {/* RIGHT BOTTOM — TABS: SYSTEMS / WATCHLIST */}
        <Card size="sm" className="row-span-1 col-span-1 overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveRightTab("systems")}
                className={`px-1.5 py-0.5 terminal-text-xs ${activeRightTab === "systems"
                    ? "text-primary font-bold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                SYS
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab("watchlist")}
                className={`px-1.5 py-0.5 terminal-text-xs ${activeRightTab === "watchlist"
                    ? "text-primary font-bold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                WATCH
              </button>
            </div>
            <CardAction>
              <div className="flex items-center gap-1">
                {activeRightTab === "systems" && (
                  <Button
                    variant={autonomy.data?.enabled ? "destructive" : "default"}
                    size="xs"
                    onClick={handleToggleAutonomy}
                    disabled={autonomyControl.loading}
                  >
                    {autonomy.data?.enabled ? "■ STOP" : "▶ START"}
                  </Button>
                )}
                <RefreshButton
                  onClick={() => {
                    if (activeRightTab === "systems") systemStatus.refresh();
                    else watchlist.refresh();
                  }}
                  loading={
                    activeRightTab === "systems"
                      ? systemStatus.refreshing
                      : watchlist.refreshing
                  }
                />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {activeRightTab === "systems" &&
              (systemStatus.loading ? (
                <LoadingState label="SYSTEMS" />
              ) : systemStatus.error ? (
                <ErrorState label="SYSTEMS" error={systemStatus.error} />
              ) : (
                <SystemsPanel status={systemStatus.data} />
              ))}
            {activeRightTab === "watchlist" &&
              (watchlist.loading ? (
                <LoadingState label="WATCHLIST" />
              ) : watchlist.error ? (
                <ErrorState label="WATCHLIST" error={watchlist.error} />
              ) : (
                <WatchlistPanel items={watchlist.data?.items ?? []} />
              ))}
          </CardContent>
        </Card>
      </div>

      {/* FOOTER STATUS BAR */}
      <footer className="flex items-center gap-3 px-2 py-0.5 border-t border-border bg-secondary min-h-[1.5rem]">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${systemStatus.data ? "bg-terminal-green" : "bg-terminal-amber animate-pulse-soft"}`}
          />
          <span className="terminal-text-xs text-muted-foreground">SYS</span>
        </div>
        {systemStatus.data && (
          <>
            <span
              className={`terminal-text-xs ${systemStatus.data.okx.configured ? "text-terminal-green" : "text-terminal-red"}`}
            >
              OKX:{systemStatus.data.okx.accountMode}
            </span>
            <span
              className={`terminal-text-xs ${systemStatus.data.redis.configured ? "text-terminal-green" : "text-terminal-amber"}`}
            >
              REDIS:{systemStatus.data.redis.configured ? "ON" : "MEM"}
            </span>
            <span
              className={`terminal-text-xs ${systemStatus.data.ollama.configured ? "text-terminal-green" : "text-terminal-red"}`}
            >
              AI:{systemStatus.data.ollama.configured ? "ON" : "OFF"}
            </span>
            <span
              className={`terminal-text-xs ${systemStatus.data.marketData.connectionState === "connected" ? "text-terminal-green" : "text-terminal-amber"}`}
            >
              MKT:{systemStatus.data.marketData.connectionState.toUpperCase()}
            </span>
          </>
        )}
        {autonomy.data && (
          <span
            className={`terminal-text-xs ${autonomy.data.running ? "text-terminal-green" : "text-terminal-dim"}`}
          >
            AUTO:{autonomy.data.running ? "●" : "○"} iter:
            {autonomy.data.iterationCount}
          </span>
        )}
        <div className="flex-1" />
        <span className="terminal-text-xs text-muted-foreground">
          {selectedSymbol} {selectedTimeframe}
        </span>
        <span className="terminal-text-xxs text-terminal-dim">
          SWARM TERMINAL
        </span>
      </footer>
    </div>
  );
}
