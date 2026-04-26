// ---------------------------------------------------------------------------
// Gemini Search Grounding
//
// Provides supplemental market research through Google's search-grounded
// Gemini models. Access is gated by role in create-agent.ts via
// modelCanUseWebSearch().
// ---------------------------------------------------------------------------

import "server-only";

import type { GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { generateText } from "ai";
import {
  getGoogleProvider,
  getGoogleSearchModel,
  isGoogleGenerativeAIConfigured,
} from "@/lib/ai/google";
import { getCachedJson, setCachedJson } from "@/lib/redis/swarm-cache";
import type { MarketContext } from "@/types/market";

const WEB_RESEARCH_TTL_SECONDS = 90;
const MAX_RENDERED_SOURCES = 5;
const SEARCH_LOOKBACK_DAYS = 14;

export interface MarketResearchRequest {
  role?: string;
  focus?: string | null;
}

type MarketResearchOptions = {
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

function normalizeCacheToken(value: string | null | undefined): string {
  if (!value) return "general";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function getResearchCacheKey(
  ctx: MarketContext,
  request?: MarketResearchRequest,
): string {
  const roleToken = normalizeCacheToken(request?.role);
  const focusToken = normalizeCacheToken(request?.focus);
  return `google:web-research:${ctx.symbol}:${ctx.timeframe}:${roleToken}:${focusToken}`;
}

function getBaseAsset(symbol: string): string {
  return symbol.split("-")[0] ?? symbol;
}

function buildRoleFocus(role?: string): string {
  switch (role) {
    case "trend_follower":
      return "trend breakout continuation price structure";
    case "momentum_analyst":
      return "momentum volatility derivatives funding liquidation";
    case "sentiment_reader":
      return "market sentiment ETF flows positioning exchange sentiment";
    case "macro_filter":
      return "macro risk regulation liquidity regime";
    case "execution_tactician":
      return "execution liquidity slippage market microstructure";
    default:
      return "market catalysts sentiment macro regulation";
  }
}

function buildSearchQuery(
  ctx: MarketContext,
  request?: MarketResearchRequest,
): string {
  const baseAsset = getBaseAsset(ctx.symbol);
  const focus = request?.focus?.trim();
  return [
    `${baseAsset} crypto latest news`,
    `${ctx.symbol} market catalysts`,
    buildRoleFocus(request?.role),
    focus ? `focus on ${focus}` : null,
    "macro regulation ETF exchange sentiment",
    "for short-term trading",
  ]
    .filter(Boolean)
    .join(" ");
}

function getSearchWindow(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function formatSource(source: unknown, index: number): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const candidate = source as Record<string, unknown>;
  const url =
    typeof candidate.url === "string"
      ? candidate.url
      : typeof candidate.sourceId === "string"
        ? candidate.sourceId
        : typeof candidate.id === "string"
          ? candidate.id
          : null;
  const title =
    typeof candidate.title === "string" && candidate.title.trim().length > 0
      ? candidate.title.trim()
      : "Untitled source";

  if (!url) {
    return `${index + 1}. ${title}`;
  }

  return `${index + 1}. ${title}\nURL: ${url}`;
}

export function isGoogleSearchConfigured(): boolean {
  return isGoogleGenerativeAIConfigured();
}

export async function getMarketResearchDigest(
  ctx: MarketContext,
  request?: MarketResearchRequest,
  options?: MarketResearchOptions,
): Promise<string | null> {
  if (!isGoogleSearchConfigured()) return null;

  throwIfAborted(
    options?.abortSignal,
    `Market research aborted for ${ctx.symbol} ${ctx.timeframe}.`,
  );
  const cacheKey = getResearchCacheKey(ctx, request);
  const cached = await getCachedJson<string>(cacheKey);
  if (cached) return cached;

  const query = buildSearchQuery(ctx, request);

  try {
    const { text, sources, providerMetadata } = await generateText({
      model: getGoogleSearchModel(),
      tools: {
        google_search: getGoogleProvider().tools.googleSearch({
          searchTypes: { webSearch: {} },
          timeRangeFilter: getSearchWindow(SEARCH_LOOKBACK_DAYS),
        }),
      },
      system: [
        "You are a crypto market research analyst.",
        "Use Google Search grounding to gather recent, material developments.",
        "Prioritize concrete developments that can affect the next 24-72 hours of trading.",
        "Always use exact dates, never relative dates.",
      ].join("\n"),
      prompt: [
        `Symbol: ${ctx.symbol}`,
        `Timeframe: ${ctx.timeframe}`,
        request?.role ? `Agent role: ${request.role}` : null,
        request?.focus ? `Research focus: ${request.focus}` : null,
        `Search query: ${query}`,
        "Return a concise markdown briefing with:",
        "1. Three to five dated developments.",
        "2. Why each item matters for near-term crypto trading.",
        "3. A short trading impact summary.",
        "If nothing material is found, say so clearly.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.1,
      maxOutputTokens: 700,
      abortSignal: options?.abortSignal,
    });

    const metadata = providerMetadata?.google as
      | GoogleGenerativeAIProviderMetadata
      | undefined;
    const searchQueries = metadata?.groundingMetadata?.webSearchQueries ?? [];
    const sourceLines = sources
      .map((source, index) => formatSource(source, index))
      .filter((source): source is string => Boolean(source))
      .slice(0, MAX_RENDERED_SOURCES);
    const trimmedText = text.trim();

    if (!trimmedText && sourceLines.length === 0) {
      return null;
    }

    const digest = [
      `Fresh web research for ${ctx.symbol} (${ctx.timeframe})`,
      request?.role ? `Agent role: ${request.role}` : null,
      request?.focus ? `Research focus: ${request.focus}` : null,
      `Search query: ${query}`,
      searchQueries.length > 0
        ? `Google search queries: ${searchQueries.join(" | ")}`
        : null,
      trimmedText || null,
      sourceLines.length > 0 ? "Sources:" : null,
      ...sourceLines,
      "Use this as supplemental context only. Prefer verified developments over hype.",
    ]
      .filter(Boolean)
      .join("\n\n");

    throwIfAborted(
      options?.abortSignal,
      `Market research aborted for ${ctx.symbol} ${ctx.timeframe}.`,
    );
    await setCachedJson(cacheKey, digest, WEB_RESEARCH_TTL_SECONDS);
    return digest;
  } catch (error) {
    if (options?.abortSignal?.aborted) {
      throw toAbortError(
        options.abortSignal.reason ?? error,
        `Market research aborted for ${ctx.symbol} ${ctx.timeframe}.`,
      );
    }

    return null;
  }
}
