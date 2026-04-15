"use client";

import type { OKXTicker } from "@/types/market";

interface TickerBarProps {
  ticker: OKXTicker | null;
  loading?: boolean;
}

export function TickerBar({ ticker, loading = false }: TickerBarProps) {
  if (loading || !ticker) {
    return (
      <div className="bloomberg-panel">
        <div className="bloomberg-panel-header">
          <h3>Ticker</h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
        </div>
        <div className="h-6 animate-pulse-soft" />
      </div>
    );
  }

  const isPositive = ticker.change24h >= 0;

  return (
    <div className="bloomberg-panel">
      <div className="bloomberg-panel-header">
        <h3>Ticker</h3>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {new Date(ticker.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="flex items-center gap-0 overflow-x-auto">
        <div className="flex items-center gap-0 text-[11px] min-h-[20px]">
          <span className="bloomberg-label px-1">Symbol</span>
          <span className="bloomberg-value text-[var(--terminal-amber)] font-bold px-2 border-r border-[var(--border)]">
            {ticker.symbol}
          </span>

          <span className="bloomberg-label px-1">Last</span>
          <span className="bloomberg-value text-[var(--foreground)] font-bold px-2 border-r border-[var(--border)] tabular-nums">
            ${ticker.last.toLocaleString()}
          </span>

          <span className="bloomberg-label px-1">Chg</span>
          <span
            className={`font-bold px-2 border-r border-[var(--border)] tabular-nums ${isPositive ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
          >
            {isPositive ? "+" : ""}
            {ticker.change24h.toFixed(2)}%
          </span>

          <span className="bloomberg-label px-1">H</span>
          <span className="bloomberg-value text-[var(--terminal-cyan)] px-2 border-r border-[var(--border)] tabular-nums">
            {ticker.high24h.toLocaleString()}
          </span>

          <span className="bloomberg-label px-1">L</span>
          <span className="bloomberg-value text-[var(--terminal-red)] px-2 border-r border-[var(--border)] tabular-nums">
            {ticker.low24h.toLocaleString()}
          </span>

          <span className="bloomberg-label px-1">Vol</span>
          <span className="bloomberg-value text-[var(--foreground)] px-2 border-r border-[var(--border)] tabular-nums">
            {ticker.vol24h.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </span>

          <span className="bloomberg-label px-1">Bid</span>
          <span className="bloomberg-value-positive px-2 border-r border-[var(--border)] tabular-nums">
            {ticker.bid}
          </span>

          <span className="bloomberg-label px-1">Ask</span>
          <span className="bloomberg-value-negative px-2 border-r border-[var(--border)] tabular-nums">
            {ticker.ask}
          </span>

          <span className="bloomberg-label px-1">Spread</span>
          <span className="bloomberg-value text-[var(--terminal-gold)] px-2 tabular-nums">
            {(
              ((ticker.ask - ticker.bid) / Math.max(ticker.last, 1)) *
              100
            ).toFixed(3)}
            %
          </span>
        </div>
      </div>
    </div>
  );
}
