import type { StrategyPerformanceSummary } from "@/types/history";
import type { AccountMode } from "@/types/trade";

export type TradingPerformanceState =
  | "disabled"
  | "no_history"
  | "blocked"
  | "flat"
  | "active";

export interface PerformanceBlockerFrequency {
  layer: string;
  code: string;
  summary: string;
  count: number;
}

export interface TradingPerformanceAudit {
  state: TradingPerformanceState;
  headline: string;
  accountMode: AccountMode;
  autonomyConfigured: boolean;
  autonomyRunning: boolean;
  currentEquityUsd: number | null;
  cashAvailableUsd: number | null;
  referenceCapitalUsd: number;
  equitySource: "account" | "configured_budget" | "unknown";
  configuredBudgetUsd: number;
  budgetRemainingUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  netPnlUsd: number;
  netReturnPct: number | null;
  attemptsTotal: number;
  successfulAttempts: number;
  heldAttempts: number;
  failedAttempts: number;
  fillsTotal: number;
  filledBuys: number;
  filledSells: number;
  blockedSwarmRuns: number;
  realizedTradeCount: number;
  winRate: number;
  openPositionCount: number;
  openPositionNotionalUsd: number;
  lastFillAt?: string;
  firstRecordedAt?: string;
  observedDays: number | null;
  hoursSinceLastFill: number | null;
  deterministicVoteMismatchCount: number;
  topBlockers: PerformanceBlockerFrequency[];
  notes: string[];
}

export interface TradingPerformancePayload {
  audit: TradingPerformanceAudit;
  strategyBreakdown: StrategyPerformanceSummary[];
}
