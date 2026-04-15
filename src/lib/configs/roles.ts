// ---------------------------------------------------------------------------
// Swarm Agent Roles
//
// Each sub-agent is assigned a specialized analytical persona.
// This focuses its LLM reasoning on a specific aspect of the market,
// reducing redundancy and improving signal diversity across the swarm.
//
// 7-model swarm:
//   Slot 1  glm-5.1          → trend_follower      (w: 1.00)
//   Slot 2  gemma4:31b       → momentum_analyst     (w: 0.90)
//   Slot 3  qwen3.5          → risk_sentinel        (w: 0.80)
//   Slot 4  kimi-k2.5        → sentiment_reader     (w: 0.85)
//   Slot 5  deepseek-v3.2    → contrarian           (w: 0.75)
//   Slot 6  ministral-3      → macro_filter         (w: 0.70)
//   Slot 7  gpt-oss          → execution_tactician  (w: 0.80)
// ---------------------------------------------------------------------------

export const SWARM_ROLES = [
  "trend_follower",
  "momentum_analyst",
  "risk_sentinel",
  "sentiment_reader",
  "contrarian",
  "macro_filter",
  "execution_tactician",
] as const;

export type SwarmRole = (typeof SWARM_ROLES)[number];

export interface AgentRoleConfig {
  role: SwarmRole;
  /** Display name for logs */
  label: string;
  /** Weight this agent's vote carries in the final consensus (0.0–1.0) */
  voteWeight: number;
  /** Role-specific system prompt suffix injected into the LLM */
  systemPromptSuffix: string;
}

/**
 * Role configuration map — each role has a distinct analytical lens.
 */
export const ROLE_CONFIGS: Record<SwarmRole, AgentRoleConfig> = {
  trend_follower: {
    role: "trend_follower",
    label: "Trend Follower",
    voteWeight: 1.0,
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

  momentum_analyst: {
    role: "momentum_analyst",
    label: "Momentum Analyst",
    voteWeight: 0.9,
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

  risk_sentinel: {
    role: "risk_sentinel",
    label: "Risk Sentinel",
    voteWeight: 0.8,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Risk/Reward Assessment & Capital Preservation

Primary focus areas:
- Candle wick analysis: long upper wicks signal rejection of higher prices; long lower wicks signal rejection of lows
- Bid/ask spread relative to recent volatility: wide spreads increase slippage risk and reduce edge
- Intrabar volatility: large high-low ranges without directional close = indecision or manipulation
- Drawdown proximity: is price near a key support or resistance level where a stop would be required?

Decision rules:
- Default posture is HOLD — the burden of proof rests on the bull/bear case, not on caution
- BUY or SELL only when risk/reward is asymmetrically favorable (estimated gain > 2× estimated risk)
- Reject signals with prominent wick rejection in the direction of the intended trade
- Reject signals when spread is abnormally wide or candles show extreme intrabar volatility

Confidence calibration:
- Confidence reflects risk clarity, not directional conviction
- 0.8–1.0: tight spread, clean candle structure, well-defined risk level
- 0.5–0.7: acceptable structure with minor risk concerns
- 0.0–0.4: elevated risk, ambiguous structure — output HOLD`,
  },

  sentiment_reader: {
    role: "sentiment_reader",
    label: "Sentiment Reader",
    voteWeight: 0.85,
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

  contrarian: {
    role: "contrarian",
    label: "Contrarian",
    voteWeight: 0.75,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Mean Reversion & Exhaustion Detection

Primary focus areas:
- Price proximity to 20-bar extremes: within 2–3% of the 20-bar high or low is the contrarian trigger zone
- Exhaustion signals: progressively smaller candle bodies at a high or low suggest momentum failure
- Wick-to-body ratio at extremes: long wicks at highs (upper rejection) or lows (lower rejection) are primary signals
- Rate of price change deceleration: a move that is slowing at an extreme is more actionable than one still accelerating

Decision rules:
- Consider SELL when price is within 2% of 20-bar high AND candle structure shows rejection or exhaustion
- Consider BUY when price is within 2% of 20-bar low AND selling pressure is visibly diminishing
- HOLD when price is mid-range or when no exhaustion signal is present at the extreme
- Do not fade a move that still has momentum and volume behind it — wait for deceleration confirmation

Confidence calibration:
- 0.8–1.0: price at clear 20-bar extreme with strong wick rejection and decelerating momentum
- 0.5–0.7: near-extreme positioning with partial reversal signals
- 0.0–0.4: no clear exhaustion or not at an actionable extreme — output HOLD`,
  },

  macro_filter: {
    role: "macro_filter",
    label: "Macro Filter",
    voteWeight: 0.7,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Regime Detection & Cross-Asset Context

Primary focus areas:
- Broad market regime: is the overall crypto/risk-asset environment trending, ranging, or in stress?
- Correlation signal: does the asset's recent price action diverge from or confirm the broader market move?
- Volatility regime: is realized volatility expanding (breakout/crisis mode) or compressing (coiling/ranging)?
- Session context: is the current candle in a high-liquidity session (US/EU overlap) or a thin overnight window?

Decision rules:
- BUY only when regime is trending bullish AND the asset is not diverging negatively from its peers
- SELL only when regime is trending bearish AND asset confirms the macro direction
- HOLD during regime transitions, high-volatility stress events, or when session liquidity is thin
- Override other signals toward HOLD if the volatility regime is extreme (VIX spike equivalent)
- Do not generate directional signals based on price action alone — regime context is required

Confidence calibration:
- 0.8–1.0: clear trending regime with confirmed asset alignment and normal session liquidity
- 0.5–0.7: regime is identifiable but transitioning, or asset shows mild divergence
- 0.0–0.4: regime ambiguous, stress detected, or thin session — output HOLD`,
  },

  execution_tactician: {
    role: "execution_tactician",
    label: "Execution Tactician",
    voteWeight: 0.8,
    systemPromptSuffix: `
ANALYTICAL MANDATE: Entry Timing & Order Execution Quality

Primary focus areas:
- Candle timing: is the current bar near open (untested), mid-range (uncertain), or near close (confirmed)?
- Spread at signal time: is the bid/ask spread at or below its recent median? Wide spread = poor fill probability
- Depth at best bid/ask: is there sufficient size at the top of book to absorb the intended order without slippage?
- Recent fill quality proxy: have the last 3–5 candles shown clean closes near their highs/lows, or frequent wicks?

Decision rules:
- BUY only when spread is at or below median AND sufficient bid depth exists AND bar close confirms direction
- SELL only when ask depth is thin relative to recent average AND spread is not elevated
- HOLD when spread is above 1.5× its recent median, or when top-of-book depth is insufficient
- Do not generate signals near major economic releases or known low-liquidity windows
- This role is a late-stage gate: it validates that execution conditions support the consensus signal

Confidence calibration:
- Confidence reflects execution quality, not directional conviction
- 0.8–1.0: tight spread, deep book, clean candle close — ideal entry conditions
- 0.5–0.7: acceptable spread, moderate depth — proceed with reduced size
- 0.0–0.4: poor fill conditions — output HOLD regardless of directional consensus`,
  },
};

// ---------------------------------------------------------------------------
// Model → Role assignment
// ---------------------------------------------------------------------------

/**
 * Maps each model to its assigned role in the swarm.
 *
 * Assignment rationale:
 *   glm-5.1        — strong sequential reasoning → trend structure
 *   gemma4:31b     — fast inference, pattern recognition → momentum
 *   qwen3.5        — cautious/analytical → risk assessment
 *   kimi-k2.5      — context-heavy reading → order flow / sentiment
 *   deepseek-v3.2  — adversarial reasoning → contrarian exhaustion
 *   ministral-3    — broad world-knowledge → macro regime context
 *   gpt-oss        — instruction-following precision → execution gate
 */
export const MODEL_ROLE_MAP: Record<string, SwarmRole> = {
  "glm-5.1:cloud": "trend_follower",
  "gemma4:31b-cloud": "momentum_analyst",
  "qwen3.5:cloud": "risk_sentinel",
  "kimi-k2.5:cloud": "sentiment_reader",
  "deepseek-v3.2:cloud": "contrarian",
  "ministral-3:cloud": "macro_filter",
  "gpt-oss:cloud": "execution_tactician",
};

/**
 * Get the role config for a given model.
 * Falls back to trend_follower if model is unknown.
 */
export function getRoleForModel(modelId: string): AgentRoleConfig {
  const role = MODEL_ROLE_MAP[modelId] ?? "trend_follower";
  return ROLE_CONFIGS[role];
}
