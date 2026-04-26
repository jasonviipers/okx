"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAutonomyStatus,
  useSwarmHistory,
  useSwarmStream,
} from "@/hooks/use-terminal-data";
import { ACTIVE_SWARM_MODELS } from "@/lib/configs/models";
import type { SwarmRole } from "@/lib/configs/roles";
import { ROLE_CONFIGS } from "@/lib/configs/roles";
import { cn } from "@/lib/utils";
import type { AgentVote, SwarmStreamEvent } from "@/types/swarm";

const AGENT_DISPLAY: Record<
  string,
  { name: string; role: string; color: string }
> = {
  "deepseek-v3.2:cloud": {
    name: "DeepSeek",
    role: "Trend Follower",
    color: "#00d4aa",
  },
  "gemma4:31b-cloud": {
    name: "Gemma4",
    role: "Momentum Analyst",
    color: "#ff8c00",
  },
  "kimi-k2.5:cloud": {
    name: "Kimi",
    role: "Sentiment Reader",
    color: "#00b8d4",
  },
  "kimi-k2.6:cloud": {
    name: "Kimi 2.6",
    role: "Cross-Asset Analyst",
    color: "#26c6da",
  },
  "minimax-m2.5:cloud": {
    name: "MiniMax M2.5",
    role: "Liquidity Specialist",
    color: "#4dd0e1",
  },
  "ministral-3:cloud": {
    name: "Ministral",
    role: "Macro Filter",
    color: "#ffd700",
  },
  "glm-5.1:cloud": {
    name: "GLM",
    role: "Execution Tactician",
    color: "#ff4444",
  },
  "qwen3.5:cloud": {
    name: "Qwen3.5",
    role: "Execution Router",
    color: "#7c4dff",
  },
  "gpt-oss:cloud": { name: "GPT-OSS", role: "Orchestrator", color: "#e040fb" },
};

const SWARM_ROLE_MAP: Record<string, SwarmRole> = {
  "deepseek-v3.2:cloud": "trend_follower",
  "gemma4:31b-cloud": "momentum_analyst",
  "kimi-k2.5:cloud": "sentiment_reader",
  "kimi-k2.6:cloud": "cross_asset_analyst",
  "minimax-m2.5:cloud": "liquidity_specialist",
  "ministral-3:cloud": "macro_filter",
  "glm-5.1:cloud": "execution_tactician",
};

function agentStatusColor(
  status: "idle" | "thinking" | "executing" | "error",
): string {
  switch (status) {
    case "idle":
      return "text-terminal-dim";
    case "thinking":
      return "text-terminal-amber";
    case "executing":
      return "text-terminal-green";
    case "error":
      return "text-terminal-red";
  }
}

function eventBorderColor(type: SwarmStreamEvent["type"]): string {
  switch (type) {
    case "vote":
      return "border-l-terminal-amber";
    case "consensus":
      return "border-l-terminal-green";
    case "pipeline":
      return "border-l-terminal-cyan";
    case "error":
      return "border-l-terminal-red";
    case "heartbeat":
      return "border-l-terminal-dim";
    case "status":
      return "border-l-terminal-dim";
    default:
      return "border-l-terminal-dim";
  }
}

function VoteBadge({ vote }: { vote: AgentVote }) {
  const signal = vote.signal;
  const color =
    signal === "BUY"
      ? "text-terminal-green"
      : signal === "SELL"
        ? "text-terminal-red"
        : "text-terminal-dim";
  const display = AGENT_DISPLAY[vote.model];
  const isVeto = vote.isVetoLayer;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-[0.5625rem] font-mono border-l-2",
        isVeto ? "border-l-terminal-red" : "border-l-terminal-dim",
      )}
    >
      {display && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: display.color }}
        />
      )}
      <span className="w-24 truncate">{display?.name ?? vote.model}</span>
      <span className="text-terminal-dim">{display?.role ?? vote.role}</span>
      <span className={cn("font-bold", color)}>{signal}</span>
      <span className="text-terminal-dim">
        {(vote.confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export function AgentDashboard() {
  const autonomyStatus = useAutonomyStatus();
  const swarmSymbol =
    autonomyStatus.data?.lastSelectedCandidate?.symbol ??
    autonomyStatus.data?.symbol ??
    "BTC-USDT";
  const swarmTimeframe = autonomyStatus.data?.timeframe ?? "1H";
  const swarmStream = useSwarmStream(swarmSymbol, swarmTimeframe);
  const swarmHistory = useSwarmHistory(25);
  const [activeTab, setActiveTab] = useState<"feed" | "status" | "decisions">(
    "feed",
  );

  const events = swarmStream.events ?? [];
  const historyEntries = swarmHistory.data?.entries ?? [];
  const isAutonomyRunning = autonomyStatus.data?.running ?? true;

  const agentStatuses = useMemo(() => {
    const latestEvents = new Map<
      string,
      { evt: SwarmStreamEvent; ts: number }
    >();
    for (const evt of events) {
      const model = evt.vote?.model || evt.pipeline?.model;
      if (model) {
        const existing = latestEvents.get(model);
        const ts = new Date(evt.timestamp).getTime();
        if (!existing || ts > existing.ts) {
          latestEvents.set(model, { evt, ts });
        }
      }
    }
    const allModels = [
      ...ACTIVE_SWARM_MODELS,
      "qwen3.5:cloud" as const,
      "gpt-oss:cloud" as const,
    ];
    return allModels.map((model: string) => {
      const display = AGENT_DISPLAY[model];
      const latest = latestEvents.get(model);
      const latestEvt = latest?.evt;
      const role = SWARM_ROLE_MAP[model];
      const isVeto = role ? (ROLE_CONFIGS[role]?.isVetoLayer ?? false) : false;
      let status: "idle" | "thinking" | "executing" | "error" = "idle";
      if (latestEvt) {
        const age = Date.now() - (latest?.ts ?? 0);
        status =
          latestEvt.type === "error"
            ? "error"
            : latestEvt.type === "vote" || latestEvt.type === "pipeline"
              ? age < 30_000
                ? "executing"
                : "thinking"
              : "thinking";
      }
      return {
        model,
        name: display?.name ?? model,
        role: display?.role ?? "",
        color: display?.color ?? "#3a4a5a",
        status,
        isVeto,
      };
    });
  }, [events]);

  const tradeDecisions = useMemo(() => {
    return historyEntries
      .filter(
        (e: {
          consensus: {
            signal: string;
            rejectionReasons?: Array<{ summary: string }>;
          };
        }) =>
          e.consensus.signal !== "HOLD" ||
          (e.consensus.rejectionReasons?.length ?? 0) > 0,
      )
      .slice(0, 20);
  }, [historyEntries]);

  return (
    <Card size="sm" className="h-full flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between w-full">
          <div className="flex flex-col">
            <span>Agent Swarm</span>
            <span className="text-[0.5rem] font-mono text-terminal-dim">
              Focus: {swarmSymbol} / {swarmTimeframe}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isAutonomyRunning
                  ? "bg-terminal-green animate-pulse-soft"
                  : "bg-terminal-dim",
              )}
            />
            <span className="text-[0.5625rem] font-mono">
              {isAutonomyRunning ? "ACTIVE" : "IDLE"}
            </span>
          </div>
        </CardTitle>
        <CardAction>
          <div className="flex gap-1">
            {(["feed", "status", "decisions"] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "ghost"}
                size="xs"
                className="text-[0.5625rem]"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "feed"
                  ? "Live"
                  : tab === "status"
                    ? "Agents"
                    : "Decisions"}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        {activeTab === "feed" && (
          <div className="flex flex-col">
            {events.length === 0 ? (
              <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
                {swarmStream.connected
                  ? "Waiting for swarm events..."
                  : "Connecting to swarm stream..."}
              </div>
            ) : (
              events.slice(0, 100).map((evt: SwarmStreamEvent, i: number) => (
                <div
                  key={evt.id ?? `${evt.timestamp}-${evt.type ?? i}`}
                  className={cn(
                    "border-l-2 px-2 py-0.5 text-[0.5625rem] font-mono border-b border-border/30 animate-slide-in",
                    eventBorderColor(evt.type),
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-terminal-dim shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={cn(
                        "font-semibold shrink-0",
                        evt.type === "error"
                          ? "text-terminal-red"
                          : evt.type === "vote"
                            ? "text-terminal-amber"
                            : evt.type === "consensus"
                              ? "text-terminal-green"
                              : "text-foreground",
                      )}
                    >
                      {evt.type.toUpperCase()}
                    </span>
                    {evt.symbol && (
                      <span className="text-terminal-cyan">{evt.symbol}</span>
                    )}
                  </div>
                  {evt.message && (
                    <div className="text-terminal-dim truncate">
                      {evt.message}
                    </div>
                  )}
                  {evt.vote && <VoteBadge vote={evt.vote} />}
                  {evt.pipeline && (
                    <div className="text-terminal-cyan">
                      {evt.pipeline.stage}: {evt.pipeline.detail}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "status" && (
          <div className="flex flex-col">
            {agentStatuses.map((agent) => (
              <div
                key={agent.model}
                className="flex items-center gap-2 px-2 py-1.5 text-[0.5625rem] font-mono border-b border-border/30"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="w-16 font-semibold">{agent.name}</span>
                <span className="text-terminal-dim w-32 truncate">
                  {agent.role}
                </span>
                <span className={agentStatusColor(agent.status)}>
                  {agent.status.toUpperCase()}
                </span>
                {agent.isVeto && (
                  <span className="text-[0.5rem] text-terminal-red border border-terminal-red/30 px-1 rounded">
                    VETO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "decisions" && (
          <div className="flex flex-col">
            {tradeDecisions.length === 0 ? (
              <div className="px-2 py-3 text-[0.625rem] text-terminal-dim text-center">
                No recent trade decisions yet
              </div>
            ) : (
              tradeDecisions.map(
                (
                  entry: {
                    id: string;
                    timestamp: string;
                    symbol: string;
                    consensus: {
                      signal: string;
                      confidence: number;
                      agreement: number;
                      blocked: boolean;
                      executionEligible: boolean;
                      blockReason?: string;
                      votes?: AgentVote[];
                    };
                  },
                  idx: number,
                ) => {
                  const c = entry.consensus;
                  const signal = c.signal as "BUY" | "SELL" | "HOLD";
                  const color =
                    signal === "BUY"
                      ? "text-terminal-green"
                      : signal === "SELL"
                        ? "text-terminal-red"
                        : "text-terminal-dim";
                  return (
                    <div
                      key={entry.id ?? idx}
                      className="px-2 py-1 text-[0.5625rem] font-mono border-b border-border/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-terminal-dim">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-semibold">{entry.symbol}</span>
                        <span className={cn("font-bold", color)}>{signal}</span>
                        <span className="text-terminal-dim">
                          {(c.confidence * 100).toFixed(0)}% conf
                        </span>
                        <span className="text-terminal-dim">
                          {(c.agreement * 100).toFixed(0)}% agree
                        </span>
                        <span
                          className={cn(
                            "text-[0.5rem] border px-1 rounded",
                            c.blocked || !c.executionEligible
                              ? "text-terminal-amber border-terminal-amber/30"
                              : "text-terminal-green border-terminal-green/30",
                          )}
                        >
                          {c.blocked || !c.executionEligible
                            ? "BLOCKED"
                            : "ELIGIBLE"}
                        </span>
                      </div>
                      {c.blocked && (
                        <div className="text-terminal-red text-[0.5rem]">
                          BLOCKED: {c.blockReason ?? "unknown"}
                        </div>
                      )}
                      <div className="flex gap-1 mt-0.5">
                        {(c.votes ?? []).map((vote: AgentVote) => (
                          <span
                            key={vote.model}
                            className={cn(
                              "text-[0.5rem] px-1 border border-border/50",
                              vote.signal === "BUY"
                                ? "text-terminal-green"
                                : vote.signal === "SELL"
                                  ? "text-terminal-red"
                                  : "text-terminal-dim",
                            )}
                          >
                            {AGENT_DISPLAY[vote.model]?.name?.slice(0, 3) ??
                              vote.model.slice(0, 3)}
                            :{vote.signal[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        )}

        {autonomyStatus.data?.lastError && (
          <div className="px-2 py-1 text-[0.5625rem] text-terminal-red border-t border-border bg-terminal-red/5">
            Autonomy error: {autonomyStatus.data.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
