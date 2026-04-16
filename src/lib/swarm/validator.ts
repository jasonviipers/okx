import type { MarketContext } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const MAX_SPREAD_PERCENT = 0.005; // 0.5%
const MAX_VOLATILITY_PERCENT = 0.03; // 3.0%
const MIN_CONFIDENCE = 0.6;
const MIN_AGREEMENT = 0.6;
const VETO_CONFIDENCE_THRESHOLD = 0.75; // Any veto-layer HOLD above this overrides

// ---------------------------------------------------------------------------
// validateConsensus
//
// Two-stage veto pipeline:
//
//   Stage 1 — Role-based veto layers
//     Checks votes from roles flagged as isVetoLayer (macro_filter, execution_tactician).
//     A HOLD with confidence > VETO_CONFIDENCE_THRESHOLD from ANY veto layer kills the signal.
//     Evaluated before structural checks so a veto agent can short-circuit everything.
//
//   Stage 2 — Structural safety checks
//     Spread, intrabar volatility, minimum confidence, minimum agreement.
//     These are deterministic market-quality guards that cannot be overridden.
// ---------------------------------------------------------------------------

export function validateConsensus(
  consensus: ConsensusResult,
  ctx: MarketContext,
): ConsensusResult {
  // Skip all validation if signal is already HOLD — nothing to block.
  if (consensus.signal === "HOLD") {
    return { ...consensus, validatedAt: new Date().toISOString() };
  }

  // -------------------------------------------------------------------------
  // Stage 1: Veto layer checks
  // Roles: macro_filter (risk tier), execution_tactician (validator tier)
  // -------------------------------------------------------------------------

  const vetoRoles = ["macro_filter", "execution_tactician"] as const;

  for (const vetoRole of vetoRoles) {
    const vetoVote = consensus.votes.find((v) => v.role === vetoRole);
    if (
      vetoVote &&
      vetoVote.signal === "HOLD" &&
      vetoVote.confidence > VETO_CONFIDENCE_THRESHOLD
    ) {
      return {
        ...consensus,
        signal: "HOLD",
        blocked: true,
        blockReason: `Veto layer "${vetoVote.role}" (${vetoVote.model}) issued a high-conviction HOLD (confidence: ${(vetoVote.confidence * 100).toFixed(0)}%). Signal blocked.`,
        validatedAt: new Date().toISOString(),
      };
    }
  }

  // -------------------------------------------------------------------------
  // Stage 2: Structural safety checks
  // -------------------------------------------------------------------------

  const spreadPercent =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;

  const lastCandle = ctx.candles.at(-1);
  const volatilityPercent =
    lastCandle && ctx.ticker.last > 0
      ? (lastCandle.high - lastCandle.low) / ctx.ticker.last
      : 0;

  const blockedReasons: string[] = [];

  if (spreadPercent > MAX_SPREAD_PERCENT) {
    blockedReasons.push(
      `spread ${(spreadPercent * 100).toFixed(3)}% exceeds ${(MAX_SPREAD_PERCENT * 100).toFixed(1)}%`,
    );
  }

  if (volatilityPercent > MAX_VOLATILITY_PERCENT) {
    blockedReasons.push(
      `last-candle volatility ${(volatilityPercent * 100).toFixed(2)}% exceeds ${(MAX_VOLATILITY_PERCENT * 100).toFixed(1)}%`,
    );
  }

  if (consensus.confidence < MIN_CONFIDENCE) {
    blockedReasons.push(
      `consensus confidence ${(consensus.confidence * 100).toFixed(0)}% is below ${(MIN_CONFIDENCE * 100).toFixed(0)}%`,
    );
  }

  if (consensus.agreement < MIN_AGREEMENT) {
    blockedReasons.push(
      `agent agreement ${(consensus.agreement * 100).toFixed(0)}% is below ${(MIN_AGREEMENT * 100).toFixed(0)}%`,
    );
  }

  if (blockedReasons.length > 0) {
    return {
      ...consensus,
      blocked: true,
      blockReason: `Structural check failed: ${blockedReasons.join("; ")}.`,
      validatedAt: new Date().toISOString(),
    };
  }

  return { ...consensus, validatedAt: new Date().toISOString() };
}
