import type { ApiEnvelope, AutonomyStatus, RuntimeStatus } from "@/types/api";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type { Candle, MarketFeedStatus, OKXTicker } from "@/types/market";
import type { MemoryRecord, MemorySummary } from "@/types/memory";
import type { ConsensusResult, ExecutionResult } from "@/types/swarm";
import type { AccountOverview, Position } from "@/types/trade";

async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getTicker(symbol: string) {
  return fetchJson<
    ApiEnvelope<{ ticker: OKXTicker; status: MarketFeedStatus }>
  >(`/api/ai/market/ticker?symbol=${symbol}`);
}

export function getCandles(symbol: string, timeframe: string, limit = 20) {
  return fetchJson<
    ApiEnvelope<{
      candles: Candle[];
      symbol: string;
      timeframe: string;
      count: number;
      status: MarketFeedStatus;
    }>
  >(
    `/api/ai/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
  );
}

export function getPositions() {
  return fetchJson<
    ApiEnvelope<{ positions: Position[]; count: number; accountMode: string }>
  >("/api/ai/trade/positions");
}

export function getAccount(symbol: string) {
  return fetchJson<ApiEnvelope<{ overview: AccountOverview }>>(
    `/api/ai/trade/account?symbol=${symbol}`,
  );
}

export function getConsensus(symbol: string, timeframe: string, mode?: string) {
  const params = new URLSearchParams({
    symbol,
    timeframe,
  });
  if (mode) {
    params.set("mode", mode);
  }

  return fetchJson<
    ApiEnvelope<{
      consensus: ConsensusResult;
      execution?: ExecutionResult;
      cached?: boolean;
      totalElapsedMs?: number;
    }>
  >(`/api/ai/swarm/consensus?${params.toString()}`);
}

export function getRuntimeSystemStatus() {
  return fetchJson<RuntimeStatus>("/api/ai/system/status");
}

export function getAutonomyStatus() {
  return fetchJson<ApiEnvelope<{ autonomy: AutonomyStatus }>>(
    "/api/ai/system/autonomy",
  );
}

export function controlAutonomy(input: {
  action: "start" | "stop";
  symbol?: string;
  timeframe?: string;
  intervalMs?: number;
}) {
  return fetch("/api/ai/system/autonomy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    }

    return (await response.json()) as ApiEnvelope<{ autonomy: AutonomyStatus }>;
  });
}

export function getSwarmHistory(limit = 25) {
  return fetchJson<ApiEnvelope<{ entries: StoredSwarmRun[]; count: number }>>(
    `/api/ai/swarm/history?limit=${limit}`,
  );
}

export function getTradeHistory(limit = 25) {
  return fetchJson<
    ApiEnvelope<{ entries: StoredTradeExecution[]; count: number }>
  >(`/api/ai/trade/history?limit=${limit}`);
}

export function getMemoryRecent(
  symbol?: string,
  timeframe?: string,
  limit = 25,
) {
  const params = new URLSearchParams();
  if (symbol) {
    params.set("symbol", symbol);
  }
  if (timeframe) {
    params.set("timeframe", timeframe);
  }
  params.set("limit", String(limit));

  return fetchJson<ApiEnvelope<{ entries: MemoryRecord[]; count: number }>>(
    `/api/ai/memory/recent?${params.toString()}`,
  );
}

export function getMemorySummaryForSymbol(symbol: string, timeframe: string) {
  return fetchJson<ApiEnvelope<{ summary: MemorySummary }>>(
    `/api/ai/memory/summary?symbol=${symbol}&timeframe=${timeframe}`,
  );
}
