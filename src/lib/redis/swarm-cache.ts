import "server-only";

import {
  DEFAULT_TRADING_MODE,
  type TradingMode,
} from "@/lib/configs/trading-modes";
import { cacheGet, cacheSet } from "@/lib/redis/client";
import { normalizeConsensusResult } from "@/lib/swarm/normalize-consensus";
import type { Timeframe } from "@/types/market";
import type { ConsensusResult, DecisionResult } from "@/types/swarm";

const DEFAULT_SWARM_CACHE_TTL_SECONDS = 15;

function getSwarmKey(
  symbol: string,
  timeframe: Timeframe,
  tradingMode: TradingMode,
): string {
  return `swarm:result:${symbol}:${timeframe}:${tradingMode}`;
}

export async function getCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
  tradingMode: TradingMode = DEFAULT_TRADING_MODE,
): Promise<DecisionResult | null> {
  const cached = await cacheGet(getSwarmKey(symbol, timeframe, tradingMode));
  if (!cached) {
    return null;
  }

  try {
    return normalizeConsensusResult(JSON.parse(cached) as ConsensusResult);
  } catch {
    return null;
  }
}

export async function setCachedSwarmResult(
  symbol: string,
  timeframe: Timeframe,
  result: DecisionResult,
  tradingMode: TradingMode = DEFAULT_TRADING_MODE,
  ttlSeconds?: number,
): Promise<void> {
  await cacheSet(
    getSwarmKey(symbol, timeframe, tradingMode),
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
