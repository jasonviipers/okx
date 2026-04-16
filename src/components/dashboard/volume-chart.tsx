"use client";

import { useCallback, useEffect, useState } from "react";
import { getCandles } from "@/lib/api/client";
import type { Candle } from "@/types/market";

interface VolumeChartProps {
  symbol: string;
  timeframe: string;
}

export function VolumeChart({ symbol, timeframe }: VolumeChartProps) {
  const [candles, setCandles] = useState<Candle[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const response = await getCandles(symbol, timeframe, 20);
      setCandles(response.data.candles ?? []);
    } catch {}
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const barWidth = candles.length > 0 ? 100 / candles.length : 0;

  return (
    <div className="bloomberg-panel h-full">
      <div className="bloomberg-header">
        <span>VOLUME - {symbol}</span>
        <span className="text-terminal-dim">{timeframe}</span>
      </div>
      <div className="flex-1 p-1">
        <div className="relative h-full min-h-[56px] border border-border bg-background">
          {candles.map((c, i) => {
            const pct = (c.volume / maxVol) * 100;
            const isGreen = c.close >= c.open;
            return (
              <div
                key={c.timestamp || `${symbol}-vol-${i}`}
                className="absolute bottom-0"
                style={{
                  left: `${i * barWidth}%`,
                  width: `${Math.max(barWidth - 1, 2)}%`,
                  height: `${pct}%`,
                  backgroundColor: isGreen
                    ? "var(--terminal-green)"
                    : "var(--terminal-red)",
                  opacity: 0.8,
                }}
              />
            );
          })}
          {candles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[0.5625rem] text-muted-foreground uppercase">
              NO DATA
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
