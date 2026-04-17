"use client";

import type {
  AgentVote,
  ConsensusResult,
  ExecutionResult,
  SwarmStreamEvent,
} from "@/types/swarm";

const ROLE_LABELS: Record<string, string> = {
  trend_follower: "TREND",
  momentum_analyst: "MOMENT",
  sentiment_reader: "SENTIM",
  macro_filter: "MACRO",
  execution_tactician: "EXEC",
};

const SIGNAL_COLORS: Record<string, string> = {
  BUY: "text-terminal-green",
  SELL: "text-terminal-red",
  HOLD: "text-terminal-amber",
};

function formatMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function VoteRow({ vote }: { vote: AgentVote }) {
  const roleLabel = ROLE_LABELS[vote.role] ?? vote.role;
  const signalClass = SIGNAL_COLORS[vote.signal] ?? "text-muted-foreground";
  const vetoBadge = vote.isVetoLayer ? " [VETO]" : "";
  const researchStatus = vote.researchTrace?.status ?? "—";
  const researchLabel =
    researchStatus === "completed"
      ? "SRCH✓"
      : researchStatus === "skipped"
        ? "SRCH—"
        : researchStatus === "failed"
          ? "SRCH✗"
          : researchStatus === "requested"
            ? "SRCH◉"
            : "";

  return (
    <div className="flex items-center gap-1 min-h-[1.25rem] terminal-cell">
      <span className="w-[4.5rem] truncate text-terminal-cyan">
        {roleLabel}
      </span>
      <span className={`w-[2rem] ${signalClass} font-bold`}>{vote.signal}</span>
      <span className="w-[3rem] text-right tabular-nums">
        {(vote.confidence * 100).toFixed(0)}%
      </span>
      <span className="w-[3rem] text-right tabular-nums text-muted-foreground">
        w:{vote.voteWeight.toFixed(2)}
      </span>
      <span className="w-[3rem] text-right tabular-nums">
        {formatMs(vote.elapsedMs)}
      </span>
      {vote.isVetoLayer && (
        <span className="text-terminal-amber text-[0.5625rem]">
          {vetoBadge}
        </span>
      )}
      {researchLabel && (
        <span className="text-[0.5625rem] text-muted-foreground ml-auto">
          {researchLabel}
        </span>
      )}
    </div>
  );
}

function ConsensusPanel({
  consensus,
  execution,
}: {
  consensus: ConsensusResult | null;
  execution?: ExecutionResult;
}) {
  if (!consensus) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">NO DATA</div>
    );
  }

  const decisionSignal = consensus.decision ?? consensus.signal;
  const signalClass = SIGNAL_COLORS[decisionSignal] ?? "text-muted-foreground";

  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      <div className="flex items-baseline gap-2">
        <span className="terminal-text text-muted-foreground">DECISION</span>
        <span className={`terminal-text font-bold ${signalClass}`}>
          {decisionSignal}
        </span>
        <span className="terminal-text text-muted-foreground">
          conf:{(consensus.confidence * 100).toFixed(1)}%
        </span>
        <span className="terminal-text text-muted-foreground">
          agr:{(consensus.agreement * 100).toFixed(1)}%
        </span>
        {consensus.blocked && (
          <span className="terminal-text text-terminal-red">BLOCKED</span>
        )}
        {consensus.blockReason && (
          <span className="terminal-text-xs text-terminal-red">
            {consensus.blockReason}
          </span>
        )}
      </div>

      {(consensus.directionalSignal !== decisionSignal ||
        consensus.directionalConfidence !== consensus.confidence ||
        consensus.directionalAgreement !== consensus.agreement) && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">RAW</span>
          <span
            className={
              SIGNAL_COLORS[consensus.directionalSignal] ??
              "text-muted-foreground"
            }
          >
            {consensus.directionalSignal}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            conf:{(consensus.directionalConfidence * 100).toFixed(1)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            agr:{(consensus.directionalAgreement * 100).toFixed(1)}%
          </span>
        </div>
      )}

      <div className="flex items-baseline gap-2">
        <span className="terminal-text text-muted-foreground">EXEC</span>
        <span
          className={
            consensus.executionEligible
              ? "terminal-text text-terminal-green"
              : "terminal-text text-terminal-red"
          }
        >
          {consensus.executionEligible ? "ELIGIBLE" : "REJECTED"}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="terminal-text text-muted-foreground">SCORES</span>
        {Object.entries(consensus.weightedScores).map(([sig, score]) => (
          <span
            key={sig}
            className={`terminal-text-xs ${SIGNAL_COLORS[sig] ?? "text-muted-foreground"}`}
          >
            {sig}:{score.toFixed(2)}
          </span>
        ))}
      </div>

      {consensus.regime && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-muted-foreground">REGIME</span>
          <span className="terminal-text text-terminal-cyan">
            {consensus.regime.regime}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            conf:{(consensus.regime.confidence * 100).toFixed(0)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            trend:{consensus.regime.trendScore.toFixed(2)}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            vol:{consensus.regime.volatilityScore.toFixed(2)}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            liq:{consensus.regime.liquidityScore.toFixed(2)}
          </span>
        </div>
      )}

      {consensus.metaSelection && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-muted-foreground">ENGINE</span>
          <span className="terminal-text text-terminal-cyan">
            {consensus.metaSelection.selectedEngine}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            suit:{(consensus.metaSelection.suitability * 100).toFixed(0)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            bias:{consensus.metaSelection.actionBias}
          </span>
        </div>
      )}

      {consensus.expectedValue && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-muted-foreground">EV</span>
          <span
            className={`terminal-text-xs ${consensus.expectedValue.netEdgeBps >= 0 ? "text-terminal-green" : "text-terminal-red"}`}
          >
            net:{consensus.expectedValue.netEdgeBps.toFixed(1)}bps
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            gross:{consensus.expectedValue.grossEdgeBps.toFixed(1)}bps
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            rr:{consensus.expectedValue.rewardRiskRatio.toFixed(2)}
          </span>
          {!consensus.expectedValue.tradeAllowed && (
            <span className="terminal-text-xs text-terminal-red">REJECTED</span>
          )}
        </div>
      )}

      {consensus.reliability && (
        <div className="flex items-baseline gap-2">
          <span className="terminal-text text-muted-foreground">REL</span>
          <span className="terminal-text-xs text-terminal-cyan">
            {(consensus.reliability.reliabilityScore * 100).toFixed(0)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            n:{consensus.reliability.sampleSize}
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            blk:{(consensus.reliability.blockedRate * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {consensus.harness && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">HARNESS</span>
          <span className="terminal-text-xs text-muted-foreground">
            mqual:{(consensus.harness.marketQualityScore * 100).toFixed(0)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            liq:{(consensus.harness.liquidityScore * 100).toFixed(0)}%
          </span>
          <span className="terminal-text-xs text-muted-foreground">
            mem:{(consensus.harness.memoryAlignmentScore * 100).toFixed(0)}%
          </span>
          {consensus.harness.blockedByHarness && (
            <span className="terminal-text-xs text-terminal-red">BLOCKED</span>
          )}
        </div>
      )}

      {consensus.researchSummary && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="terminal-text text-muted-foreground">RESEARCH</span>
          <span className="terminal-text-xs text-terminal-cyan">
            {consensus.researchSummary.completedAgents}/
            {consensus.researchSummary.totalAgents}
          </span>
          {consensus.researchSummary.topFocuses.length > 0 && (
            <span className="terminal-text-xs text-muted-foreground">
              [{consensus.researchSummary.topFocuses.slice(0, 2).join(", ")}]
            </span>
          )}
        </div>
      )}

      {consensus.rejectionReasons.length > 0 && (
        <div className="mt-1">
          <div className="data-header">REJECTIONS</div>
          {consensus.rejectionReasons.slice(0, 4).map((reason) => (
            <div
              key={`${reason.layer}-${reason.code}`}
              className="terminal-text-xs text-terminal-red"
            >
              [{reason.layer}] {reason.summary}
            </div>
          ))}
        </div>
      )}

      {execution && (
        <div className="mt-1">
          <div className="data-header">EXECUTION</div>
          <div className="terminal-text-xs">
            <span className="text-muted-foreground">status:</span>{" "}
            <span
              className={
                execution.status === "success"
                  ? "text-terminal-green"
                  : execution.status === "error"
                    ? "text-terminal-red"
                    : "text-terminal-amber"
              }
            >
              {execution.status}
            </span>
            {execution.reason && (
              <>
                {" "}
                <span className="text-muted-foreground">{execution.reason}</span>
              </>
            )}
            {execution.error && (
              <>
                {" "}
                <span className="text-terminal-red">{execution.error}</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-1">
        <div className="data-header">VOTES ({consensus.votes.length})</div>
        {consensus.votes.map((vote, i) => (
          <VoteRow key={`${vote.model}-${vote.role}-${i}`} vote={vote} />
        ))}
      </div>
    </div>
  );
}

function getStreamEventKey(evt: SwarmStreamEvent, index: number): string {
  if (evt.id) {
    return evt.id;
  }

  return [
    evt.type,
    evt.timestamp,
    evt.pipeline?.stage,
    evt.vote?.model,
    evt.vote?.role,
    evt.message,
    index,
  ]
    .filter(Boolean)
    .join("-");
}

function StreamLog({ events }: { events: SwarmStreamEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="p-1.5 terminal-text text-muted-foreground">
        STREAM IDLE
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-px overflow-y-auto max-h-48 p-1">
      {events.map((evt, index) => {
        const key = getStreamEventKey(evt, index);
        const ts = formatTime(evt.timestamp);
        switch (evt.type) {
          case "status":
            return (
              <div key={key} className="terminal-text-xs">
                <span className="text-muted-foreground">{ts}</span>{" "}
                <span className="text-terminal-cyan">STS</span>{" "}
                <span>{evt.message}</span>
              </div>
            );
          case "pipeline":
            return (
              <div key={key} className="terminal-text-xs">
                <span className="text-muted-foreground">{ts}</span>{" "}
                <span className="text-terminal-amber">PIPE</span>{" "}
                <span className="text-terminal-cyan">
                  {evt.pipeline?.stage}
                </span>{" "}
                <span className="text-muted-foreground">
                  {evt.pipeline?.detail}
                </span>
              </div>
            );
          case "vote":
            return (
              <div key={key} className="terminal-text-xs">
                <span className="text-muted-foreground">{ts}</span>{" "}
                <span className={SIGNAL_COLORS[evt.vote?.signal ?? "HOLD"]}>
                  VOTE
                </span>{" "}
                <span className="text-terminal-cyan">
                  {ROLE_LABELS[evt.vote?.role ?? ""] ?? evt.vote?.role}
                </span>{" "}
                <span className={SIGNAL_COLORS[evt.vote?.signal ?? "HOLD"]}>
                  {evt.vote?.signal}
                </span>{" "}
                <span className="text-muted-foreground">
                  {(evt.vote?.confidence ?? 0) * 100}%
                </span>
              </div>
            );
          case "consensus":
            return (
              <div key={key} className="terminal-text-xs">
                <span className="text-muted-foreground">{ts}</span>{" "}
                <span className="text-terminal-gold">CONS</span>{" "}
                <span
                  className={
                    SIGNAL_COLORS[
                      evt.consensus?.decision ?? evt.consensus?.signal ?? "HOLD"
                    ]
                  }
                >
                  {evt.consensus?.decision ?? evt.consensus?.signal}
                </span>{" "}
                <span className="text-muted-foreground">
                  {(evt.consensus?.confidence ?? 0) * 100}%
                </span>
              </div>
            );
          case "error":
            return (
              <div key={key} className="terminal-text-xs text-terminal-red">
                <span className="text-muted-foreground">{ts}</span>{" "}
                <span>ERR</span> {evt.message}
              </div>
            );
          case "heartbeat":
            return (
              <div key={key} className="terminal-text-xs text-muted-foreground">
                <span>{ts}</span> ♥
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export {
  ConsensusPanel,
  StreamLog,
  ROLE_LABELS,
  SIGNAL_COLORS,
  formatMs,
  formatTime,
};
