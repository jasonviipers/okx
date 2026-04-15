"use client";

import type { ConsensusResult } from "@/types/swarm";

interface TradeConfirmModalProps {
  consensus: ConsensusResult;
  symbol: string;
  size: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function TradeConfirmModal({
  consensus,
  symbol,
  size,
  onConfirm,
  onCancel,
  loading = false,
}: TradeConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bloomberg-panel w-full max-w-sm border-[var(--terminal-amber)]">
        <div className="bloomberg-panel-header border-[var(--terminal-amber)]">
          <h3>Confirm Execution</h3>
          <span
            className={`bloomberg-tag ${consensus.signal === "BUY" ? "bloomberg-tag-buy" : "bloomberg-tag-sell"}`}
          >
            {consensus.signal}
          </span>
        </div>

        <table className="bloomberg-table">
          <tbody>
            <tr>
              <td className="bloomberg-label">Signal</td>
              <td
                className={`font-bold ${consensus.signal === "BUY" ? "bloomberg-value-positive" : "bloomberg-value-negative"}`}
              >
                {consensus.signal}
              </td>
            </tr>
            <tr>
              <td className="bloomberg-label">Symbol</td>
              <td className="bloomberg-value text-[var(--terminal-amber)]">
                {symbol}
              </td>
            </tr>
            <tr>
              <td className="bloomberg-label">Size</td>
              <td className="bloomberg-value tabular-nums">{size}</td>
            </tr>
            <tr>
              <td className="bloomberg-label">Conf</td>
              <td className="bloomberg-value tabular-nums">
                {(consensus.confidence * 100).toFixed(1)}%
              </td>
            </tr>
            <tr>
              <td className="bloomberg-label">Agree</td>
              <td className="bloomberg-value tabular-nums">
                {(consensus.agreement * 100).toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>

        <div className="bloomberg-data-row text-[9px]">
          <span className="bloomberg-label">Votes</span>
          <span className="bloomberg-value-positive">
            B:{consensus.votes.filter((v) => v.signal === "BUY").length}
          </span>
          <span className="text-[var(--terminal-amber)] ml-2">
            H:{consensus.votes.filter((v) => v.signal === "HOLD").length}
          </span>
          <span className="bloomberg-value-negative ml-2">
            S:{consensus.votes.filter((v) => v.signal === "SELL").length}
          </span>
        </div>

        <div className="bloomberg-data-row text-[var(--terminal-amber)] text-[10px] border-[var(--terminal-amber)]">
          <span className="font-bold">
            ⚠ Real trade execution — verify before confirming
          </span>
        </div>

        <div className="bloomberg-data-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="bloomberg-btn bloomberg-btn-danger text-[10px] py-0 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`bloomberg-btn text-[10px] py-0 disabled:opacity-40 ${
              consensus.signal === "BUY"
                ? "bloomberg-btn-execute"
                : "bloomberg-btn-execute-sell"
            }`}
          >
            {loading ? "Executing…" : `Confirm ${consensus.signal}`}
          </button>
        </div>
      </div>
    </div>
  );
}
