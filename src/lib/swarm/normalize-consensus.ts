import type { ConsensusResult } from "@/types/swarm";

export function normalizeConsensusResult(
  consensus: ConsensusResult,
): ConsensusResult {
  const decision = consensus.decision ?? consensus.signal;

  return {
    ...consensus,
    decisionSource: consensus.decisionSource ?? "deterministic",
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
    featureSummary: consensus.featureSummary ?? {},
    riskFlags: consensus.riskFlags ?? [],
    directionalEdgeScore: consensus.directionalEdgeScore ?? 0,
    executionQualityScore: consensus.executionQualityScore ?? 0,
    riskPenaltyScore: consensus.riskPenaltyScore ?? 0,
    expectedNetEdgeBps:
      consensus.expectedNetEdgeBps ?? consensus.expectedValue?.netEdgeBps,
    marketQualityScore:
      consensus.marketQualityScore ?? consensus.harness?.marketQualityScore,
    decisionCadenceMs: consensus.decisionCadenceMs ?? 20_000,
    symbolThrottleMs: consensus.symbolThrottleMs ?? 30_000,
  };
}
