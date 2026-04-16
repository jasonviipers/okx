import "server-only";

import { cacheGet, cacheSet } from "@/lib/redis/client";
import type { Timeframe } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";

const SWARM_CACHE_TTL_SECONDS = 30;

function getSwarmKey(symbol: string, timeframe: Timeframe): string {
  return `swarm:result:${symbol}:${timeframe}`;
}

export async function getCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
): Promise<ConsensusResult | null> {
  const cached = await cacheGet(getSwarmKey(symbol, timeframe));
  return cached ? (JSON.parse(cached) as ConsensusResult) : null;
}

export async function setCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
  result: ConsensusResult,
): Promise<void> {
  await cacheSet(
    getSwarmKey(symbol, timeframe),
    JSON.stringify(result),
    SWARM_CACHE_TTL_SECONDS,
  );
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const cached = await cacheGet(key);
  return cached ? (JSON.parse(cached) as T) : null;
}

export async function setCachedJson<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
}
