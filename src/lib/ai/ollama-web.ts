// ---------------------------------------------------------------------------
// Ollama Web Search
//
// Provides supplemental market research via Ollama's web search API.
// Access is gated by role in create-agent.ts via modelCanUseWebSearch().
// This module does NOT enforce role permissions — it simply executes the
// search when called. Role gates must be applied by the caller.
//
// Enabled roles:  strategy, orchestrator, signal_worker
// Disabled roles: risk, validator, execution  (deterministic data only)
// ---------------------------------------------------------------------------

import "server-only";

import { getCachedJson, setCachedJson } from "@/lib/redis/swarm-cache";
import type { MarketContext } from "@/types/market";

const OLLAMA_WEB_BASE_URL = "https://ollama.com";
const WEB_RESEARCH_TTL_SECONDS = 90;
const MAX_SEARCH_RESULTS = 3;
const MAX_FETCH_RESULTS = 2;

interface OllamaWebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface OllamaWebSearchResponse {
  results?: OllamaWebSearchResult[];
}

interface OllamaWebFetchResponse {
  title?: string;
  content?: string;
  links?: string[];
}

function clampText(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function getResearchCacheKey(ctx: MarketContext): string {
  return `ollama:web-research:${ctx.symbol}:${ctx.timeframe}`;
}

function getBaseAsset(symbol: string): string {
  return symbol.split("-")[0] ?? symbol;
}

function buildSearchQuery(ctx: MarketContext): string {
  const baseAsset = getBaseAsset(ctx.symbol);
  return [
    `${baseAsset} crypto latest news`,
    `${ctx.symbol} market catalysts`,
    "macro regulation ETF exchange sentiment",
    "for short-term trading",
  ].join(" ");
}

function getAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function postJson<TResponse>(
  path: string,
  body: Record<string, string | number>,
): Promise<TResponse> {
  const response = await fetch(`${OLLAMA_WEB_BASE_URL}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ollama web API failed with status ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

async function webSearch(query: string): Promise<OllamaWebSearchResult[]> {
  const response = await postJson<OllamaWebSearchResponse>("/api/web_search", {
    query,
    max_results: MAX_SEARCH_RESULTS,
  });
  return response.results ?? [];
}

async function webFetch(url: string): Promise<OllamaWebFetchResponse> {
  return postJson<OllamaWebFetchResponse>("/api/web_fetch", { url });
}

function formatSearchResults(results: OllamaWebSearchResult[]): string[] {
  return results.map((result, index) =>
    [
      `${index + 1}. ${result.title}`,
      `URL: ${result.url}`,
      `Snippet: ${clampText(result.content, 220)}`,
    ].join("\n"),
  );
}

function formatFetchResults(
  results: Array<{ url: string; title: string; content: string }>,
): string[] {
  return results.map((result, index) =>
    [
      `${index + 1}. ${result.title}`,
      `URL: ${result.url}`,
      `Extract: ${clampText(result.content, 420)}`,
    ].join("\n"),
  );
}

export function isOllamaWebSearchConfigured(): boolean {
  return Boolean(process.env.OLLAMA_API_KEY);
}

/**
 * Fetch supplemental web research for the given market context.
 *
 * Returns null when:
 * - OLLAMA_API_KEY is not set
 * - The caller's role does not permit web search (enforced by create-agent.ts)
 * - The search or fetch fails
 *
 * Results are cached in Redis with a 90-second TTL to avoid redundant
 * searches across concurrent agent calls for the same symbol/timeframe.
 */
export async function getMarketResearchDigest(
  ctx: MarketContext,
): Promise<string | null> {
  if (!isOllamaWebSearchConfigured()) return null;

  const cacheKey = getResearchCacheKey(ctx);
  const cached = await getCachedJson<string>(cacheKey);
  if (cached) return cached;

  const query = buildSearchQuery(ctx);

  try {
    const searchResults = await webSearch(query);
    if (searchResults.length === 0) return null;

    const fetchedPages = (
      await Promise.allSettled(
        searchResults
          .filter((r) => /^https?:\/\//i.test(r.url))
          .slice(0, MAX_FETCH_RESULTS)
          .map(async (r) => {
            const page = await webFetch(r.url);
            return {
              url: r.url,
              title: page.title || r.title,
              content: page.content || r.content,
            };
          }),
      )
    )
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          url: string;
          title: string;
          content: string;
        }> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    const digest = [
      `Fresh web research for ${ctx.symbol} (${ctx.timeframe})`,
      `Search query: ${query}`,
      "Search results:",
      ...formatSearchResults(searchResults),
      fetchedPages.length > 0 ? "Fetched page extracts:" : null,
      ...formatFetchResults(fetchedPages),
      "Use this as supplemental context only. Prefer verified developments over hype.",
    ]
      .filter(Boolean)
      .join("\n\n");

    await setCachedJson(cacheKey, digest, WEB_RESEARCH_TTL_SECONDS);
    return digest;
  } catch {
    return null;
  }
}
