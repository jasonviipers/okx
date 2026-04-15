"use client";

import type { AgentVote } from "@/types/swarm";

interface AgentCardProps {
  vote: AgentVote;
  index: number;
}

const SIGNAL_TAG: Record<AgentVote["signal"], string> = {
  BUY: "bloomberg-tag-buy",
  SELL: "bloomberg-tag-sell",
  HOLD: "bloomberg-tag-hold",
};

const SIGNAL_BAR: Record<AgentVote["signal"], string> = {
  BUY: "bg-[var(--terminal-green)]",
  SELL: "bg-[var(--terminal-red)]",
  HOLD: "bg-[var(--terminal-amber)]",
};

export function AgentCard({ vote, index }: AgentCardProps) {
  return (
    <div className="bloomberg-panel text-[11px]">
      <div className="bloomberg-panel-header">
        <h3>
          #{index + 1} {vote.role}
        </h3>
        <span className={`bloomberg-tag ${SIGNAL_TAG[vote.signal]}`}>
          {vote.signal}
        </span>
      </div>

      <div className="bloomberg-data-row">
        <span className="bloomberg-label">Model</span>
        <span className="bloomberg-value text-[10px]">
          {vote.model.replace(":cloud", "")}
        </span>
      </div>
      <div className="bloomberg-data-row">
        <span className="bloomberg-label">Conf</span>
        <span className="bloomberg-value tabular-nums">
          {(vote.confidence * 100).toFixed(0)}%
        </span>
        <div className="bloomberg-conf-bar flex-1 ml-2">
          <div
            className={`bloomberg-conf-bar-fill ${SIGNAL_BAR[vote.signal]}`}
            style={{ width: `${vote.confidence * 100}%` }}
          />
        </div>
      </div>
      <div className="bloomberg-data-row">
        <span className="bloomberg-label">Time</span>
        <span className="bloomberg-value text-[var(--muted-foreground)] tabular-nums">
          {vote.elapsedMs}ms
        </span>
        <span className="bloomberg-label ml-auto">Wt</span>
        <span className="bloomberg-value tabular-nums">
          {vote.voteWeight.toFixed(1)}
        </span>
      </div>
      <div className="bloomberg-data-row">
        <span className="bloomberg-label">Note</span>
        <span className="bloomberg-value text-[10px] text-[var(--muted-foreground)] leading-tight line-clamp-2">
          {vote.reasoning}
        </span>
      </div>
    </div>
  );
}
