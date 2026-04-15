"use client";

import { useCallback, useEffect, useState } from "react";
import { PositionList } from "@/components/trade/PositionList";
import type { Position } from "@/types/trade";

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/trade/positions");
      const data = await response.json();
      if (data.positions) {
        setPositions(data.positions);
      }
    } catch (error) {
      console.error("Failed to fetch positions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const bestPnl =
    positions.length > 0 ? Math.max(...positions.map((p) => p.pnlPercent)) : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex items-center h-7 px-2 border-b border-[var(--border)] bg-[var(--card)]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--terminal-amber)]">
          Positions
        </span>
        <span className="mx-2 text-[var(--terminal-dim)]">│</span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          Track unrealized P&L
        </span>
        <span className="ml-auto">
          <button
            type="button"
            onClick={fetchPositions}
            disabled={loading}
            className="bloomberg-btn bloomberg-btn-primary text-[10px] py-0 disabled:opacity-40"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        <div className="bloomberg-grid grid-cols-3" style={{ display: "grid" }}>
          <div className="bloomberg-panel text-center py-2">
            <div className="bloomberg-label text-center">Open</div>
            <div className="bloomberg-value text-[20px] font-bold text-[var(--terminal-amber)] tabular-nums">
              {positions.length}
            </div>
          </div>
          <div className="bloomberg-panel text-center py-2">
            <div className="bloomberg-label text-center">Total P&L</div>
            <div
              className={`text-[20px] font-bold tabular-nums ${totalPnl >= 0 ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
            >
              ${totalPnl.toFixed(2)}
            </div>
          </div>
          <div className="bloomberg-panel text-center py-2">
            <div className="bloomberg-label text-center">Best</div>
            <div className="text-[20px] font-bold bloomberg-value-positive tabular-nums">
              {positions.length > 0 ? `+${bestPnl.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>

        <PositionList positions={positions} loading={loading} />
      </div>
    </div>
  );
}
