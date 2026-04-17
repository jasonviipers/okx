"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/features/dashboard/dashboard-context";
import { useMarketSnapshot } from "@/features/dashboard/hooks/use-market-data";
import { cn } from "@/lib/utils";

export function OrderBookAndTrades() {
  const { selectedSymbol, selectedTimeframe } = useDashboard();
  const snapshot = useMarketSnapshot(selectedSymbol, selectedTimeframe);

  const orderbook = snapshot.data?.orderbook;
  const ticker = snapshot.data?.ticker;

  const maxBidSize = useMemo(() => {
    if (!orderbook) return 1;
    return Math.max(...orderbook.bids.slice(0, 15).map((b) => b.size), 1);
  }, [orderbook]);

  const maxAskSize = useMemo(() => {
    if (!orderbook) return 1;
    return Math.max(...orderbook.asks.slice(0, 15).map((a) => a.size), 1);
  }, [orderbook]);

  const spread = useMemo(() => {
    if (
      !orderbook ||
      orderbook.bids.length === 0 ||
      orderbook.asks.length === 0
    )
      return null;
    const bestBid = orderbook.bids[0].price;
    const bestAsk = orderbook.asks[0].price;
    return {
      spread: bestAsk - bestBid,
      spreadBps: ((bestAsk - bestBid) / bestAsk) * 10000,
      mid: (bestAsk + bestBid) / 2,
    };
  }, [orderbook]);

  if (snapshot.loading && !snapshot.data) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle>Order Book</CardTitle>
        </CardHeader>
        <CardContent className="p-2 animate-pulse-soft text-terminal-dim text-[0.625rem]">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (!orderbook) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle>Order Book</CardTitle>
        </CardHeader>
        <CardContent className="p-2 text-terminal-dim text-[0.625rem]">
          No data
        </CardContent>
      </Card>
    );
  }

  const bids = orderbook.bids.slice(0, 15);
  const asks = orderbook.asks.slice(0, 15);

  return (
    <Card size="sm" className="h-full overflow-hidden flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>Order Book</span>
          {spread && (
            <span className="text-[0.5625rem] font-mono text-terminal-dim">
              Spread: {spread.spreadBps.toFixed(1)}bps (
              {spread.spread.toFixed(2)})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        {/* Headers */}
        <div className="grid grid-cols-3 text-[0.5rem] uppercase tracking-wider text-terminal-dim px-2 py-0.5 border-b border-border sticky top-0 bg-card">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (reversed, lowest ask at bottom) */}
        <div className="flex flex-col-reverse">
          {asks.map((level, i) => {
            const cumSize = asks
              .slice(0, i + 1)
              .reduce((acc, l) => acc + l.size, 0);
            const barWidth = (level.size / maxAskSize) * 100;
            return (
              <div
                key={`ask-${i}-${level.price}`}
                className="grid grid-cols-3 text-[0.5625rem] font-mono px-2 py-px relative hover:bg-terminal-red/5"
              >
                <div
                  className="absolute inset-0 bg-terminal-red/10"
                  style={{ width: `${barWidth}%`, right: 0, left: "auto" }}
                />
                <span className="relative text-terminal-red tabular-nums">
                  {level.price.toFixed(2)}
                </span>
                <span className="relative text-right tabular-nums">
                  {level.size.toFixed(4)}
                </span>
                <span className="relative text-right tabular-nums text-terminal-dim">
                  {cumSize.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Spread / Mid price indicator */}
        {ticker && (
          <div className="flex items-center justify-center py-1 border-y border-border bg-secondary text-[0.6875rem] font-mono font-bold tabular-nums">
            <span
              className={cn(
                ticker.change24h >= 0
                  ? "text-terminal-green"
                  : "text-terminal-red",
              )}
            >
              {ticker.last.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })}
            </span>
          </div>
        )}

        {/* Bids */}
        <div className="flex flex-col">
          {bids.map((level, i) => {
            const cumSize = bids
              .slice(0, i + 1)
              .reduce((acc, l) => acc + l.size, 0);
            const barWidth = (level.size / maxBidSize) * 100;
            return (
              <div
                key={`bid-${i}-${level.price}`}
                className="grid grid-cols-3 text-[0.5625rem] font-mono px-2 py-px relative hover:bg-terminal-green/5"
              >
                <div
                  className="absolute inset-0 bg-terminal-green/10"
                  style={{ width: `${barWidth}%`, right: 0, left: "auto" }}
                />
                <span className="relative text-terminal-green tabular-nums">
                  {level.price.toFixed(2)}
                </span>
                <span className="relative text-right tabular-nums">
                  {level.size.toFixed(4)}
                </span>
                <span className="relative text-right tabular-nums text-terminal-dim">
                  {cumSize.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
