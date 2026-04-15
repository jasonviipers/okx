"use client";

import type { AgentVote } from "@/types/swarm";

interface SwarmVoteChartProps {
  votes: AgentVote[];
}

export function SwarmVoteChart({ votes }: SwarmVoteChartProps) {
  const buyVotes = votes.filter((v) => v.signal === "BUY");
  const sellVotes = votes.filter((v) => v.signal === "SELL");
  const holdVotes = votes.filter((v) => v.signal === "HOLD");

  const buyWeight = buyVotes.reduce(
    (sum, v) => sum + v.confidence * v.voteWeight,
    0,
  );
  const sellWeight = sellVotes.reduce(
    (sum, v) => sum + v.confidence * v.voteWeight,
    0,
  );
  const holdWeight = holdVotes.reduce(
    (sum, v) => sum + v.confidence * v.voteWeight,
    0,
  );
  const totalWeight = buyWeight + sellWeight + holdWeight || 1;

  return (
    <div className="bloomberg-panel">
      <div className="bloomberg-panel-header">
        <h3>Vote Distribution</h3>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {votes.length} agents
        </span>
      </div>

      <div className="flex h-5 overflow-hidden border border-[var(--border)]">
        <div
          className="bg-[var(--terminal-green)] flex items-center justify-center text-[9px] font-bold text-[var(--background)]"
          style={{ width: `${(buyWeight / totalWeight) * 100}%` }}
        >
          {(buyWeight / totalWeight) * 100 > 15 && `BUY ${buyVotes.length}`}
        </div>
        <div
          className="bg-[var(--terminal-amber)] flex items-center justify-center text-[9px] font-bold text-[var(--background)]"
          style={{ width: `${(holdWeight / totalWeight) * 100}%` }}
        >
          {(holdWeight / totalWeight) * 100 > 15 && `HOLD ${holdVotes.length}`}
        </div>
        <div
          className="bg-[var(--terminal-red)] flex items-center justify-center text-[9px] font-bold text-[var(--background)]"
          style={{ width: `${(sellWeight / totalWeight) * 100}%` }}
        >
          {(sellWeight / totalWeight) * 100 > 15 && `SELL ${sellVotes.length}`}
        </div>
      </div>

      <div className="bloomberg-data-row text-[9px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-[var(--terminal-green)]" />
          <span className="text-[var(--muted-foreground)]">
            BUY({buyVotes.length}) w={buyWeight.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-3">
          <div className="w-2 h-2 bg-[var(--terminal-amber)]" />
          <span className="text-[var(--muted-foreground)]">
            HOLD({holdVotes.length}) w={holdWeight.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-3">
          <div className="w-2 h-2 bg-[var(--terminal-red)]" />
          <span className="text-[var(--muted-foreground)]">
            SELL({sellVotes.length}) w={sellWeight.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
