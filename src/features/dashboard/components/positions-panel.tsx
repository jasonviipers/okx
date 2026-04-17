"use client";

import { useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount, usePositions } from "@/hooks/use-terminal-data";
import { cn } from "@/lib/utils";
import type { AccountOverview, Position } from "@/types/trade";

function formatUsd(n: number): string {
  if (Number.isNaN(n) || !Number.isFinite(n)) return "---";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number): { text: string; className: string } {
  if (Number.isNaN(n) || !Number.isFinite(n))
    return { text: "---", className: "text-terminal-dim" };
  const text = `${n >= 0 ? "+" : ""}$${n.toFixed(2)}`;
  const className = n >= 0 ? "text-terminal-green" : "text-terminal-red";
  return { text, className };
}

export function PositionsPanel() {
  const positionsData = usePositions();
  const accountData = useAccount();
  const [_isPending, _startTransition] = useTransition();

  const positions: Position[] = positionsData.data?.positions ?? [];
  const overview: AccountOverview | undefined = accountData.data?.overview;
  const spotHoldings = (overview?.tradingBalances ?? []).filter(
    (balance) => balance.availableBalance > 0,
  );

  const totalPnl = useMemo(() => {
    return positions.reduce(
      (acc: number, p: Position) => acc + (p.pnl ?? 0),
      0,
    );
  }, [positions]);

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <span>Portfolio</span>
          {overview && (
            <span className="text-[0.5625rem] font-mono text-terminal-dim">
              Equity: {formatUsd(overview.totalEquity)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        {overview && (
          <div className="grid grid-cols-3 gap-px bg-border text-[0.5625rem]">
            <div className="bg-card px-2 py-1.5">
              <div className="text-terminal-dim uppercase">Total Equity</div>
              <div className="font-mono tabular-nums">
                {formatUsd(overview.totalEquity)}
              </div>
            </div>
            <div className="bg-card px-2 py-1.5">
              <div className="text-terminal-dim uppercase">Available</div>
              <div className="font-mono tabular-nums">
                {formatUsd(overview.availableEquity)}
              </div>
            </div>
            <div className="bg-card px-2 py-1.5">
              <div className="text-terminal-dim uppercase">Day P&L</div>
              <div
                className={cn(
                  "font-mono tabular-nums",
                  formatPnl(totalPnl).className,
                )}
              >
                {formatPnl(totalPnl).text}
              </div>
            </div>
            {overview.unrealizedPnl !== undefined && (
              <div className="bg-card px-2 py-1.5">
                <div className="text-terminal-dim uppercase">
                  Unrealized P&L
                </div>
                <div
                  className={cn(
                    "font-mono tabular-nums",
                    formatPnl(overview.unrealizedPnl).className,
                  )}
                >
                  {formatPnl(overview.unrealizedPnl).text}
                </div>
              </div>
            )}
            {overview.marginRatio !== undefined && (
              <div className="bg-card px-2 py-1.5">
                <div className="text-terminal-dim uppercase">Margin Ratio</div>
                <div className="font-mono tabular-nums">
                  {(overview.marginRatio * 100).toFixed(2)}%
                </div>
              </div>
            )}
            {overview.notionalUsd !== undefined && (
              <div className="bg-card px-2 py-1.5">
                <div className="text-terminal-dim uppercase">Notional</div>
                <div className="font-mono tabular-nums">
                  {formatUsd(overview.notionalUsd)}
                </div>
              </div>
            )}
            <div className="bg-card px-2 py-1.5">
              <div className="text-terminal-dim uppercase">Mode</div>
              <div className="font-mono">
                {overview.accountMode.toUpperCase()}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-border">
          <div className="grid grid-cols-7 text-[0.5rem] uppercase tracking-wider text-terminal-dim px-2 py-0.5 border-b border-border bg-secondary">
            <span>Symbol</span>
            <span>Side</span>
            <span className="text-right">Size</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Mark</span>
            <span className="text-right">P&L</span>
            <span className="text-right">P&L%</span>
          </div>
          {positions.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No open derivative-style positions
            </div>
          ) : (
            positions.map((pos: Position, index: number) => {
              const pnlFmt = formatPnl(pos.pnl);
              return (
                <div
                  key={`${pos.symbol}-${pos.side}-${index}`}
                  className="grid grid-cols-7 text-[0.5625rem] font-mono px-2 py-px border-b border-border/50 hover:bg-secondary/50"
                >
                  <span className="font-semibold">{pos.symbol}</span>
                  <span
                    className={
                      pos.side === "buy"
                        ? "text-terminal-green"
                        : "text-terminal-red"
                    }
                  >
                    {pos.side.toUpperCase()}
                  </span>
                  <span className="text-right tabular-nums">{pos.size}</span>
                  <span className="text-right tabular-nums">
                    {pos.entryPrice.toFixed(2)}
                  </span>
                  <span className="text-right tabular-nums">
                    {pos.currentPrice.toFixed(2)}
                  </span>
                  <span
                    className={cn("text-right tabular-nums", pnlFmt.className)}
                  >
                    {pnlFmt.text}
                  </span>
                  <span
                    className={cn(
                      "text-right tabular-nums",
                      pos.pnlPercent >= 0
                        ? "text-terminal-green"
                        : "text-terminal-red",
                    )}
                  >
                    {pos.pnlPercent >= 0 ? "+" : ""}
                    {pos.pnlPercent.toFixed(2)}%
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border">
          <div className="grid grid-cols-4 text-[0.5rem] uppercase tracking-wider text-terminal-dim px-2 py-0.5 border-b border-border bg-secondary">
            <span>Asset</span>
            <span className="text-right">Available</span>
            <span className="text-right">Equity</span>
            <span className="text-right">USD</span>
          </div>
          {spotHoldings.length === 0 ? (
            <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
              No spot holdings visible
            </div>
          ) : (
            spotHoldings.map((balance) => (
              <div
                key={balance.currency}
                className="grid grid-cols-4 text-[0.5625rem] font-mono px-2 py-px border-b border-border/50 hover:bg-secondary/50"
              >
                <span className="font-semibold">{balance.currency}</span>
                <span className="text-right tabular-nums">
                  {balance.availableBalance.toFixed(6)}
                </span>
                <span className="text-right tabular-nums">
                  {balance.equity.toFixed(6)}
                </span>
                <span className="text-right tabular-nums">
                  {formatUsd(balance.usdValue)}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
