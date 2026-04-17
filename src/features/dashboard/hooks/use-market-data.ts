"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ApiEnvelope } from "@/types/api";
import type {
  Candle,
  MarketFeedStatus,
  OKXTicker,
  OrderBook,
} from "@/types/market";

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

interface SnapshotData {
  symbol: string;
  timeframe: string;
  ticker: OKXTicker;
  orderbook: OrderBook;
  candles: Candle[];
  status: MarketFeedStatus;
}

interface CandlesData {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  count: number;
  status: MarketFeedStatus;
}

interface SwrState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

interface DataStore<T> {
  state: SwrState<T>;
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const storeMap = new Map<string, DataStore<unknown>>();

function getStore<T>(key: string): DataStore<T> {
  let entry = storeMap.get(key) as DataStore<T> | undefined;
  if (!entry) {
    entry = {
      state: { data: null, error: null, loading: true, refreshing: false },
      version: 0,
      listeners: new Set(),
      timer: null,
    };
    storeMap.set(key, entry);
  }
  return entry;
}

function emitChange(key: string) {
  const entry = storeMap.get(key);
  if (entry) {
    entry.version += 1;
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

export function useMarketSnapshot(
  symbol: string,
  timeframe: string,
): SwrState<SnapshotData> & { refresh: () => void } {
  const key = `snapshot:${symbol}:${timeframe}`;
  const fetcherRef = useRef(() =>
    fetchJson<ApiEnvelope<SnapshotData>>(
      `/api/ai/market/snapshot?symbol=${symbol}&timeframe=${timeframe}&limit=200`,
    ),
  );
  fetcherRef.current = () =>
    fetchJson<ApiEnvelope<SnapshotData>>(
      `/api/ai/market/snapshot?symbol=${symbol}&timeframe=${timeframe}&limit=200`,
    );

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const entry = getStore<SnapshotData>(key);
      entry.listeners.add(onStoreChange);
      const needsFetch = entry.state.loading && entry.state.data === null;

      const doFetch = async (isRefresh: boolean) => {
        if (isRefresh) {
          entry.state = { ...entry.state, refreshing: true, error: null };
          emitChange(key);
        } else {
          entry.state = {
            data: null,
            error: null,
            loading: true,
            refreshing: false,
          };
          emitChange(key);
        }
        try {
          const res = await fetcherRef.current();
          entry.state = {
            data: res.data,
            error: null,
            loading: false,
            refreshing: false,
          };
        } catch (err) {
          entry.state = {
            ...entry.state,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
            refreshing: false,
          };
        }
        emitChange(key);
      };

      if (needsFetch) {
        doFetch(false);
      }

      if (!entry.timer) {
        entry.timer = setInterval(() => doFetch(true), 5_000);
      }

      return () => {
        entry.listeners.delete(onStoreChange);
        if (entry.listeners.size === 0 && entry.timer) {
          clearInterval(entry.timer);
          entry.timer = null;
        }
      };
    },
    [key],
  );

  const lastRef = useRef<{
    state: SwrState<SnapshotData>;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const entry = getStore<SnapshotData>(key);
    if (lastRef.current && lastRef.current.version === entry.version) {
      return lastRef.current;
    }
    const snap = { state: entry.state, version: entry.version };
    lastRef.current = snap;
    return snap;
  }, [key]);

  const serverRef = useRef<{
    state: SwrState<SnapshotData>;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverRef.current) {
      serverRef.current = {
        state: {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        } as SwrState<SnapshotData>,
        version: 0,
      };
    }
    return serverRef.current;
  }, []);

  const { state } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    const entry = getStore<SnapshotData>(key);
    const doFetch = async () => {
      entry.state = { ...entry.state, refreshing: true, error: null };
      emitChange(key);
      try {
        const res = await fetcherRef.current();
        entry.state = {
          data: res.data,
          error: null,
          loading: false,
          refreshing: false,
        };
      } catch (err) {
        entry.state = {
          ...entry.state,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          refreshing: false,
        };
      }
      emitChange(key);
    };
    doFetch();
  }, [key]);

  return { ...state, refresh };
}

export function useCandles(
  symbol: string,
  timeframe: string,
  limit = 200,
): SwrState<CandlesData> & { refresh: () => void } {
  const key = `candles:${symbol}:${timeframe}:${limit}`;
  const fetcherRef = useRef(() =>
    fetchJson<ApiEnvelope<CandlesData>>(
      `/api/ai/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
    ),
  );
  fetcherRef.current = () =>
    fetchJson<ApiEnvelope<CandlesData>>(
      `/api/ai/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
    );

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const entry = getStore<CandlesData>(key);
      entry.listeners.add(onStoreChange);
      const needsFetch = entry.state.loading && entry.state.data === null;

      const doFetch = async (isRefresh: boolean) => {
        if (isRefresh) {
          entry.state = { ...entry.state, refreshing: true, error: null };
          emitChange(key);
        } else {
          entry.state = {
            data: null,
            error: null,
            loading: true,
            refreshing: false,
          };
          emitChange(key);
        }
        try {
          const res = await fetcherRef.current();
          entry.state = {
            data: res.data,
            error: null,
            loading: false,
            refreshing: false,
          };
        } catch (err) {
          entry.state = {
            ...entry.state,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
            refreshing: false,
          };
        }
        emitChange(key);
      };

      if (needsFetch) {
        doFetch(false);
      }
      if (!entry.timer) {
        entry.timer = setInterval(() => doFetch(true), 10_000);
      }

      return () => {
        entry.listeners.delete(onStoreChange);
        if (entry.listeners.size === 0 && entry.timer) {
          clearInterval(entry.timer);
          entry.timer = null;
        }
      };
    },
    [key],
  );

  const lastRef = useRef<{
    state: SwrState<CandlesData>;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const entry = getStore<CandlesData>(key);
    if (lastRef.current && lastRef.current.version === entry.version) {
      return lastRef.current;
    }
    const snap = { state: entry.state, version: entry.version };
    lastRef.current = snap;
    return snap;
  }, [key]);

  const serverRef = useRef<{
    state: SwrState<CandlesData>;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverRef.current) {
      serverRef.current = {
        state: {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        } as SwrState<CandlesData>,
        version: 0,
      };
    }
    return serverRef.current;
  }, []);

  const { state } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    const entry = getStore<CandlesData>(key);
    const doFetch = async () => {
      entry.state = { ...entry.state, refreshing: true, error: null };
      emitChange(key);
      try {
        const res = await fetcherRef.current();
        entry.state = {
          data: res.data,
          error: null,
          loading: false,
          refreshing: false,
        };
      } catch (err) {
        entry.state = {
          ...entry.state,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          refreshing: false,
        };
      }
      emitChange(key);
    };
    doFetch();
  }, [key]);

  return { ...state, refresh };
}

interface TickerStore {
  tickers: OKXTicker[];
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const tickerStore: TickerStore = {
  tickers: [],
  version: 0,
  listeners: new Set(),
  timer: null,
};

function emitTickerChange() {
  tickerStore.version += 1;
  for (const listener of tickerStore.listeners) {
    listener();
  }
}

export function useTickerFeed(symbols: string[]) {
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const doRefresh = useCallback(async () => {
    try {
      const res = await fetchJson<
        ApiEnvelope<{
          items: {
            symbol: string;
            ticker: OKXTicker;
            status: MarketFeedStatus;
          }[];
          count: number;
          timeframe: string;
        }>
      >(
        `/api/ai/market/watchlist?symbols=${encodeURIComponent(symbolsRef.current.join(","))}&timeframe=1H`,
      );
      tickerStore.tickers = res.data.items.map((item) => item.ticker);
    } catch {
      // preserve previous data on error
    }
    emitTickerChange();
  }, []);

  useEffect(() => {
    doRefresh();
    const interval = setInterval(doRefresh, 3_000);
    return () => clearInterval(interval);
  }, [doRefresh]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    tickerStore.listeners.add(onStoreChange);
    return () => {
      tickerStore.listeners.delete(onStoreChange);
    };
  }, []);

  const lastRef = useRef<{ tickers: OKXTicker[]; version: number } | null>(
    null,
  );

  const getSnapshot = useCallback(() => {
    if (lastRef.current && lastRef.current.version === tickerStore.version) {
      return lastRef.current;
    }
    const snap = { tickers: tickerStore.tickers, version: tickerStore.version };
    lastRef.current = snap;
    return snap;
  }, []);

  const serverRef = useRef<{ tickers: OKXTicker[]; version: number } | null>(
    null,
  );

  const getServerSnapshot = useCallback(() => {
    if (!serverRef.current) {
      serverRef.current = { tickers: [], version: 0 };
    }
    return serverRef.current;
  }, []);

  const { tickers } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return tickers;
}
