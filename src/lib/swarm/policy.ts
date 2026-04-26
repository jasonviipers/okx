// ---------------------------------------------------------------------------
// swarm-policy.ts
//
// Single source of truth for ALL numeric risk constants used across:
//   - swarm-roles.ts      (injected into every agent system prompt)
//   - orchestrator.ts     (consensus evaluation)
//   - risk-engine.ts      (veto threshold checks)
//   - swarm-trading-prompt.md (human-readable policy doc, version-locked)
//
// Do NOT hardcode any of these values elsewhere.
// ---------------------------------------------------------------------------

export const SWARM_PROMPT_VERSION = "1.1" as const;

export const SWARM_POLICY = {
  // -------------------------------------------------------------------------
  // Position sizing — enforced by glm-5.1 (validator) at vote-validation time
  // -------------------------------------------------------------------------
  positionSizing: {
    /** Hard cap: no single asset may exceed this % of NAV */
    maxSingleAssetExposurePct: 0.2,
    /** Hard cap: top two assets combined may not exceed this % of NAV */
    maxTopTwoAssetsExposurePct: 0.55,
    /** Hard floor: EUR (or stablecoin) cash must stay at or above this % of NAV */
    minCashReservePct: 0.15,
    /** Phase-1 cash floor (recovery mode, first 7 days): stricter than steady-state */
    phaseOneCashReservePct: 0.2,
    /** Max capital deployed in a single order execution */
    maxSingleTradePct: 0.1,
  },

  // -------------------------------------------------------------------------
  // Protective exits — injected into trend_follower and momentum_analyst prompts
  // -------------------------------------------------------------------------
  exits: {
    /** Close position unconditionally if price moves this % against entry */
    hardStopLossPct: 0.07,
    /** Trailing stop activates once position gains this % */
    trailingActivationGainPct: 0.05,
    /** Once trailing stop is active, lock in this fraction of peak unrealised gain */
    trailingGainLockRatio: 0.5,
    /** Default take-profit target per position (can be overridden by signal workers) */
    defaultTakeProfitPct: 0.12,
  },

  // -------------------------------------------------------------------------
  // Consensus & veto thresholds — enforced by gpt-oss (orchestrator)
  // -------------------------------------------------------------------------
  risk: {
    /**
     * Confidence level above which a veto-layer HOLD overrides consensus.
     * Must be expressed as a decimal (e.g. 0.75 = 7.5/10).
     */
    vetoConfidenceThreshold: 0.75,
    /** Minimum number of aligned BUY or SELL votes required to proceed */
    minConsensusVotes: 3,
    /** Minimum average confidence across voting agents (decimal, e.g. 0.7 = 7/10) */
    minAverageConfidence: 0.7,
    /**
     * Portfolio-level circuit breaker: if NAV drops this % from its most recent
     * weekly high, all BUY signals are suspended for 24 hours.
     */
    portfolioDrawdownCircuitPct: 0.05,
  },

  // -------------------------------------------------------------------------
  // Meme / high-volatility asset policy
  // -------------------------------------------------------------------------
  memeAssets: {
    /** Assets subject to the reduced allocation cap and mandatory uptrend filter */
    symbols: ["DOGE-USDT", "SHIB-USDT", "PEPE-USDT", "WIF-USDT", "BONK-USDT"] as const,
    /** Hard ceiling: meme assets collectively must not exceed this % of NAV */
    maxAllocationPct: 0.15,
    /** Any BUY vote on a meme asset must include RISK_FLAG: HIGH or it is vetoed */
    requiredRiskFlag: "HIGH" as const,
    /**
     * Meme assets may only be bought when price is above this moving average.
     * Value is in days (e.g. 20 = 20-day MA).
     */
    requiredUptrendMA: 20,
    /** Meme positions must be reviewed this often regardless of P&L (hours) */
    mandatoryReviewIntervalHours: 48,
  },

  // -------------------------------------------------------------------------
  // Recovery plan phases (post-drawdown mode)
  // These constants are read by the orchestrator to switch policy tiers.
  // -------------------------------------------------------------------------
  recoveryPlan: {
    phase1: {
      /** Duration of the stabilisation phase in calendar days */
      durationDays: 7,
      /** Maximum simultaneous open positions during phase 1 */
      maxOpenPositions: 0, // No new positions; only reduce existing
      /** Target NAV to exit phase 1 (absolute EUR) */
      targetNavEur: 34.5,
      /** DOGE must be reduced to this % of NAV before phase 2 begins */
      dogeTargetPct: 0.15,
    },
    phase2: {
      durationDays: 14,
      maxOpenPositions: 2,
      /** Only BTC and ETH are eligible until phase 3 */
      eligibleAssets: ["BTC-USDT", "ETH-USDT"] as const,
      /** Target NAV to exit phase 2 — approximately the starting NAV */
      targetNavEur: 36.0,
    },
    phase3: {
      durationDays: 9,
      maxOpenPositions: 3,
      /** Altcoins re-eligible once phase 3 is entered */
      altcoinsEligible: true,
      /**
       * Position cap relaxes once NAV exceeds this level.
       * Raises maxSingleAssetExposurePct from 0.20 → 0.25.
       */
      relaxCapAboveNavEur: 38.0,
    },
  },

  // -------------------------------------------------------------------------
  // Session cadence (UTC hours) — used by the orchestrator scheduler
  // -------------------------------------------------------------------------
  sessionCadence: {
    morningStrategyHour: 6,
    morningVoteHour: 6.25,       // 06:15
    morningExecutionHour: 6.5,   // 06:30
    midSessionReviewHour: 12,
    eveningVoteHour: 18,
    eveningExecutionHour: 18.5,  // 18:30
    dailyLogHour: 23,
  },

  // -------------------------------------------------------------------------
  // Performance targets — used in session summary logs
  // -------------------------------------------------------------------------
  targets: {
    weeklyReturnMinPct: 0.015,
    weeklyReturnMaxPct: 0.03,
    monthlyReturnMinPct: 0.06,
    monthlyReturnMaxPct: 0.1,
    maxMonthlyLossPct: 0.05,
    minWinRatePct: 0.55,
    /** Average winner must be at least this multiple of the average loser */
    minWinLossRatio: 1.5,
  },
} as const;

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type SwarmRiskFlag = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type MemeAssetSymbol =
  (typeof SWARM_POLICY.memeAssets.symbols)[number];

export type Phase2EligibleAsset =
  (typeof SWARM_POLICY.recoveryPlan.phase2.eligibleAssets)[number];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Returns true if the normalised symbol is subject to meme-asset rules. */
export function isMemeAsset(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase() as MemeAssetSymbol;
  return (SWARM_POLICY.memeAssets.symbols as readonly string[]).includes(normalized);
}

/**
 * Builds the policy excerpt injected into the master prompt header.
 * Every agent receives this before their role-specific suffix.
 */
export function buildSwarmMasterPromptExcerpt(): string {
  const p = SWARM_POLICY;
  const pct = (n: number, decimals = 0) => `${(n * 100).toFixed(decimals)}%`;

  return [
    `Swarm Trading System — prompt version ${SWARM_PROMPT_VERSION}.`,
    "",
    "MISSION: Capital preservation first. Growth second.",
    "",
    "HARD POSITION CAPS (enforced by glm-5.1 — non-negotiable):",
    `  Single asset:    <= ${pct(p.positionSizing.maxSingleAssetExposurePct)} of NAV`,
    `  Top-2 assets:    <= ${pct(p.positionSizing.maxTopTwoAssetsExposurePct)} of NAV`,
    `  EUR cash floor:  >= ${pct(p.positionSizing.minCashReservePct)} of NAV at all times`,
    `  Single trade:    <= ${pct(p.positionSizing.maxSingleTradePct)} of NAV per execution`,
    "",
    "PROTECTIVE EXITS (hard rules — no discretion):",
    `  Stop-loss:       ${pct(p.exits.hardStopLossPct)} from entry (unconditional close)`,
    `  Trailing stop:   activates after +${pct(p.exits.trailingActivationGainPct)}, locks ${pct(p.exits.trailingGainLockRatio)} of peak gain`,
    `  Take-profit:     +${pct(p.exits.defaultTakeProfitPct)} default (may be tightened by signal workers)`,
    "",
    "CONSENSUS RULES:",
    `  Minimum aligned votes:   ${p.risk.minConsensusVotes} of 4 signal-layer agents`,
    `  Minimum avg confidence:  ${(p.risk.minAverageConfidence * 10).toFixed(0)}/10`,
    `  Veto threshold:          confidence >= ${(p.risk.vetoConfidenceThreshold * 10).toFixed(0)}/10 from any veto-layer agent`,
    `  Tie / split vote:        → HOLD (no execution)`,
    `  Missing INVALIDATION:    → vote rejected by glm-5.1`,
    "",
    "MEME ASSET RULES:",
    `  Meme assets: ${p.memeAssets.symbols.join(", ")}`,
    `  Max combined allocation: ${pct(p.memeAssets.maxAllocationPct)} of NAV`,
    `  Entry condition:         price must be above ${p.memeAssets.requiredUptrendMA}-day MA`,
    `  Required risk flag:      RISK_FLAG: HIGH on every meme vote (non-optional)`,
    `  Mandatory review:        every ${p.memeAssets.mandatoryReviewIntervalHours}h regardless of P&L`,
    "",
    "CIRCUIT BREAKER:",
    `  Fires when NAV drops ${pct(p.risk.portfolioDrawdownCircuitPct)} from weekly peak.`,
    "  Effect: all BUY signals suspended for 24h. gpt-oss must log recovery rationale before resuming.",
    "",
    "AVERAGING DOWN: strictly prohibited. No BUY vote on an asset already in a losing open position.",
  ].join("\n");
}

/**
 * Returns the current recovery phase (1, 2, or 3) based on current NAV
 * and whether the DOGE reduction target has been met.
 * Returns null if the portfolio is not in recovery mode.
 */
export function getRecoveryPhase(
  currentNavEur: number,
  dogeAllocationPct: number,
): 1 | 2 | 3 | null {
  const { phase1, phase2, phase3 } = SWARM_POLICY.recoveryPlan;

  if (dogeAllocationPct > phase1.dogeTargetPct) return 1;
  if (currentNavEur < phase2.targetNavEur) return 2;
  if (currentNavEur < phase3.relaxCapAboveNavEur) return 3;
  return null; // Portfolio is healthy — standard policy applies
}