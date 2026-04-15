"use client";

import { useState } from "react";
import { AgentCard } from "@/components/swarm/AgentCard";
import { AgentStream } from "@/components/swarm/AgentStream";
import { ConsensusPanel } from "@/components/swarm/ConsensusPanel";
import { SwarmVoteChart } from "@/components/swarm/SwarmVoteChart";
import type { AIMode } from "@/lib/configs/models";
import type { ConsensusResult } from "@/types/swarm";

export default function SwarmPage() {
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode] = useState<AIMode>("swarm");

  const runAnalysis = async (symbol: string) => {
    setLoading(true);
    try {
      const response = await fetch("/api/swarm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe: "1H" }),
      });

      const data = await response.json();
      if (data.consensus) {
        setConsensus(data.consensus);
      }
    } catch (error) {
      console.error("Swarm analysis failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex items-center h-7 px-2 border-b border-[var(--border)] bg-[var(--card)]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--terminal-amber)]">
          Swarm Decision Visualizer
        </span>
        <span className="mx-2 text-[var(--terminal-dim)]">│</span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          5 active agents
        </span>
        <span className="ml-auto">
          <button
            type="button"
            onClick={() => runAnalysis("BTC-USDT")}
            disabled={loading}
            className="bloomberg-btn bloomberg-btn-execute text-[10px] py-0 disabled:opacity-40"
          >
            {loading ? "Running…" : "Run Analysis"}
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-px">
        <AgentStream symbol="BTC-USDT" />

        {consensus && (
          <div className="grid grid-cols-1 gap-px">
            <div
              className="bloomberg-grid grid-cols-1 lg:grid-cols-[1fr_1fr]"
              style={{ display: "grid" }}
            >
              <ConsensusPanel
                consensus={consensus}
                mode={mode}
                loading={loading}
              />
              <SwarmVoteChart votes={consensus.votes} />
            </div>

            <div
              className="bloomberg-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
              style={{ display: "grid" }}
            >
              {consensus.votes.map((vote, i) => (
                <AgentCard
                  key={`${vote.model}-${vote.role}`}
                  vote={vote}
                  index={i}
                />
              ))}
            </div>
          </div>
        )}

        {!consensus && !loading && (
          <div className="bloomberg-panel">
            <div className="flex items-center justify-center min-h-[60px]">
              <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
                — Run swarm analysis to see agent decisions —
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
