import "server-only";

import { getAutonomyStatus } from "@/lib/autonomy/service";
import { hasBrokerAccountSnapshot } from "@/lib/okx/account";
import { getManagedSpotPositionSummary, getPositions } from "@/lib/okx/orders";
import { getExecutionIntents } from "@/lib/persistence/execution-intents";
import {
  buildStrategyPerformanceSummary,
  getHistory,
  refreshOutcomeWindows,
  refreshTradeExecutionOutcomes,
} from "@/lib/persistence/history";
import type { StoredSwarmRun, StoredTradeExecution } from "@/types/history";
import type {
  PerformanceBlockerFrequency,
  TradingPerformanceAudit,
  TradingPerformancePayload,
  TradingPerformanceState,
} from "@/types/performance";

const HISTORY_LIMIT = 500;
const LEGACY_DETERMINISTIC_BLOCKERS = new Set([
  "missing_invalidation",
  "insufficient_aligned_votes",
  "aligned_confidence_below_min",
  "confidence_below_min",
  "agreement_below_min",
]);

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function toHoursSince(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }

  const millis = new Date(timestamp).getTime();
  if (!Number.isFinite(millis)) {
    return null;
  }

  return round((Date.now() - millis) / 3_600_000, 2);
}

function toObservedDays(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }

  const millis = new Date(timestamp).getTime();
  if (!Number.isFinite(millis)) {
    return null;
  }

  return round((Date.now() - millis) / 86_400_000, 2);
}

function slugifyReasonCode(input: string): string {
  const normalized = input.trim().toLowerCase();
  return (
    normalized
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "unspecified_reason"
  );
}

function isSwarmRun(
  entry: Awaited<ReturnType<typeof getHistory>>[number],
): entry is StoredSwarmRun {
  return entry.type === "swarm_run";
}

function isFilledTrade(entry: StoredTradeExecution): boolean {
  return entry.success && entry.order.status === "filled";
}

function pushFrequency(
  counts: Map<string, PerformanceBlockerFrequency>,
  reason: {
    layer: string;
    code: string;
    summary: string;
  },
) {
  const key = `${reason.layer}:${reason.code}`;
  const current = counts.get(key);

  if (current) {
    current.count += 1;
    return;
  }

  counts.set(key, {
    layer: reason.layer,
    code: reason.code,
    summary: reason.summary,
    count: 1,
  });
}

function classifyAuditState(input: {
  autonomyRunning: boolean;
  attemptsTotal: number;
  fillsTotal: number;
  netPnlUsd: number;
  referenceCapitalUsd: number;
}): {
  state: TradingPerformanceState;
  headline: string;
} {
  const flatBandUsd = Math.max(0.5, input.referenceCapitalUsd * 0.02);

  if (!input.autonomyRunning) {
    return {
      state: "disabled",
      headline:
        "Autonomy is not actively running in this workspace, so a flat balance here is expected.",
    };
  }

  if (input.attemptsTotal === 0 && input.fillsTotal === 0) {
    return {
      state: "no_history",
      headline:
        "No local trading activity has been recorded yet, so there is nothing real to score.",
    };
  }

  if (input.fillsTotal === 0 && input.attemptsTotal > 0) {
    return {
      state: "blocked",
      headline:
        "The bot is producing trade attempts, but they are not becoming filled executions.",
    };
  }

  if (Math.abs(input.netPnlUsd) <= flatBandUsd) {
    return {
      state: "flat",
      headline:
        "The bot has activity, but the measured PnL is effectively flat against the configured capital.",
    };
  }

  return {
    state: "active",
    headline:
      input.netPnlUsd > 0
        ? "The bot is active and currently net positive."
        : "The bot is active, but the current measured PnL is negative.",
  };
}

export async function buildTradingPerformanceAudit(
  regime?: string,
): Promise<TradingPerformancePayload> {
  const [
    trades,
    outcomeWindows,
    history,
    intents,
    autonomy,
    positions,
    managed,
  ] = await Promise.all([
    refreshTradeExecutionOutcomes(HISTORY_LIMIT).catch(() => []),
    refreshOutcomeWindows(HISTORY_LIMIT).catch(() => []),
    getHistory(HISTORY_LIMIT),
    getExecutionIntents(HISTORY_LIMIT),
    getAutonomyStatus(),
    getPositions().catch(() => []),
    getManagedSpotPositionSummary().catch(() => ({
      positions: [],
      unrealizedPnl: 0,
      notionalUsd: 0,
    })),
  ]);

  const strategyBreakdown = await buildStrategyPerformanceSummary(regime);
  const accountOverview = autonomy.accountOverview;
  const swarmRuns = history.filter(isSwarmRun);
  const filledTrades = trades.filter(isFilledTrade);
  const filledBuys = filledTrades.filter((trade) => trade.order.side === "buy");
  const filledSells = filledTrades.filter(
    (trade) => trade.order.side === "sell",
  );
  const realizedWindows = outcomeWindows.filter(
    (window) =>
      window.realizedPnl !== null && (!regime || window.regime === regime),
  );
  const realizedPnls = realizedWindows.flatMap((window) =>
    window.realizedPnl === null ? [] : [window.realizedPnl],
  );
  const realizedPnlUsd = round(
    realizedPnls.reduce((sum, value) => sum + value, 0),
    8,
  );
  const hasAccountSnapshot = hasBrokerAccountSnapshot(accountOverview);
  const currentEquityUsd = hasAccountSnapshot
    ? round(accountOverview.totalEquity, 8)
    : null;
  const cashAvailableUsd = hasAccountSnapshot
    ? round(accountOverview.cashAvailableUsd, 8)
    : null;
  const unrealizedPnlUsd = round(
    autonomy.accountOverview?.unrealizedPnl ?? managed.unrealizedPnl ?? 0,
    8,
  );
  const netPnlUsd = round(realizedPnlUsd + unrealizedPnlUsd, 8);
  const configuredBudgetUsd = round(
    autonomy.configuredBudgetUsd ?? autonomy.budgetUsd ?? 0,
    8,
  );
  const budgetRemainingUsd = round(autonomy.budgetRemainingUsd ?? 0, 8);
  const referenceCapitalUsd = Math.max(
    configuredBudgetUsd,
    currentEquityUsd !== null ? currentEquityUsd - netPnlUsd : 0,
    currentEquityUsd ?? 0,
    budgetRemainingUsd,
    0,
  );
  const equitySource: TradingPerformanceAudit["equitySource"] =
    currentEquityUsd !== null
      ? "account"
      : configuredBudgetUsd > 0
        ? "configured_budget"
        : "unknown";
  const netReturnPct =
    referenceCapitalUsd > 0
      ? round((netPnlUsd / referenceCapitalUsd) * 100, 4)
      : null;
  const blockedSwarmRuns = swarmRuns.filter(
    (entry) => entry.consensus.blocked || !entry.consensus.executionEligible,
  );
  const deterministicVoteMismatchCount = swarmRuns.filter(
    (entry) =>
      entry.consensus.decisionSource === "deterministic" &&
      entry.consensus.rejectionReasons.some((reason) =>
        LEGACY_DETERMINISTIC_BLOCKERS.has(reason.code),
      ),
  ).length;
  const winRate =
    realizedPnls.length > 0
      ? round(
          (realizedPnls.filter((value) => value > 0).length /
            realizedPnls.length) *
            100,
          2,
        )
      : 0;
  const timestamps = [
    ...history.map((entry) => entry.timestamp),
    ...intents.map((entry) => entry.createdAt),
    ...realizedWindows.map((window) => window.entryTime),
  ]
    .map((value) => ({
      value,
      time: new Date(value).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);
  const firstRecordedAt = timestamps[0]?.value;
  const lastFillAt = [...filledTrades].sort(
    (left, right) =>
      new Date(right.order.filledAt ?? right.timestamp).getTime() -
      new Date(left.order.filledAt ?? left.timestamp).getTime(),
  )[0];
  const blockerCounts = new Map<string, PerformanceBlockerFrequency>();

  for (const run of blockedSwarmRuns) {
    for (const reason of run.consensus.rejectionReasons) {
      pushFrequency(blockerCounts, {
        layer: reason.layer,
        code: reason.code,
        summary: reason.summary,
      });
    }
  }

  for (const intent of intents) {
    if (intent.status !== "hold" && intent.status !== "error") {
      continue;
    }

    if (intent.decisionSnapshot.rejectionReasons.length > 0) {
      for (const reason of intent.decisionSnapshot.rejectionReasons) {
        pushFrequency(blockerCounts, {
          layer: reason.layer,
          code: reason.code,
          summary: reason.summary,
        });
      }
      continue;
    }

    if (intent.reason) {
      pushFrequency(blockerCounts, {
        layer: "execution",
        code: slugifyReasonCode(intent.reason),
        summary: intent.reason,
      });
    }
  }

  const topBlockers = [...blockerCounts.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
  const classification = classifyAuditState({
    autonomyRunning: autonomy.running,
    attemptsTotal: intents.length,
    fillsTotal: filledTrades.length,
    netPnlUsd,
    referenceCapitalUsd,
  });
  const notes: string[] = [];

  if (autonomy.accountOverview?.accountMode === "paper") {
    notes.push(
      "The workspace is currently configured for paper trading, so balance movement here is simulated rather than live.",
    );
  }

  if (!hasAccountSnapshot) {
    notes.push(
      configuredBudgetUsd > 0
        ? "No broker account snapshot is available in this runtime, so return is measured against the configured trading budget instead of live equity."
        : "No broker account snapshot is available in this runtime, so equity and cash figures are not fully verifiable here.",
    );
  }

  if (!autonomy.configured) {
    notes.push(
      "AUTONOMOUS_TRADING_ENABLED is off in this workspace, which means the local runtime will stay flat unless you start it manually elsewhere.",
    );
  } else if (!autonomy.running) {
    notes.push(
      "Autonomy is configured but not currently running, so this runtime is not producing fresh executions on its own.",
    );
  }

  if (deterministicVoteMismatchCount > 0) {
    notes.push(
      "Historical runs show deterministic decisions that were still blocked by legacy vote-based validator rules.",
    );
  }

  if (strategyBreakdown.length === 0) {
    notes.push(
      "There are no closed outcome windows yet, so regime and engine win-rate stats are still incomplete.",
    );
  }

  if (topBlockers.length > 0) {
    const primary = topBlockers[0];
    notes.push(
      `The most frequent blocker in recent history is ${primary.summary.toLowerCase()} (${primary.count}x).`,
    );
  }

  const audit: TradingPerformanceAudit = {
    state: classification.state,
    headline: classification.headline,
    accountMode: autonomy.accountOverview?.accountMode ?? "paper",
    autonomyConfigured: autonomy.configured,
    autonomyRunning: autonomy.running,
    currentEquityUsd,
    cashAvailableUsd,
    referenceCapitalUsd,
    equitySource,
    configuredBudgetUsd,
    budgetRemainingUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    netPnlUsd,
    netReturnPct,
    attemptsTotal: intents.length,
    successfulAttempts: intents.filter((entry) => entry.status === "success")
      .length,
    heldAttempts: intents.filter((entry) => entry.status === "hold").length,
    failedAttempts: intents.filter((entry) => entry.status === "error").length,
    fillsTotal: filledTrades.length,
    filledBuys: filledBuys.length,
    filledSells: filledSells.length,
    blockedSwarmRuns: blockedSwarmRuns.length,
    realizedTradeCount: realizedPnls.length,
    winRate,
    openPositionCount: positions.length,
    openPositionNotionalUsd: round(
      positions.reduce(
        (sum, position) => sum + position.currentPrice * position.size,
        0,
      ),
      8,
    ),
    lastFillAt: lastFillAt?.order.filledAt ?? lastFillAt?.timestamp,
    firstRecordedAt,
    observedDays: toObservedDays(firstRecordedAt),
    hoursSinceLastFill: toHoursSince(
      lastFillAt?.order.filledAt ?? lastFillAt?.timestamp,
    ),
    deterministicVoteMismatchCount,
    topBlockers,
    notes,
  };

  return {
    audit,
    strategyBreakdown,
  };
}
