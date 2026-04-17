"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Timeframe } from "@/types/market";

export const DEFAULT_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "DOGE-USDT",
  "ADA-USDT",
  "AVAX-USDT",
  "DOT-USDT",
  "LINK-USDT",
  "POL-USDT",
  "SUI-USDT",
  "PEPE-USDT",
] as const;

export const DEFAULT_TIMEFRAME: Timeframe = "1H";

export const TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "1H",
  "4H",
  "1D",
  "1W",
];

interface DashboardState {
  selectedSymbol: string;
  selectedTimeframe: Timeframe;
  colorScheme: string;
  sidebarOpen: boolean;
  activeTab: string;
}

interface DashboardActions {
  setSelectedSymbol: (symbol: string) => void;
  setSelectedTimeframe: (tf: Timeframe) => void;
  setColorScheme: (scheme: string) => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: string) => void;
}

type DashboardContextValue = DashboardState & DashboardActions;

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState>({
    selectedSymbol: "BTC-USDT",
    selectedTimeframe: DEFAULT_TIMEFRAME,
    colorScheme: "phosphor",
    sidebarOpen: false,
    activeTab: "chart",
  });

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(
        "data-color-scheme",
        state.colorScheme,
      );
    }
  }, [state.colorScheme]);

  const setSelectedSymbol = useCallback((symbol: string) => {
    setState((s) => ({ ...s, selectedSymbol: symbol }));
  }, []);

  const setSelectedTimeframe = useCallback((tf: Timeframe) => {
    setState((s) => ({ ...s, selectedTimeframe: tf }));
  }, []);

  const setColorScheme = useCallback((scheme: string) => {
    setState((s) => ({ ...s, colorScheme: scheme }));
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-color-scheme", scheme);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }));
  }, []);

  const setActiveTab = useCallback((tab: string) => {
    setState((s) => ({ ...s, activeTab: tab }));
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        ...state,
        setSelectedSymbol,
        setSelectedTimeframe,
        setColorScheme,
        toggleSidebar,
        setActiveTab,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx)
    throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
