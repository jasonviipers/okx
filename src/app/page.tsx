"use client";

import { useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AgentDashboard } from "@/features/dashboard/components/agent-dashboard";
import { AssetDetail } from "@/features/dashboard/components/asset-detail";
import { CandlestickChart } from "@/features/dashboard/components/candlestick-chart";
import { ErrorBoundary } from "@/features/dashboard/components/error-boundary";
import { MemoryPanel } from "@/features/dashboard/components/memory-panel";
import { OrderBookAndTrades } from "@/features/dashboard/components/order-book";
import { OrdersAndHistory } from "@/features/dashboard/components/orders-history";
import { PositionsPanel } from "@/features/dashboard/components/positions-panel";
import {
  ConnectionStatus,
  SystemLogs,
} from "@/features/dashboard/components/system-logs";
import { TickerTape } from "@/features/dashboard/components/ticker-tape";
import {
  DashboardProvider,
  DEFAULT_SYMBOLS,
  useDashboard,
} from "@/features/dashboard/dashboard-context";
import { addLog } from "@/features/dashboard/hooks/use-log-store";
import { useSystemStatus } from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";

const COLOR_SCHEMES = [
  "phosphor",
  "arctic",
  "amber",
  "crimson",
  "matrix",
  "synthwave",
];

function DashboardShell() {
  const {
    selectedSymbol,
    setSelectedSymbol,
    selectedTimeframe,
    setActiveTab,
    activeTab,
    colorScheme,
    setColorScheme,
  } = useDashboard();

  const systemStatus = useSystemStatus();

  const prevStatusSigRef = useRef("");
  const prevErrorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (systemStatus.data) {
      const sig = `${systemStatus.data.okx.available}:${systemStatus.data.marketData.realtime}`;
      if (sig !== prevStatusSigRef.current) {
        prevStatusSigRef.current = sig;
        addLog(
          "INFO",
          "System",
          `Status loaded: OKX ${systemStatus.data.okx.available ? "online" : "offline"}, Market ${systemStatus.data.marketData.realtime ? "realtime" : "polling"}`,
        );
      }
    }
    if (systemStatus.error && systemStatus.error !== prevErrorRef.current) {
      prevErrorRef.current = systemStatus.error;
      addLog("ERROR", "System", `Status error: ${systemStatus.error}`);
    }
  }, [systemStatus.data, systemStatus.error]);

  const [_isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-mono overflow-hidden">
      {/* Top bar: Ticker Tape */}
      <ErrorBoundary label="Ticker">
        <TickerTape />
      </ErrorBoundary>

      {/* Symbol selector bar */}
      <div className="flex items-center gap-1 px-2 py-0.5 border-b border-border bg-secondary/50 overflow-x-auto">
        {DEFAULT_SYMBOLS.map((sym) => (
          <Button
            key={sym}
            variant={selectedSymbol === sym ? "default" : "ghost"}
            size="xs"
            className={cn(
              "text-[0.5625rem] shrink-0",
              selectedSymbol === sym && "terminal-glow",
            )}
            onClick={() => startTransition(() => setSelectedSymbol(sym))}
          >
            {sym.replace("-USDT", "")}
          </Button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme}
              type="button"
              className={cn(
                "w-3 h-3 rounded-sm border border-border text-[0.375rem] flex items-center justify-center cursor-pointer transition-all",
                colorScheme === scheme
                  ? "ring-1 ring-primary"
                  : "opacity-60 hover:opacity-100",
              )}
              style={{
                backgroundColor: `var(--color-terminal-${scheme === "phosphor" ? "green" : scheme === "arctic" ? "cyan" : scheme === "amber" ? "gold" : scheme === "crimson" ? "red" : scheme === "matrix" ? "green" : "primary"})`,
              }}
              onClick={() => setColorScheme(scheme)}
              aria-label={`Color scheme: ${scheme}`}
            />
          ))}
        </div>
      </div>

      {/* Main dashboard grid */}
      <div className="flex-1 grid grid-cols-[260px_1fr_280px] grid-rows-[1fr_auto] gap-px bg-border overflow-hidden p-0 m-0">
        {/* Left column: Asset Detail + Order Book */}
        <div className="flex flex-col gap-px bg-border overflow-hidden">
          <ErrorBoundary label="Asset Detail">
            <div className="flex-1 min-h-0 overflow-auto">
              <AssetDetail />
            </div>
          </ErrorBoundary>
          <ErrorBoundary label="Order Book">
            <div className="flex-1 min-h-0 overflow-auto">
              <OrderBookAndTrades />
            </div>
          </ErrorBoundary>
        </div>

        {/* Center: Chart + Orders */}
        <div className="flex flex-col gap-px bg-border overflow-hidden">
          <ErrorBoundary label="Chart">
            <div className="flex-1 min-h-0">
              <CandlestickChart />
            </div>
          </ErrorBoundary>
          <ErrorBoundary label="Orders">
            <div className="h-[180px] min-h-[180px]">
              <OrdersAndHistory />
            </div>
          </ErrorBoundary>
        </div>

        {/* Right column: Positions + Memory */}
        <div className="flex flex-col gap-px bg-border overflow-hidden">
          <ErrorBoundary label="Positions">
            <div className="flex-1 min-h-0 overflow-auto">
              <PositionsPanel />
            </div>
          </ErrorBoundary>
          <ErrorBoundary label="Memory">
            <div className="flex-1 min-h-0 overflow-auto">
              <MemoryPanel />
            </div>
          </ErrorBoundary>
        </div>

        {/* Bottom row: Agent + Logs + Connections, spanning full width */}
        {/* This is handled inside the grid rows */}
      </div>

      {/* Bottom panels: Agent + Logs + Connections */}
      <div
        className="grid grid-cols-[1fr_1fr_260px] gap-px bg-border border-t border-border"
        style={{ height: "200px" }}
      >
        <ErrorBoundary label="Agent">
          <AgentDashboard />
        </ErrorBoundary>
        <ErrorBoundary label="Logs">
          <SystemLogs />
        </ErrorBoundary>
        <ErrorBoundary label="Connections">
          <ConnectionStatus />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardProvider>
      <DashboardShell />
    </DashboardProvider>
  );
}
