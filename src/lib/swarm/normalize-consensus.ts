import type { ConsensusResult } from "@/types/swarm";

export function normalizeConsensusResult(
  consensus: ConsensusResult,
): ConsensusResult {
  const decision = consensus.decision ?? consensus.signal;

  return {
    ...consensus,
    directionalSignal: consensus.directionalSignal ?? consensus.signal,
    directionalConfidence:
      consensus.directionalConfidence ?? consensus.confidence,
    directionalAgreement:
      consensus.directionalAgreement ?? consensus.agreement,
    decision,
    executionEligible:
      consensus.executionEligible ??
      (!consensus.blocked && decision !== "HOLD"),
    rejectionReasons: consensus.rejectionReasons ?? [],
  };
}
