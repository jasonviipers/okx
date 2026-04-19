import "server-only";

import { env } from "@/env";
import { getAccountOverview } from "@/lib/okx/account";
import { parseNumber } from "@/lib/runtime-utils";
import { getOpenPositions } from "@/lib/store/open-positions";
import { SWARM_THRESHOLDS } from "@/lib/swarm/thresholds";
import type { PortfolioState, SymbolAllocation } from "@/types/portfolio";

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function getMaxSymbolAllocationPct(): number {
  const legacyDefault = parseNumber(
    env.AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT,
    SWARM_THRESHOLDS.DEFAULT_MAX_SYMBOL_ALLOCATION_PCT,
  );
  return Math.max(
    0.01,
    Math.min(1, parseNumber(env.MAX_SYMBOL_ALLOCATION_PCT, legacyDefault)),
  );
}

/**
 * Single source of truth for portfolio state. Import this wherever
 * cross-symbol concentration or budget decisions are needed.
 * Do NOT recompute inline in autonomy/service.ts or autoExecute.ts.
 */
export async function buildPortfolioState(
  symbols: string[],
  liveTradingBudgetUsd: number,
): Promise<PortfolioState> {
  const [openPositions, accountOverview] = await Promise.all([
    getOpenPositions(),
    getAccountOverview(),
  ]);
  const uniqueSymbols = [
    ...new Set([
      ...symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
      ...openPositions.map((position) => position.instId),
    ]),
  ];
  const maxAllocationPct = getMaxSymbolAllocationPct();
  const totalDeployedUsd = openPositions.reduce((sum, position) => {
    const referencePrice = position.lastKnownPrice ?? position.entryPrice;
    return sum + position.remainingSize * Math.max(referencePrice, 0);
  }, 0);
  const totalBudgetUsd =
    liveTradingBudgetUsd > 0
      ? liveTradingBudgetUsd
      : Math.max(
          accountOverview.totalEquity,
          accountOverview.cashAvailableUsd,
          0,
        );
  const allocations: SymbolAllocation[] = uniqueSymbols.map((symbol) => {
    const currentNotionalUsd = openPositions
      .filter((position) => position.instId === symbol)
      .reduce((sum, position) => {
        const referencePrice = position.lastKnownPrice ?? position.entryPrice;
        return sum + position.remainingSize * Math.max(referencePrice, 0);
      }, 0);
    const allocationPct =
      totalDeployedUsd > 0 ? currentNotionalUsd / totalDeployedUsd : 0;
    const maxAllocationUsd = totalBudgetUsd * maxAllocationPct;

    return {
      symbol,
      currentNotionalUsd: round(currentNotionalUsd),
      allocationPct: round(allocationPct, 6),
      maxAllocationPct: round(maxAllocationPct, 6),
      budgetRemainingUsd: round(
        Math.max(0, maxAllocationUsd - currentNotionalUsd),
      ),
    };
  });

  return {
    totalDeployedUsd: round(totalDeployedUsd),
    totalBudgetUsd: round(totalBudgetUsd),
    utilizationPct:
      totalBudgetUsd > 0
        ? round(Math.min(1, totalDeployedUsd / totalBudgetUsd), 6)
        : 0,
    symbols: allocations,
    computedAt: new Date().toISOString(),
  };
}
