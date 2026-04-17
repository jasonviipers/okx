"use client";

import { useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/features/dashboard/dashboard-context";
import { useMarketSnapshot } from "@/features/dashboard/hooks/use-market-data";
import { cn } from "@/lib/utils";

function formatNumber(n: number, decimals = 2): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return "---";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

function formatPct(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return "---";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function DataField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-px", className)}>
      <span className="text-[0.5625rem] uppercase tracking-wider text-terminal-dim">
        {label}
      </span>
      <span className="text-[0.6875rem] font-mono tabular-nums">{value}</span>
    </div>
  );
}

export function AssetDetail() {
  const { selectedSymbol, selectedTimeframe } = useDashboard();
  const [_isPending, _startTransition] = useTransition();
  const snapshot = useMarketSnapshot(selectedSymbol, selectedTimeframe);

  const ticker = snapshot.data?.ticker;
  const orderbook = snapshot.data?.orderbook;
  const status = snapshot.data?.status;

  const spread = useMemo(() => {
    if (!orderbook) return null;
    const bestBid = orderbook.bids[0]?.price ?? 0;
    const bestAsk = orderbook.asks[0]?.price ?? 0;
    if (!bestBid || !bestAsk) return null;
    return {
      bid: bestBid,
      ask: bestAsk,
      spread: bestAsk - bestBid,
      spreadBps: ((bestAsk - bestBid) / bestAsk) * 10000,
    };
  }, [orderbook]);

  const change24h = ticker?.change24h ?? 0;
  const isUp = change24h >= 0;

  if (snapshot.loading) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle>Asset Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-2 animate-pulse-soft text-terminal-dim text-[0.625rem]">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (snapshot.error || !ticker) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle>Asset Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-2 text-terminal-red text-[0.625rem]">
          {snapshot.error ?? "No data available"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="h-full overflow-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>
            {selectedSymbol}{" "}
            <span
              className={cn(
                "text-[0.6875rem]",
                isUp ? "text-terminal-green" : "text-terminal-red",
              )}
            >
              {formatPct(change24h)}
            </span>
          </span>
          <span className="text-terminal-dim text-[0.5625rem]">
            {status?.source ?? "---"} {status?.realtime ? "LIVE" : "REST"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-2">
        {/* Price header */}
        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              "text-lg font-mono font-bold tabular-nums",
              isUp ? "text-terminal-green" : "text-terminal-red",
            )}
          >
            {ticker.last.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 6,
            })}
          </span>
        </div>

        {/* Spread */}
        {spread && (
          <div className="flex gap-4 text-[0.5625rem] font-mono text-terminal-dim">
            <span>
              Bid:{" "}
              <span className="text-terminal-green">
                {spread.bid.toFixed(2)}
              </span>
            </span>
            <span>
              Ask:{" "}
              <span className="text-terminal-red">{spread.ask.toFixed(2)}</span>
            </span>
            <span>Spread: {spread.spreadBps.toFixed(1)}bps</span>
          </div>
        )}

        {/* Price data grid */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1">
          <DataField
            label="Open"
            value={formatNumber(
              ticker.last - (ticker.change24h / 100) * ticker.last,
            )}
          />
          <DataField label="High 24h" value={formatNumber(ticker.high24h)} />
          <DataField label="Low 24h" value={formatNumber(ticker.low24h)} />
          <DataField label="Volume 24h" value={formatNumber(ticker.vol24h)} />
          <DataField label="Bid Size" value={formatNumber(ticker.bidSize, 4)} />
          <DataField label="Ask Size" value={formatNumber(ticker.askSize, 4)} />
          <DataField label="Change 24h" value={formatPct(ticker.change24h)} />
          <DataField label="Bid" value={ticker.bid.toFixed(2)} />
          <DataField label="Ask" value={ticker.ask.toFixed(2)} />
        </div>

        {/* Feed status */}
        {status && (
          <div className="border-t border-border pt-2 mt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <DataField label="Feed Source" value={status.source} />
              <DataField
                label="Realtime"
                value={status.realtime ? "Yes" : "No"}
              />
              <DataField label="Connection" value={status.connectionState} />
              <DataField
                label="Tradeable"
                value={status.tradeable ? "Yes" : "No"}
              />
              {status.lastEventAt && (
                <DataField
                  label="Last Event"
                  value={new Date(status.lastEventAt).toLocaleTimeString()}
                />
              )}
              {status.warnings.length > 0 && (
                <DataField
                  label="Warnings"
                  value={status.warnings.join("; ")}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
