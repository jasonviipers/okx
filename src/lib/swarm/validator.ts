import type { MarketContext } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";

const MAX_SPREAD_PERCENT = 0.005;
const MAX_VOLATILITY_PERCENT = 0.03;
const MIN_CONFIDENCE = 0.6;
const MIN_AGREEMENT = 0.6;
const RISK_SENTINEL_OVERRIDE = 0.75;

export function validateConsensus(
  consensus: ConsensusResult,
  ctx: MarketContext,
): ConsensusResult {
  const spreadPercent =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;
  const lastCandle = ctx.candles.at(-1);
  const volatilityPercent =
    lastCandle && ctx.ticker.last > 0
      ? (lastCandle.high - lastCandle.low) / ctx.ticker.last
      : 0;
  const riskVote = consensus.votes.find(
    (vote) => vote.role === "risk_sentinel",
  );

  const blockedReasons: string[] = [];
  if (spreadPercent > MAX_SPREAD_PERCENT) {
    blockedReasons.push(
      `spread ${(spreadPercent * 100).toFixed(3)}% exceeds 0.5%`,
    );
  }
  if (volatilityPercent > MAX_VOLATILITY_PERCENT) {
    blockedReasons.push(
      `last-candle volatility ${(volatilityPercent * 100).toFixed(2)}% exceeds 3.0%`,
    );
  }
  if (consensus.signal !== "HOLD" && consensus.confidence < MIN_CONFIDENCE) {
    blockedReasons.push(
      `confidence ${Math.round(consensus.confidence * 100)}% is below 60%`,
    );
  }
  if (consensus.signal !== "HOLD" && consensus.agreement < MIN_AGREEMENT) {
    blockedReasons.push(
      `agreement ${Math.round(consensus.agreement * 100)}% is below 60%`,
    );
  }

  if (
    consensus.signal !== "HOLD" &&
    riskVote?.signal === "HOLD" &&
    riskVote.confidence > RISK_SENTINEL_OVERRIDE
  ) {
    return {
      ...consensus,
      signal: "HOLD",
      blocked: true,
      blockReason: "Risk sentinel issued a high-conviction HOLD override.",
      validatedAt: new Date().toISOString(),
    };
  }

  if (blockedReasons.length > 0) {
    return {
      ...consensus,
      blocked: true,
      blockReason: blockedReasons.join("; "),
      validatedAt: new Date().toISOString(),
    };
  }

  return {
    ...consensus,
    validatedAt: new Date().toISOString(),
  };
}
