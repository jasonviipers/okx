export type SymbolAllocation = {
  symbol: string;
  currentNotionalUsd: number;
  allocationPct: number;
  maxAllocationPct: number;
  budgetRemainingUsd: number;
};

export type PortfolioState = {
  totalDeployedUsd: number;
  totalBudgetUsd: number;
  utilizationPct: number;
  symbols: SymbolAllocation[];
  computedAt: string;
};
