"use client";

import type { RuntimeStatus } from "@/types/api";
import { formatTime } from "./swarm-panels";

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 terminal-cell">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? "bg-terminal-green" : "bg-terminal-red"}`}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-terminal-green" : "text-terminal-red"}>
        {ok ? "OK" : "DOWN"}
      </span>
    </div>
  );
}

function AutonomyPanel({ status }: { status: RuntimeStatus["autonomy"] }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="flex items-baseline gap-2">
        <span className="terminal-text text-muted-foreground">MODE</span>
        <span className="terminal-text text-terminal-cyan">
          {status.enabled ? "ENABLED" : "DISABLED"}
        </span>
        <span className="terminal-text text-muted-foreground">
          {status.running ? "● RUNNING" : "○ IDLE"}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="terminal-text text-muted-foreground">SYM</span>
        <span className="terminal-text">{status.symbol}</span>
        <span className="terminal-text text-muted-foreground">TF</span>
        <span className="terminal-text">{status.timeframe}</span>
        <span className="terminal-text text-muted-foreground">SEL</span>
        <span className="terminal-text">{status.selectionMode ?? "—"}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="terminal-text text-muted-foreground">INTERVAL</span>
        <span className="terminal-text">
          {(status.intervalMs / 1000).toFixed(0)}s
        </span>
        <span className="terminal-text text-muted-foreground">COOLDOWN</span>
        <span className="terminal-text">
          {(status.cooldownMs / 1000).toFixed(0)}s
        </span>
        <span className="terminal-text text-muted-foreground">ITER</span>
        <span className="terminal-text">{status.iterationCount}</span>
      </div>
      {status.lastRunAt && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">LAST RUN</span>
          <span className="terminal-text">{formatTime(status.lastRunAt)}</span>
          {status.lastDecision && (
            <>
              <span className="terminal-text text-muted-foreground">
                DECISION
              </span>
              <span
                className={`terminal-text ${status.lastDecision === "BUY" ? "text-terminal-green" : status.lastDecision === "SELL" ? "text-terminal-red" : "text-terminal-amber"}`}
              >
                {status.lastDecision}
              </span>
            </>
          )}
          {status.lastExecutionStatus && (
            <>
              <span className="terminal-text text-muted-foreground">
                STATUS
              </span>
              <span
                className={`terminal-text ${status.lastExecutionStatus === "success" ? "text-terminal-green" : status.lastExecutionStatus === "error" ? "text-terminal-red" : "text-terminal-amber"}`}
              >
                {status.lastExecutionStatus}
              </span>
            </>
          )}
        </div>
      )}
      {status.nextRunAt && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-muted-foreground">NEXT RUN</span>
          <span className="terminal-text">{formatTime(status.nextRunAt)}</span>
        </div>
      )}
      {status.budgetUsd !== undefined && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">BUDGET</span>
          <span className="terminal-text">${status.budgetUsd.toFixed(2)}</span>
          {status.budgetRemainingUsd !== undefined && (
            <>
              <span className="terminal-text text-muted-foreground">
                REMAIN
              </span>
              <span className="terminal-text">
                ${status.budgetRemainingUsd.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}
      {status.lastError && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-terminal-red">ERROR</span>
          <span className="terminal-text-xs text-terminal-red">
            {status.lastError}
          </span>
        </div>
      )}
      {status.inFlight && (
        <div className="flex items-baseline gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-terminal-amber animate-pulse-soft" />
          <span className="terminal-text text-terminal-amber">IN FLIGHT</span>
        </div>
      )}
      {status.candidateSymbols && status.candidateSymbols.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">
            CANDIDATES
          </span>
          {status.candidateSymbols.map((sym) => (
            <span key={sym} className="terminal-text-xs text-terminal-cyan">
              {sym}
            </span>
          ))}
        </div>
      )}
      {status.lastSelectedCandidate && (
        <div className="mt-1">
          <div className="data-header">LAST SELECTED</div>
          <div className="terminal-text-xs">
            <span className="text-terminal-cyan">
              {status.lastSelectedCandidate.symbol}
            </span>{" "}
            <span className="text-muted-foreground">
              score:{status.lastSelectedCandidate.score.toFixed(3)}
            </span>{" "}
            <span
              className={
                status.lastSelectedCandidate.decision === "BUY"
                  ? "text-terminal-green"
                  : status.lastSelectedCandidate.decision === "SELL"
                    ? "text-terminal-red"
                    : "text-terminal-amber"
              }
            >
              {status.lastSelectedCandidate.decision}
            </span>
          </div>
        </div>
      )}
      {status.lastCandidateScores && status.lastCandidateScores.length > 0 && (
        <div className="mt-1">
          <div className="data-header">CANDIDATE SCORES</div>
          {status.lastCandidateScores.slice(0, 4).map((candidate) => (
            <div
              key={candidate.symbol}
              className="flex items-baseline gap-2 terminal-text-xs"
            >
              <span className="text-terminal-cyan w-[5rem] truncate">
                {candidate.symbol}
              </span>
              <span className="text-muted-foreground">
                {candidate.score.toFixed(3)}
              </span>
              <span
                className={
                  candidate.decision === "BUY"
                    ? "text-terminal-green"
                    : candidate.decision === "SELL"
                      ? "text-terminal-red"
                      : "text-terminal-amber"
                }
              >
                {candidate.decision}
              </span>
              {candidate.expectedNetEdgeBps !== undefined && (
                <span className="text-muted-foreground">
                  ev:{candidate.expectedNetEdgeBps.toFixed(1)}
                </span>
              )}
              {candidate.marketQualityScore !== undefined && (
                <span className="text-muted-foreground">
                  mq:{(candidate.marketQualityScore * 100).toFixed(0)}%
                </span>
              )}
              {!candidate.realtime && (
                <span className="text-terminal-amber">NON-RT</span>
              )}
              {candidate.rejectionReasons.length > 0 && (
                <span className="text-terminal-red">REJ</span>
              )}
            </div>
          ))}
        </div>
      )}
      {status.lastRejectedReasons && status.lastRejectedReasons.length > 0 && (
        <div className="mt-1">
          <div className="data-header">LAST REJECTIONS</div>
          {status.lastRejectedReasons.slice(0, 3).map((reason) => (
            <div
              key={`${reason.layer}-${reason.code}`}
              className="terminal-text-xs text-terminal-red"
            >
              [{reason.layer}] {reason.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemsPanel({ status }: { status: RuntimeStatus | null }) {
  if (!status) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO DATA</div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-1.5">
      <div className="data-header">SERVICES</div>
      <StatusDot ok={status.okx.configured} label="OKX" />
      <div className="flex items-center gap-2 ml-4 terminal-text-xs text-muted-foreground">
        <span>mode:{status.okx.accountMode}</span>
        <span>url:{status.okx.baseUrl}</span>
        <span>{status.okx.detail}</span>
      </div>
      <StatusDot ok={status.redis.configured} label="REDIS" />
      <div className="flex items-center gap-2 ml-4 terminal-text-xs text-muted-foreground">
        <span>{status.redis.detail}</span>
      </div>
      <StatusDot ok={status.ollama.configured} label="OLLAMA" />
      <div className="flex items-center gap-2 ml-4 terminal-text-xs text-muted-foreground">
        <span>{status.ollama.detail}</span>
        {status.ollama.baseUrl && <span>{status.ollama.baseUrl}</span>}
      </div>
      <StatusDot ok={status.webResearch.configured} label="WEB SEARCH" />
      <div className="flex items-center gap-2 ml-4 terminal-text-xs text-muted-foreground">
        <span>{status.webResearch.detail}</span>
      </div>

      <div className="data-header mt-1">MARKET DATA</div>
      <div className="flex items-center gap-2 terminal-text">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status.marketData.connectionState === "connected"
              ? "bg-terminal-green"
              : status.marketData.connectionState === "connecting" ||
                  status.marketData.connectionState === "degraded"
                ? "bg-terminal-amber"
                : "bg-terminal-red"
          }`}
        />
        <span
          className={
            status.marketData.available
              ? "text-terminal-green"
              : "text-terminal-red"
          }
        >
          {status.marketData.connectionState.toUpperCase()}
        </span>
        <span className="text-muted-foreground">
          {status.marketData.realtime ? "REALTIME" : "POLLING"}
        </span>
        {status.marketData.stale && (
          <span className="text-terminal-amber">STALE</span>
        )}
      </div>
      <div className="flex items-center gap-2 terminal-text-xs text-muted-foreground">
        <span>sym:{status.marketData.symbol ?? "—"}</span>
        <span>tf:{status.marketData.timeframe ?? "—"}</span>
        <span>src:{status.marketData.source ?? "unknown"}</span>
        {status.marketData.lastEventAt && (
          <span>last:{formatTime(status.marketData.lastEventAt)}</span>
        )}
      </div>
      {status.marketData.detail && (
        <div className="flex flex-col gap-px mt-0.5">
          <span className="terminal-text-xs text-terminal-amber">
            {status.marketData.detail}
          </span>
        </div>
      )}

      <div className="data-header mt-1">AUTONOMY</div>
      <AutonomyPanel status={status.autonomy} />
    </div>
  );
}

export { SystemsPanel, AutonomyPanel, StatusDot };
