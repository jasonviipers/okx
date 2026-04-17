"use client";

import type { WatchlistItem } from "@/hooks/use-terminal-data";

function WatchlistPanel({ items }: { items: WatchlistItem[] }) {
  if (items.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO DATA</div>
    );
  }

  return (
    <div className="flex flex-col gap-0 p-0">
      <div className="bloomberg-grid">
        <div className="grid grid-cols-[5rem_4.5rem_3.5rem_3.5rem_3.5rem_3rem_3.5rem] gap-px">
          <div className="data-header bg-secondary">SYMBOL</div>
          <div className="data-header bg-secondary text-right">PRICE</div>
          <div className="data-header bg-secondary text-right">24H%</div>
          <div className="data-header bg-secondary text-right">HIGH</div>
          <div className="data-header bg-secondary text-right">LOW</div>
          <div className="data-header bg-secondary text-right">VOL</div>
          <div className="data-header bg-secondary text-right">BID/ASK</div>
        </div>
        {items.map((item) => {
          const changeClass =
            item.ticker.change24h >= 0
              ? "text-terminal-green"
              : "text-terminal-red";
          const formatVol = (v: number) => {
            if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
            if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
            return v.toFixed(0);
          };

          return (
            <div
              key={item.symbol}
              className="grid grid-cols-[5rem_4.5rem_3.5rem_3.5rem_3.5rem_3rem_3.5rem] gap-px hover:bg-secondary/50"
            >
              <div className="data-cell text-terminal-cyan truncate">
                {item.symbol}
              </div>
              <div className="data-cell text-right tabular-nums font-bold">
                {item.ticker.last < 1
                  ? item.ticker.last.toFixed(6)
                  : item.ticker.last < 100
                    ? item.ticker.last.toFixed(4)
                    : item.ticker.last.toFixed(2)}
              </div>
              <div
                className={`data-cell text-right tabular-nums ${changeClass}`}
              >
                {item.ticker.change24h >= 0 ? "+" : ""}
                {item.ticker.change24h.toFixed(2)}%
              </div>
              <div className="data-cell text-right tabular-nums text-muted-foreground">
                {item.ticker.high24h < 100
                  ? item.ticker.high24h.toFixed(4)
                  : item.ticker.high24h.toFixed(2)}
              </div>
              <div className="data-cell text-right tabular-nums text-muted-foreground">
                {item.ticker.low24h < 100
                  ? item.ticker.low24h.toFixed(4)
                  : item.ticker.low24h.toFixed(2)}
              </div>
              <div className="data-cell text-right tabular-nums text-muted-foreground">
                {formatVol(item.ticker.vol24h)}
              </div>
              <div className="data-cell text-right tabular-nums text-muted-foreground">
                <span className="text-terminal-green">
                  {item.ticker.bid.toFixed(2)}
                </span>
                <span className="text-terminal-dim">/</span>
                <span className="text-terminal-red">
                  {item.ticker.ask.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { WatchlistPanel };
