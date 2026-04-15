"use client";

import { useCallback, useRef, useState } from "react";

interface CommandBarProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onRefresh: () => void;
  onAnalyze: () => void;
  loading?: boolean;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;

export function CommandBar({
  symbol,
  onSymbolChange,
  onRefresh,
  onAnalyze,
  loading = false,
}: CommandBarProps) {
  const [inputValue, setInputValue] = useState(symbol);
  const [tf, setTf] = useState<string>("1H");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const cmd = inputValue.trim().toUpperCase();
      if (cmd.startsWith("/SYMBOL ")) {
        onSymbolChange(cmd.replace("/SYMBOL ", ""));
      } else if (cmd === "/REFRESH") {
        onRefresh();
      } else if (cmd === "/ANALYZE") {
        onAnalyze();
      } else {
        onSymbolChange(cmd);
      }
    },
    [inputValue, onSymbolChange, onRefresh, onAnalyze],
  );

  const now = new Date();
  const utcStr = `${now.toISOString().replace("T", " ").slice(0, 19)} UTC`;

  return (
    <div className="flex flex-col border-b border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center h-7 px-2 border-b border-[var(--border)] bg-[var(--secondary)]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--terminal-amber)]">
          AI Trading Swarm
        </span>
        <span className="mx-2 text-[var(--terminal-dim)]">│</span>
        <span className="bloomberg-tag bloomberg-tag-live">Live</span>
        <span className="mx-2 text-[var(--terminal-dim)]">│</span>
        <span className="text-[10px] text-[var(--terminal-green)] font-bold">
          {symbol}
        </span>
        <span className="mx-2 text-[var(--terminal-dim)]">│</span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          TF:{tf}
        </span>
        <span className="ml-auto text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {utcStr}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center h-7 px-1">
        <span className="text-[11px] font-bold text-[var(--terminal-amber)] mr-1 flex-shrink-0">
          &gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="bloomberg-command-input flex-1"
          placeholder="Enter symbol or /command…"
        />
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className={`bloomberg-btn text-[9px] px-1.5 py-0 ${tf === t ? "bloomberg-btn-primary" : ""}`}
            >
              {t}
            </button>
          ))}
          <span className="text-[var(--terminal-dim)] mx-1">│</span>
          <button
            type="submit"
            className="bloomberg-btn bloomberg-btn-primary text-[10px] py-0"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={loading}
            className="bloomberg-btn bloomberg-btn-execute text-[10px] py-0 disabled:opacity-40"
          >
            {loading ? "…" : "Analyze"}
          </button>
        </div>
      </form>
    </div>
  );
}
