import type { AccountAssetBalance } from "@/types/trade";

export function parseSpotSymbol(
  symbol?: string,
): { base: string; quote: string } | null {
  if (!symbol) {
    return null;
  }

  const parts = symbol.split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    base: parts[0],
    quote: parts[1],
  };
}

export function approximateAvailableUsd(balance?: AccountAssetBalance): number {
  if (!balance || balance.availableBalance <= 0) {
    return 0;
  }

  if (balance.equity > 0 && balance.usdValue > 0) {
    return balance.usdValue * (balance.availableBalance / balance.equity);
  }

  return balance.availableBalance;
}
