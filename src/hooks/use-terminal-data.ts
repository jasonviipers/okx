"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  controlAutonomy,
  getAccount,
  getAutonomyStatus,
  getConsensus,
  getMemoryRecent,
  getMemorySummaryForSymbol,
  getPositions,
  getRuntimeSystemStatus,
  getSwarmHistory,
  getTradeHistory,
  getWatchlist,
} from "@/lib/api/client";
import type { AutonomyStatus, RuntimeStatus } from "@/types/api";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type { MarketFeedStatus, OKXTicker } from "@/types/market";
import type { MemoryRecord, MemorySummary } from "@/types/memory";
import type {
  ConsensusResult,
  ExecutionResult,
  SwarmStreamEvent,
} from "@/types/swarm";
import type { AccountOverview, Position } from "@/types/trade";

export interface WatchlistItem {
  symbol: string;
  ticker: OKXTicker;
  status: MarketFeedStatus;
}

interface SwrState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

function useSwr<T>(
  fetcher: () => Promise<{ data: T }>,
  intervalMs: number,
): SwrState<T> & { refresh: () => void } {
  const [state, setState] = useState<SwrState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setState((s) => ({ ...s, refreshing: true, error: null }));
      } else {
        setState({ data: null, error: null, loading: true, refreshing: false });
      }
      try {
        const res = await fetcher();
        if (mounted.current) {
          setState({
            data: res.data,
            error: null,
            loading: false,
            refreshing: false,
          });
        }
      } catch (err) {
        if (mounted.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
            refreshing: false,
          }));
        }
      }
    },
    [fetcher],
  );

  const refresh = useCallback(() => {
    doFetch(true);
  }, [doFetch]);

  useEffect(() => {
    mounted.current = true;
    doFetch(false);
    timer.current = setInterval(() => doFetch(true), intervalMs);
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [doFetch, intervalMs]);

  return { ...state, refresh };
}

export function useSystemStatus() {
  const [state, setState] = useState<SwrState<RuntimeStatus>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });
  const mounted = useRef(true);

  const doFetch = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setState((s) => ({ ...s, refreshing: true, error: null }));
    } else {
      setState({ data: null, error: null, loading: true, refreshing: false });
    }
    try {
      const res = await getRuntimeSystemStatus();
      if (mounted.current) {
        setState({ data: res, error: null, loading: false, refreshing: false });
      }
    } catch (err) {
      if (mounted.current) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          refreshing: false,
        }));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    doFetch(false);
    const timer = setInterval(() => doFetch(true), 10_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [doFetch]);

  const refresh = useCallback(() => {
    doFetch(true);
  }, [doFetch]);
  return { ...state, refresh };
}

export function useAutonomyStatus() {
  const [state, setState] = useState<SwrState<AutonomyStatus>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });
  const mounted = useRef(true);

  const doFetch = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setState((s) => ({ ...s, refreshing: true, error: null }));
    } else {
      setState({ data: null, error: null, loading: true, refreshing: false });
    }
    try {
      const res = await getAutonomyStatus();
      if (mounted.current) {
        setState({
          data: res.data.autonomy,
          error: null,
          loading: false,
          refreshing: false,
        });
      }
    } catch (err) {
      if (mounted.current) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          refreshing: false,
        }));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    doFetch(false);
    const timer = setInterval(() => doFetch(true), 5_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [doFetch]);

  const refresh = useCallback(() => {
    doFetch(true);
  }, [doFetch]);
  return { ...state, refresh };
}

export function useWatchlist(symbols: string[] = []) {
  const fetcher = useCallback(() => getWatchlist(symbols), [symbols]);
  return useSwr<{ items: WatchlistItem[]; count: number }>(fetcher, 5_000);
}

export function useAccount(symbol = "BTC-USDT") {
  const fetcher = useCallback(() => getAccount(symbol), [symbol]);
  return useSwr<{ overview: AccountOverview }>(fetcher, 15_000);
}

export function usePositions() {
  return useSwr<{ positions: Position[]; count: number; accountMode: string }>(
    getPositions,
    10_000,
  );
}

export function useSwarmHistory(limit = 25) {
  const fetcher = useCallback(() => getSwarmHistory(limit), [limit]);
  return useSwr<{ entries: StoredSwarmRun[]; count: number }>(fetcher, 15_000);
}

export function useTradeHistory(limit = 25) {
  const fetcher = useCallback(() => getTradeHistory(limit), [limit]);
  return useSwr<{ entries: StoredTradeExecution[]; count: number }>(
    fetcher,
    15_000,
  );
}

export function useMemoryRecent(
  symbol?: string,
  timeframe?: string,
  limit = 25,
) {
  const fetcher = useCallback(
    () => getMemoryRecent(symbol, timeframe, limit),
    [symbol, timeframe, limit],
  );
  return useSwr<{ entries: MemoryRecord[]; count: number }>(fetcher, 30_000);
}

export function useMemorySummary(symbol = "BTC-USDT", timeframe = "1H") {
  const fetcher = useCallback(
    () => getMemorySummaryForSymbol(symbol, timeframe),
    [symbol, timeframe],
  );
  return useSwr<{ summary: MemorySummary }>(fetcher, 30_000);
}

export function useConsensus(
  symbol = "BTC-USDT",
  timeframe = "1H",
  mode?: string,
) {
  const fetcher = useCallback(
    () => getConsensus(symbol, timeframe, mode),
    [symbol, timeframe, mode],
  );
  return useSwr<{
    consensus: ConsensusResult;
    execution?: ExecutionResult;
    cached?: boolean;
    totalElapsedMs?: number;
  }>(fetcher, 30_000);
}

export function useSwarmStream(symbol = "BTC-USDT", timeframe = "1H") {
  const [events, setEvents] = useState<SwarmStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let receivedAnyMessage = false;

    const connect = () => {
      if (!active) {
        return;
      }

      const params = new URLSearchParams({ symbol, timeframe });
      const url = `/api/ai/swarm/stream?${params.toString()}`;
      es = new EventSource(url);

      es.onopen = () => {
        if (!active) {
          return;
        }
        setConnected(true);
        setError(null);
      };

      es.onmessage = (e) => {
        try {
          const event: SwarmStreamEvent = JSON.parse(e.data);
          receivedAnyMessage = true;
          setEvents((prev) => [event, ...prev].slice(0, 200));
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        if (!active) {
          return;
        }

        setConnected(false);
        setError(
          receivedAnyMessage ? null : "Unable to connect to swarm stream",
        );

        es?.close();
        reconnectTimer = setTimeout(() => {
          connect();
        }, 1_500);
      };
    };

    setConnected(false);
    setError(null);
    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      es?.close();
      setConnected(false);
    };
  }, [symbol, timeframe]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, error, clear };
}

export function useAutonomyControl() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (opts?: {
      symbol?: string;
      timeframe?: string;
      intervalMs?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await controlAutonomy({ action: "start", ...opts });
        return res.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await controlAutonomy({ action: "stop" });
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { start, stop, loading, error };
}
