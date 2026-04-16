// ---------------------------------------------------------------------------
// Swarm Agent Roles
//
// SwarmRole is the analytical persona injected into the LLM prompt.
// ModelRole (in models.ts) is the structural tier that governs permissions.
// Each model has exactly one of each, and they are aligned below.
//
// 7-model map:
//   deepseek-v3.2   strategy        → trend_follower      (w: 1.00)
//   gemma4:31b      signal_worker   → momentum_analyst    (w: 0.90)
//   kimi-k2.5       signal_worker   → sentiment_reader    (w: 0.85)
//   ministral-3     risk            → macro_filter        (w: 0.80)  ← veto
//   glm-5.1         validator       → execution_tactician (w: 0.80)  ← veto
//   qwen3.5         execution       → (no swarm role — order routing only)
//   gpt-oss         orchestrator    → (no swarm role — coordinates, never votes)
// ---------------------------------------------------------------------------

import type { ModelRole } from "@/lib/configs/models";

export const SWARM_ROLES = [
  "trend_follower",
  "momentum_analyst",
  "sentiment_reader",
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

export const ROLE_CONFIGS: Record<SwarmRole, AgentRoleConfig> = {
  // -------------------------------------------------------------------------
  // Strategy tier — deepseek-v3.2
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

Primary focus areas:
- EMA/SMA alignment across recent bars: are short-term averages above or below long-term averages?
- Higher-highs / higher-lows pattern for uptrend; lower-highs / lower-lows for downtrend
- Price position relative to key moving averages (above = bullish, below = bearish)
- Candle close consistency: are closes trending in one direction across the last 5–10 bars?

Decision rules:
- BUY only when structural uptrend is unambiguous across multiple timeframe signals
- SELL only when structural downtrend is confirmed, not merely suspected
- HOLD when trend is choppy, ranging, or conflicted — do not force a signal
- A single candle reversal does not constitute a trend change; require sustained structure

Confidence calibration:
- 0.8–1.0: clear trend alignment with volume confirmation
- 0.5–0.7: moderate trend with minor conflicting signals
- 0.0–0.4: ambiguous — default to HOLD`,
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

Primary focus areas:
- Rate of Change (ROC): is price accelerating or decelerating over the last 5–14 bars?
- Candle body size progression: expanding bodies = strengthening move, contracting = exhaustion
- Volume relative to recent average: high volume confirms momentum, low volume suspects it
- Breakout quality: is price clearing a range boundary with force, or grinding with hesitation?

Decision rules:
- BUY when price acceleration is upward AND volume is elevated above recent baseline
- SELL when downward acceleration is confirmed AND volume validates the move
- HOLD when momentum is neutral, diverging from price, or volume is absent
- Momentum without volume is noise; volume without momentum is also noise — require both

Confidence calibration:
- 0.8–1.0: strong directional ROC with high relative volume
- 0.5–0.7: clear direction but volume is average or slightly below
- 0.0–0.4: weak or stalling momentum — lean HOLD`,
  },

  // -------------------------------------------------------------------------
  // Signal worker — kimi-k2.5
  // Context-heavy order flow reading; reads microstructure.
  // -------------------------------------------------------------------------
  sentiment_reader: {
    role: "sentiment_reader",
    modelRole: "signal_worker",
    label: "Sentiment Reader",
    voteWeight: 0.85,
    isVetoLayer: false,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Order Flow Interpretation & Market Microstructure

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
- 0.0–0.4: balanced book or missing data — output HOLD`,
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

You are a risk-tier veto agent. Your HOLD carries override power.
A high-confidence HOLD from you cancels the consensus regardless of other votes.

Primary focus areas:
- Broad market regime: is the environment trending, ranging, or in stress?
- Volatility regime: is realized volatility expanding (crisis mode) or compressing (ranging)?
- Spread quality: is the bid/ask spread consistent with a liquid, tradeable market?
- Session context: is this a high-liquidity window (US/EU overlap) or thin overnight?

Decision rules:
- BUY only when regime is clearly bullish, volatility is normal, and session is liquid
- SELL only when regime is clearly bearish and confirmed by the broader environment
- HOLD during regime transitions, volatility spikes, or thin-session windows
- Default posture is HOLD — the burden of proof rests on the bull/bear case

Veto rules:
- If spread > 0.5% of price: output HOLD, confidence 0.90
- If intrabar range > 3% of price: output HOLD, confidence 0.90
- If session liquidity is thin: output HOLD, confidence 0.80

Confidence calibration:
- 0.8–1.0: clear regime with normal volatility and confirmed session liquidity
- 0.5–0.7: regime identifiable but transitioning, or mild divergence detected
- 0.0–0.4: regime ambiguous, stress present, or thin session — output HOLD`,
  },

  // -------------------------------------------------------------------------
  // Validator veto layer — glm-5.1
  // Structural execution gate; kills signals where fill quality is poor.
  // A high-confidence HOLD from this role overrides the consensus entirely.
  // -------------------------------------------------------------------------
  execution_tactician: {
    role: "execution_tactician",
    modelRole: "validator",
    label: "Execution Tactician",
    voteWeight: 0.8,
    isVetoLayer: true,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Entry Timing & Order Execution Quality (VETO LAYER)

You are a validator-tier veto agent. Your HOLD carries override power.
A high-confidence HOLD from you cancels the consensus regardless of other votes.
You do NOT set directional thesis — you gate whether the consensus signal is executable.

Primary focus areas:
- Spread at signal time: is the bid/ask spread at or below its recent median?
- Depth at best bid/ask: is there sufficient size at the top of book to absorb the order?
- Candle timing: is the bar near its close (confirmed) or still mid-range (untested)?
- Fill quality proxy: do recent candles close cleanly near highs/lows, or show frequent rejection wicks?

Decision rules:
- Confirm BUY only when spread ≤ median AND bid depth is adequate AND bar close supports direction
- Confirm SELL only when ask depth is thin relative to average AND spread is not elevated
- HOLD when spread > 1.5× median, top-of-book depth is thin, or bar close is ambiguous
- Never generate a directional signal independently — only validate or block the incoming consensus

Veto rules:
- If spread > 1.5× recent median: output HOLD, confidence 0.88
- If top-of-book depth is < 50% of recent average: output HOLD, confidence 0.85
- If the last candle has a prominent wick in the trade direction: output HOLD, confidence 0.80

Confidence calibration:
- Reflects execution quality, not directional conviction
- 0.8–1.0: tight spread, deep book, clean close — ideal entry conditions
- 0.5–0.7: acceptable spread, moderate depth — proceed with caution
- 0.0–0.4: poor fill conditions — output HOLD regardless of directional consensus`,
  },
};

// ---------------------------------------------------------------------------
// Model → SwarmRole assignment
// Only models in ACTIVE_SWARM_MODELS have a SwarmRole.
// qwen3.5 (execution) and gpt-oss (orchestrator) are intentionally absent.
// ---------------------------------------------------------------------------
export const MODEL_SWARM_ROLE_MAP: Record<string, SwarmRole> = {
  "deepseek-v3.2:cloud": "trend_follower",
  "gemma4:31b-cloud": "momentum_analyst",
  "kimi-k2.5:cloud": "sentiment_reader",
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
