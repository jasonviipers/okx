export const SWARM_PROMPT_VERSION = "1.0" as const;

export const SWARM_POLICY = {
  positionSizing: {
    maxSingleAssetExposurePct: 0.2,
    maxTopTwoAssetsExposurePct: 0.55,
    minCashReservePct: 0.15,
    phaseOneCashReservePct: 0.2,
    maxSingleTradePct: 0.1,
  },
  exits: {
    hardStopLossPct: 0.07,
    trailingActivationGainPct: 0.05,
    trailingGainLockRatio: 0.5,
    defaultTakeProfitPct: 0.12,
  },
  risk: {
    vetoConfidenceThreshold: 0.75,
    minConsensusVotes: 3,
    minAverageConfidence: 0.7,
    portfolioDrawdownCircuitPct: 0.05,
  },
  memeAssets: {
    symbols: ["DOGE-USDT", "SHIB-USDT", "PEPE-USDT"] as const,
    maxAllocationPct: 0.15,
  },
} as const;

export type SwarmRiskFlag = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export function isMemeAsset(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase();
  return SWARM_POLICY.memeAssets.symbols.includes(
    normalized as (typeof SWARM_POLICY.memeAssets.symbols)[number],
  );
}

export function buildSwarmMasterPromptExcerpt(): string {
  return [
    `Swarm Trading System prompt version ${SWARM_PROMPT_VERSION}.`,
    "Mission: capital preservation first, growth second.",
    `Hard caps: single asset <= ${(SWARM_POLICY.positionSizing.maxSingleAssetExposurePct * 100).toFixed(0)}%, top-2 <= ${(SWARM_POLICY.positionSizing.maxTopTwoAssetsExposurePct * 100).toFixed(0)}%, EUR cash >= ${(SWARM_POLICY.positionSizing.minCashReservePct * 100).toFixed(0)}%, trade size <= ${(SWARM_POLICY.positionSizing.maxSingleTradePct * 100).toFixed(0)}% of NAV.`,
    `Protective exits: hard stop-loss ${(SWARM_POLICY.exits.hardStopLossPct * 100).toFixed(0)}%, trailing stop activates after +${(SWARM_POLICY.exits.trailingActivationGainPct * 100).toFixed(0)}% and locks ${(SWARM_POLICY.exits.trailingGainLockRatio * 100).toFixed(0)}% of gains, default take-profit +${(SWARM_POLICY.exits.defaultTakeProfitPct * 100).toFixed(0)}%.`,
    `Consensus: require at least ${SWARM_POLICY.risk.minConsensusVotes} aligned BUY or SELL votes with average confidence >= ${(SWARM_POLICY.risk.minAverageConfidence * 10).toFixed(0)}/10 and zero vetoes.`,
    `Meme assets (${SWARM_POLICY.memeAssets.symbols.join(", ")}): allocation <= ${(SWARM_POLICY.memeAssets.maxAllocationPct * 100).toFixed(0)}% and bias HIGH risk.`,
    "No averaging down. Ties go to HOLD. Missing invalidation invalidates the vote.",
  ].join("\n");
}
