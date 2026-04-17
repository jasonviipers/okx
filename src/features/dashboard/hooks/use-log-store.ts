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

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "auth",
  "apikey",
  "api_key",
  "secret",
  "authorization",
  "cookie",
  "stack",
]);

function sanitizeValue(value: unknown, maxLen = 200): string {
  if (value == null) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

function sanitizePayload(payload: unknown): string | undefined {
  if (payload == null) return undefined;
  if (typeof payload === "string") return sanitizeValue(payload);
  if (typeof payload === "object") {
    try {
      const obj = payload as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        sanitized[key] = SENSITIVE_KEYS.has(key.toLowerCase())
          ? "[REDACTED]"
          : val;
      }
      return sanitizeValue(JSON.stringify(sanitized));
    } catch {
      return sanitizeValue(payload);
    }
  }
  return sanitizeValue(payload);
}

function sanitizeMessage(message: string): string {
  return message.length > 500 ? message.slice(0, 500) + "…" : message;
}

export function addLog(
  level: LogEntry["level"],
  source: string,
  message: string,
  payload?: unknown,
) {
  const entry: LogEntry = {
    id: `log-${++logIdCounter}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message: sanitizeMessage(message),
    payload: sanitizePayload(payload),
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
