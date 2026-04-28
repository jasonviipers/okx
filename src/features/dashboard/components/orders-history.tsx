"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useExecutionIntents,
  useTradeHistory,
} from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";
import type {
  StoredExecutionIntent,
  StoredTradeExecution,
} from "@/types/history";

export function OrdersAndHistory() {
  const tradeHistory = useTradeHistory(50);
  const executionIntents = useExecutionIntents(50);
  const [activeTab, setActiveTab] = useState<"fills" | "trades" | "attempts">(
    "fills",
  );

  const fills: StoredTradeExecution[] = tradeHistory.data?.entries ?? [];
  const intents: StoredExecutionIntent[] = executionIntents.data?.entries ?? [];
  const filledFills = fills.filter(
    (fill: StoredTradeExecution) =>
      fill.success && fill.order.status === "filled",
  );
  const historyBusy = tradeHistory.loading || tradeHistory.refreshing;
  const intentsBusy = executionIntents.loading || executionIntents.refreshing;
  const priceHeader = activeTab === "attempts" ? "Edge" : "Price";
  const infoHeader = activeTab === "attempts" ? "Reason" : "Info";

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span>Trade History</span>
            {(activeTab === "attempts" ? intentsBusy : historyBusy) && (
              <span className="text-[0.5rem] uppercase tracking-wider text-terminal-dim">
                Syncing
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {(["fills", "trades", "attempts"] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "ghost"}
                size="xs"
                className="text-[0.5625rem]"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "fills"
                  ? "Filled"
                  : tab === "trades"
                    ? "All"
                    : "Attempts"}
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
          <span className="text-right">{priceHeader}</span>
          <span className="text-right">Status</span>
          <span className="text-right">{infoHeader}</span>
        </div>

        {activeTab === "fills" &&
          (tradeHistory.error ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-red text-center">
              {tradeHistory.error}
            </div>
          ) : tradeHistory.loading && fills.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              Loading filled orders...
            </div>
          ) : filledFills.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No filled orders
            </div>
          ) : (
            filledFills.map((fill: StoredTradeExecution) => (
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
                  {fill.order.notionalUsd != null &&
                  fill.order.notionalUsd !== undefined
                    ? `$${fill.order.notionalUsd.toFixed(2)}`
                    : "—"}
                </span>
              </div>
            ))
          ))}

        {activeTab === "trades" &&
          (tradeHistory.error ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-red text-center">
              {tradeHistory.error}
            </div>
          ) : tradeHistory.loading && fills.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              Loading trade history...
            </div>
          ) : fills.length === 0 ? (
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

        {activeTab === "attempts" &&
          (executionIntents.error ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-red text-center">
              {executionIntents.error}
            </div>
          ) : executionIntents.loading && intents.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              Loading execution attempts...
            </div>
          ) : intents.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No execution attempts yet
            </div>
          ) : (
            intents.map((intent: StoredExecutionIntent) => (
              <div
                key={intent.id}
                className="grid grid-cols-7 text-[0.5625rem] font-mono px-2 py-px border-b border-border/50 hover:bg-secondary/50"
              >
                <span className="text-terminal-dim">
                  {new Date(intent.updatedAt).toLocaleTimeString()}
                </span>
                <span>{intent.symbol}</span>
                <span
                  className={
                    intent.decision === "BUY"
                      ? "text-terminal-green"
                      : intent.decision === "SELL"
                        ? "text-terminal-red"
                        : "text-terminal-amber"
                  }
                >
                  {intent.decision}
                </span>
                <span className="text-right tabular-nums">
                  {intent.normalizedSize?.toFixed(4) ??
                    intent.targetSize.toFixed(4)}
                </span>
                <span className="text-right tabular-nums">
                  {(intent.decisionSnapshot.expectedNetEdgeBps ?? 0).toFixed(2)}
                </span>
                <span
                  className={cn(
                    "text-right uppercase",
                    intent.status === "success"
                      ? "text-terminal-green"
                      : intent.status === "error"
                        ? "text-terminal-red"
                        : "text-terminal-amber",
                  )}
                >
                  {intent.status}
                </span>
                <span
                  className="text-right truncate text-terminal-dim"
                  title={intent.reason}
                >
                  {intent.reason ?? "—"}
                </span>
              </div>
            ))
          ))}
      </CardContent>
    </Card>
  );
}