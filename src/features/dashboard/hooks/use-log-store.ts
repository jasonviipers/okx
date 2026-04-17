"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  source: string;
  message: string;
  payload?: string;
}

interface LogStore {
  entries: LogEntry[];
  version: number;
  listeners: Set<() => void>;
}

const logStore: LogStore = {
  entries: [],
  version: 0,
  listeners: new Set(),
};

let logIdCounter = 0;

function emitLogChange() {
  logStore.version += 1;
  for (const listener of logStore.listeners) {
    listener();
  }
}

export function addLog(
  level: LogEntry["level"],
  source: string,
  message: string,
  payload?: string,
) {
  const entry: LogEntry = {
    id: `log-${++logIdCounter}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    payload,
  };
  logStore.entries = [entry, ...logStore.entries].slice(0, 500);
  emitLogChange();
}

export function useLogStore() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    logStore.listeners.add(onStoreChange);
    return () => {
      logStore.listeners.delete(onStoreChange);
    };
  }, []);

  const lastRef = useRef<{ entries: LogEntry[]; version: number } | null>(null);

  const getSnapshot = useCallback(() => {
    if (lastRef.current && lastRef.current.version === logStore.version) {
      return lastRef.current;
    }
    const snap = { entries: logStore.entries, version: logStore.version };
    lastRef.current = snap;
    return snap;
  }, []);

  const serverRef = useRef<{ entries: LogEntry[]; version: number } | null>(
    null,
  );
  const getServerSnapshot = useCallback(() => {
    if (!serverRef.current) {
      serverRef.current = { entries: [], version: 0 };
    }
    return serverRef.current;
  }, []);

  const { entries } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [filter, setFilter] = useState<{
    levels: Set<LogEntry["level"]>;
    sources: Set<string>;
  }>({
    levels: new Set(["INFO", "WARN", "ERROR", "DEBUG"]),
    sources: new Set(),
  });

  const filteredEntries = useMemo(() => {
    return entries.filter(
      (e) =>
        filter.levels.has(e.level) &&
        (filter.sources.size === 0 || filter.sources.has(e.source)),
    );
  }, [entries, filter]);

  const toggleLevel = useCallback((level: LogEntry["level"]) => {
    setFilter((prev) => {
      const next = new Set(prev.levels);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return { ...prev, levels: next };
    });
  }, []);

  const toggleSource = useCallback((source: string) => {
    setFilter((prev) => {
      const next = new Set(prev.sources);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return { ...prev, sources: next };
    });
  }, []);

  return {
    entries: filteredEntries,
    allEntries: entries,
    filter,
    toggleLevel,
    toggleSource,
    setFilter,
  };
}
