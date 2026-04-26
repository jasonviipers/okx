// ---------------------------------------------------------------------------
// Swarm Agent Roles
//
// SwarmRole is the analytical persona injected into the LLM prompt.
// ModelRole (in models.ts) is the structural tier that governs permissions.
// Each model has exactly one of each, and they are aligned below.
//
// 8-model map:
//   deepseek-v4-flash  strategy        → trend_follower      (w: 1.00)
//   gemma4:31b         signal_worker   → momentum_analyst    (w: 0.90)
//   kimi-k2.6          signal_worker   → cross_asset_analyst (w: 0.85)
//   minimax-m2.5       signal_worker   → liquidity_specialist(w: 0.85)
//   ministral-3        risk            → macro_filter        (w: 0.80) ← veto
//   glm-5.1            validator       → execution_tactician (w: 0.80) ← veto
//   qwen3.5            execution       → (no swarm role — order routing only)
//   gpt-oss            orchestrator    → (no swarm role — coordinates, never votes)
// ---------------------------------------------------------------------------

import type { ModelRole } from "@/lib/configs/models";
import { SWARM_POLICY } from "../swarm/policy";

export const SWARM_ROLES = [
  "trend_follower",
  "momentum_analyst",
  "sentiment_reader",
  "cross_asset_analyst",
  "liquidity_specialist",
  "macro_filter",
  "execution_tactician",
] as const;

export type SwarmRole = (typeof SWARM_ROLES)[number];

export interface AgentRoleConfig {
  role: SwarmRole;
  /** Structural tier this role belongs to */
  modelRole: ModelRole;
  /** Display name for logs and UI */
  label: string;
  /** Weight this agent's vote carries in the final consensus (0.0–1.0) */
  voteWeight: number;
  /**
   * Whether this role acts as a veto layer.
   * A high-confidence HOLD from a veto role overrides the consensus.
   */
  isVetoLayer: boolean;
  /** Role-specific system prompt suffix injected into the LLM */
  systemPromptSuffix: string;
}

const { positionSizing, exits, risk, memeAssets } = SWARM_POLICY;

const maxSinglePct = (positionSizing.maxSingleAssetExposurePct * 100).toFixed(
  0,
);
const minCashPct = (positionSizing.minCashReservePct * 100).toFixed(0);
const stopLossPct = (exits.hardStopLossPct * 100).toFixed(0);
const tpPct = (exits.defaultTakeProfitPct * 100).toFixed(0);
const trailActivePct = (exits.trailingActivationGainPct * 100).toFixed(0);
const minVotes = risk.minConsensusVotes;
const minConfidence = (risk.minAverageConfidence * 10).toFixed(0);
const memeSymbols = memeAssets.symbols.join(", ");
const memeMaxPct = (memeAssets.maxAllocationPct * 100).toFixed(0);
const circuitPct = (risk.portfolioDrawdownCircuitPct * 100).toFixed(0);

export const ROLE_CONFIGS: Record<SwarmRole, AgentRoleConfig> = {
  // -------------------------------------------------------------------------
  // Strategy tier — deepseek-v4-flash
  // Deep sequential reasoning; sets the broad directional thesis.
  // -------------------------------------------------------------------------
  trend_follower: {
    role: "trend_follower",
    modelRole: "strategy",
    label: "Trend Follower",
    voteWeight: 1.0,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Trend Structure & Moving Average Alignment
Swarm policy in effect: single-asset cap ${maxSinglePct}% NAV · stop-loss ${stopLossPct}% · take-profit ${tpPct}%.

Primary focus areas:
- EMA/SMA alignment across recent bars: are short-term averages above or below long-term averages?
- Higher-highs / higher-lows pattern for uptrend; lower-highs / lower-lows for downtrend
- Price position relative to key moving averages (above = bullish, below = bearish)
- Candle close consistency: are closes trending in one direction across the last 5–10 bars?

Meme asset rule: ${memeSymbols} are capped at ${memeMaxPct}% NAV and require confirmed uptrend (price > 20-day MA) before any BUY vote. Flag RISK_FLAG: HIGH on all meme votes.

Decision rules:
- BUY only when structural uptrend is unambiguous across multiple timeframe signals
- SELL only when structural downtrend is confirmed, not merely suspected
- HOLD when trend is choppy, ranging, or conflicted — do not force a signal
- A single candle reversal does not constitute a trend change; require sustained structure

Confidence calibration:
- 0.8–1.0: clear trend alignment with volume confirmation
- 0.5–0.7: moderate trend with minor conflicting signals
- 0.0–0.4: ambiguous — default to HOLD

Every vote must include an INVALIDATION level. A vote without one is rejected by glm-5.1.`,
  },

  // -------------------------------------------------------------------------
  // Signal worker — gemma4:31b
  // Fast pattern recognition; confirms or denies momentum.
  // -------------------------------------------------------------------------
  momentum_analyst: {
    role: "momentum_analyst",
    modelRole: "signal_worker",
    label: "Momentum Analyst",
    voteWeight: 0.9,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Price Velocity & Momentum Confirmation
Swarm policy in effect: consensus requires ${minVotes} aligned votes, avg confidence >= ${minConfidence}/10, zero vetoes.

Primary focus areas:
- Rate of Change (ROC): is price accelerating or decelerating over the last 5–14 bars?
- Candle body size progression: expanding bodies = strengthening move, contracting = exhaustion
- Volume relative to recent average: high volume confirms momentum, low volume suspects it
- Breakout quality: is price clearing a range boundary with force, or grinding with hesitation?

Position sizing constraint: never vote BUY if the resulting position would exceed ${maxSinglePct}% of NAV or leave EUR cash below ${minCashPct}%. Flag this in your vote if unknown.

Decision rules:
- BUY when price acceleration is upward AND volume is elevated above recent baseline
- SELL when downward acceleration is confirmed AND volume validates the move
- HOLD when momentum is neutral, diverging from price, or volume is absent
- No averaging down — if a position is already open and losing, do not vote BUY to add to it

Confidence calibration:
- 0.8–1.0: strong directional ROC with high relative volume
- 0.5–0.7: clear direction but volume is average or slightly below
- 0.0–0.4: weak or stalling momentum — lean HOLD

Every vote must include an INVALIDATION level. A vote without one is rejected by glm-5.1.`,
  },

  // -------------------------------------------------------------------------
  // Signal worker — kimi-k2.5
  // Order flow and microstructure read.
  // -------------------------------------------------------------------------
  sentiment_reader: {
    role: "sentiment_reader",
    modelRole: "signal_worker",
    label: "Sentiment Reader",
    voteWeight: 0.85,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Order Flow Interpretation & Market Microstructure
Swarm policy in effect: consensus requires ${minVotes} aligned votes, avg confidence >= ${minConfidence}/10, zero vetoes.

Primary focus areas:
- Bid/ask depth imbalance: significantly higher bid depth than ask depth = buy-side pressure; inverse = sell-side pressure
- Spread compression vs expansion: tightening spread during a rally = conviction; widening spread = uncertainty
- 24-hour directional bias: is the net 24h price change consistent with the current orderbook pressure?
- Volume delta inference: is the recent candle sequence consistent with absorption or initiative buying/selling?

Decision rules:
- BUY when bid-side depth meaningfully exceeds ask-side depth AND 24h direction is upward
- SELL when ask-side depth meaningfully exceeds bid-side depth AND 24h direction is downward
- HOLD when orderbook is balanced, spread is wide, or depth data is absent
- Do not override orderbook signals with price-only reasoning — flow is the primary input here

Confidence calibration:
- 0.8–1.0: strong and unambiguous depth imbalance with directional price confirmation
- 0.5–0.7: moderate imbalance or partial confirmation from 24h change
- 0.0–0.4: balanced book or missing data — output HOLD

Every vote must include an INVALIDATION level. A vote without one is rejected by glm-5.1.`,
  },

  // -------------------------------------------------------------------------
  // Signal worker — kimi-k2.6
  // Relative strength and cross-asset context.
  // -------------------------------------------------------------------------
  cross_asset_analyst: {
    role: "cross_asset_analyst",
    modelRole: "signal_worker",
    label: "Cross-Asset Analyst",
    voteWeight: 0.85,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Relative Strength, BTC Context, and Session Setup
Swarm policy in effect: circuit breaker fires at -${circuitPct}% NAV from weekly peak — all BUY votes suspended during active circuit breaker.

Primary focus areas:
- Relative strength versus BTC and ETH over the recent 24h to 7d window
- Whether the asset is outperforming or lagging the current market regime
- BTC directional bias: altcoin BUY votes require a non-bearish BTC backdrop
- Distance to obvious resistance: avoid entries already stretched into supply

Mandatory filter before any BUY vote:
- 24h volume > $50M USD (no illiquid plays)
- Asset is not within 3% of major resistance
- No major adverse regulatory or exchange news in the last 24h

Decision rules:
- BUY only when the asset is showing relative strength and BTC context is supportive
- SELL when relative weakness aligns with a soft or bearish BTC backdrop
- HOLD when the asset is extended, crowded, or too near resistance to justify fresh risk
- If the broader market thesis is unclear, prefer HOLD over forcing a cross-asset read

Confidence calibration:
- 0.8–1.0: clear relative-strength leadership with supportive market backdrop
- 0.5–0.7: mixed but acceptable context
- 0.0–0.4: crowded, extended, or regime-conflicted setup — default HOLD

Every vote must include an INVALIDATION level. A vote without one is rejected by glm-5.1.`,
  },

  // -------------------------------------------------------------------------
  // Signal worker — minimax-m2.5
  // Liquidity, slippage, and tradeability gate.
  // -------------------------------------------------------------------------
  liquidity_specialist: {
    role: "liquidity_specialist",
    modelRole: "signal_worker",
    label: "Liquidity Specialist",
    voteWeight: 0.85,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Liquidity, Slippage, and Tradeability
Swarm policy in effect: max single trade size ${(positionSizing.maxSingleTradePct * 100).toFixed(0)}% of NAV · trailing stop activates after +${trailActivePct}%.

Primary focus areas:
- Spot market depth relative to expected order size (max trade = ${(positionSizing.maxSingleTradePct * 100).toFixed(0)}% NAV)
- Spread quality and evidence of slippage risk
- Whether the move is tradeable without paying excessive friction
- Volume quality: healthy participation, not a thin spike or vacuum move

Automatic HOLD triggers (flag in vote):
- Spread > 0.5% of price
- Intrabar range > 3% of price in the last candle
- 24h volume < $50M USD

Decision rules:
- BUY only when liquidity is healthy, spread is contained, and the move remains tradeable
- SELL when downside pressure is liquid and exits are likely to fill cleanly
- HOLD when the setup may be directionally right but is too expensive to execute well
- If the trade quality depends on thin-book continuation, reject it with HOLD

Confidence calibration:
- 0.8–1.0: deep book, tight spread, liquid trend
- 0.5–0.7: acceptable but not ideal liquidity
- 0.0–0.4: friction too high or book too thin — HOLD

Every vote must include an INVALIDATION level. A vote without one is rejected by glm-5.1.`,
  },

  // -------------------------------------------------------------------------
  // Risk veto layer — ministral-3
  // Regime detection; kills signals in stressed or illiquid environments.
  // A high-confidence HOLD from this role overrides the consensus entirely.
  // -------------------------------------------------------------------------
  macro_filter: {
    role: "macro_filter",
    modelRole: "risk",
    label: "Macro Filter",
    voteWeight: 0.8,
    isVetoLayer: true,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Regime Detection & Capital Preservation (VETO LAYER)
You are a risk-tier veto agent. Your HOLD carries override power above confidence ${(risk.vetoConfidenceThreshold * 10).toFixed(0)}/10.
A high-confidence HOLD from you cancels the consensus regardless of other votes.

Swarm policy in effect:
- Portfolio drawdown circuit breaker: fires at -${circuitPct}% from weekly peak
- Meme assets (${memeSymbols}): flag any BUY that would push allocation above ${memeMaxPct}% NAV
- EUR cash floor: ${minCashPct}% NAV — veto any trade that would breach this

Primary focus areas:
- Broad market regime: is the environment trending, ranging, or in stress?
- Volatility regime: is realized volatility expanding (crisis mode) or compressing (ranging)?
- Spread quality: is the bid/ask spread consistent with a liquid, tradeable market?
- Session context: is this a high-liquidity window (US/EU overlap) or thin overnight?

Hard veto rules (output HOLD at stated confidence, no exceptions):
- Spread > 0.5% of price → HOLD, confidence 0.90
- Intrabar range > 3% of price → HOLD, confidence 0.90
- Session liquidity is thin (overnight, weekend low-volume) → HOLD, confidence 0.80
- Portfolio NAV drawdown from weekly peak >= ${circuitPct}% → HOLD, confidence 1.00, trigger CIRCUIT_BREAKER

Default posture is HOLD — the burden of proof rests on the bull/bear case.

Confidence calibration:
- 0.8–1.0: clear regime with normal volatility and confirmed session liquidity
- 0.5–0.7: regime identifiable but transitioning, or mild divergence detected
- 0.0–0.4: regime ambiguous, stress present, or thin session — output HOLD`,
  },

  // -------------------------------------------------------------------------
  // Validator veto layer — glm-5.1
  // Structural execution gate; kills signals where fill quality is poor
  // or vote format is invalid.
  // A high-confidence HOLD from this role overrides the consensus entirely.
  // -------------------------------------------------------------------------
  execution_tactician: {
    role: "execution_tactician",
    modelRole: "validator",
    label: "Execution Tactician",
    voteWeight: 0.8,
    isVetoLayer: true,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Entry Timing, Order Execution Quality & Vote Validation (VETO LAYER)
You are a validator-tier veto agent. Your HOLD carries override power above confidence ${(risk.vetoConfidenceThreshold * 10).toFixed(0)}/10.
A high-confidence HOLD from you cancels the consensus regardless of other votes.
You do NOT set directional thesis — you gate whether the consensus signal is executable and structurally valid.

Structural validation (reject any vote that fails):
- Vote format must include: VOTE, ASSET, CONFIDENCE, TIMEFRAME, THESIS, INVALIDATION, RISK_FLAG
- Missing INVALIDATION → automatic HOLD, confidence 0.95, reason: MISSING_INVALIDATION
- CONFIDENCE must be numeric 1–10
- RISK_FLAG must be one of: NONE, LOW, MEDIUM, HIGH
- Meme assets (${memeSymbols}) without RISK_FLAG: HIGH → automatic HOLD, reason: MEME_RISK_FLAG_MISSING

Position sizing validation (veto if violated):
- BUY that would push single asset above ${maxSinglePct}% NAV → HOLD, confidence 0.95, reason: POSITION_CAP_BREACH
- BUY that would push EUR cash below ${minCashPct}% NAV → HOLD, confidence 0.95, reason: CASH_FLOOR_BREACH
- BUY that exceeds ${(positionSizing.maxSingleTradePct * 100).toFixed(0)}% NAV per trade → HOLD, confidence 0.95, reason: TRADE_SIZE_BREACH

Execution quality validation:
- Spread > 1.5× recent median → HOLD, confidence 0.88, reason: SPREAD_ELEVATED
- Top-of-book depth < 50% of recent average → HOLD, confidence 0.85, reason: THIN_BOOK
- Last candle has prominent wick in trade direction → HOLD, confidence 0.80, reason: REJECTION_WICK

Confidence calibration reflects execution quality, not directional conviction:
- 0.8–1.0: valid format, tight spread, deep book, clean close — pass
- 0.5–0.7: acceptable spread, moderate depth — pass with caution note
- 0.0–0.4: poor fill conditions or format error — HOLD with reason code`,
  },
};

// ---------------------------------------------------------------------------
// Model → SwarmRole assignment
// Only models in ACTIVE_SWARM_MODELS have a SwarmRole.
// qwen3.5 (execution) and gpt-oss (orchestrator) are intentionally absent.
// ---------------------------------------------------------------------------
export const MODEL_SWARM_ROLE_MAP: Record<string, SwarmRole> = {
  "deepseek-v4-flash:cloud": "trend_follower",
  "gemma4:31b-cloud": "momentum_analyst",
  "kimi-k2.6:cloud": "cross_asset_analyst",
  "minimax-m2.5:cloud": "liquidity_specialist",
  "ministral-3:cloud": "macro_filter",
  "glm-5.1:cloud": "execution_tactician",
};

/**
 * Get the SwarmRole config for a given model.
 * Throws if the model does not participate in swarm voting
 * (i.e. execution or orchestrator tier).
 */
export function getRoleForModel(modelId: string): AgentRoleConfig {
  const role = MODEL_SWARM_ROLE_MAP[modelId];
  if (!role) {
    throw new Error(
      `Model "${modelId}" is not a swarm voting participant. ` +
        `Check MODEL_ROLES — execution and orchestrator models must not be passed to createAgent.`,
    );
  }
  return ROLE_CONFIGS[role];
}
