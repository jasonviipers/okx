import type { ConsensusResult, DecisionResult } from "@/types/swarm";

function requireValue<T>(value: T | null | undefined, field: string): T {
  if (value === undefined || value === null) {
    throw new Error(`DecisionResult conversion requires "${field}".`);
  }

  return value;
}

function normalizeDecisionSource(
  source: ConsensusResult["decisionSource"],
): DecisionResult["decisionSource"] {
  return source === "diagnostic" || source === "diagnostic_swarm"
    ? "diagnostic"
    : "deterministic";
}

export function toDecisionResult(
  consensus: ConsensusResult | DecisionResult,
): DecisionResult {
  const decision = consensus.decision ?? consensus.signal;

  return {
    symbol: requireValue(consensus.symbol, "symbol"),
    timeframe: requireValue(consensus.timeframe, "timeframe"),
    signal: requireValue(consensus.signal, "signal"),
    directionalSignal: consensus.directionalSignal ?? consensus.signal,
    directionalConfidence:
      consensus.directionalConfidence ?? consensus.confidence,
    directionalAgreement: consensus.directionalAgreement ?? consensus.agreement,
    decision,
    confidence: requireValue(consensus.confidence, "confidence"),
    agreement: requireValue(consensus.agreement, "agreement"),
    executionEligible:
      consensus.executionEligible ??
      (!consensus.blocked && decision !== "HOLD"),
    blocked: consensus.blocked,
    blockReason: consensus.blockReason,
    rejectionReasons: consensus.rejectionReasons ?? [],
    riskFlags: consensus.riskFlags ?? [],
    featureSummary: consensus.featureSummary ?? {},
    directionalEdgeScore: consensus.directionalEdgeScore ?? 0,
    executionQualityScore: consensus.executionQualityScore ?? 0,
    riskPenaltyScore: consensus.riskPenaltyScore ?? 0,
    expectedNetEdgeBps:
      consensus.expectedNetEdgeBps ?? consensus.expectedValue?.netEdgeBps ?? 0,
    marketQualityScore:
      consensus.marketQualityScore ??
      consensus.harness?.marketQualityScore ??
      0,
    decisionSource: normalizeDecisionSource(consensus.decisionSource),
    decisionCadenceMs: consensus.decisionCadenceMs ?? 20_000,
    symbolThrottleMs: consensus.symbolThrottleMs ?? 30_000,
    validatedAt: requireValue(consensus.validatedAt, "validatedAt"),
    regime: requireValue(consensus.regime, "regime"),
    engineReports: requireValue(consensus.engineReports, "engineReports"),
    metaSelection: requireValue(consensus.metaSelection, "metaSelection"),
    expectedValue: requireValue(consensus.expectedValue, "expectedValue"),
    harness: requireValue(consensus.harness, "harness"),
    memory: consensus.memory,
    reliability: consensus.reliability,
    votes: consensus.votes,
    weightedScores: consensus.weightedScores,
    researchSummary: consensus.researchSummary,
  };
}

export function normalizeConsensusResult(
  consensus: ConsensusResult | DecisionResult,
): DecisionResult {
  return {
    ...toDecisionResult(consensus),
    directionalSignal: consensus.directionalSignal ?? consensus.signal,
    directionalConfidence:
      consensus.directionalConfidence ?? consensus.confidence,
  };
}
