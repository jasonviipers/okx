"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_SYMBOLS,
  useDashboard,
} from "@/features/dashboard/dashboard-context";
import { useTickerFeed } from "@/features/dashboard/hooks/use-market-data";
import { cn } from "@/lib/utils";

export function TickerTape() {
  const { selectedSymbol, setSelectedSymbol } = useDashboard();
  const tickers = useTickerFeed(DEFAULT_SYMBOLS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div
      role="marquee"
      className="w-full h-7 bg-card border-b border-border overflow-hidden flex items-center relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center gap-4 whitespace-nowrap h-full px-2",
          isPaused ? "" : "animate-ticker",
        )}
        style={{ width: "max-content" }}
      >
        {[...DEFAULT_SYMBOLS, ...DEFAULT_SYMBOLS].map((sym, i) => {
          const ticker = tickers.find((t) => t.symbol === sym);
          const change = ticker?.change24h ?? 0;
          const isPositive = change >= 0;
          const isSelected = sym === selectedSymbol;
          const isFirstHalf = i < DEFAULT_SYMBOLS.length;

          return (
            <button
              key={`${sym}-${isFirstHalf ? "a" : "b"}`}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              className={cn(
                "flex items-center gap-1.5 text-[0.625rem] font-mono cursor-pointer transition-colors hover:text-primary shrink-0",
                isSelected
                  ? "text-primary terminal-glow"
                  : "text-secondary-foreground",
              )}
              aria-label={`Select ${sym}`}
            >
              <span className="font-semibold">{sym.replace("-USDT", "")}</span>
              {ticker ? (
                <>
                  <span
                    className={cn(
                      "tabular-nums",
                      isPositive ? "text-terminal-green" : "text-terminal-red",
                    )}
                  >
                    {ticker.last.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: ticker.last < 1 ? 6 : 2,
                    })}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      isPositive ? "text-terminal-green" : "text-terminal-red",
                    )}
                  >
                    {isPositive ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-terminal-dim">---</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
