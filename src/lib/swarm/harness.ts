import "server-only";

import { clampConfidence } from "@/lib/agents/base-agent";
import { markConsensusBlocked } from "@/lib/swarm/rejection-utils";
import type { MarketContext } from "@/types/market";
import type { DecisionHarnessReport, MemorySummary } from "@/types/memory";
import type { ConsensusResult, TradeSignal } from "@/types/swarm";

function spreadPercent(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
    : 0;
}

function volatilityPercent(ctx: MarketContext): number {
  const last = ctx.candles.at(-1);
  return last && last.close > 0 ? (last.high - last.low) / last.close : 0;
}

function dominantOpposingSignal(signal: TradeSignal): TradeSignal {
  if (signal === "BUY") {
    return "SELL";
  }
  if (signal === "SELL") {
    return "BUY";
  }
  return "HOLD";
}

export function applyDecisionHarness(
  consensus: ConsensusResult,
  ctx: MarketContext,
  memory: MemorySummary,
): ConsensusResult {
  const spread = spreadPercent(ctx);
  const volatility = volatilityPercent(ctx);
  const liquidityScore = Math.max(0, 1 - spread / 0.006);
  const volatilityPenalty = Math.min(0.12, volatility * 1.8);

  const alignedWeight = memory.directionalWeights[consensus.signal] ?? 0;
  const opposingSignal = dominantOpposingSignal(consensus.signal);
  const opposingWeight =
    consensus.signal === "HOLD"
      ? Math.max(memory.directionalWeights.BUY, memory.directionalWeights.SELL)
      : memory.directionalWeights[opposingSignal];
  const totalDirectionalWeight =
    memory.directionalWeights.BUY +
    memory.directionalWeights.SELL +
    memory.directionalWeights.HOLD;
  const memoryAlignmentScore =
    totalDirectionalWeight > 0
      ? (alignedWeight - opposingWeight) / totalDirectionalWeight
      : 0;

  let confidenceAdjustment = 0;
  const notes: string[] = [];

  if (memory.effectiveSampleSize >= 0.8) {
    if (memoryAlignmentScore > 0.2) {
      confidenceAdjustment += 0.05;
      notes.push("Aging memory aligns with the current consensus.");
    }
    if (memoryAlignmentScore < -0.2) {
      confidenceAdjustment -= 0.08;
      notes.push("Aging memory contradicts the current consensus.");
    }
    if (memory.blockedRatio > 0.45 && consensus.signal !== "HOLD") {
      confidenceAdjustment -= 0.05;
      notes.push("Comparable historical setups were frequently blocked.");
    }
  }

  if (spread > 0.0035) {
    confidenceAdjustment -= 0.04;
    notes.push(
      "Liquidity is thinning relative to the preferred spread envelope.",
    );
  }

  confidenceAdjustment -= volatilityPenalty;
  if (volatilityPenalty > 0.02) {
    notes.push(
      "Harness reduced conviction due to elevated intrabar volatility.",
    );
  }

  const nextConfidence = clampConfidence(
    consensus.confidence + confidenceAdjustment,
  );
  const blockedByHarness =
    consensus.signal !== "HOLD" &&
    (nextConfidence < 0.58 ||
      (memory.blockedRatio > 0.6 && memoryAlignmentScore < 0));

  const harness: DecisionHarnessReport = {
    generatedAt: new Date().toISOString(),
    marketQualityScore: Number(
      ((liquidityScore + (1 - volatilityPenalty)) / 2).toFixed(3),
    ),
    liquidityScore: Number(liquidityScore.toFixed(3)),
    volatilityPenalty: Number(volatilityPenalty.toFixed(3)),
    memoryAlignmentScore: Number(memoryAlignmentScore.toFixed(3)),
    confidenceAdjustment: Number(confidenceAdjustment.toFixed(3)),
    blockedByHarness,
    notes:
      notes.length > 0
        ? notes
        : ["Harness found no material reason to adjust the raw consensus."],
  };

  let nextConsensus: ConsensusResult = {
    ...consensus,
    confidence: nextConfidence,
    memory,
    harness,
  };

  if (blockedByHarness) {
    nextConsensus = markConsensusBlocked(nextConsensus, {
      layer: "harness",
      code: "harness_threshold_failed",
      summary:
        "Decision harness suppressed the trade after memory and market-quality review.",
      detail:
        "Harness confidence or memory-alignment thresholds were not satisfied.",
      metrics: {
        confidence: Number((nextConfidence * 100).toFixed(4)),
        marketQualityScore: Number(
          (harness.marketQualityScore * 100).toFixed(4),
        ),
        memoryAlignmentScore: Number((memoryAlignmentScore * 100).toFixed(4)),
        blockedRatio: Number((memory.blockedRatio * 100).toFixed(4)),
      },
    });
  }

  return nextConsensus;
}
