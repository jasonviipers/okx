"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentVote, ConsensusResult } from "@/types/swarm";

interface AgentStreamProps {
  symbol: string;
  onEvent?: (data: StreamEvent) => void;
}

interface StreamEvent {
  type: string;
  timestamp: string;
  vote?: AgentVote;
  consensus?: ConsensusResult;
  message?: string;
}

export function AgentStream({ symbol, onEvent }: AgentStreamProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/swarm/stream?symbol=${symbol}`);

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents((prev) => [...prev, data]);
        onEvent?.(data);
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [symbol, onEvent]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  });

  return (
    <div className="bloomberg-panel">
      <div className="bloomberg-panel-header">
        <h3>Live Stream</h3>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 ${connected ? "bg-[var(--terminal-green)]" : "bg-[var(--terminal-red)]"}`}
          />
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {connected ? "LIVE" : "OFF"}
          </span>
        </div>
      </div>

      <div ref={containerRef} className="h-48 overflow-y-auto">
        {events.length === 0 && (
          <div className="bloomberg-data-row">
            <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
              — Waiting for agent events —
            </span>
          </div>
        )}
        {events.map((event) => {
          const ts = new Date(event.timestamp).toLocaleTimeString();
          const isVote = event.type === "vote";
          const isError = event.type === "error";
          return (
            <div
              key={`${event.type}-${event.timestamp}-${event.vote?.model ?? event.message ?? "event"}`}
              className="bloomberg-data-row text-[10px]"
            >
              <span className="text-[var(--muted-foreground)] tabular-nums w-16 flex-shrink-0">
                {ts}
              </span>
              <span
                className={`font-bold uppercase flex-shrink-0 w-10 ${
                  isVote
                    ? "text-[var(--terminal-cyan)]"
                    : isError
                      ? "bloomberg-value-negative"
                      : "text-[var(--muted-foreground)]"
                }`}
              >
                {event.type}
              </span>
              <span className="text-[var(--foreground)] truncate">
                {event.vote?.reasoning ??
                  event.consensus?.signal ??
                  event.message ??
                  "update"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
