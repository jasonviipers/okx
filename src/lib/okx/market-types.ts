import "server-only";

import { env } from "@/env";
import type { MarketType } from "@/types/trade";

export type OkxInstType = "SPOT" | "FUTURES" | "SWAP";

export const OKX_SUPPORTED_MARKET_TYPES: readonly MarketType[] = [
  "spot",
  "futures",
  "swap",
];

export function normalizeMarketType(
  value: string | null | undefined,
): MarketType | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "spot":
      return "spot";
    case "futures":
    case "future":
      return "futures";
    case "swap":
    case "perp":
    case "perpetual":
      return "swap";
    default:
      return undefined;
  }
}

export function toOkxInstType(marketType: MarketType): OkxInstType {
  switch (marketType) {
    case "futures":
      return "FUTURES";
    case "swap":
      return "SWAP";
    default:
      return "SPOT";
  }
}

export function fromOkxInstType(
  instType: string | null | undefined,
): MarketType | undefined {
  switch ((instType ?? "").trim().toUpperCase()) {
    case "FUTURES":
      return "futures";
    case "SWAP":
      return "swap";
    case "SPOT":
      return "spot";
    default:
      return undefined;
  }
}

export function inferMarketTypeFromSymbol(symbol?: string): MarketType {
  const normalized = symbol?.trim().toUpperCase() ?? "";
  if (normalized.endsWith("-SWAP")) {
    return "swap";
  }

  if (/-\d{6,8}$/.test(normalized)) {
    return "futures";
  }

  return "spot";
}

export function resolveMarketType(
  symbol?: string,
  explicitMarketType?: MarketType | null,
): MarketType {
  return explicitMarketType ?? inferMarketTypeFromSymbol(symbol);
}

export function isDerivativeMarketType(
  marketType: MarketType | null | undefined,
): boolean {
  return marketType === "futures" || marketType === "swap";
}

function parseConfiguredMarketTypes(value: string | undefined): MarketType[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((entry) => normalizeMarketType(entry))
        .filter((entry): entry is MarketType => entry !== undefined),
    ),
  ];
}

export function getConfiguredAutonomousMarketTypes(): MarketType[] {
  const configured = parseConfiguredMarketTypes(env.AUTONOMOUS_MARKET_TYPES);
  return configured.length > 0 ? configured : [...OKX_SUPPORTED_MARKET_TYPES];
}
