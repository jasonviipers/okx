"use client";

import type { AIMode } from "@/lib/configs/models";
import type { ConsensusResult } from "@/types/swarm";

interface ConsensusPanelProps {
  consensus: ConsensusResult | null;
  mode: AIMode;
  onExecute?: () => void;
  loading?: boolean;
}

export function ConsensusPanel({
  consensus,
  mode,
  onExecute,
  loading = false,
}: ConsensusPanelProps) {
  if (!consensus) {
    return (
      <div className="bloomberg-panel">
        <div className="bloomberg-panel-header">
          <h3>Consensus</h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
        </div>
        <div className="flex items-center justify-center min-h-[40px]">
          <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
            — Run analysis —
          </span>
        </div>
      </div>
    );
  }

  const canExecute =
    !consensus.blocked &&
    consensus.signal !== "HOLD" &&
    (mode === "ai_only" || mode === "ai_enhance" || mode === "ai_confirm");

  const signalTag =
    consensus.signal === "BUY"
      ? "bloomberg-tag-buy"
      : consensus.signal === "SELL"
        ? "bloomberg-tag-sell"
        : "bloomberg-tag-hold";

  return (
    <div className="bloomberg-panel">
      <div className="bloomberg-panel-header">
        <h3>Consensus</h3>
        <div className="flex items-center gap-2">
          {consensus.blocked && (
            <span className="bloomberg-tag bloomberg-tag-blocked">Blocked</span>
          )}
          <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
            {new Date(consensus.validatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="flex items-stretch gap-0">
        <div className="flex items-center justify-center border-r border-[var(--border)] px-4 py-1 min-w-[80px]">
          <span
            className={`bloomberg-tag ${signalTag} text-[16px] font-bold leading-none`}
          >
            {consensus.signal}
          </span>
        </div>

        <div className="flex-1">
          <div className="bloomberg-data-row">
            <span className="bloomberg-label">Conf</span>
            <span className="bloomberg-value tabular-nums">
              {(consensus.confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bloomberg-data-row">
            <span className="bloomberg-label">Agree</span>
            <span className="bloomberg-value tabular-nums">
              {(consensus.agreement * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bloomberg-data-row">
            <span className="bloomberg-label">Symbol</span>
            <span className="bloomberg-value text-[var(--terminal-amber)]">
              {consensus.symbol}
            </span>
            <span className="bloomberg-label ml-auto">TF</span>
            <span className="bloomberg-value">{consensus.timeframe}</span>
          </div>

          {consensus.weightedScores && (
            <div className="bloomberg-data-row">
              <span className="bloomberg-label">W.BUY</span>
              <span className="bloomberg-value-positive tabular-nums">
                {consensus.weightedScores.BUY?.toFixed(3) ?? "—"}
              </span>
              <span className="bloomberg-label ml-1">W.SELL</span>
              <span className="bloomberg-value-negative tabular-nums">
                {consensus.weightedScores.SELL?.toFixed(3) ?? "—"}
              </span>
              <span className="bloomberg-label ml-1">W.HOLD</span>
              <span className="text-[var(--terminal-amber)] tabular-nums font-bold">
                {consensus.weightedScores.HOLD?.toFixed(3) ?? "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      {consensus.blocked && consensus.blockReason && (
        <div className="bloomberg-data-row text-[var(--terminal-red)] text-[10px] font-bold">
          <span className="bloomberg-label">Reason</span>
          <span>{consensus.blockReason}</span>
        </div>
      )}

      {canExecute && onExecute && (
        <div className="bloomberg-data-row">
          <button
            type="button"
            onClick={onExecute}
            disabled={loading}
            className={`bloomberg-btn text-[10px] py-0 disabled:opacity-40 ${
              consensus.signal === "BUY"
                ? "bloomberg-btn-execute"
                : "bloomberg-btn-execute-sell"
            }`}
          >
            {loading
              ? "Executing…"
              : mode === "ai_confirm"
                ? "Confirm & Execute"
                : `Execute ${consensus.signal}`}
          </button>
        </div>
      )}
    </div>
  );
}
