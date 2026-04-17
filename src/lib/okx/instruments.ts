import "server-only";

import { OKX_ENDPOINTS } from "@/lib/configs/okx";
import { okxPublicGet } from "@/lib/okx/client";
import { getCachedJson, setCachedJson } from "@/lib/redis/swarm-cache";
import type { AccountAssetBalance } from "@/types/trade";

interface OkxInstrumentRow {
  instId: string;
  instType?: string;
  quoteCcy?: string;
  tickSz: string;
  lotSz: string;
  minSz: string;
  state?: string;
}

export interface InstrumentRules {
  symbol: string;
  tickSize: number;
  lotSize: number;
  minSize: number;
  state: string;
}

const DEFAULT_AUTONOMOUS_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "BNB-USDT",
  "XRP-USDT",
  "ADA-USDT",
  "DOGE-USDT",
  "LINK-USDT",
] as const;
const DEFAULT_AUTONOMOUS_QUOTES = ["USDT", "EUR", "USDC"] as const;
const INSTRUMENTS_CACHE_KEY = "okx:spot-instruments";
const INSTRUMENTS_CACHE_TTL_SECONDS = 300;

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getInstrumentRules(
  symbol: string,
): Promise<InstrumentRules> {
  const [row] = await okxPublicGet<OkxInstrumentRow>(
    OKX_ENDPOINTS.instruments,
    new URLSearchParams({
      instType: "SPOT",
      instId: symbol,
    }),
  );

  return {
    symbol,
    tickSize: toNumber(row?.tickSz, 0.00000001),
    lotSize: toNumber(row?.lotSz, 0.00000001),
    minSize: toNumber(row?.minSz, 0),
    state: row?.state ?? "live",
  };
}

export function normalizeOrderSize(size: number, lotSize: number): number {
  if (lotSize <= 0) {
    return size;
  }

  return Math.floor(size / lotSize) * lotSize;
}

function parseSymbolList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueUppercase(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
}

function extractBaseAsset(symbol: string): string {
  return symbol.split("-")[0]?.trim().toUpperCase() ?? symbol.trim().toUpperCase();
}

function getDefaultAutonomousBases(): string[] {
  return DEFAULT_AUTONOMOUS_SYMBOLS.map(extractBaseAsset);
}

export function getConfiguredAutonomousBaseAssets(
  explicitSymbols?: string[],
): string[] {
  const sourceSymbols =
    explicitSymbols && explicitSymbols.length > 0
      ? explicitSymbols
      : parseSymbolList(process.env.AUTONOMOUS_SYMBOLS);
  const bases =
    sourceSymbols.length > 0
      ? sourceSymbols.map(extractBaseAsset)
      : getDefaultAutonomousBases();

  return uniqueUppercase(bases);
}

export function getConfiguredAutonomousQuoteCurrencies(): string[] {
  const configured = uniqueUppercase([
    ...parseSymbolList(process.env.AUTONOMOUS_QUOTE_CURRENCIES),
    ...parseSymbolList(process.env.AUTONOMOUS_QUOTE_CURRENCY),
  ]);

  return uniqueUppercase([
    ...configured,
    ...DEFAULT_AUTONOMOUS_QUOTES,
  ]);
}

export function getQuoteCurrenciesFromBalances(
  balances: AccountAssetBalance[],
): string[] {
  return balances
    .filter(
      (balance) =>
        balance.availableBalance > 0 &&
        (balance.usdValue > 0 || balance.availableBalance >= 1),
    )
    .sort((left, right) => {
      const leftRank = left.usdValue > 0 ? left.usdValue : left.availableBalance;
      const rightRank =
        right.usdValue > 0 ? right.usdValue : right.availableBalance;
      return rightRank - leftRank;
    })
    .map((balance) => balance.currency.trim().toUpperCase());
}

async function listSpotInstrumentRows(): Promise<OkxInstrumentRow[]> {
  const cached = await getCachedJson<OkxInstrumentRow[]>(INSTRUMENTS_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const rows = await okxPublicGet<OkxInstrumentRow>(
    OKX_ENDPOINTS.instruments,
    new URLSearchParams({
      instType: "SPOT",
    }),
  );
  await setCachedJson(INSTRUMENTS_CACHE_KEY, rows, INSTRUMENTS_CACHE_TTL_SECONDS);
  return rows;
}

export async function listSpotInstruments(quoteCurrency = "USDT") {
  const rows = await listSpotInstrumentRows();

  return rows
    .filter(
      (row) =>
        row.instId &&
        (row.state ?? "live") === "live" &&
        (row.quoteCcy?.toUpperCase() ??
          row.instId.split("-")[1]?.toUpperCase()) ===
          quoteCurrency.toUpperCase(),
    )
    .map((row) => row.instId);
}

export async function getAutonomousSymbolUniverse(options?: {
  explicitSymbols?: string[];
  quoteCurrencies?: string[];
  limit?: number;
}): Promise<string[]> {
  const limit = Math.max(
    1,
    Math.min(
      20,
      options?.limit ?? parseNumber(process.env.AUTONOMOUS_SYMBOL_LIMIT, 8),
    ),
  );
  const baseAssets = getConfiguredAutonomousBaseAssets(options?.explicitSymbols);
  const quoteCurrencies = uniqueUppercase([
    ...(options?.quoteCurrencies ?? []),
    ...getConfiguredAutonomousQuoteCurrencies(),
  ]);
  const rows = await listSpotInstrumentRows();
  const rankedSymbols: string[] = [];

  for (const quoteCurrency of quoteCurrencies) {
    const matchesForQuote = rows
      .filter((row) => {
        const quote =
          row.quoteCcy?.toUpperCase() ??
          row.instId.split("-")[1]?.toUpperCase() ??
          "";
        const base = extractBaseAsset(row.instId);

        return (
          row.instId &&
          (row.state ?? "live") === "live" &&
          quote === quoteCurrency &&
          baseAssets.includes(base)
        );
      })
      .sort((left, right) => {
        const leftBaseIndex = baseAssets.indexOf(extractBaseAsset(left.instId));
        const rightBaseIndex = baseAssets.indexOf(extractBaseAsset(right.instId));
        return leftBaseIndex - rightBaseIndex;
      })
      .map((row) => row.instId);

    rankedSymbols.push(...matchesForQuote);
  }

  const uniqueSymbols = [...new Set(rankedSymbols)];
  if (uniqueSymbols.length > 0) {
    return uniqueSymbols.slice(0, limit);
  }

  return [...DEFAULT_AUTONOMOUS_SYMBOLS].slice(0, limit);
}
