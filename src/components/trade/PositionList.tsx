"use client";

import type { Position } from "@/types/trade";

interface PositionListProps {
  positions: Position[];
  loading?: boolean;
}

export function PositionList({
  positions,
  loading = false,
}: PositionListProps) {
  if (loading) {
    return (
      <div className="bloomberg-panel">
        <div className="bloomberg-panel-header">
          <h3>Positions</h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
        </div>
        <div className="h-10 animate-pulse-soft" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="bloomberg-panel">
        <div className="bloomberg-panel-header">
          <h3>Positions</h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">0</span>
        </div>
        <div className="flex items-center justify-center min-h-[30px]">
          <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
            — No open positions —
          </span>
        </div>
      </div>
    );
  }

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <div className="bloomberg-panel">
      <div className="bloomberg-panel-header">
        <h3>Positions</h3>
        <span
          className={`text-[10px] font-bold tabular-nums ${totalPnl >= 0 ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
        >
          P&L: ${totalPnl.toFixed(2)}
        </span>
      </div>

      <table className="bloomberg-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th className="text-right">Size</th>
            <th className="text-right">Entry</th>
            <th className="text-right">Current</th>
            <th className="text-right">P&L</th>
            <th className="text-right">P&L%</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={`${pos.symbol}-${pos.openedAt}-${pos.side}`}>
              <td className="font-bold text-[var(--terminal-amber)]">
                {pos.symbol}
              </td>
              <td>
                <span
                  className={`bloomberg-tag ${pos.side === "buy" ? "bloomberg-tag-buy" : "bloomberg-tag-sell"}`}
                >
                  {pos.side.toUpperCase()}
                </span>
              </td>
              <td className="text-right tabular-nums">{pos.size}</td>
              <td className="text-right tabular-nums">
                {pos.entryPrice.toLocaleString()}
              </td>
              <td className="text-right tabular-nums">
                {pos.currentPrice.toLocaleString()}
              </td>
              <td
                className={`text-right font-bold tabular-nums ${pos.pnl >= 0 ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
              >
                {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
              </td>
              <td
                className={`text-right tabular-nums ${pos.pnlPercent >= 0 ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
              >
                {pos.pnlPercent >= 0 ? "+" : ""}
                {pos.pnlPercent.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
