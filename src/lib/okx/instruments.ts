import "server-only";

import { env } from "@/env";
import { OKX_ENDPOINTS } from "@/lib/configs/okx";
import { okxPublicGet } from "@/lib/okx/client";
import {
  fromOkxInstType,
  getConfiguredAutonomousMarketTypes,
  isDerivativeMarketType,
  resolveMarketType,
  toOkxInstType,
} from "@/lib/okx/market-types";
import { getCachedJson, setCachedJson } from "@/lib/redis/swarm-cache";
import { parseNumber } from "@/lib/runtime-utils";
import type { AccountAssetBalance, MarketType } from "@/types/trade";

interface OkxInstrumentRow {
  instId: string;
  instType?: string;
  baseCcy?: string;
  quoteCcy?: string;
  settleCcy?: string;
  instFamily?: string;
  ctVal?: string;
  ctValCcy?: string;
  tickSz: string;
  lotSz: string;
  minSz: string;
  state?: string;
}

interface OkxTickerRow {
  instId: string;
  instType?: string;
  last: string;
  bidPx?: string;
  askPx?: string;
  vol24h?: string;
}

export interface InstrumentRules {
  symbol: string;
  marketType: MarketType;
  okxInstType: "SPOT" | "FUTURES" | "SWAP";
  baseCurrency?: string;
  quoteCurrency?: string;
  settleCurrency?: string;
  family?: string;
  contractValue: number;
  contractValueCurrency?: string;
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
const INSTRUMENTS_CACHE_TTL_SECONDS = 300;
const TICKERS_CACHE_TTL_SECONDS = 30;

function getInstrumentCacheKey(marketType: MarketType) {
  return `okx:instruments:${toOkxInstType(marketType).toLowerCase()}`;
}

function getTickersCacheKey(marketType: MarketType) {
  return `okx:tickers:${toOkxInstType(marketType).toLowerCase()}`;
}

function parseSymbolList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function uniqueUppercase(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim().toUpperCase()).filter(Boolean),
    ),
  ];
}

function extractBaseAsset(symbol: string): string {
  return (
    symbol.split("-")[0]?.trim().toUpperCase() ?? symbol.trim().toUpperCase()
  );
}

function extractQuoteAsset(symbol: string): string {
  return symbol.split("-")[1]?.trim().toUpperCase() ?? "";
}

function isLeveragedToken(baseAsset: string): boolean {
  return /(BULL|BEAR|[235]L|[235]S)$/i.test(baseAsset);
}

function getDefaultAutonomousBases(): string[] {
  return DEFAULT_AUTONOMOUS_SYMBOLS.map(extractBaseAsset);
}

function toInstrumentRules(
  row: OkxInstrumentRow,
  symbol: string,
): InstrumentRules {
  const marketType = fromOkxInstType(row.instType) ?? resolveMarketType(symbol);

  return {
    symbol,
    marketType,
    okxInstType: toOkxInstType(marketType),
    baseCurrency: row.baseCcy?.trim().toUpperCase(),
    quoteCurrency: row.quoteCcy?.trim().toUpperCase(),
    settleCurrency: row.settleCcy?.trim().toUpperCase(),
    family: row.instFamily?.trim().toUpperCase(),
    contractValue: parseNumber(row.ctVal, 0),
    contractValueCurrency: row.ctValCcy?.trim().toUpperCase(),
    tickSize: parseNumber(row.tickSz, 0.00000001),
    lotSize: parseNumber(row.lotSz, 0.00000001),
    minSize: parseNumber(row.minSz, 0),
    state: row.state ?? "live",
  };
}

async function listInstrumentRowsForMarketType(
  marketType: MarketType,
): Promise<OkxInstrumentRow[]> {
  const cacheKey = getInstrumentCacheKey(marketType);
  const cached = await getCachedJson<OkxInstrumentRow[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await okxPublicGet<OkxInstrumentRow>(
    OKX_ENDPOINTS.instruments,
    new URLSearchParams({
      instType: toOkxInstType(marketType),
    }),
  );
  await setCachedJson(cacheKey, rows, INSTRUMENTS_CACHE_TTL_SECONDS);
  return rows;
}

async function listTickerRowsForMarketType(
  marketType: MarketType,
): Promise<OkxTickerRow[]> {
  const cacheKey = getTickersCacheKey(marketType);
  const cached = await getCachedJson<OkxTickerRow[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await okxPublicGet<OkxTickerRow>(
    OKX_ENDPOINTS.tickers,
    new URLSearchParams({
      instType: toOkxInstType(marketType),
    }),
  );
  await setCachedJson(cacheKey, rows, TICKERS_CACHE_TTL_SECONDS);
  return rows;
}

async function findInstrumentRowBySymbol(
  symbol: string,
  explicitMarketType?: MarketType,
): Promise<OkxInstrumentRow | undefined> {
  const preferred = resolveMarketType(symbol, explicitMarketType);
  const marketTypes: MarketType[] = explicitMarketType
    ? [preferred]
    : [preferred, ...getConfiguredAutonomousMarketTypes()].filter(
        (value, index, values) => values.indexOf(value) === index,
      );

  for (const marketType of marketTypes) {
    const rows = await listInstrumentRowsForMarketType(marketType);
    const row = rows.find(
      (candidate) =>
        candidate.instId.trim().toUpperCase() === symbol.toUpperCase(),
    );
    if (row) {
      return row;
    }
  }

  return undefined;
}

export async function getInstrumentRules(
  symbol: string,
  explicitMarketType?: MarketType,
): Promise<InstrumentRules> {
  const row = await findInstrumentRowBySymbol(symbol, explicitMarketType);
  if (row) {
    return toInstrumentRules(row, symbol);
  }

  const marketType = resolveMarketType(symbol, explicitMarketType);
  return {
    symbol,
    marketType,
    okxInstType: toOkxInstType(marketType),
    baseCurrency: extractBaseAsset(symbol),
    quoteCurrency: extractQuoteAsset(symbol),
    tickSize: 0.00000001,
    lotSize: 0.00000001,
    minSize: 0,
    contractValue: 0,
    state: "live",
  };
}

export function normalizeOrderSize(size: number, lotSize: number): number {
  if (lotSize <= 0) {
    return size;
  }

  return Math.floor(size / lotSize) * lotSize;
}

export function getConfiguredAutonomousBaseAssets(
  explicitSymbols?: string[],
): string[] {
  const sourceSymbols =
    explicitSymbols && explicitSymbols.length > 0
      ? explicitSymbols
      : parseSymbolList(env.AUTONOMOUS_SYMBOLS);
  const bases =
    sourceSymbols.length > 0
      ? sourceSymbols.map(extractBaseAsset)
      : getDefaultAutonomousBases();

  return uniqueUppercase(bases);
}

export function getConfiguredAutonomousQuoteCurrencies(): string[] {
  const configured = uniqueUppercase([
    ...parseSymbolList(env.AUTONOMOUS_QUOTE_CURRENCIES),
    ...parseSymbolList(env.AUTONOMOUS_QUOTE_CURRENCY),
  ]);

  return configured.length > 0 ? configured : [...DEFAULT_AUTONOMOUS_QUOTES];
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
      const leftRank =
        left.usdValue > 0 ? left.usdValue : left.availableBalance;
      const rightRank =
        right.usdValue > 0 ? right.usdValue : right.availableBalance;
      return rightRank - leftRank;
    })
    .map((balance) => balance.currency.trim().toUpperCase());
}

function getHeldBaseAssetsFromBalances(
  balances: AccountAssetBalance[],
  quoteCurrencies: string[],
): string[] {
  const quotes = new Set(quoteCurrencies.map((quote) => quote.toUpperCase()));
  const minUsdValue = parseNumber(env.MIN_TRADE_NOTIONAL, 5);

  return uniqueUppercase(
    balances
      .filter(
        (balance) =>
          balance.availableBalance > 0 &&
          balance.usdValue >= minUsdValue &&
          !quotes.has(balance.currency.trim().toUpperCase()),
      )
      .sort((left, right) => {
        const leftRank =
          left.usdValue > 0 ? left.usdValue : left.availableBalance;
        const rightRank =
          right.usdValue > 0 ? right.usdValue : right.availableBalance;
        return rightRank - leftRank;
      })
      .map((balance) => balance.currency),
  );
}

async function listInstrumentRows(
  marketTypes: MarketType[],
): Promise<OkxInstrumentRow[]> {
  const batches = await Promise.all(
    marketTypes.map((marketType) =>
      listInstrumentRowsForMarketType(marketType),
    ),
  );
  return batches.flat();
}

async function listTickerRows(
  marketTypes: MarketType[],
): Promise<OkxTickerRow[]> {
  const batches = await Promise.all(
    marketTypes.map((marketType) => listTickerRowsForMarketType(marketType)),
  );
  return batches.flat();
}

function estimateQuoteVolume(row: OkxTickerRow): number {
  const last = parseNumber(row.last, 0);
  const vol24h = parseNumber(row.vol24h, 0);
  return last * vol24h;
}

function matchesConfiguredQuote(
  row: OkxInstrumentRow,
  quoteCurrencies: string[],
): boolean {
  if (quoteCurrencies.length === 0) {
    return true;
  }

  const quotes = new Set(quoteCurrencies.map((quote) => quote.toUpperCase()));
  const quoteCurrency = row.quoteCcy?.trim().toUpperCase();
  const settleCurrency = row.settleCcy?.trim().toUpperCase();

  return (
    (quoteCurrency ? quotes.has(quoteCurrency) : false) ||
    (settleCurrency ? quotes.has(settleCurrency) : false)
  );
}

function getQuotePreferenceIndex(
  row: OkxInstrumentRow,
  quoteCurrencies: string[],
): number {
  if (quoteCurrencies.length === 0) {
    return 0;
  }

  const normalizedQuotes = quoteCurrencies.map((quote) => quote.toUpperCase());
  const quoteCurrency = row.quoteCcy?.trim().toUpperCase();
  const settleCurrency = row.settleCcy?.trim().toUpperCase();
  const quoteIndex = quoteCurrency
    ? normalizedQuotes.indexOf(quoteCurrency)
    : -1;
  const settleIndex = settleCurrency
    ? normalizedQuotes.indexOf(settleCurrency)
    : -1;
  const candidates = [quoteIndex, settleIndex].filter((value) => value >= 0);

  return candidates.length > 0
    ? Math.min(...candidates)
    : normalizedQuotes.length;
}

function getDynamicBaseAssetsFromMarket(
  rows: OkxInstrumentRow[],
  tickers: OkxTickerRow[],
  quoteCurrencies: string[],
  limit: number,
): string[] {
  const instrumentMap = new Map(
    rows.map((row) => [row.instId.trim().toUpperCase(), row]),
  );

  return uniqueUppercase(
    tickers
      .filter((row) => {
        const symbol = row.instId.trim().toUpperCase();
        const instrument = instrumentMap.get(symbol);
        const base =
          instrument?.baseCcy?.trim().toUpperCase() ?? extractBaseAsset(symbol);

        return (
          instrument !== undefined &&
          (instrument.state ?? "live") === "live" &&
          base.length > 0 &&
          !isLeveragedToken(base) &&
          matchesConfiguredQuote(instrument, quoteCurrencies)
        );
      })
      .sort(
        (left, right) => estimateQuoteVolume(right) - estimateQuoteVolume(left),
      )
      .slice(0, Math.max(limit * 4, 24))
      .map((row) => {
        const instrument = instrumentMap.get(row.instId.trim().toUpperCase());
        return (
          instrument?.baseCcy?.trim().toUpperCase() ??
          extractBaseAsset(row.instId)
        );
      }),
  );
}

export async function listSpotInstruments(quoteCurrency = "USDT") {
  const rows = await listInstrumentRowsForMarketType("spot");

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
  balances?: AccountAssetBalance[];
  marketTypes?: MarketType[];
  limit?: number;
}): Promise<string[]> {
  const limit = Math.max(
    1,
    Math.min(20, options?.limit ?? parseNumber(env.AUTONOMOUS_SYMBOL_LIMIT, 8)),
  );
  const marketTypes =
    options?.marketTypes && options.marketTypes.length > 0
      ? options.marketTypes
      : getConfiguredAutonomousMarketTypes();
  const manualBaseAssets = getConfiguredAutonomousBaseAssets(
    options?.explicitSymbols,
  );
  const quoteCurrencies = uniqueUppercase([
    ...(options?.quoteCurrencies ?? []),
    ...getConfiguredAutonomousQuoteCurrencies(),
  ]);
  const rows = await listInstrumentRows(marketTypes);
  const tickers = await listTickerRows(marketTypes);
  const heldBaseAssets = options?.balances
    ? getHeldBaseAssetsFromBalances(options.balances, quoteCurrencies)
    : [];
  const dynamicBaseAssets = getDynamicBaseAssetsFromMarket(
    rows,
    tickers,
    quoteCurrencies,
    limit,
  );
  const baseAssets = uniqueUppercase([
    ...manualBaseAssets,
    ...dynamicBaseAssets,
    ...heldBaseAssets,
  ]);
  const tickerVolumeMap = new Map(
    tickers.map((row) => [
      row.instId.trim().toUpperCase(),
      estimateQuoteVolume(row),
    ]),
  );
  const rankedRows = rows.filter((row) => {
    const base =
      row.baseCcy?.trim().toUpperCase() ?? extractBaseAsset(row.instId);
    return (
      row.instId &&
      (row.state ?? "live") === "live" &&
      baseAssets.includes(base) &&
      matchesConfiguredQuote(row, quoteCurrencies)
    );
  });
  const preferredRowsByBase = baseAssets
    .map((baseAsset) => {
      const candidates = rankedRows
        .filter((row) => {
          const base =
            row.baseCcy?.trim().toUpperCase() ?? extractBaseAsset(row.instId);
          return base === baseAsset;
        })
        .sort((left, right) => {
          const leftQuoteIndex = getQuotePreferenceIndex(left, quoteCurrencies);
          const rightQuoteIndex = getQuotePreferenceIndex(
            right,
            quoteCurrencies,
          );
          if (leftQuoteIndex !== rightQuoteIndex) {
            return leftQuoteIndex - rightQuoteIndex;
          }

          const leftMarketIndex = marketTypes.indexOf(
            fromOkxInstType(left.instType) ?? resolveMarketType(left.instId),
          );
          const rightMarketIndex = marketTypes.indexOf(
            fromOkxInstType(right.instType) ?? resolveMarketType(right.instId),
          );
          if (leftMarketIndex !== rightMarketIndex) {
            return leftMarketIndex - rightMarketIndex;
          }

          return (
            (tickerVolumeMap.get(right.instId.trim().toUpperCase()) ?? 0) -
            (tickerVolumeMap.get(left.instId.trim().toUpperCase()) ?? 0)
          );
        });

      return candidates[0];
    })
    .filter((row): row is OkxInstrumentRow => row !== undefined);

  const secondaryRows = rankedRows
    .filter(
      (row) =>
        !preferredRowsByBase.some(
          (preferred) =>
            preferred.instId.trim().toUpperCase() ===
            row.instId.trim().toUpperCase(),
        ),
    )
    .sort((left, right) => {
      const leftBaseIndex = baseAssets.indexOf(
        left.baseCcy?.trim().toUpperCase() ?? extractBaseAsset(left.instId),
      );
      const rightBaseIndex = baseAssets.indexOf(
        right.baseCcy?.trim().toUpperCase() ?? extractBaseAsset(right.instId),
      );
      if (leftBaseIndex !== rightBaseIndex) {
        return leftBaseIndex - rightBaseIndex;
      }

      const leftQuoteIndex = getQuotePreferenceIndex(left, quoteCurrencies);
      const rightQuoteIndex = getQuotePreferenceIndex(right, quoteCurrencies);
      if (leftQuoteIndex !== rightQuoteIndex) {
        return leftQuoteIndex - rightQuoteIndex;
      }

      const leftMarketIndex = marketTypes.indexOf(
        fromOkxInstType(left.instType) ?? resolveMarketType(left.instId),
      );
      const rightMarketIndex = marketTypes.indexOf(
        fromOkxInstType(right.instType) ?? resolveMarketType(right.instId),
      );
      if (leftMarketIndex !== rightMarketIndex) {
        return leftMarketIndex - rightMarketIndex;
      }

      return (
        (tickerVolumeMap.get(right.instId.trim().toUpperCase()) ?? 0) -
        (tickerVolumeMap.get(left.instId.trim().toUpperCase()) ?? 0)
      );
    });
  const rankedSymbols = [
    ...preferredRowsByBase.map((row) => row.instId),
    ...secondaryRows.map((row) => row.instId),
  ];
  const uniqueSymbols = [...new Set(rankedSymbols)];
  if (uniqueSymbols.length > 0) {
    return uniqueSymbols.slice(0, limit);
  }

  const fallbackByVolume = [...tickers]
    .sort(
      (left, right) => estimateQuoteVolume(right) - estimateQuoteVolume(left),
    )
    .map((row) => row.instId);
  const uniqueFallback = [...new Set(fallbackByVolume)];
  if (uniqueFallback.length > 0) {
    return uniqueFallback.slice(0, limit);
  }

  return [...DEFAULT_AUTONOMOUS_SYMBOLS].slice(0, limit);
}

function isQuoteDenominatedCurrency(
  rules: InstrumentRules,
  currency: string | undefined,
): boolean {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized === rules.quoteCurrency?.toUpperCase() ||
    normalized === rules.settleCurrency?.toUpperCase() ||
    normalized === "USD" ||
    normalized === "USDT" ||
    normalized === "USDC"
  );
}

export function estimateInstrumentUnitNotionalUsd(
  rules: InstrumentRules,
  referencePrice: number,
): number {
  if (!isDerivativeMarketType(rules.marketType)) {
    return Math.max(referencePrice, 0);
  }

  if (rules.contractValue <= 0) {
    return Math.max(referencePrice, 0);
  }

  if (isQuoteDenominatedCurrency(rules, rules.contractValueCurrency)) {
    return rules.contractValue;
  }

  if (
    rules.contractValueCurrency?.toUpperCase() ===
    rules.baseCurrency?.toUpperCase()
  ) {
    return rules.contractValue * Math.max(referencePrice, 0);
  }

  return rules.contractValue * Math.max(referencePrice, 0);
}

export function estimateInstrumentNotionalUsd(
  rules: InstrumentRules,
  referencePrice: number,
  size: number,
): number {
  return Number(
    (
      estimateInstrumentUnitNotionalUsd(rules, referencePrice) *
      Math.max(size, 0)
    ).toFixed(8),
  );
}
