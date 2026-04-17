import type { MarketContext } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";
import {
  appendRejectionReason,
  markConsensusBlocked,
} from "@/lib/swarm/rejection-utils";

const MAX_SPREAD_PERCENT = 0.005;
const MAX_VOLATILITY_PERCENT = 0.03;
const MIN_CONFIDENCE = 0.6;
const MIN_AGREEMENT = 0.6;
const VETO_CONFIDENCE_THRESHOLD = 0.75;

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
      vetoVote.confidence > VETO_CONFIDENCE_THRESHOLD
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
              (VETO_CONFIDENCE_THRESHOLD * 100).toFixed(4),
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

  let nextConsensus = consensus;

  if (spreadPercent > MAX_SPREAD_PERCENT) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "spread_above_max",
      summary: "Spread exceeds the structural execution limit.",
      detail: `Spread ${(spreadPercent * 100).toFixed(3)}% is above ${(MAX_SPREAD_PERCENT * 100).toFixed(3)}%.`,
      metrics: {
        spreadPercent: Number((spreadPercent * 100).toFixed(4)),
        maxSpreadPercent: Number((MAX_SPREAD_PERCENT * 100).toFixed(4)),
      },
    });
  }

  if (volatilityPercent > MAX_VOLATILITY_PERCENT) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "volatility_above_max",
      summary: "Last-candle volatility exceeds the structural limit.",
      detail: `Last-candle volatility ${(volatilityPercent * 100).toFixed(3)}% is above ${(MAX_VOLATILITY_PERCENT * 100).toFixed(3)}%.`,
      metrics: {
        volatilityPercent: Number((volatilityPercent * 100).toFixed(4)),
        maxVolatilityPercent: Number(
          (MAX_VOLATILITY_PERCENT * 100).toFixed(4),
        ),
      },
    });
  }

  if (consensus.confidence < MIN_CONFIDENCE) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "confidence_below_min",
      summary: "Consensus confidence is below the structural minimum.",
      detail: `Confidence ${(consensus.confidence * 100).toFixed(2)}% is below ${(MIN_CONFIDENCE * 100).toFixed(2)}%.`,
      metrics: {
        confidence: Number((consensus.confidence * 100).toFixed(4)),
        minConfidence: Number((MIN_CONFIDENCE * 100).toFixed(4)),
      },
    });
  }

  if (consensus.agreement < MIN_AGREEMENT) {
    nextConsensus = appendRejectionReason(nextConsensus, {
      layer: "validator",
      code: "agreement_below_min",
      summary: "Agent agreement is below the structural minimum.",
      detail: `Agreement ${(consensus.agreement * 100).toFixed(2)}% is below ${(MIN_AGREEMENT * 100).toFixed(2)}%.`,
      metrics: {
        agreement: Number((consensus.agreement * 100).toFixed(4)),
        minAgreement: Number((MIN_AGREEMENT * 100).toFixed(4)),
      },
    });
  }

  if (nextConsensus.rejectionReasons.length > consensus.rejectionReasons.length) {
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
