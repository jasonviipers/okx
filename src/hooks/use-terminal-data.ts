"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useOptimistic,
  useRef,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  controlAutonomy,
  getAccount,
  getAutonomyStatus,
  getConsensus,
  getExecutionIntents,
  getMemoryRecent,
  getMemorySummaryForSymbol,
  getPositions,
  getRuntimeSystemStatus,
  getSwarmHistory,
  getTradeHistory,
  getTradingPerformance,
  getWatchlist,
} from "@/lib/api/client";
import type { AutonomyStatus, RuntimeStatus } from "@/types/api";
import type {
  StoredExecutionIntent,
  StoredSwarmRun,
  StoredTradeExecution,
  StrategyPerformanceSummary,
} from "@/types/history";
import type { MarketFeedStatus, OKXTicker } from "@/types/market";
import type { MemoryRecord, MemorySummary } from "@/types/memory";
import type { TradingPerformancePayload } from "@/types/performance";
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

// ---------------------------------------------------------------------------
// useSyncExternalStore-backed polling hook
// ---------------------------------------------------------------------------
// Each data stream gets its own external store. Components subscribe via
// useSyncExternalStore which guarantees consistency across concurrent renders
// and avoids tearing / stale-snapshot bugs.

interface StoreEntry<T> {
  state: SwrState<T>;
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const storeMap = new Map<string, StoreEntry<unknown>>();

function getStore<T>(key: string): StoreEntry<T> {
  let entry = storeMap.get(key) as StoreEntry<T> | undefined;
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

// ---------------------------------------------------------------------------
// useSwr – uses useSyncExternalStore under the hood
// ---------------------------------------------------------------------------

function useSwr<T>(
  key: string,
  fetcher: () => Promise<{ data: T }>,
  intervalMs: number,
): SwrState<T> & { refresh: () => void } {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const entry = getStore<T>(key);
      entry.listeners.add(onStoreChange);

      // Start polling if this is the first subscriber
      const needsInitialFetch =
        entry.state.loading && entry.state.data === null;

      const doRefresh = async () => {
        const prevData = entry.state.data;
        if (prevData !== null) {
          entry.state = { ...entry.state, refreshing: true, error: null };
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

      const doInitialFetch = async () => {
        entry.state = {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        };
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

      if (needsInitialFetch) {
        doInitialFetch();
      }

      if (!entry.timer) {
        entry.timer = setInterval(doRefresh, intervalMs);
      }

      return () => {
        entry.listeners.delete(onStoreChange);
        if (entry.listeners.size === 0 && entry.timer) {
          clearInterval(entry.timer);
          entry.timer = null;
        }
      };
    },
    [key, intervalMs],
  );

  const lastSnapshotRef = useRef<{
    state: SwrState<T>;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const entry = getStore<T>(key);
    if (
      lastSnapshotRef.current &&
      lastSnapshotRef.current.version === entry.version
    ) {
      return lastSnapshotRef.current;
    }
    const snapshot = { state: entry.state, version: entry.version };
    lastSnapshotRef.current = snapshot;
    return snapshot;
  }, [key]);

  const serverSnapshotRef = useRef<{
    state: SwrState<T>;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverSnapshotRef.current) {
      serverSnapshotRef.current = {
        state: {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        } as SwrState<T>,
        version: 0,
      };
    }
    return serverSnapshotRef.current;
  }, []);

  const { state } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    const entry = getStore<T>(key);
    const doRefresh = async () => {
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
    doRefresh();
  }, [key]);

  return { ...state, refresh };
}

// ---------------------------------------------------------------------------
// useSyncExternalStore-based system status (non-ApiEnvelope response)
// ---------------------------------------------------------------------------

interface SystemStatusStore {
  state: SwrState<RuntimeStatus>;
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const systemStatusStore: SystemStatusStore = {
  state: { data: null, error: null, loading: true, refreshing: false },
  version: 0,
  listeners: new Set(),
  timer: null,
};

function emitSystemStatusChange() {
  systemStatusStore.version += 1;
  for (const listener of systemStatusStore.listeners) {
    listener();
  }
}

export function useSystemStatus() {
  const doRefresh = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      systemStatusStore.state = {
        ...systemStatusStore.state,
        refreshing: true,
        error: null,
      };
      emitSystemStatusChange();
    } else {
      systemStatusStore.state = {
        data: null,
        error: null,
        loading: true,
        refreshing: false,
      };
      emitSystemStatusChange();
    }
    try {
      const res = await getRuntimeSystemStatus();
      systemStatusStore.state = {
        data: res,
        error: null,
        loading: false,
        refreshing: false,
      };
    } catch (err) {
      systemStatusStore.state = {
        ...systemStatusStore.state,
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        refreshing: false,
      };
    }
    emitSystemStatusChange();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      systemStatusStore.listeners.add(onStoreChange);
      const needsInitialFetch =
        systemStatusStore.state.loading &&
        systemStatusStore.state.data === null;

      if (needsInitialFetch) {
        doRefresh(false);
      }
      if (!systemStatusStore.timer) {
        systemStatusStore.timer = setInterval(() => doRefresh(true), 10_000);
      }

      return () => {
        systemStatusStore.listeners.delete(onStoreChange);
        if (systemStatusStore.listeners.size === 0 && systemStatusStore.timer) {
          clearInterval(systemStatusStore.timer);
          systemStatusStore.timer = null;
        }
      };
    },
    [doRefresh],
  );

  const lastSnapshotRef = useRef<{
    state: SwrState<RuntimeStatus>;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    if (
      lastSnapshotRef.current &&
      lastSnapshotRef.current.version === systemStatusStore.version
    ) {
      return lastSnapshotRef.current;
    }
    const snapshot = {
      state: systemStatusStore.state,
      version: systemStatusStore.version,
    };
    lastSnapshotRef.current = snapshot;
    return snapshot;
  }, []);

  const serverSnapshotRef = useRef<{
    state: SwrState<RuntimeStatus>;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverSnapshotRef.current) {
      serverSnapshotRef.current = {
        state: {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        } as SwrState<RuntimeStatus>,
        version: 0,
      };
    }
    return serverSnapshotRef.current;
  }, []);

  const { state } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    doRefresh(true);
  }, [doRefresh]);

  return { ...state, refresh };
}

// ---------------------------------------------------------------------------
// useSyncExternalStore-based autonomy status
// ---------------------------------------------------------------------------

interface AutonomyStatusStore {
  state: SwrState<AutonomyStatus>;
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const autonomyStatusStore: AutonomyStatusStore = {
  state: { data: null, error: null, loading: true, refreshing: false },
  version: 0,
  listeners: new Set(),
  timer: null,
};

function emitAutonomyStatusChange() {
  autonomyStatusStore.version += 1;
  for (const listener of autonomyStatusStore.listeners) {
    listener();
  }
}

export function useAutonomyStatus() {
  const doRefresh = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      autonomyStatusStore.state = {
        ...autonomyStatusStore.state,
        refreshing: true,
        error: null,
      };
      emitAutonomyStatusChange();
    } else {
      autonomyStatusStore.state = {
        data: null,
        error: null,
        loading: true,
        refreshing: false,
      };
      emitAutonomyStatusChange();
    }
    try {
      const res = await getAutonomyStatus();
      autonomyStatusStore.state = {
        data: res.data.autonomy,
        error: null,
        loading: false,
        refreshing: false,
      };
    } catch (err) {
      autonomyStatusStore.state = {
        ...autonomyStatusStore.state,
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        refreshing: false,
      };
    }
    emitAutonomyStatusChange();
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      autonomyStatusStore.listeners.add(onStoreChange);
      const needsInitialFetch =
        autonomyStatusStore.state.loading &&
        autonomyStatusStore.state.data === null;

      if (needsInitialFetch) {
        doRefresh(false);
      }
      if (!autonomyStatusStore.timer) {
        autonomyStatusStore.timer = setInterval(() => doRefresh(true), 5_000);
      }

      return () => {
        autonomyStatusStore.listeners.delete(onStoreChange);
        if (
          autonomyStatusStore.listeners.size === 0 &&
          autonomyStatusStore.timer
        ) {
          clearInterval(autonomyStatusStore.timer);
          autonomyStatusStore.timer = null;
        }
      };
    },
    [doRefresh],
  );

  const lastSnapshotRef = useRef<{
    state: SwrState<AutonomyStatus>;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    if (
      lastSnapshotRef.current &&
      lastSnapshotRef.current.version === autonomyStatusStore.version
    ) {
      return lastSnapshotRef.current;
    }
    const snapshot = {
      state: autonomyStatusStore.state,
      version: autonomyStatusStore.version,
    };
    lastSnapshotRef.current = snapshot;
    return snapshot;
  }, []);

  const serverSnapshotRef = useRef<{
    state: SwrState<AutonomyStatus>;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverSnapshotRef.current) {
      serverSnapshotRef.current = {
        state: {
          data: null,
          error: null,
          loading: true,
          refreshing: false,
        } as SwrState<AutonomyStatus>,
        version: 0,
      };
    }
    return serverSnapshotRef.current;
  }, []);

  const { state } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    doRefresh(true);
  }, [doRefresh]);

  return { ...state, refresh };
}

// ---------------------------------------------------------------------------
// useOptimistic + useTransition: Watchlist with optimistic updates
// ---------------------------------------------------------------------------

export function useWatchlist(symbols: string[] = []) {
  const fetcher = useCallback(() => getWatchlist(symbols), [symbols]);
  return useSwr<{ items: WatchlistItem[]; count: number }>(
    `watchlist:${symbols.join(",")}`,
    fetcher,
    5_000,
  );
}

// ---------------------------------------------------------------------------
// useTransition-wrapped data hooks – symbol/timeframe switches are
// non-blocking transitions so the UI stays responsive during refetch.
// ---------------------------------------------------------------------------

export function useAccount(symbol = "BTC-USDT") {
  const fetcher = useCallback(() => getAccount(symbol), [symbol]);
  return useSwr<{ overview: AccountOverview }>(
    `account:${symbol}`,
    fetcher,
    15_000,
  );
}

export function usePositions() {
  return useSwr<{ positions: Position[]; count: number; accountMode: string }>(
    "positions",
    getPositions,
    10_000,
  );
}

export function useSwarmHistory(limit = 25) {
  const fetcher = useCallback(() => getSwarmHistory(limit), [limit]);
  return useSwr<{ entries: StoredSwarmRun[]; count: number }>(
    `swarm-history:${limit}`,
    fetcher,
    15_000,
  );
}

export function useTradeHistory(limit = 25) {
  const fetcher = useCallback(() => getTradeHistory(limit), [limit]);
  return useSwr<{ entries: StoredTradeExecution[]; count: number }>(
    `trade-history:${limit}`,
    fetcher,
    15_000,
  );
}

export function useExecutionIntents(limit = 25) {
  const fetcher = useCallback(() => getExecutionIntents(limit), [limit]);
  return useSwr<{ entries: StoredExecutionIntent[]; count: number }>(
    `execution-intents:${limit}`,
    fetcher,
    15_000,
  );
}

export function useTradingPerformanceAudit(regime?: string) {
  const fetcher = useCallback(() => getTradingPerformance(regime), [regime]);
  return useSwr<
    TradingPerformancePayload & { summary: StrategyPerformanceSummary[] }
  >(`trading-performance:${regime ?? "all"}`, fetcher, 15_000);
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
  return useSwr<{ entries: MemoryRecord[]; count: number }>(
    `memory-recent:${symbol ?? "all"}:${timeframe ?? "all"}:${limit}`,
    fetcher,
    30_000,
  );
}

export function useMemorySummary(symbol = "BTC-USDT", timeframe = "1H") {
  const fetcher = useCallback(
    () => getMemorySummaryForSymbol(symbol, timeframe),
    [symbol, timeframe],
  );
  return useSwr<{ summary: MemorySummary }>(
    `memory-summary:${symbol}:${timeframe}`,
    fetcher,
    30_000,
  );
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
  }>(`consensus:${symbol}:${timeframe}:${mode ?? ""}`, fetcher, 10_000);
}

// ---------------------------------------------------------------------------
// useSyncExternalStore + useEffectEvent: Swarm SSE stream
// ---------------------------------------------------------------------------

interface SwarmStreamStore {
  events: SwarmStreamEvent[];
  connected: boolean;
  error: string | null;
  version: number;
  listeners: Set<() => void>;
}

const swarmStreamStores = new Map<string, SwarmStreamStore>();

function getSwarmStreamStore(key: string): SwarmStreamStore {
  let store = swarmStreamStores.get(key);
  if (!store) {
    store = {
      events: [],
      connected: false,
      error: null,
      version: 0,
      listeners: new Set(),
    };
    swarmStreamStores.set(key, store);
  }
  return store;
}

function emitSwarmStreamChange(key: string) {
  const store = swarmStreamStores.get(key);
  if (store) {
    store.version += 1;
    for (const listener of store.listeners) {
      listener();
    }
  }
}

export function useSwarmStream(symbol = "BTC-USDT", timeframe = "1H") {
  const key = `swarm-stream:${symbol}:${timeframe}`;

  const onMessage = useEffectEvent((event: SwarmStreamEvent) => {
    const store = getSwarmStreamStore(key);
    store.events = [event, ...store.events].slice(0, 200);
    emitSwarmStreamChange(key);
  });

  const onOpen = useEffectEvent(() => {
    const store = getSwarmStreamStore(key);
    store.connected = true;
    store.error = null;
    emitSwarmStreamChange(key);
  });

  const onError = useEffectEvent((receivedAnyMessage: boolean) => {
    const store = getSwarmStreamStore(key);
    store.connected = false;
    store.error = receivedAnyMessage
      ? null
      : "Unable to connect to swarm stream";
    emitSwarmStreamChange(key);
  });

  useEffect(() => {
    const store = getSwarmStreamStore(key);
    store.events = [];
    store.connected = false;
    store.error = null;

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let receivedAnyMessage = false;

    const connect = () => {
      if (!active) return;

      const params = new URLSearchParams({ symbol, timeframe });
      const url = `/api/ai/swarm/stream?${params.toString()}`;
      es = new EventSource(url);

      es.onopen = () => {
        if (!active) return;
        onOpen();
      };

      es.onmessage = (e) => {
        try {
          const event: SwarmStreamEvent = JSON.parse(e.data);
          receivedAnyMessage = true;
          onMessage(event);
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        if (!active) return;
        onError(receivedAnyMessage);
        es?.close();
        reconnectTimer = setTimeout(() => {
          connect();
        }, 1_500);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      es?.close();
      store.connected = false;
      emitSwarmStreamChange(key);
    };
    // useEffectEvent callbacks (onOpen, onMessage, onError) are stable
    // refs that always read the latest closure — they intentionally don't
    // need to appear in the dependency array. This is the purpose of
    // useEffectEvent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, key]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const store = getSwarmStreamStore(key);
      store.listeners.add(onStoreChange);
      return () => {
        store.listeners.delete(onStoreChange);
      };
    },
    [key],
  );

  const lastSnapshotRef = useRef<{
    events: SwarmStreamEvent[];
    connected: boolean;
    error: string | null;
    version: number;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const store = getSwarmStreamStore(key);
    if (
      lastSnapshotRef.current &&
      lastSnapshotRef.current.version === store.version
    ) {
      return lastSnapshotRef.current;
    }
    const snapshot = {
      events: store.events,
      connected: store.connected,
      error: store.error,
      version: store.version,
    };
    lastSnapshotRef.current = snapshot;
    return snapshot;
  }, [key]);

  const serverSnapshotRef = useRef<{
    events: SwarmStreamEvent[];
    connected: boolean;
    error: string | null;
    version: number;
  } | null>(null);

  const getServerSnapshot = useCallback(() => {
    if (!serverSnapshotRef.current) {
      serverSnapshotRef.current = {
        events: [] as SwarmStreamEvent[],
        connected: false,
        error: null as string | null,
        version: 0,
      };
    }
    return serverSnapshotRef.current;
  }, []);

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const clear = useCallback(() => {
    const store = getSwarmStreamStore(key);
    store.events = [];
    emitSwarmStreamChange(key);
  }, [key]);

  return {
    events: snapshot.events,
    connected: snapshot.connected,
    error: snapshot.error,
    clear,
  };
}

// ---------------------------------------------------------------------------
// useActionState + useOptimistic + useTransition: Autonomy control
// ---------------------------------------------------------------------------

interface AutonomyActionState {
  enabled: boolean;
  error: string | null;
}

async function autonomyAction(
  _prevState: AutonomyActionState,
  formData: FormData,
): Promise<AutonomyActionState> {
  const action = formData.get("action") as string;
  const symbol = formData.get("symbol") as string | null;
  const timeframe = formData.get("timeframe") as string | null;

  try {
    if (action === "start") {
      const res = await controlAutonomy({
        action: "start",
        symbol: symbol ?? undefined,
        timeframe: timeframe ?? undefined,
      });
      return { enabled: res.data.autonomy.enabled, error: null };
    }
    const res = await controlAutonomy({ action: "stop" });
    return { enabled: res.data.autonomy.enabled, error: null };
  } catch (err) {
    return {
      enabled: _prevState.enabled,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function useAutonomyControl() {
  const [actionState, formAction, isPending] = useActionState(autonomyAction, {
    enabled: false,
    error: null,
  });

  // Optimistic state: immediately flip the toggle before the server confirms
  const [optimisticEnabled, addOptimisticEnabled] = useOptimistic(
    actionState.enabled,
    (_current: boolean, optimisticValue: boolean) => optimisticValue,
  );

  const [isPendingTransition, startTransition] = useTransition();

  const start = useCallback(
    (opts?: { symbol?: string; timeframe?: string; intervalMs?: number }) => {
      const formData = new FormData();
      formData.set("action", "start");
      if (opts?.symbol) formData.set("symbol", opts.symbol);
      if (opts?.timeframe) formData.set("timeframe", opts.timeframe);

      addOptimisticEnabled(true);
      startTransition(() => {
        formAction(formData);
      });
    },
    [formAction, addOptimisticEnabled],
  );

  const stop = useCallback(() => {
    const formData = new FormData();
    formData.set("action", "stop");

    addOptimisticEnabled(false);
    startTransition(() => {
      formAction(formData);
    });
  }, [formAction, addOptimisticEnabled]);

  return {
    start,
    stop,
    loading: isPending || isPendingTransition,
    error: actionState.error,
    optimisticEnabled,
    formAction,
  };
}
