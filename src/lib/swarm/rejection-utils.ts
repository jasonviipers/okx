import type { ConsensusResult, RejectionReason, TradeSignal } from "@/types/swarm";

function dedupeRejectionReasons(
  reasons: RejectionReason[],
): RejectionReason[] {
  const seen = new Set<string>();

  return reasons.filter((reason) => {
    const key = `${reason.layer}:${reason.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function appendRejectionReason(
  consensus: ConsensusResult,
  reason: RejectionReason,
): ConsensusResult {
  const rejectionReasons = dedupeRejectionReasons([
    ...consensus.rejectionReasons,
    reason,
  ]);

  return {
    ...consensus,
    rejectionReasons,
    blockReason: consensus.blockReason ?? reason.summary,
  };
}

export function markConsensusBlocked(
  consensus: ConsensusResult,
  reason: RejectionReason,
  options?: {
    confidence?: number;
    decision?: TradeSignal;
  },
): ConsensusResult {
  const next = appendRejectionReason(consensus, reason);

  return {
    ...next,
    confidence: options?.confidence ?? next.confidence,
    decision: options?.decision ?? "HOLD",
    blocked: true,
    executionEligible: false,
  };
}

export function finalizeConsensusDecision(
  consensus: ConsensusResult,
): ConsensusResult {
  const decision = consensus.blocked
    ? "HOLD"
    : (consensus.decision ?? consensus.signal);

  return {
    ...consensus,
    decision,
    executionEligible: !consensus.blocked && decision !== "HOLD",
  };
}
