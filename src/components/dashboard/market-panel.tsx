"use client";

import { useCallback, useEffect, useState } from "react";
import { getCandles, getTicker } from "@/lib/api/client";
import type { SourceHealth } from "@/types/api";
import type { Candle, MarketFeedStatus, OKXTicker } from "@/types/market";

interface MarketPanelProps {
  symbol: string;
  timeframe: string;
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function MarketPanel({ symbol, timeframe }: MarketPanelProps) {
  const [ticker, setTicker] = useState<OKXTicker | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [prevLast, setPrevLast] = useState<number>(0);
  const [tickerHealth, setTickerHealth] = useState<SourceHealth | null>(null);
  const [candlesHealth, setCandlesHealth] = useState<SourceHealth | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketFeedStatus | null>(
    null,
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tickerResponse, candlesResponse] = await Promise.all([
        getTicker(symbol),
        getCandles(symbol, timeframe, 20),
      ]);

      const newTicker = tickerResponse.data.ticker as OKXTicker;
      setTicker((prev) => {
        if (prev) {
          setPrevLast(prev.last);
        }
        return newTicker;
      });
      setCandles(candlesResponse.data.candles ?? []);
      setMarketStatus(
        candlesResponse.data.status ?? tickerResponse.data.status ?? null,
      );
      setTickerHealth(tickerResponse.sourceHealth?.ticker ?? null);
      setCandlesHealth(candlesResponse.sourceHealth?.candles ?? null);
      setUpdatedAt(
        tickerResponse.data.status?.lastEventAt ??
          candlesResponse.data.status?.lastEventAt ??
          tickerResponse.timestamp ??
          candlesResponse.timestamp,
      );
    } catch {}
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchData();

    const params = new URLSearchParams({
      symbols: symbol,
      timeframe,
      intervalMs: "2000",
    });
    const eventSource = new EventSource(
      `/api/ai/market/stream?${params.toString()}`,
    );

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: "market";
          snapshot?: {
            context: {
              ticker: OKXTicker;
              candles: Candle[];
            };
            status: MarketFeedStatus;
          };
        };

        if (payload.type !== "market" || !payload.snapshot) {
          return;
        }

        setTicker((prev) => {
          if (prev) {
            setPrevLast(prev.last);
          }
          return payload.snapshot?.context.ticker ?? prev;
        });
        setCandles(payload.snapshot.context.candles ?? []);
        setMarketStatus(payload.snapshot.status);
        setUpdatedAt(
          payload.snapshot.status.lastEventAt ?? new Date().toISOString(),
        );
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [fetchData, symbol, timeframe]);

  const change24h = ticker?.change24h ?? 0;
  const lastPrice = ticker?.last ?? 0;
  const flashClass =
    prevLast > 0
      ? lastPrice > prevLast
        ? "flash-up"
        : lastPrice < prevLast
          ? "flash-down"
          : ""
      : "";

  const high = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : 0;
  const low = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : 0;
  const avgVol =
    candles.length > 0
      ? candles.reduce((sum, c) => sum + c.volume, 0) / candles.length
      : 0;

  const priceMin = low || 0;
  const priceRange = high - low || 1;
  const barWidth = candles.length > 0 ? 100 / candles.length : 0;
  const marketSource =
    marketStatus?.source ??
    tickerHealth?.source ??
    candlesHealth?.source ??
    "unknown";
  const sourceTone =
    marketSource === "fallback"
      ? "data-negative"
      : marketSource === "rest" || marketSource === "cache"
        ? "text-terminal-amber"
        : "data-positive";

  return (
    <div className="bloomberg-panel h-full">
      <div className="bloomberg-header">
        <span>MARKET DATA - {symbol}</span>
        <div className="flex items-center gap-2 text-[0.5625rem]">
          <span className={sourceTone}>{marketSource.toUpperCase()}</span>
          <span className="text-terminal-dim">{timeframe}</span>
          {marketStatus && (
            <span
              className={
                marketStatus.tradeable
                  ? "data-positive"
                  : marketStatus.stale
                    ? "text-terminal-amber"
                    : "data-negative"
              }
            >
              {marketStatus.tradeable
                ? marketStatus.realtime
                  ? "LIVE"
                  : "SYNC"
                : marketStatus.stale
                  ? "STALE"
                  : "BLOCK"}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        <div className="mb-1 text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          Snapshot:{" "}
          {updatedAt
            ? new Date(updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "--:--:--"}
          {marketStatus?.warnings[0]
            ? ` | ${marketStatus.warnings[0]}`
            : tickerHealth?.warning
              ? ` | ${tickerHealth.warning}`
              : ""}
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-b border-border">
              <td className="data-header w-[70px]">LAST</td>
              <td
                className={`data-cell text-right font-bold ${flashClass} ${change24h >= 0 ? "data-positive" : "data-negative"}`}
              >
                {lastPrice > 0 ? fmt(lastPrice) : "---"}
              </td>
              <td className="data-header w-[70px]">24H CHG</td>
              <td
                className={`data-cell text-right font-bold ${change24h >= 0 ? "data-positive" : "data-negative"}`}
              >
                {change24h >= 0 ? "+" : ""}
                {change24h.toFixed(2)}%
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="data-header">BID</td>
              <td className="data-cell text-right">
                {ticker?.bid ? fmt(ticker.bid) : "---"}
              </td>
              <td className="data-header">ASK</td>
              <td className="data-cell text-right">
                {ticker?.ask ? fmt(ticker.ask) : "---"}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="data-header">HIGH</td>
              <td className="data-cell text-right text-terminal-amber">
                {high > 0 ? fmt(high) : "---"}
              </td>
              <td className="data-header">LOW</td>
              <td className="data-cell text-right text-terminal-cyan">
                {low > 0 ? fmt(low) : "---"}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="data-header">BID SZ</td>
              <td className="data-cell text-right">
                {ticker?.bidSize ? fmt(ticker.bidSize, 4) : "---"}
              </td>
              <td className="data-header">ASK SZ</td>
              <td className="data-cell text-right">
                {ticker?.askSize ? fmt(ticker.askSize, 4) : "---"}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="data-header">VOL 24H</td>
              <td className="data-cell text-right" colSpan={3}>
                {ticker?.vol24h ? fmt(ticker.vol24h, 0) : "---"}
              </td>
            </tr>
            <tr>
              <td className="data-header">AVG VOL</td>
              <td className="data-cell text-right" colSpan={3}>
                {avgVol > 0 ? fmt(avgVol, 0) : "---"}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-1 border-t border-border pt-1">
          <div className="data-header mb-0.5">
            OHLCV - LAST {candles.length} BARS
          </div>
          <div className="relative h-14 border border-border bg-background">
            {candles.map((c, i) => {
              const oPct = ((c.open - priceMin) / priceRange) * 100;
              const cPct = ((c.close - priceMin) / priceRange) * 100;
              const hPct = ((c.high - priceMin) / priceRange) * 100;
              const lPct = ((c.low - priceMin) / priceRange) * 100;
              const isGreen = c.close >= c.open;
              const bodyTop = 100 - Math.max(oPct, cPct);
              const bodyBot = 100 - Math.min(oPct, cPct);
              const wickTop = 100 - hPct;
              const wickBot = 100 - lPct;

              return (
                <div
                  key={c.timestamp || `${symbol}-ohlcv-${i}`}
                  className="absolute"
                  style={{
                    left: `${i * barWidth}%`,
                    width: `${Math.max(barWidth - 1, 2)}%`,
                    top: `${wickTop}%`,
                    height: `${wickBot - wickTop}%`,
                  }}
                >
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-px"
                    style={{
                      top: 0,
                      bottom: 0,
                      backgroundColor: isGreen
                        ? "var(--terminal-green)"
                        : "var(--terminal-red)",
                    }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: `${bodyTop - wickTop}%`,
                      height: `${Math.max(bodyBot - bodyTop, 1)}%`,
                      width: "60%",
                      backgroundColor: isGreen
                        ? "var(--terminal-green)"
                        : "var(--terminal-red)",
                      opacity: 0.8,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-1 border-t border-border pt-1">
          <div className="data-header mb-0.5">CANDLE TABLE</div>
          <div className="overflow-auto max-h-28">
            <table className="w-full border-collapse text-[0.5625rem]">
              <thead>
                <tr className="border-b border-border">
                  <th className="data-header text-left">TIME</th>
                  <th className="data-header text-right">O</th>
                  <th className="data-header text-right">H</th>
                  <th className="data-header text-right">L</th>
                  <th className="data-header text-right">C</th>
                  <th className="data-header text-right">VOL</th>
                </tr>
              </thead>
              <tbody>
                {candles
                  .slice(-10)
                  .reverse()
                  .map((c, i) => (
                    <tr
                      key={c.timestamp}
                      className={i > 0 ? "border-t border-border/50" : ""}
                    >
                      <td className="data-cell text-muted-foreground">
                        {new Date(c.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="data-cell text-right">{fmt(c.open)}</td>
                      <td className="data-cell text-right text-terminal-amber">
                        {fmt(c.high)}
                      </td>
                      <td className="data-cell text-right text-terminal-cyan">
                        {fmt(c.low)}
                      </td>
                      <td
                        className={`data-cell text-right font-bold ${c.close >= c.open ? "data-positive" : "data-negative"}`}
                      >
                        {fmt(c.close)}
                      </td>
                      <td className="data-cell text-right text-muted-foreground">
                        {fmt(c.volume, 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
