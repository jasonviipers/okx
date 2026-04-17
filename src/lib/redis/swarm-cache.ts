import "server-only";

import { cacheGet, cacheSet } from "@/lib/redis/client";
import { normalizeConsensusResult } from "@/lib/swarm/normalize-consensus";
import type { Timeframe } from "@/types/market";
import type { ConsensusResult } from "@/types/swarm";

const DEFAULT_SWARM_CACHE_TTL_SECONDS = 15;

function getSwarmKey(symbol: string, timeframe: Timeframe): string {
  return `swarm:result:${symbol}:${timeframe}`;
}

export async function getCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
): Promise<ConsensusResult | null> {
  const cached = await cacheGet(getSwarmKey(symbol, timeframe));
  return cached
    ? normalizeConsensusResult(JSON.parse(cached) as ConsensusResult)
    : null;
}

export async function setCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
  result: ConsensusResult,
  ttlSeconds?: number,
): Promise<void> {
  await cacheSet(
    getSwarmKey(symbol, timeframe),
    JSON.stringify(result),
    ttlSeconds ??
      Math.max(
        5,
        Math.round(
          (result.decisionCadenceMs ?? DEFAULT_SWARM_CACHE_TTL_SECONDS * 1000) /
            1000,
        ),
      ),
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
