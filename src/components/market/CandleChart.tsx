"use client";

import type { Candle } from "@/types/market";

interface CandleChartProps {
  candles: Candle[];
  height?: number;
}

export function CandleChart({ candles, height = 260 }: CandleChartProps) {
  if (candles.length === 0) {
    return (
      <div className="bloomberg-panel h-full">
        <div className="bloomberg-panel-header">
          <h3>Price Chart</h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">0</span>
        </div>
        <div className="flex items-center justify-center h-full min-h-[80px]">
          <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
            — No data —
          </span>
        </div>
      </div>
    );
  }

  const prices = candles.flatMap((c) => [c.high, c.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const scaleY = (price: number) =>
    ((price - minPrice) / priceRange) * (height - 40);

  return (
    <div className="bloomberg-panel h-full flex flex-col">
      <div className="bloomberg-panel-header">
        <h3>Price Chart</h3>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {candles.length} bars · H:{maxPrice.toFixed(2)} L:
          {minPrice.toFixed(2)}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${candles.length * 16} ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          <title>{`Price chart for ${candles.length} candles`}</title>
          <line
            x1="0"
            y1={height - 20 - scaleY(maxPrice)}
            x2={candles.length * 16}
            y2={height - 20 - scaleY(maxPrice)}
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="2,4"
          />
          <line
            x1="0"
            y1={height - 20 - scaleY(minPrice)}
            x2={candles.length * 16}
            y2={height - 20 - scaleY(minPrice)}
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="2,4"
          />
          <text
            x="2"
            y={10}
            className="fill-[var(--muted-foreground)] text-[8px]"
          >
            {maxPrice.toFixed(2)}
          </text>
          <text
            x="2"
            y={height - 5}
            className="fill-[var(--muted-foreground)] text-[8px]"
          >
            {minPrice.toFixed(2)}
          </text>
          {candles.map((candle, i) => {
            const x = i * 16 + 8;
            const isBullish = candle.close > candle.open;
            const color = isBullish
              ? "var(--terminal-green)"
              : "var(--terminal-red)";
            const highY = height - scaleY(candle.high) - 20;
            const lowY = height - scaleY(candle.low) - 20;
            const openY = height - scaleY(candle.open) - 20;
            const closeY = height - scaleY(candle.close) - 20;
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.abs(closeY - openY) || 1;
            return (
              <g key={candle.timestamp}>
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                />
                <rect
                  x={x - 3}
                  y={bodyTop}
                  width="6"
                  height={bodyHeight}
                  fill={isBullish ? color : color}
                  stroke={color}
                  strokeWidth="0.5"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
