import { SWARM_POLICY } from "@/lib/swarm/policy";
import {
  appendRejectionReason,
  markConsensusBlocked,
} from "@/lib/swarm/rejection-utils";
import { SWARM_THRESHOLDS } from "@/lib/swarm/thresholds";
import type { MarketContext } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";

export function validateConsensus(
  consensus: ConsensusResult,
  ctx: MarketContext,
): ConsensusResult {
  if (consensus.signal === "HOLD") {
    return { ...consensus, validatedAt: new Date().toISOString() };
  }

  const vetoRoles = ["macro_filter", "execution_tactician"] as const;

  for (const vetoRole of vetoRoles) {
    const vetoVote = consensus.votes.find((vote) => vote.role === vetoRole);
    if (
      vetoVote &&
      vetoVote.signal === "HOLD" &&
      vetoVote.confidence > SWARM_THRESHOLDS.VETO_CONFIDENCE_THRESHOLD
    ) {
      return {
        ...markConsensusBlocked(consensus, {
          layer: "validator",
          code: "veto_hold",
          summary: `Veto layer "${vetoVote.role}" blocked the setup.`,
          detail: `Model ${vetoVote.model} issued a HOLD with veto confidence.`,
          metrics: {
            vetoConfidence: Number((vetoVote.confidence * 100).toFixed(4)),
            vetoThreshold: Number(
              (SWARM_THRESHOLDS.VETO_CONFIDENCE_THRESHOLD * 100).toFixed(4),
            ),
          },
        }),
        validatedAt: new Date().toISOString(),
      };
    }
  }

  const spreadPercent =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;

  const lastCandle = ctx.candles.at(-1);
  const volatilityPercent =
    lastCandle && ctx.ticker.last > 0
      ? (lastCandle.high - lastCandle.low) / ctx.ticker.last
      : 0;
  const usesLegacyVoteValidation = consensus.decisionSource !== "deterministic";

  let nextConsensus = consensus;

  const directionalVotes = consensus.votes.filter((vote) => !vote.isVetoLayer);
  const alignedDirectionalVotes = directionalVotes.filter(
    (vote) => vote.signal === consensus.signal,
  );
  const missingInvalidationVote = consensus.votes.find(
    (vote) =>
      vote.signal !== "HOLD" &&
      (!vote.invalidation || vote.invalidation.trim().length === 0),
  );

  if (usesLegacyVoteValidation && missingInvalidationVote) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "missing_invalidation",
      summary: "A directional vote was missing its invalidation rule.",
      detail: `Model ${missingInvalidationVote.model} submitted ${missingInvalidationVote.signal} without a valid invalidation.`,
    });
  }

  if (
    usesLegacyVoteValidation &&
    alignedDirectionalVotes.length < SWARM_POLICY.risk.minConsensusVotes
  ) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "insufficient_aligned_votes",
      summary:
        "Directional consensus did not reach the minimum aligned vote count.",
      detail: `Received ${alignedDirectionalVotes.length} aligned votes; need at least ${SWARM_POLICY.risk.minConsensusVotes}.`,
      metrics: {
        alignedVotes: alignedDirectionalVotes.length,
        requiredVotes: SWARM_POLICY.risk.minConsensusVotes,
      },
    });
  }

  if (usesLegacyVoteValidation && alignedDirectionalVotes.length > 0) {
    const avgAlignedConfidence =
      alignedDirectionalVotes.reduce((sum, vote) => sum + vote.confidence, 0) /
      alignedDirectionalVotes.length;
    if (avgAlignedConfidence < SWARM_POLICY.risk.minAverageConfidence) {
      nextConsensus = appendRejectionReason(nextConsensus, {
        layer: "validator",
        code: "aligned_confidence_below_min",
        summary:
          "Aligned directional votes did not meet the required average confidence.",
        detail: `Average aligned confidence ${(avgAlignedConfidence * 100).toFixed(2)}% is below ${(SWARM_POLICY.risk.minAverageConfidence * 100).toFixed(2)}%.`,
        metrics: {
          avgAlignedConfidence: Number((avgAlignedConfidence * 100).toFixed(4)),
          minAverageConfidence: Number(
            (SWARM_POLICY.risk.minAverageConfidence * 100).toFixed(4),
          ),
        },
      });
    }
  }

  if (spreadPercent > SWARM_THRESHOLDS.MAX_SPREAD_PERCENT) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "spread_above_max",
      summary: "Spread exceeds the structural execution limit.",
      detail: `Spread ${(spreadPercent * 100).toFixed(3)}% is above ${(SWARM_THRESHOLDS.MAX_SPREAD_PERCENT * 100).toFixed(3)}%.`,
      metrics: {
        spreadPercent: Number((spreadPercent * 100).toFixed(4)),
        maxSpreadPercent: Number(
          (SWARM_THRESHOLDS.MAX_SPREAD_PERCENT * 100).toFixed(4),
        ),
      },
    });
  }

  if (volatilityPercent > SWARM_THRESHOLDS.MAX_VOLATILITY_PERCENT) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "volatility_above_max",
      summary: "Last-candle volatility exceeds the structural limit.",
      detail: `Last-candle volatility ${(volatilityPercent * 100).toFixed(3)}% is above ${(SWARM_THRESHOLDS.MAX_VOLATILITY_PERCENT * 100).toFixed(3)}%.`,
      metrics: {
        volatilityPercent: Number((volatilityPercent * 100).toFixed(4)),
        maxVolatilityPercent: Number(
          (SWARM_THRESHOLDS.MAX_VOLATILITY_PERCENT * 100).toFixed(4),
        ),
      },
    });
  }

  if (
    usesLegacyVoteValidation &&
    consensus.confidence < SWARM_THRESHOLDS.MIN_CONFIDENCE
  ) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "confidence_below_min",
      summary: "Consensus confidence is below the structural minimum.",
      detail: `Confidence ${(consensus.confidence * 100).toFixed(2)}% is below ${(SWARM_THRESHOLDS.MIN_CONFIDENCE * 100).toFixed(2)}%.`,
      metrics: {
        confidence: Number((consensus.confidence * 100).toFixed(4)),
        minConfidence: Number(
          (SWARM_THRESHOLDS.MIN_CONFIDENCE * 100).toFixed(4),
        ),
      },
    });
  }

  if (
    usesLegacyVoteValidation &&
    consensus.agreement < SWARM_THRESHOLDS.MIN_AGREEMENT
  ) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "agreement_below_min",
      summary: "Agent agreement is below the structural minimum.",
      detail: `Agreement ${(consensus.agreement * 100).toFixed(2)}% is below ${(SWARM_THRESHOLDS.MIN_AGREEMENT * 100).toFixed(2)}%.`,
      metrics: {
        agreement: Number((consensus.agreement * 100).toFixed(4)),
        minAgreement: Number((SWARM_THRESHOLDS.MIN_AGREEMENT * 100).toFixed(4)),
      },
    });
  }

  if (
    nextConsensus.rejectionReasons.length > consensus.rejectionReasons.length
  ) {
    return {
      ...markConsensusBlocked(nextConsensus, {
        layer: "validator",
        code: "structural_validation_failed",
        summary: "Structural validation blocked the setup.",
        detail:
          "One or more execution-quality or consensus-quality thresholds were violated.",
      }),
      validatedAt: new Date().toISOString(),
    };
  }

  return { ...nextConsensus, validatedAt: new Date().toISOString() };
}
