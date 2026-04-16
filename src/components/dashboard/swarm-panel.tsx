"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getConsensus } from "@/lib/api/client";
import { ROLE_CONFIGS, type SwarmRole } from "@/lib/configs/roles";
import type {
  AgentVote,
  ConsensusResult,
  SwarmStreamEvent,
} from "@/types/swarm";

interface SwarmPanelProps {
  symbol: string;
  timeframe: string;
  runTrigger: number;
}

function RoleBadge({ role }: { role: SwarmRole }) {
  const config = ROLE_CONFIGS[role];
  const roleColors: Record<SwarmRole, string> = {
    trend_follower: "data-positive",
    momentum_analyst: "text-terminal-amber",
    sentiment_reader: "text-terminal-cyan",
    macro_filter: "data-neutral",
    execution_tactician: "data-neutral",
  };

  return (
    <span
      className={`text-[0.5625rem] uppercase tracking-wider font-bold ${roleColors[role] ?? "data-neutral"}`}
    >
      {config?.label ?? role.replace("_", " ").toUpperCase()}
    </span>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const colors: Record<string, string> = {
    BUY: "data-positive bg-terminal-green/10",
    SELL: "data-negative bg-terminal-red/10",
    HOLD: "data-neutral bg-muted",
  };

  return (
    <span
      className={`text-[0.5625rem] font-bold px-1 ${colors[signal] ?? "data-neutral"}`}
    >
      {signal}
    </span>
  );
}

export function SwarmPanel({ symbol, timeframe, runTrigger }: SwarmPanelProps) {
  const [votes, setVotes] = useState<AgentVote[]>([]);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [status, setStatus] = useState<string>("IDLE");
  const [logs, setLogs] = useState<Array<{ id: string; message: string }>>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logCounterRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const id = `${Date.now()}-${logCounterRef.current++}`;
    setLogs((prev) =>
      [{ id, message: `[${ts}] ${msg}` }, ...prev].slice(0, 100),
    );
  }, []);

  const fetchCachedConsensus = useCallback(async () => {
    try {
      const response = await getConsensus(symbol, timeframe);
      if (response.data.consensus) {
        setConsensus(response.data.consensus);
        setVotes(response.data.consensus.votes ?? []);
        addLog(
          `CONSENSUS READY: ${response.data.consensus.signal} @ ${response.data.consensus.confidence.toFixed(2)}`,
        );
      }
    } catch {}
  }, [symbol, timeframe, addLog]);

  const runSwarm = useCallback(async () => {
    if (running) {
      return;
    }

    setRunning(true);
    setVotes([]);
    setConsensus(null);
    setStatus("FETCHING");
    addLog(`SWARM START -> ${symbol} ${timeframe}`);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(
        `/api/ai/swarm/stream?symbol=${symbol}&timeframe=${timeframe}`,
        { signal: abortRef.current.signal },
      );
      const reader = res.body?.getReader();

      if (!reader) {
        throw new Error("No stream body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }

          try {
            const event: SwarmStreamEvent = JSON.parse(line.slice(6));

            if (event.type === "status") {
              setStatus(event.message?.toUpperCase() ?? "PROCESSING");
              addLog(`STATUS: ${event.message}`);
            } else if (event.type === "vote" && event.vote) {
              const vote = event.vote;
              setVotes((prev) => [...prev, vote]);
              setStatus(`VOTE ${votes.length + 1}/5`);
              addLog(
                `VOTE: ${vote.role} -> ${vote.signal} (${(vote.confidence * 100).toFixed(0)}%)`,
              );
            } else if (event.type === "consensus" && event.consensus) {
              setConsensus(event.consensus);
              setStatus("CONSENSUS");
              addLog(
                `CONSENSUS: ${event.consensus.signal} conf=${(event.consensus.confidence * 100).toFixed(0)}% agree=${(event.consensus.agreement * 100).toFixed(0)}%`,
              );
            } else if (event.type === "error") {
              setStatus("ERROR");
              addLog(`ERROR: ${event.message}`);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        addLog("SWARM ABORTED");
      } else {
        setStatus("ERROR");
        addLog(
          `STREAM ERROR: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    } finally {
      setRunning(false);
      setStatus(consensus ? "CONSENSUS" : "IDLE");
    }
  }, [running, symbol, timeframe, addLog, votes.length, consensus]);

  useEffect(() => {
    fetchCachedConsensus();
  }, [fetchCachedConsensus]);

  useEffect(() => {
    if (runTrigger > 0) {
      runSwarm();
    }
  }, [runTrigger, runSwarm]);

  const signalScores = consensus?.weightedScores;
  const totalWeight =
    votes.reduce((sum, vote) => sum + vote.voteWeight, 0) || 1;

  return (
    <div className="bloomberg-panel h-full">
      <div className="bloomberg-header">
        <span>SWARM INTELLIGENCE</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-[0.5625rem] ${running ? "text-terminal-amber animate-pulse-soft" : status === "CONSENSUS" ? "data-positive" : "data-neutral"}`}
          >
            {status}
          </span>
          <button
            type="button"
            onClick={runSwarm}
            disabled={running}
            className="text-[0.5625rem] data-positive hover:text-primary/80 disabled:data-neutral uppercase tracking-wider"
          >
            {running ? "RUN..." : "RUN>"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-1">
        {consensus && (
          <div className="border border-border mb-1">
            <div className="bg-secondary px-2 py-0.5 border-b border-border flex items-center justify-between">
              <span className="text-[0.5625rem] text-muted-foreground uppercase">
                Consensus
              </span>
              <SignalBadge signal={consensus.signal} />
            </div>
            <div className="px-2 py-0.5 grid grid-cols-3 gap-1">
              <div>
                <div className="text-[0.5rem] text-muted-foreground uppercase">
                  Confidence
                </div>
                <div className="text-[0.6875rem] font-bold data-positive">
                  {(consensus.confidence * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[0.5rem] text-muted-foreground uppercase">
                  Agreement
                </div>
                <div className="text-[0.6875rem] font-bold text-terminal-amber">
                  {(consensus.agreement * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[0.5rem] text-muted-foreground uppercase">
                  Blocked
                </div>
                <div
                  className={`text-[0.6875rem] font-bold ${consensus.blocked ? "data-negative" : "data-positive"}`}
                >
                  {consensus.blocked ? "YES" : "NO"}
                </div>
              </div>
            </div>
            {consensus.memory && (
              <div className="px-2 py-0.5 border-t border-border text-[0.5625rem] text-muted-foreground">
                MEM: {consensus.memory.totalMemories} | DOM:{" "}
                {consensus.memory.dominantSignal} | BLK:{" "}
                {(consensus.memory.blockedRatio * 100).toFixed(0)}%
              </div>
            )}
            {consensus.harness && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Harness
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  MQ:{consensus.harness.marketQualityScore.toFixed(2)} LIQ:
                  {consensus.harness.liquidityScore.toFixed(2)} ALIGN:
                  {consensus.harness.memoryAlignmentScore.toFixed(2)} ADJ:
                  {consensus.harness.confidenceAdjustment >= 0 ? "+" : ""}
                  {consensus.harness.confidenceAdjustment.toFixed(2)}
                </div>
              </div>
            )}
            {consensus.regime && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Regime
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  {consensus.regime.regime.toUpperCase()} | CONF:
                  {(consensus.regime.confidence * 100).toFixed(0)}% | TREND:
                  {consensus.regime.trendScore.toFixed(2)} | BO:
                  {consensus.regime.breakoutScore.toFixed(2)} | MR:
                  {consensus.regime.meanReversionScore.toFixed(2)}
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  {consensus.regime.notes.join(" ")}
                </div>
              </div>
            )}
            {consensus.metaSelection && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Meta Selector
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  ENG:{consensus.metaSelection.selectedEngine.toUpperCase()} |
                  FIT:
                  {(consensus.metaSelection.suitability * 100).toFixed(0)}% |
                  BIAS:{consensus.metaSelection.actionBias}
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  {consensus.metaSelection.notes.join(" ")}
                </div>
              </div>
            )}
            {consensus.expectedValue && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Expected Value
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  GROSS:{consensus.expectedValue.grossEdgeBps.toFixed(1)}bps |
                  FEE:{consensus.expectedValue.estimatedFeeBps.toFixed(1)}bps |
                  SLIP:
                  {consensus.expectedValue.estimatedSlippageBps.toFixed(1)}bps |
                  NET:{consensus.expectedValue.netEdgeBps.toFixed(1)}bps | RR:
                  {consensus.expectedValue.rewardRiskRatio.toFixed(2)}
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  {consensus.expectedValue.notes.join(" ")}
                </div>
              </div>
            )}
            {consensus.reliability && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Reliability
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  SCORE:
                  {(consensus.reliability.reliabilityScore * 100).toFixed(0)}% |
                  SAMPLE:{consensus.reliability.sampleSize} | BLOCK:
                  {(consensus.reliability.blockedRate * 100).toFixed(0)}%
                </div>
                <div className="text-[0.5625rem] text-muted-foreground">
                  {consensus.reliability.notes.join(" ")}
                </div>
              </div>
            )}
            {consensus.engineReports && consensus.engineReports.length > 0 && (
              <div className="px-2 py-0.5 border-t border-border space-y-0.5">
                <div className="text-[0.5625rem] uppercase text-muted-foreground">
                  Engines
                </div>
                <table className="w-full border-collapse text-[0.5625rem]">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="data-header text-left">ENGINE</th>
                      <th className="data-header text-center">SIG</th>
                      <th className="data-header text-right">CONF</th>
                      <th className="data-header text-right">SUPPORT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consensus.engineReports.map((report) => (
                      <tr
                        key={report.engine}
                        className="border-b border-border/30"
                      >
                        <td className="data-cell text-muted-foreground">
                          {report.engine.toUpperCase()}
                        </td>
                        <td className="data-cell text-center">
                          <SignalBadge signal={report.signal} />
                        </td>
                        <td className="data-cell text-right">
                          {(report.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="data-cell text-right">
                          {report.supportScore.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {signalScores && (
              <div className="px-2 py-0.5 border-t border-border flex gap-4">
                {(["BUY", "SELL", "HOLD"] as const).map((signal) => (
                  <div key={signal} className="flex items-center gap-1">
                    <SignalBadge signal={signal} />
                    <div className="w-16 h-1 bg-muted relative">
                      <div
                        className={`h-full ${signal === "BUY" ? "bg-primary" : signal === "SELL" ? "bg-destructive" : "bg-muted-foreground/40"}`}
                        style={{
                          width: `${((signalScores[signal] ?? 0) / totalWeight) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-[0.5rem] text-muted-foreground">
                      {(signalScores[signal] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border border-border">
          <div className="bg-secondary px-2 py-0.5 border-b border-border">
            <span className="text-[0.5625rem] text-muted-foreground uppercase">
              Agent Votes ({votes.length})
            </span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="data-header text-left">ROLE</th>
                <th className="data-header text-left">MODEL</th>
                <th className="data-header text-center">SIG</th>
                <th className="data-header text-right">CONF</th>
                <th className="data-header text-right">WT</th>
                <th className="data-header text-right">MS</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((vote, index) => (
                <tr
                  key={`${vote.role}-${vote.model}-${index}`}
                  className={`border-b border-border/50 ${index === 0 ? "animate-slide-in" : ""}`}
                >
                  <td className="data-cell">
                    <RoleBadge role={vote.role} />
                  </td>
                  <td className="data-cell text-muted-foreground truncate max-w-[80px]">
                    {vote.model.split(":")[0]}
                  </td>
                  <td className="data-cell text-center">
                    <SignalBadge signal={vote.signal} />
                  </td>
                  <td className="data-cell text-right">
                    <span
                      className={
                        vote.confidence >= 0.7
                          ? "data-positive"
                          : vote.confidence >= 0.4
                            ? "text-terminal-amber"
                            : "data-negative"
                      }
                    >
                      {(vote.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="data-cell text-right text-muted-foreground">
                    {vote.voteWeight.toFixed(2)}
                  </td>
                  <td className="data-cell text-right text-muted-foreground">
                    {vote.elapsedMs}
                  </td>
                </tr>
              ))}
              {votes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="data-cell text-center text-muted-foreground py-2"
                  >
                    NO VOTES - RUN SWARM TO ANALYZE
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-border mt-1">
          <div className="bg-secondary px-2 py-0.5 border-b border-border">
            <span className="text-[0.5625rem] text-muted-foreground uppercase">
              Agent Discussion
            </span>
          </div>
          <div className="max-h-32 overflow-auto">
            {votes.length > 0 ? (
              <table className="w-full border-collapse">
                <tbody>
                  {votes.map((vote, index) => (
                    <tr
                      key={`${vote.role}-reasoning-${index}`}
                      className="border-b border-border/30 align-top"
                    >
                      <td className="data-cell w-[96px]">
                        <RoleBadge role={vote.role} />
                      </td>
                      <td className="data-cell w-[48px] text-center">
                        <SignalBadge signal={vote.signal} />
                      </td>
                      <td className="data-cell text-muted-foreground">
                        {vote.reasoning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-[0.5625rem] text-muted-foreground text-center py-2">
                NO DISCUSSION AVAILABLE
              </div>
            )}
          </div>
        </div>

        <div className="border border-border mt-1">
          <div className="bg-secondary px-2 py-0.5 border-b border-border">
            <span className="text-[0.5625rem] text-muted-foreground uppercase">
              Activity Log
            </span>
          </div>
          <div className="max-h-24 overflow-auto p-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="text-[0.5625rem] font-mono leading-tight text-muted-foreground"
              >
                {log.message}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-[0.5625rem] text-muted-foreground text-center py-1">
                NO ACTIVITY
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
