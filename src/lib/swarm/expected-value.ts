import type { MarketContext } from "@/types/market";
import type { ConsensusResult, ExpectedValueReport } from "@/types/swarm";

const DEFAULT_EXPECTED_FEE_BPS = 10;
const DEFAULT_MIN_NET_EDGE_BPS = 8;
const DEFAULT_MIN_REWARD_RISK = 1.35;

function spreadBps(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? ((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 10_000
    : 0;
}

function realizedVolBps(ctx: MarketContext): number {
  const last = ctx.candles.at(-1);
  if (!last || last.close <= 0) {
    return 0;
  }
  return ((last.high - last.low) / last.close) * 10_000;
}

function getExpectedMoveBps(ctx: MarketContext): number {
  const volBps = realizedVolBps(ctx);
  return Math.max(20, volBps * 0.65);
}

export function applyExpectedValueGate(
  consensus: ConsensusResult,
  ctx: MarketContext,
): ConsensusResult {
  const estimatedFeeBps = Number(
    process.env.EXPECTED_FEE_BPS || DEFAULT_EXPECTED_FEE_BPS,
  );
  const minNetEdgeBps = Number(
    process.env.MIN_NET_EDGE_BPS || DEFAULT_MIN_NET_EDGE_BPS,
  );
  const minRewardRisk = Number(
    process.env.MIN_REWARD_RISK || DEFAULT_MIN_REWARD_RISK,
  );

  const spread = spreadBps(ctx);
  const slippageBps = Math.max(2, spread * 0.55);
  const expectedMoveBps = getExpectedMoveBps(ctx);
  const grossEdgeBps =
    consensus.signal === "HOLD"
      ? 0
      : expectedMoveBps * consensus.confidence * consensus.agreement;
  const rewardRiskRatio =
    spread + slippageBps > 0 ? grossEdgeBps / (spread + slippageBps) : 0;
  const netEdgeBps = grossEdgeBps - estimatedFeeBps - slippageBps;

  const notes: string[] = [];
  let tradeAllowed = true;
  let nextSignal = consensus.signal;
  let nextConfidence = consensus.confidence;
  let blocked = consensus.blocked;
  let blockReason = consensus.blockReason;

  if (consensus.signal === "HOLD") {
    tradeAllowed = false;
    notes.push(
      "No trade expected value calculated because the signal is HOLD.",
    );
  } else {
    if (netEdgeBps < minNetEdgeBps) {
      tradeAllowed = false;
      notes.push("Estimated net edge does not clear the minimum threshold.");
    }
    if (rewardRiskRatio < minRewardRisk) {
      tradeAllowed = false;
      notes.push("Estimated reward-to-risk is not attractive enough.");
    }
  }

  if (!tradeAllowed && consensus.signal !== "HOLD") {
    nextSignal = "HOLD";
    nextConfidence = Math.min(nextConfidence, 0.42);
    blocked = true;
    blockReason =
      blockReason ??
      "Expected-value gate rejected the setup after fees and slippage.";
  }

  const expectedValue: ExpectedValueReport = {
    grossEdgeBps: Number(grossEdgeBps.toFixed(2)),
    estimatedFeeBps: Number(estimatedFeeBps.toFixed(2)),
    estimatedSlippageBps: Number(slippageBps.toFixed(2)),
    netEdgeBps: Number(netEdgeBps.toFixed(2)),
    rewardRiskRatio: Number(rewardRiskRatio.toFixed(2)),
    tradeAllowed,
    notes,
    generatedAt: new Date().toISOString(),
  };

  return {
    ...consensus,
    signal: nextSignal,
    decision: nextSignal,
    confidence: Number(nextConfidence.toFixed(3)),
    blocked,
    blockReason,
    expectedValue,
  };
}
