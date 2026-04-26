import { generateText } from "ai";
import {
  buildAgentPrompt,
  clampConfidence,
  finalizeVote,
  summarizeMemoryForDisplay,
} from "@/lib/agents/base-agent";
import {
  getMarketResearchDigest,
  isGoogleSearchConfigured,
} from "@/lib/ai/google-search";
import { getOllamaModel, isOllamaConfigured } from "@/lib/ai/ollama";
import type { AIModel } from "@/lib/configs/models";
import {
  assertCanReason,
  MODEL_ROLES,
  modelCanUseWebSearch,
  modelCanVote,
} from "@/lib/configs/models";
import type { AgentRoleConfig } from "@/lib/configs/roles";
import { average } from "@/lib/math-utils";
import { buildMemoryPrompt, getMemorySummary } from "@/lib/memory/aging-memory";
import { checkRateLimit } from "@/lib/redis/rate-limiter";
import {
  buildSwarmMasterPromptExcerpt,
  isMemeAsset,
  type SwarmRiskFlag,
} from "@/lib/swarm/policy";
import type { Candle, MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentResearchTrace, AgentVote, TradeSignal } from "@/types/swarm";

type SignalScore = {
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
  invalidation: string;
  riskFlag: SwarmRiskFlag;
};

type ParsedModelVote = Partial<SignalScore> & {
  vote?: TradeSignal;
  thesis?: string;
  risk_flag?: SwarmRiskFlag;
};

type ResearchDecision = {
  useWebResearch: boolean;
  focus: string | null;
  rationale: string | null;
};

type AgentRunOptions = {
  abortSignal?: AbortSignal;
};

function toAbortError(reason: unknown, fallbackMessage: string): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new Error(fallbackMessage);
}

function throwIfAborted(
  abortSignal: AbortSignal | undefined,
  fallbackMessage: string,
) {
  if (!abortSignal?.aborted) {
    return;
  }
  throw toAbortError(abortSignal.reason, fallbackMessage);
}

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function parseResearchDecision(text: string): ResearchDecision | null {
  const jsonCandidate = extractJsonObject(text);
  if (!jsonCandidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<ResearchDecision>;
    return {
      useWebResearch: parsed.useWebResearch === true,
      focus:
        typeof parsed.focus === "string" && parsed.focus.trim().length > 0
          ? parsed.focus.trim()
          : null,
      rationale:
        typeof parsed.rationale === "string" &&
        parsed.rationale.trim().length > 0
          ? parsed.rationale.trim()
          : null,
    };
  } catch {
    return null;
  }
}

function parseModelVote(text: string, fallback: SignalScore): SignalScore {
  const jsonCandidate = extractJsonObject(text);
  if (!jsonCandidate) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as ParsedModelVote;
    const voteCandidate =
      parsed.signal === "BUY" ||
      parsed.signal === "SELL" ||
      parsed.signal === "HOLD"
        ? parsed.signal
        : parsed.vote === "BUY" ||
            parsed.vote === "SELL" ||
            parsed.vote === "HOLD"
          ? parsed.vote
          : fallback.signal;
    const confidenceCandidate =
      typeof parsed.confidence === "number"
        ? parsed.confidence > 1
          ? parsed.confidence / 10
          : parsed.confidence
        : fallback.confidence;
    const reasoning =
      typeof parsed.thesis === "string" && parsed.thesis.trim().length > 0
        ? parsed.thesis.trim()
        : typeof parsed.reasoning === "string" &&
            parsed.reasoning.trim().length > 0
          ? parsed.reasoning.trim()
          : fallback.reasoning;
    const invalidation =
      typeof parsed.invalidation === "string" &&
      parsed.invalidation.trim().length > 0
        ? parsed.invalidation.trim()
        : fallback.invalidation;
    const riskFlag =
      parsed.riskFlag === "NONE" ||
      parsed.riskFlag === "LOW" ||
      parsed.riskFlag === "MEDIUM" ||
      parsed.riskFlag === "HIGH"
        ? parsed.riskFlag
        : parsed.risk_flag === "NONE" ||
            parsed.risk_flag === "LOW" ||
            parsed.risk_flag === "MEDIUM" ||
            parsed.risk_flag === "HIGH"
          ? parsed.risk_flag
          : fallback.riskFlag;
    return {
      signal: voteCandidate,
      confidence: clampConfidence(confidenceCandidate),
      reasoning,
      invalidation,
      riskFlag,
    };
  } catch {
    return fallback;
  }
}

function buildInvalidation(
  ctx: MarketContext,
  signal: TradeSignal,
  fallbackDetail: string,
): string {
  const lastCandle = ctx.candles.at(-1);
  const support = lastCandle ? lastCandle.low : ctx.ticker.bid;
  const resistance = lastCandle ? lastCandle.high : ctx.ticker.ask;

  if (signal === "BUY") {
    return `Invalid if price loses ${support.toFixed(6)} or spread/liquidity deteriorates enough to break the long thesis.`;
  }
  if (signal === "SELL") {
    return `Invalid if price reclaims ${resistance.toFixed(6)} or sell-side pressure fails to follow through.`;
  }
  return fallbackDetail;
}

function deriveRiskFlag(
  ctx: MarketContext,
  signal: TradeSignal,
): SwarmRiskFlag {
  if (isMemeAsset(ctx.symbol)) {
    return "HIGH";
  }
  const spread =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;
  const lastCandle = ctx.candles.at(-1);
  const range =
    lastCandle && ctx.ticker.last > 0
      ? (lastCandle.high - lastCandle.low) / ctx.ticker.last
      : 0;

  if (spread > 0.005 || range > 0.03) {
    return "HIGH";
  }
  if (
    signal === "HOLD" ||
    spread > 0.0025 ||
    Math.abs(ctx.ticker.change24h) > 8
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function candleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function spreadPercent(ctx: MarketContext): number {
  return ctx.ticker.last > 0
    ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
    : 0;
}

function priceMove(ctx: MarketContext, lookback = 6): number {
  const candles = ctx.candles.slice(-lookback);
  const first = candles.at(0);
  const last = candles.at(-1);
  if (!first || !last || first.close === 0) {
    return 0;
  }
  return (last.close - first.close) / first.close;
}

function highLowRange(candle: Candle): number {
  return candle.high > 0 ? (candle.high - candle.low) / candle.high : 0;
}

function orderbookImbalance(ctx: MarketContext): number {
  const bidDepth = ctx.orderbook.bids.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const askDepth = ctx.orderbook.asks.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const total = bidDepth + askDepth;
  return total === 0 ? 0 : (bidDepth - askDepth) / total;
}

function detectSignal(score: number, threshold = 0.0025): TradeSignal {
  if (score > threshold) return "BUY";
  if (score < -threshold) return "SELL";
  return "HOLD";
}

function shouldUseWebResearchHeuristic(
  ctx: MarketContext,
  heuristicVote: SignalScore,
): ResearchDecision {
  const lastCandle = ctx.candles.at(-1);
  const rangePct =
    lastCandle && ctx.ticker.last > 0
      ? (lastCandle.high - lastCandle.low) / ctx.ticker.last
      : 0;
  const dailyMovePct = Math.abs(ctx.ticker.change24h);
  const spreadPct =
    ctx.ticker.last > 0
      ? (ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last
      : 0;
  const uncertainSignal =
    heuristicVote.signal === "HOLD" || heuristicVote.confidence < 0.62;
  const fastMarket = dailyMovePct >= 3 || rangePct >= 0.02;
  const dislocatedExecution = spreadPct >= 0.0025;
  const useWebResearch = uncertainSignal || fastMarket || dislocatedExecution;

  return {
    useWebResearch,
    focus: useWebResearch
      ? "recent news, sentiment, macro catalysts, and exchange-specific developments"
      : null,
    rationale: useWebResearch
      ? "Heuristic fallback requested research due to uncertainty or elevated market conditions."
      : "Heuristic fallback found local market data sufficient.",
  };
}

// ---------------------------------------------------------------------------
// Role heuristics
// ---------------------------------------------------------------------------

function runTrendFollower(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 8);
  const recentCloses = ctx.candles.slice(-5).map((c) => c.close);
  const latestClose = recentCloses.at(-1) ?? 0;
  const avg = average(recentCloses);
  const trendStrength = avg > 0 ? (latestClose - avg) / avg : 0;
  const composite = move * 0.7 + trendStrength * 0.3;
  const signal = detectSignal(composite);
  return {
    signal,
    confidence: Math.abs(composite) * 16 + 0.35,
    reasoning:
      signal === "HOLD"
        ? "Trend structure is mixed across the recent candle sequence."
        : `${signal === "BUY" ? "Uptrend" : "Downtrend"} confirmed across latest bars with closing prices supporting direction.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if the current mixed trend structure resolves without directional confirmation.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

function runMomentumAnalyst(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 5);
  const volumes = ctx.candles.slice(-8).map((c) => c.volume);
  const recentVol = average(volumes.slice(-3));
  const baseVol = average(volumes.slice(0, Math.max(1, volumes.length - 3)));
  const volBoost = baseVol > 0 ? recentVol / baseVol - 1 : 0;
  const composite = move + volBoost * 0.01;
  const signal = detectSignal(composite, 0.003);
  return {
    signal,
    confidence: Math.abs(composite) * 18 + 0.32,
    reasoning:
      signal === "HOLD"
        ? "Momentum is fading or under-confirmed by recent volume."
        : `${signal === "BUY" ? "Upside" : "Downside"} velocity is supported by the latest volume profile.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if momentum stays unconfirmed by volume and price remains noisy.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

function runSentimentReader(ctx: MarketContext): SignalScore {
  const imbalance = orderbookImbalance(ctx);
  const dailyBias = ctx.ticker.change24h / 100;
  const composite = imbalance * 0.8 + dailyBias * 0.2;
  const signal = detectSignal(composite, 0.03);
  return {
    signal,
    confidence: Math.abs(composite) * 5 + 0.28,
    reasoning:
      signal === "HOLD"
        ? "Order book pressure is balanced; no clear directional edge."
        : `${signal === "BUY" ? "Bid" : "Ask"} depth dominates and aligns with the session bias.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if the order book rebalances and the microstructure edge disappears.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

/**
 * cross_asset_analyst (kimi-k2.6)
 *
 * Heuristic: relative strength proxy using 24h change vs recent candle
 * momentum. A positive 24h change paired with an upward recent move signals
 * outperformance; divergence between the two signals caution (HOLD).
 */
function runCrossAssetAnalyst(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 6);
  const dailyBias = ctx.ticker.change24h / 100;
  // Relative strength: both the recent candle move and the 24h bias must agree.
  const aligned = Math.sign(move) === Math.sign(dailyBias);
  const composite = aligned ? move * 0.6 + dailyBias * 0.4 : 0;
  const signal = detectSignal(composite, 0.004);
  return {
    signal,
    confidence: aligned ? Math.abs(composite) * 10 + 0.35 : 0.3, // divergence → low confidence HOLD
    reasoning:
      signal === "HOLD"
        ? aligned
          ? "Relative strength is neutral; no clear BTC-context edge."
          : "Recent candle direction and 24h bias are diverging; cross-asset read is unreliable."
        : `${signal === "BUY" ? "Outperformance" : "Underperformance"} signal: 24h bias and short-term momentum are aligned.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if the 24h directional bias and recent price action diverge further.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

/**
 * liquidity_specialist (minimax-m2.5)
 *
 * Heuristic: combines spread quality and orderbook imbalance.
 * Elevated spread → automatic HOLD regardless of direction.
 * Sufficient liquidity → passes imbalance to directional signal.
 */
function runLiquiditySpecialist(ctx: MarketContext): SignalScore {
  const spread = spreadPercent(ctx);

  if (spread > 0.005) {
    return {
      signal: "HOLD",
      confidence: 0.9,
      reasoning: `Spread of ${(spread * 100).toFixed(3)}% exceeds 0.5% liquidity threshold; trade is unexecutable at acceptable cost.`,
      invalidation:
        "Invalid only if spread compresses back below 0.5% with book depth restored.",
      riskFlag: "HIGH",
    };
  }

  const lastCandle = ctx.candles.at(-1);
  const range = lastCandle ? highLowRange(lastCandle) : 0;
  if (range > 0.03) {
    return {
      signal: "HOLD",
      confidence: 0.88,
      reasoning: `Intrabar range of ${(range * 100).toFixed(2)}% signals a thin or volatile book; slippage risk is too high.`,
      invalidation:
        "Invalid only if the next candle's range compresses and spread normalises.",
      riskFlag: "HIGH",
    };
  }

  const imbalance = orderbookImbalance(ctx);
  const signal = detectSignal(imbalance, 0.05);
  return {
    signal,
    confidence: Math.abs(imbalance) * 4 + 0.3,
    reasoning:
      signal === "HOLD"
        ? "Orderbook is balanced; no liquidity-driven directional edge."
        : `${signal === "BUY" ? "Bid" : "Ask"} depth dominates with acceptable spread; execution quality supports the signal.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if the orderbook rebalances or spread widens before fill.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

function runMacroFilter(ctx: MarketContext): SignalScore {
  const spread = spreadPercent(ctx);
  const lastCandle = ctx.candles.at(-1);
  const range = lastCandle ? highLowRange(lastCandle) : 0;

  if (spread > 0.005) {
    return {
      signal: "HOLD",
      confidence: 0.9,
      reasoning: `Spread of ${(spread * 100).toFixed(3)}% exceeds 0.5%; execution quality is too poor to trade.`,
      invalidation:
        "Invalid only if spread compresses back into normal tradeable conditions.",
      riskFlag: "HIGH",
    };
  }
  if (range > 0.03) {
    return {
      signal: "HOLD",
      confidence: 0.9,
      reasoning: `Intrabar range of ${(range * 100).toFixed(2)}% exceeds 3%; volatility regime is elevated.`,
      invalidation:
        "Invalid only if volatility cools and the market returns to a normal regime.",
      riskFlag: "HIGH",
    };
  }

  const move = priceMove(ctx, 6);
  const signal = detectSignal(move, 0.004);
  return {
    signal,
    confidence: Math.abs(move) * 12 + 0.3,
    reasoning:
      signal === "HOLD"
        ? "Market conditions are acceptable but no clear regime signal."
        : `Regime appears ${signal === "BUY" ? "bullish" : "bearish"} with acceptable market quality.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if the market regime stays ambiguous or loses liquidity support.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

function runExecutionTactician(ctx: MarketContext): SignalScore {
  const spread = spreadPercent(ctx);
  const lastCandle = ctx.candles.at(-1);

  const recentSpreads = ctx.candles
    .slice(-10)
    .map((c) => (ctx.ticker.last > 0 ? (c.high - c.low) / ctx.ticker.last : 0));
  const medianSpread =
    recentSpreads.sort((a, b) => a - b)[Math.floor(recentSpreads.length / 2)] ??
    0;

  if (medianSpread > 0 && spread > medianSpread * 1.5) {
    return {
      signal: "HOLD",
      confidence: 0.88,
      reasoning: `Spread is ${(spread / medianSpread).toFixed(1)}x median; fill quality is unacceptable.`,
      invalidation:
        "Invalid only if spread normalizes back toward recent median conditions.",
      riskFlag: "HIGH",
    };
  }

  if (lastCandle) {
    const body = candleBody(lastCandle);
    const upperWick =
      lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lowerWick =
      Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const wickThreshold = body * 2;

    if (upperWick > wickThreshold && lowerWick < upperWick) {
      return {
        signal: "HOLD",
        confidence: 0.82,
        reasoning:
          "Prominent upper wick rejection on last candle; do not buy into rejection.",
        invalidation:
          "Invalid only if buyers reclaim the rejected area with a cleaner close.",
        riskFlag: "HIGH",
      };
    }
    if (lowerWick > wickThreshold && lowerWick > upperWick) {
      return {
        signal: "HOLD",
        confidence: 0.82,
        reasoning:
          "Prominent lower wick rejection on last candle; do not sell into support absorption.",
        invalidation:
          "Invalid only if sellers break through the absorbed support cleanly.",
        riskFlag: "HIGH",
      };
    }
  }

  const move = priceMove(ctx, 4);
  const signal = detectSignal(move, 0.003);
  return {
    signal,
    confidence: Math.abs(move) * 14 + 0.35,
    reasoning:
      signal === "HOLD"
        ? "Execution conditions are adequate but no confirmed entry signal."
        : `Execution conditions are clean; ${signal.toLowerCase()} signal is executable.`,
    invalidation: buildInvalidation(
      ctx,
      signal,
      "Invalid if execution quality degrades before entry confirmation.",
    ),
    riskFlag: deriveRiskFlag(ctx, signal),
  };
}

// ---------------------------------------------------------------------------
// Role dispatcher — exhaustive over SwarmRole union
// ---------------------------------------------------------------------------

function analyzeRole(
  roleConfig: AgentRoleConfig,
  ctx: MarketContext,
): SignalScore {
  switch (roleConfig.role) {
    case "trend_follower":
      return runTrendFollower(ctx);
    case "momentum_analyst":
      return runMomentumAnalyst(ctx);
    case "sentiment_reader":
      return runSentimentReader(ctx);
    case "cross_asset_analyst":
      return runCrossAssetAnalyst(ctx);
    case "liquidity_specialist":
      return runLiquiditySpecialist(ctx);
    case "macro_filter":
      return runMacroFilter(ctx);
    case "execution_tactician":
      return runExecutionTactician(ctx);
    // TypeScript exhaustiveness guard — should never be reached
    default: {
      const _exhaustive: never = roleConfig.role;
      console.warn(
        `[analyzeRole] Unhandled role: ${String(_exhaustive)}; falling back to trend_follower.`,
      );
      return runTrendFollower(ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(roleConfig: AgentRoleConfig): string {
  const vetoNote = roleConfig.isVetoLayer
    ? "\nIMPORTANT: You are a VETO LAYER. A HOLD from you with confidence > 0.75 overrides the full consensus. Use this power deliberately."
    : "";

  return [
    "You are one specialist agent in a crypto trading swarm.",
    `Role: ${roleConfig.label} (${roleConfig.modelRole})`,
    buildSwarmMasterPromptExcerpt(),
    "Return strict JSON only.",
    '{"vote":"BUY"|"SELL"|"HOLD","asset":"ticker","confidence":1-10,"timeframe":"label","thesis":"max 2 short sentences","invalidation":"exact price or condition","riskFlag":"NONE|LOW|MEDIUM|HIGH"}',
    "Use HOLD when mandatory filters or risk rules are not satisfied.",
    "Every BUY or SELL must include a concrete invalidation.",
    "Keep thesis concise and falsifiable.",
    "Use web research as supporting context only and weigh it against live market data.",
    vetoNote,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildResearchDecisionPrompt(
  ctx: MarketContext,
  roleConfig: AgentRoleConfig,
  heuristicVote: SignalScore,
  memoryLabel: string | null,
): string {
  const lastCandle = ctx.candles.at(-1);

  return [
    "Decide whether external web research is needed before finalizing this trade vote.",
    "Return strict JSON only.",
    '{"useWebResearch":boolean,"focus":"short search focus or null","rationale":"short reason"}',
    "Set useWebResearch=true only if recent news, sentiment, macro, regulatory, ETF, exchange, or market-structure developments could materially change the decision or confidence.",
    "Prefer false when the supplied live market data is already sufficient.",
    `Role: ${roleConfig.label} (${roleConfig.role})`,
    `Symbol: ${ctx.symbol}`,
    `Timeframe: ${ctx.timeframe}`,
    `Heuristic signal: ${heuristicVote.signal}`,
    `Heuristic confidence: ${heuristicVote.confidence.toFixed(3)}`,
    `24h change: ${ctx.ticker.change24h.toFixed(2)}%`,
    `Spread: ${ctx.ticker.last > 0 ? (((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 100).toFixed(3) : "0.000"}%`,
    lastCandle
      ? `Last candle range vs price: ${(((lastCandle.high - lastCandle.low) / ctx.ticker.last) * 100).toFixed(3)}%`
      : null,
    memoryLabel ?? null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Web research decision
// ---------------------------------------------------------------------------

async function decideWebResearchNeed(
  modelId: string,
  roleConfig: AgentRoleConfig,
  ctx: MarketContext,
  heuristicVote: SignalScore,
  memoryLabel: string | null,
  options?: AgentRunOptions,
): Promise<ResearchDecision> {
  const heuristicDecision = shouldUseWebResearchHeuristic(ctx, heuristicVote);

  if (!isOllamaConfigured()) {
    return heuristicDecision;
  }

  throwIfAborted(
    options?.abortSignal,
    `Research decision aborted for ${modelId}.`,
  );

  try {
    const { text } = await generateText({
      model: getOllamaModel(modelId),
      system: [
        "You are deciding whether an analyst should perform external web research before finalizing a crypto trade vote.",
        "Return strict JSON only.",
        '{"useWebResearch":boolean,"focus":"short search focus or null","rationale":"short reason"}',
        "Be cost-aware and selective. External research should be requested when it can materially change the decision quality.",
      ].join("\n"),
      prompt: buildResearchDecisionPrompt(
        ctx,
        roleConfig,
        heuristicVote,
        memoryLabel,
      ),
      temperature: 0,
      maxOutputTokens: 120,
      abortSignal: options?.abortSignal,
    });

    const parsed = parseResearchDecision(text);
    if (!parsed) {
      return heuristicDecision;
    }

    return {
      useWebResearch: parsed.useWebResearch || heuristicDecision.useWebResearch,
      focus: parsed.focus ?? heuristicDecision.focus,
      rationale: parsed.rationale ?? heuristicDecision.rationale,
    };
  } catch (error) {
    if (options?.abortSignal?.aborted) {
      throw toAbortError(
        options.abortSignal.reason ?? error,
        `Research decision aborted for ${modelId}.`,
      );
    }
    return heuristicDecision;
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createAgent(modelId: string, roleConfig: AgentRoleConfig) {
  assertCanReason(modelId as AIModel);

  if (!modelCanVote(modelId as AIModel)) {
    throw new Error(
      `Model "${modelId}" (role: ${MODEL_ROLES[modelId as AIModel]}) cannot vote. Orchestrator models are not valid swarm participants.`,
    );
  }

  return async function runAgent(
    ctx: MarketContext,
    memorySummary?: MemorySummary,
    options?: AgentRunOptions,
  ): Promise<AgentVote> {
    const startedAt = Date.now();
    const heuristicVote = analyzeRole(roleConfig, ctx);
    throwIfAborted(options?.abortSignal, `Agent vote aborted for ${modelId}.`);

    const resolvedMemorySummary =
      memorySummary ?? (await getMemorySummary(ctx));
    throwIfAborted(options?.abortSignal, `Agent vote aborted for ${modelId}.`);

    const memoryLabel = summarizeMemoryForDisplay(resolvedMemorySummary);

    const rateLimit = await checkRateLimit(`agent:call:${modelId}`, 1, 1);
    throwIfAborted(options?.abortSignal, `Agent vote aborted for ${modelId}.`);

    if (!rateLimit.allowed) {
      return finalizeVote({
        model: modelId,
        roleConfig,
        asset: ctx.symbol,
        timeframeLabel: ctx.timeframe,
        signal: heuristicVote.signal,
        confidence: heuristicVote.confidence,
        reasoning: `${heuristicVote.reasoning} [Rate-limited: heuristic used]${memoryLabel ? ` ${memoryLabel}` : ""}`,
        invalidation: heuristicVote.invalidation,
        riskFlag: heuristicVote.riskFlag,
        startedAt,
        researchTrace: {
          status: "skipped",
          searched: false,
          rationale:
            "Agent rate-limited; heuristic vote returned without external research.",
        },
      });
    }

    const webSearchAllowed = modelCanUseWebSearch(modelId as AIModel);
    let researchTrace: AgentResearchTrace | undefined = webSearchAllowed
      ? undefined
      : {
          status: "not_allowed",
          searched: false,
          rationale:
            "This agent role is restricted to local market data and cannot perform external web research.",
        };

    const researchDecision = webSearchAllowed
      ? await decideWebResearchNeed(
          modelId,
          roleConfig,
          ctx,
          heuristicVote,
          memoryLabel,
          options,
        )
      : null;
    throwIfAborted(options?.abortSignal, `Agent vote aborted for ${modelId}.`);

    if (
      webSearchAllowed &&
      researchDecision &&
      !researchDecision.useWebResearch
    ) {
      researchTrace = {
        status: "skipped",
        searched: false,
        focus: researchDecision.focus,
        rationale:
          researchDecision.rationale ??
          "Agent determined local market context was sufficient.",
      };
    }

    let researchContext: string | null = null;
    if (webSearchAllowed && researchDecision?.useWebResearch) {
      researchTrace = {
        status: "requested",
        searched: true,
        focus: researchDecision.focus,
        rationale:
          researchDecision.rationale ??
          "Agent requested external research to improve context.",
      };
      researchContext = await getMarketResearchDigest(
        ctx,
        {
          role: roleConfig.role,
          focus: researchDecision.focus,
        },
        options,
      );
      throwIfAborted(
        options?.abortSignal,
        `Agent vote aborted for ${modelId}.`,
      );

      researchTrace = researchContext
        ? {
            status: "completed",
            searched: true,
            focus: researchDecision.focus,
            rationale:
              researchDecision.rationale ??
              "External research was added to the agent context.",
          }
        : {
            status: isGoogleSearchConfigured() ? "failed" : "unavailable",
            searched: true,
            focus: researchDecision.focus,
            rationale:
              researchDecision.rationale ??
              "External research was requested but no digest was available.",
          };
    }

    const memoryContext = buildMemoryPrompt(resolvedMemorySummary);
    const prompt = buildAgentPrompt(
      ctx,
      roleConfig,
      researchContext,
      memoryContext,
    );
    let resolvedVote = heuristicVote;

    if (isOllamaConfigured()) {
      try {
        const { text } = await generateText({
          model: getOllamaModel(modelId),
          system: buildSystemPrompt(roleConfig),
          prompt,
          temperature: roleConfig.isVetoLayer ? 0.05 : 0.2,
          maxOutputTokens: 220,
          abortSignal: options?.abortSignal,
        });

        resolvedVote = parseModelVote(text, heuristicVote);

        // Veto-layer guard: if the heuristic fired a high-confidence HOLD,
        // the LLM cannot override it — enforce the structural veto.
        if (
          roleConfig.isVetoLayer &&
          heuristicVote.signal === "HOLD" &&
          heuristicVote.confidence >= 0.75 &&
          resolvedVote.signal !== "HOLD"
        ) {
          resolvedVote = {
            signal: "HOLD",
            confidence: heuristicVote.confidence,
            reasoning: `${heuristicVote.reasoning} [Veto layer: LLM directional override rejected; heuristic HOLD enforced]`,
            invalidation: heuristicVote.invalidation,
            riskFlag: heuristicVote.riskFlag,
          };
        }
      } catch (error) {
        if (options?.abortSignal?.aborted) {
          throw toAbortError(
            options.abortSignal.reason ?? error,
            `Agent vote aborted for ${modelId}.`,
          );
        }
        resolvedVote = {
          ...heuristicVote,
          reasoning: `${heuristicVote.reasoning} [Model call failed; heuristic used]${memoryLabel ? ` ${memoryLabel}` : ""}`,
        };
      }
    } else {
      const suffix = researchContext
        ? " [Ollama reasoning offline; heuristic used with Gemini Search context]"
        : " [Ollama reasoning offline; heuristic used]";
      resolvedVote = {
        ...heuristicVote,
        reasoning: `${heuristicVote.reasoning}${suffix}${memoryLabel ? ` ${memoryLabel}` : ""}`,
      };
    }

    return finalizeVote({
      model: modelId,
      roleConfig,
      asset: ctx.symbol,
      timeframeLabel: ctx.timeframe,
      signal: resolvedVote.signal,
      confidence: clampConfidence(
        resolvedVote.confidence + Math.min(prompt.length / 4000, 0.05),
      ),
      reasoning: resolvedVote.reasoning,
      invalidation: resolvedVote.invalidation,
      riskFlag: resolvedVote.riskFlag,
      startedAt,
      researchTrace,
    });
  };
}
