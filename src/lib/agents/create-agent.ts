import { generateText } from "ai";
import {
  buildAgentPrompt,
  clampConfidence,
  finalizeVote,
  summarizeMemoryForDisplay,
} from "@/lib/agents/base-agent";
import { getOllamaModel, isOllamaConfigured } from "@/lib/ai/ollama";
import { getMarketResearchDigest } from "@/lib/ai/ollama-web";
import type { AIModel } from "@/lib/configs/models";
import {
  assertCanReason,
  MODEL_ROLES,
  modelCanUseWebSearch,
  modelCanVote,
} from "@/lib/configs/models";
import type { AgentRoleConfig } from "@/lib/configs/roles";
import { buildMemoryPrompt, getMemorySummary } from "@/lib/memory/aging-memory";
import { checkRateLimit } from "@/lib/redis/rate-limiter";
import type { Candle, MarketContext } from "@/types/market";
import type { MemorySummary } from "@/types/memory";
import type { AgentVote, TradeSignal } from "@/types/swarm";

type SignalScore = {
  signal: TradeSignal;
  confidence: number;
  reasoning: string;
};

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

function parseModelVote(text: string, fallback: SignalScore): SignalScore {
  const jsonCandidate = extractJsonObject(text);
  if (!jsonCandidate) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<SignalScore>;
    const signal =
      parsed.signal === "BUY" ||
      parsed.signal === "SELL" ||
      parsed.signal === "HOLD"
        ? parsed.signal
        : fallback.signal;
    const confidence =
      typeof parsed.confidence === "number"
        ? clampConfidence(parsed.confidence)
        : fallback.confidence;
    const reasoning =
      typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
        ? parsed.reasoning.trim()
        : fallback.reasoning;
    return { signal, confidence, reasoning };
  } catch {
    return fallback;
  }
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
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
  if (score > threshold) {
    return "BUY";
  }
  if (score < -threshold) {
    return "SELL";
  }
  return "HOLD";
}

function runTrendFollower(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 8);
  const recentCloses = ctx.candles.slice(-5).map((candle) => candle.close);
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
  };
}

function runMomentumAnalyst(ctx: MarketContext): SignalScore {
  const move = priceMove(ctx, 5);
  const volumes = ctx.candles.slice(-8).map((candle) => candle.volume);
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
    };
  }
  if (range > 0.03) {
    return {
      signal: "HOLD",
      confidence: 0.9,
      reasoning: `Intrabar range of ${(range * 100).toFixed(2)}% exceeds 3%; volatility regime is elevated.`,
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
  };
}

function runExecutionTactician(ctx: MarketContext): SignalScore {
  const spread = spreadPercent(ctx);
  const lastCandle = ctx.candles.at(-1);

  const recentSpreads = ctx.candles
    .slice(-10)
    .map((candle) =>
      ctx.ticker.last > 0 ? (candle.high - candle.low) / ctx.ticker.last : 0,
    );
  const medianSpread =
    recentSpreads.sort((left, right) => left - right)[
      Math.floor(recentSpreads.length / 2)
    ] ?? 0;

  if (medianSpread > 0 && spread > medianSpread * 1.5) {
    return {
      signal: "HOLD",
      confidence: 0.88,
      reasoning: `Spread is ${(spread / medianSpread).toFixed(1)}x median; fill quality is unacceptable.`,
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
      };
    }
    if (lowerWick > wickThreshold && lowerWick > upperWick) {
      return {
        signal: "HOLD",
        confidence: 0.82,
        reasoning:
          "Prominent lower wick rejection on last candle; do not sell into support absorption.",
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
  };
}

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
    case "macro_filter":
      return runMacroFilter(ctx);
    case "execution_tactician":
      return runExecutionTactician(ctx);
  }
}

function buildSystemPrompt(roleConfig: AgentRoleConfig): string {
  const vetoNote = roleConfig.isVetoLayer
    ? "\nIMPORTANT: You are a VETO LAYER. A HOLD from you with confidence > 0.75 overrides the full consensus. Use this power deliberately."
    : "";

  return [
    "You are one specialist agent in a crypto trading swarm.",
    `Role: ${roleConfig.label} (${roleConfig.modelRole})`,
    "Return strict JSON only.",
    '{"signal":"BUY"|"SELL"|"HOLD","confidence":0.0-1.0,"reasoning":"short rationale"}',
    "Keep reasoning under 220 characters.",
    "Use web research as supporting context only and weigh it against live market data.",
    vetoNote,
  ]
    .filter(Boolean)
    .join("\n");
}

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
  ): Promise<AgentVote> {
    const startedAt = Date.now();
    const heuristicVote = analyzeRole(roleConfig, ctx);
    const resolvedMemorySummary =
      memorySummary ?? (await getMemorySummary(ctx));
    const memoryLabel = summarizeMemoryForDisplay(resolvedMemorySummary);

    const rateLimit = await checkRateLimit(`agent:call:${modelId}`, 1, 1);
    if (!rateLimit.allowed) {
      return finalizeVote({
        model: modelId,
        roleConfig,
        signal: heuristicVote.signal,
        confidence: heuristicVote.confidence,
        reasoning: `${heuristicVote.reasoning} [Rate-limited: heuristic used]${memoryLabel ? ` ${memoryLabel}` : ""}`,
        startedAt,
      });
    }

    const webSearchAllowed = modelCanUseWebSearch(modelId as AIModel);
    const researchContext = webSearchAllowed
      ? await getMarketResearchDigest(ctx)
      : null;
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
        });

        resolvedVote = parseModelVote(text, heuristicVote);

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
          };
        }
      } catch {
        resolvedVote = {
          ...heuristicVote,
          reasoning: `${heuristicVote.reasoning} [Model call failed; heuristic used]${memoryLabel ? ` ${memoryLabel}` : ""}`,
        };
      }
    } else {
      const suffix = researchContext
        ? " [Ollama offline; heuristic used without web synthesis]"
        : " [Ollama offline; heuristic used]";
      resolvedVote = {
        ...heuristicVote,
        reasoning: `${heuristicVote.reasoning}${suffix}${memoryLabel ? ` ${memoryLabel}` : ""}`,
      };
    }

    return finalizeVote({
      model: modelId,
      roleConfig,
      signal: resolvedVote.signal,
      confidence: clampConfidence(
        resolvedVote.confidence + Math.min(prompt.length / 4000, 0.05),
      ),
      reasoning: resolvedVote.reasoning,
      startedAt,
    });
  };
}
