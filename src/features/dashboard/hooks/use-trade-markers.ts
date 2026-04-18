"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredTradeExecution } from "@/types/history";

interface TradeMarker {
  time: number;
  side: "buy" | "sell";
  price: number;
  size: number;
  id: string;
}

async function fetchTradeHistory(limit = 200): Promise<StoredTradeExecution[]> {
  const res = await fetch(`/api/ai/trade/history?limit=${limit}`);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data: { entries: StoredTradeExecution[] };
  };
  return json.data?.entries ?? [];
}

function toMarkers(
  trades: StoredTradeExecution[],
  symbol: string,
): TradeMarker[] {
  return trades
    .filter(
      (t) =>
        t.symbol === symbol &&
        t.order.status === "filled" &&
        (t.order.filledPrice ?? t.order.referencePrice) !== undefined,
    )
    .map((t) => ({
      time: new Date(t.order.filledAt ?? t.order.createdAt).getTime() / 1000,
      side: t.order.side,
      price: t.order.filledPrice ?? t.order.referencePrice ?? 0,
      size: t.order.size,
      id: t.id,
    }))
    .sort((a, b) => a.time - b.time);
}

export function useTradeMarkers(symbol: string): {
  markers: TradeMarker[];
  loading: boolean;
} {
  const [markers, setMarkers] = useState<TradeMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    try {
      const trades = await fetchTradeHistory();
      setMarkers(toMarkers(trades, symbol));
    } catch {
      // keep previous markers on error
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    doFetch();
    timerRef.current = setInterval(doFetch, 10_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [doFetch]);

  return { markers, loading };
}

export type { TradeMarker };
