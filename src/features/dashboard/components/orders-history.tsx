"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTradeHistory } from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";
import type { StoredTradeExecution } from "@/types/history";

export function OrdersAndHistory() {
  const tradeHistory = useTradeHistory(50);
  const [activeTab, setActiveTab] = useState<"fills" | "trades">("fills");

  const fills: StoredTradeExecution[] = tradeHistory.data?.entries ?? [];

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>Trade History</span>
          <div className="flex gap-1">
            {(["fills", "trades"] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "ghost"}
                size="xs"
                className="text-[0.5625rem]"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "fills" ? "Filled" : "All"}
              </Button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        <div className="grid grid-cols-7 text-[0.5rem] uppercase tracking-wider text-terminal-dim px-2 py-0.5 border-b border-border bg-secondary sticky top-0">
          <span>Time</span>
          <span>Symbol</span>
          <span>Side</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Status</span>
          <span className="text-right">Info</span>
        </div>

        {activeTab === "fills" &&
          (fills.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No filled orders
            </div>
          ) : (
            fills
              .filter(
                (fill: StoredTradeExecution) =>
                  fill.success && fill.order.status === "filled",
              )
              .map((fill: StoredTradeExecution) => (
                <div
                  key={fill.id}
                  className="grid grid-cols-7 text-[0.5625rem] font-mono px-2 py-px border-b border-border/50 hover:bg-secondary/50"
                >
                  <span className="text-terminal-dim">
                    {new Date(fill.timestamp).toLocaleTimeString()}
                  </span>
                  <span>{fill.symbol}</span>
                  <span
                    className={
                      fill.order.side === "buy"
                        ? "text-terminal-green"
                        : "text-terminal-red"
                    }
                  >
                    {fill.order.side.toUpperCase()}
                  </span>
                  <span className="text-right tabular-nums">
                    {fill.order.size}
                  </span>
                  <span className="text-right tabular-nums">
                    {fill.order.filledPrice?.toFixed(2) ??
                      fill.order.price?.toFixed(2) ??
                      "—"}
                  </span>
                  <span className="text-right text-terminal-green">FILLED</span>
                  <span className="text-right tabular-nums text-terminal-dim">
                    {fill.order.notionalUsd
                      ? `$${fill.order.notionalUsd.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
              ))
          ))}

        {activeTab === "trades" &&
          (fills.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No trade history
            </div>
          ) : (
            fills.map((fill: StoredTradeExecution) => (
              <div
                key={fill.id}
                className="grid grid-cols-7 text-[0.5625rem] font-mono px-2 py-px border-b border-border/50 hover:bg-secondary/50"
              >
                <span className="text-terminal-dim">
                  {new Date(fill.timestamp).toLocaleTimeString()}
                </span>
                <span>{fill.symbol}</span>
                <span
                  className={
                    fill.order.side === "buy"
                      ? "text-terminal-green"
                      : "text-terminal-red"
                  }
                >
                  {fill.order.side.toUpperCase()}
                </span>
                <span className="text-right tabular-nums">
                  {fill.order.size}
                </span>
                <span className="text-right tabular-nums">
                  {fill.order.filledPrice?.toFixed(2) ??
                    fill.order.price?.toFixed(2) ??
                    "—"}
                </span>
                <span
                  className={cn(
                    "text-right",
                    fill.success ? "text-terminal-green" : "text-terminal-red",
                  )}
                >
                  {fill.success ? "OK" : "ERR"}
                </span>
                <span className="text-right tabular-nums text-terminal-dim">
                  {fill.performance?.realizedSlippageBps?.toFixed(1) ?? "—"}
                </span>
              </div>
            ))
          ))}
      </CardContent>
    </Card>
  );
}
