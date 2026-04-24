import "server-only";

import { env } from "@/env";
import {
  getOkxAccountModeLabel,
  getOkxPrivateAuthHint,
  getOkxTradeModeForMarketType,
  hasOkxTradingCredentials,
  OKX_ENDPOINTS,
} from "@/lib/configs/okx";
import { OkxRequestError, okxPrivateGet } from "@/lib/okx/client";
import {
  estimateInstrumentNotionalUsd,
  estimateInstrumentUnitNotionalUsd,
  getConfiguredAutonomousQuoteCurrencies,
  getInstrumentRules,
} from "@/lib/okx/instruments";
import { getTicker } from "@/lib/okx/market";
import {
  isDerivativeMarketType,
  resolveMarketType,
} from "@/lib/okx/market-types";
import { parseNumber } from "@/lib/runtime-utils";
import { approximateAvailableUsd } from "@/lib/trade-utils";
import type {
  AccountAssetBalance,
  AccountOverview,
  TradingBuyingPower,
} from "@/types/trade";

interface OkxBalanceDetailRow {
  ccy: string;
  cashBal: string;
  availBal: string;
  availEq: string;
  disEq?: string;
  upl?: string;
}

interface OkxBalanceRow {
  totalEq: string;
  isoEq: string;
  adjEq: string;
  availEq: string;
  imr?: string;
  mmr?: string;
  notionalUsd?: string;
  upl?: string;
  details: OkxBalanceDetailRow[];
}

interface OkxMaxSizeRow {
  ccy?: string;
  instId: string;
  maxBuy: string;
  maxSell: string;
}

interface OkxFundingBalanceRow {
  ccy: string;
  bal: string;
  availBal?: string;
  frozenBal?: string;
}

interface CachedAccountState {
  balance?: OkxBalanceRow;
  fundingBalances: OkxFundingBalanceRow[];
  fetchedAt: number;
  warning?: string;
}

const DEFAULT_ACCOUNT_CACHE_TTL_MS = 5_000;
const DEFAULT_ACCOUNT_STALE_FALLBACK_MS = 120_000;
const DEFAULT_CASH_LIKE_CURRENCIES = [
  "USD",
  "USDT",
  "USDC",
  "EUR",
  "GBP",
  "DAI",
  "FDUSD",
  "TUSD",
] as const;

let cachedAccountState: CachedAccountState | null = null;
let inFlightAccountState: Promise<CachedAccountState> | null = null;

function accountCacheTtlMs(): number {
  return parseNumber(
    env.OKX_ACCOUNT_CACHE_TTL_MS,
    DEFAULT_ACCOUNT_CACHE_TTL_MS,
  );
}

function accountStaleFallbackMs(): number {
  return parseNumber(
    env.OKX_ACCOUNT_STALE_FALLBACK_MS,
    DEFAULT_ACCOUNT_STALE_FALLBACK_MS,
  );
}

function mergeWarnings(
  ...warnings: Array<string | undefined>
): string | undefined {
  const merged = warnings
    .map((warning) => warning?.trim())
    .filter((warning): warning is string => Boolean(warning));

  return merged.length > 0 ? merged.join(" ") : undefined;
}

function toMarginRatio(imr?: string, mmr?: string): number | undefined {
  const initial = parseNumber(imr, 0);
  const maintenance = parseNumber(mmr, 0);
  if (initial <= 0 || maintenance <= 0) {
    return undefined;
  }

  return maintenance / initial;
}

function toCurrencyKey(currency: string | undefined): string {
  return currency?.trim().toUpperCase() ?? "";
}

function mapTradingBalances(
  details: OkxBalanceDetailRow[] | undefined,
): AccountAssetBalance[] {
  return (details ?? [])
    .map((detail) => ({
      currency: detail.ccy,
      equity: parseNumber(detail.cashBal, 0),
      availableBalance: parseNumber(detail.availBal, 0),
      availableEquity: parseNumber(detail.availEq, 0),
      usdValue: parseNumber(detail.disEq, 0),
      unrealizedPnl: parseNumber(detail.upl, 0),
    }))
    .filter((detail) => detail.equity !== 0 || detail.availableBalance !== 0)
    .sort((a, b) => b.usdValue - a.usdValue);
}

function mapFundingBalances(
  rows: OkxFundingBalanceRow[] | undefined,
): AccountAssetBalance[] {
  return (rows ?? [])
    .map((row) => ({
      currency: row.ccy,
      equity: parseNumber(row.bal, 0),
      availableBalance: parseNumber(row.availBal ?? row.bal, 0),
      availableEquity: parseNumber(row.availBal ?? row.bal, 0),
      usdValue: 0,
      unrealizedPnl: 0,
    }))
    .filter((detail) => detail.equity !== 0 || detail.availableBalance !== 0)
    .sort((a, b) => b.equity - a.equity);
}

function buildEmptyBuyingPower(symbol?: string): TradingBuyingPower {
  const marketType = symbol ? resolveMarketType(symbol) : undefined;

  return {
    symbol,
    marketType,
    buy: 0,
    sell: 0,
    buyUnit: marketType === "spot" ? "quote" : "contract",
    sellUnit: marketType === "spot" ? "base" : "contract",
    buyNotionalUsd: 0,
    sellNotionalUsd: 0,
    tdMode: marketType ? getOkxTradeModeForMarketType(marketType) : "cash",
    posSide:
      marketType && isDerivativeMarketType(marketType) ? "net" : undefined,
    shortingSupported: marketType ? isDerivativeMarketType(marketType) : false,
  };
}

function buildCashAvailableUsd(
  tradingBalances: AccountAssetBalance[],
  symbol?: string,
): number {
  const quoteFromSymbol =
    resolveMarketType(symbol) === "spot"
      ? symbol?.split("-")[1]?.trim().toUpperCase()
      : undefined;
  const quoteCurrencies = new Set(
    [
      ...DEFAULT_CASH_LIKE_CURRENCIES,
      ...getConfiguredAutonomousQuoteCurrencies(),
      quoteFromSymbol,
    ]
      .map(toCurrencyKey)
      .filter(Boolean),
  );

  return tradingBalances.reduce((sum, balance) => {
    if (!quoteCurrencies.has(toCurrencyKey(balance.currency))) {
      return sum;
    }

    return sum + approximateAvailableUsd(balance);
  }, 0);
}

function buildEmptyOverview(
  symbol?: string,
  warning?: string,
): AccountOverview {
  return {
    totalEquity: 0,
    availableEquity: 0,
    cashAvailableUsd: 0,
    adjustedEquity: 0,
    isoEquity: 0,
    unrealizedPnl: 0,
    buyingPower: buildEmptyBuyingPower(symbol),
    tradingBalances: [],
    fundingBalances: [],
    accountMode: getOkxAccountModeLabel(),
    updatedAt: new Date().toISOString(),
    warning,
  };
}

export function buildUnavailableAccountOverview(
  symbol?: string,
  warning?: string,
): AccountOverview {
  return buildEmptyOverview(symbol, warning);
}

async function fetchAccountStateFromOkx(): Promise<CachedAccountState> {
  const [balanceRows, fundingBalanceRows] = await Promise.all([
    okxPrivateGet<OkxBalanceRow>(OKX_ENDPOINTS.balance),
    okxPrivateGet<OkxFundingBalanceRow>(OKX_ENDPOINTS.fundingBalances).catch(
      (error) => {
        if (
          error instanceof OkxRequestError &&
          (error.status === 400 ||
            error.status === 401 ||
            error.status === 403 ||
            error.status === 404)
        ) {
          return [] as OkxFundingBalanceRow[];
        }

        throw error;
      },
    ),
  ]);

  return {
    balance: balanceRows[0],
    fundingBalances: fundingBalanceRows,
    fetchedAt: Date.now(),
  };
}

async function getCachedAccountState(): Promise<CachedAccountState> {
  if (
    cachedAccountState &&
    Date.now() - cachedAccountState.fetchedAt <= accountCacheTtlMs()
  ) {
    return cachedAccountState;
  }

  if (inFlightAccountState) {
    return inFlightAccountState;
  }

  inFlightAccountState = (async () => {
    try {
      const nextState = await fetchAccountStateFromOkx();
      cachedAccountState = nextState;
      return nextState;
    } catch (error) {
      if (
        error instanceof OkxRequestError &&
        error.status === 429 &&
        cachedAccountState &&
        Date.now() - cachedAccountState.fetchedAt <= accountStaleFallbackMs()
      ) {
        return {
          ...cachedAccountState,
          warning:
            "Using the last known account snapshot because OKX rate-limited the private account API (429).",
        };
      }

      throw error;
    } finally {
      inFlightAccountState = null;
    }
  })();

  return inFlightAccountState;
}

function getTradingBalance(
  tradingBalances: AccountAssetBalance[],
  currency: string | undefined,
) {
  if (!currency) {
    return undefined;
  }

  return tradingBalances.find(
    (detail) => detail.currency.trim().toUpperCase() === currency.toUpperCase(),
  );
}

function buildFallbackBuyingPower(
  symbol: string | undefined,
  tradingBalances: AccountAssetBalance[],
): TradingBuyingPower {
  return {
    ...buildEmptyBuyingPower(symbol),
    buy: tradingBalances.reduce(
      (sum, balance) => sum + balance.availableBalance,
      0,
    ),
    buyUnit: "currency",
  };
}

async function buildSpotBuyingPower(input: {
  symbol: string;
  tradingBalances: AccountAssetBalance[];
}): Promise<TradingBuyingPower> {
  const instrumentRules = await getInstrumentRules(input.symbol, "spot");
  const quoteBalance = getTradingBalance(
    input.tradingBalances,
    instrumentRules.quoteCurrency,
  );
  const baseBalance = getTradingBalance(
    input.tradingBalances,
    instrumentRules.baseCurrency,
  );

  return {
    symbol: input.symbol,
    marketType: "spot",
    quoteCurrency: instrumentRules.quoteCurrency,
    baseCurrency: instrumentRules.baseCurrency,
    settleCurrency: instrumentRules.settleCurrency,
    buy: Math.max(quoteBalance?.availableBalance ?? 0, 0),
    sell: Math.max(baseBalance?.availableBalance ?? 0, 0),
    buyUnit: "quote",
    sellUnit: "base",
    buyNotionalUsd: Math.max(approximateAvailableUsd(quoteBalance), 0),
    sellNotionalUsd: Math.max(approximateAvailableUsd(baseBalance), 0),
    tdMode: "cash",
    shortingSupported: false,
  };
}

async function buildDerivativeBuyingPower(
  symbol: string,
): Promise<{ buyingPower: TradingBuyingPower; warning?: string }> {
  const instrumentRules = await getInstrumentRules(symbol);
  const tdMode = getOkxTradeModeForMarketType(instrumentRules.marketType);
  let rows: OkxMaxSizeRow[] = [];
  let warning: string | undefined;

  try {
    rows = await okxPrivateGet<OkxMaxSizeRow>(
      OKX_ENDPOINTS.maxSize,
      new URLSearchParams({
        instId: symbol,
        tdMode,
      }),
    );
  } catch (error) {
    if (error instanceof OkxRequestError && error.status === 400) {
      warning =
        "OKX rejected the derivative size lookup for this instrument. Balance data is still available.";
    } else {
      throw error;
    }
  }

  const ticker = await getTicker(symbol);
  const contractSizeUsd = estimateInstrumentUnitNotionalUsd(
    instrumentRules,
    ticker.last,
  );
  const maxSize = rows[0];
  const buy = Math.max(parseNumber(maxSize?.maxBuy, 0), 0);
  const sell = Math.max(parseNumber(maxSize?.maxSell, 0), 0);

  return {
    buyingPower: {
      symbol,
      marketType: instrumentRules.marketType,
      quoteCurrency: instrumentRules.quoteCurrency,
      baseCurrency: instrumentRules.baseCurrency,
      settleCurrency: instrumentRules.settleCurrency,
      buy,
      sell,
      buyUnit: "contract",
      sellUnit: "contract",
      buyNotionalUsd: estimateInstrumentNotionalUsd(
        instrumentRules,
        ticker.last,
        buy,
      ),
      sellNotionalUsd: estimateInstrumentNotionalUsd(
        instrumentRules,
        ticker.last,
        sell,
      ),
      contractSizeUsd,
      tdMode,
      shortingSupported: true,
    },
    warning,
  };
}

export async function getAccountOverview(
  symbol?: string,
): Promise<AccountOverview> {
  const emptyOverview = buildEmptyOverview(
    symbol,
    !hasOkxTradingCredentials()
      ? "OKX private credentials are not configured."
      : undefined,
  );

  if (!hasOkxTradingCredentials()) {
    return emptyOverview;
  }

  try {
    const accountState = await getCachedAccountState();
    const balance = accountState.balance;
    const fundingBalanceRows = accountState.fundingBalances;
    const tradingBalances = mapTradingBalances(balance?.details);
    const fundingBalances = mapFundingBalances(fundingBalanceRows);
    const marketType = symbol ? resolveMarketType(symbol) : undefined;
    const buyingPowerResult =
      symbol && isDerivativeMarketType(marketType)
        ? await buildDerivativeBuyingPower(symbol)
        : symbol
          ? {
              buyingPower: await buildSpotBuyingPower({
                symbol,
                tradingBalances,
              }),
              warning: undefined,
            }
          : {
              buyingPower: buildFallbackBuyingPower(symbol, tradingBalances),
              warning: undefined,
            };

    const totalAvailableEquity = parseNumber(balance?.availEq, 0);
    const derivedAvailableEquity =
      totalAvailableEquity > 0
        ? totalAvailableEquity
        : tradingBalances.reduce(
            (sum, detail) => sum + approximateAvailableUsd(detail),
            0,
          );
    const cashAvailableUsd = buildCashAvailableUsd(tradingBalances, symbol);

    return {
      totalEquity: parseNumber(balance?.totalEq, 0),
      availableEquity: derivedAvailableEquity,
      cashAvailableUsd,
      adjustedEquity: parseNumber(balance?.adjEq, 0),
      isoEquity: parseNumber(balance?.isoEq, 0),
      unrealizedPnl: parseNumber(balance?.upl, 0),
      marginRatio: toMarginRatio(balance?.imr, balance?.mmr),
      notionalUsd: parseNumber(balance?.notionalUsd, 0),
      buyingPower: buyingPowerResult.buyingPower,
      tradingBalances,
      fundingBalances,
      accountMode: getOkxAccountModeLabel(),
      updatedAt: new Date(accountState.fetchedAt).toISOString(),
      warning: mergeWarnings(buyingPowerResult.warning, accountState.warning),
    };
  } catch (error) {
    if (
      error instanceof OkxRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return buildEmptyOverview(
        symbol,
        `OKX private account request was rejected. ${getOkxPrivateAuthHint()}`,
      );
    }

    throw error;
  }
}
