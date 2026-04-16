"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketFeedStatus } from "@/types/market";

const DEFAULT_TICKERS = [
  { symbol: "BTC-USDT", last: 0, change24h: 0 },
  { symbol: "ETH-USDT", last: 0, change24h: 0 },
  { symbol: "SOL-USDT", last: 0, change24h: 0 },
  { symbol: "XRP-USDT", last: 0, change24h: 0 },
  { symbol: "DOGE-USDT", last: 0, change24h: 0 },
];

interface TickerEntry {
  symbol: string;
  last: number;
  change24h: number;
  status?: MarketFeedStatus;
}

export function TickerBar() {
  const [tickers, setTickers] = useState<TickerEntry[]>(DEFAULT_TICKERS);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      symbols: DEFAULT_TICKERS.map((ticker) => ticker.symbol).join(","),
      timeframe: "1H",
      intervalMs: "2000",
    });
    const eventSource = new EventSource(
      `/api/ai/market/stream?${params.toString()}`,
    );

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: "market";
          symbol?: string;
          snapshot?: {
            context: {
              ticker: {
                last: number;
                change24h: number;
              };
            };
            status: MarketFeedStatus;
          };
        };

        if (payload.type !== "market" || !payload.symbol || !payload.snapshot) {
          return;
        }

        const snapshot = payload.snapshot;
        setTickers((prev) =>
          prev.map((entry) =>
            entry.symbol === payload.symbol
              ? {
                  ...entry,
                  last: snapshot.context.ticker.last ?? entry.last,
                  change24h:
                    snapshot.context.ticker.change24h ?? entry.change24h,
                  status: snapshot.status,
                }
              : entry,
          ),
        );
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  return (
    <div className="flex items-center border-b border-border bg-secondary h-6 overflow-hidden">
      <div className="flex items-center px-2 border-r border-border h-full shrink-0">
        <span className="text-[0.5625rem] uppercase tracking-wider text-primary font-bold">
          MKT
        </span>
      </div>
      <div ref={scrollRef} className="flex overflow-hidden flex-1">
        <div className="flex animate-ticker whitespace-nowrap">
          {[...tickers, ...tickers].map((t, i) => (
            <span
              key={`${t.symbol}-${i}`}
              className="inline-flex items-center gap-2 px-2 text-[0.625rem] font-mono"
            >
              <span className="text-primary font-bold w-16">
                {t.symbol.replace("-USDT", "")}
              </span>
              <span
                className={`${t.change24h >= 0 ? "data-positive" : "data-negative"} w-20 text-right`}
              >
                {t.last > 0
                  ? t.last.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "---"}
              </span>
              <span
                className={`${t.change24h >= 0 ? "data-positive" : "data-negative"} w-16 text-right`}
              >
                {t.change24h >= 0 ? "+" : ""}
                {t.change24h.toFixed(2)}%
              </span>
              <span className="text-terminal-dim mx-2">|</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center px-2 border-l border-border h-full shrink-0">
        <span className="text-[0.5625rem] text-terminal-green animate-pulse-soft">
          ●
        </span>
      </div>
    </div>
  );
}
