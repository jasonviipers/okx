import "server-only";

import { env } from "@/env";
import {
  getOkxAccountModeLabel,
  getOkxPrivateAuthHint,
  hasOkxTradingCredentials,
  OKX_ENDPOINTS,
} from "@/lib/configs/okx";
import { OkxRequestError, okxPrivateGet } from "@/lib/okx/client";
import { getConfiguredAutonomousQuoteCurrencies } from "@/lib/okx/instruments";
import { getManagedSpotPositionSummary } from "@/lib/okx/orders";
import { parseNumber } from "@/lib/runtime-utils";
import { approximateAvailableUsd, parseSpotSymbol } from "@/lib/trade-utils";
import type {
  AccountAssetBalance,
  AccountOverview,
  SpotBuyingPower,
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

interface OkxMaxAvailRow {
  availBuy: string;
  availSell: string;
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

function buildCashAvailableUsd(
  tradingBalances: AccountAssetBalance[],
  symbol?: string,
): number {
  const symbolParts = parseSpotSymbol(symbol);
  const quoteCurrencies = new Set(
    [
      ...DEFAULT_CASH_LIKE_CURRENCIES,
      ...getConfiguredAutonomousQuoteCurrencies(),
      symbolParts?.quote,
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
    buyingPower: {
      symbol,
      quoteCurrency: parseSpotSymbol(symbol)?.quote,
      baseCurrency: parseSpotSymbol(symbol)?.base,
      buy: 0,
      sell: 0,
    },
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

export function hasBrokerAccountSnapshot(
  overview: AccountOverview | undefined,
): overview is AccountOverview {
  if (!overview) {
    return false;
  }

  return (
    overview.totalEquity > 0 ||
    overview.availableEquity > 0 ||
    overview.cashAvailableUsd > 0 ||
    overview.tradingBalances.length > 0
  );
}

export function resolveEffectiveLiveTradingBudgetUsd(
  overview: AccountOverview | undefined,
  configuredBudgetUsd = 0,
): number {
  const safeConfiguredBudgetUsd = Math.max(0, configuredBudgetUsd);

  if (!hasBrokerAccountSnapshot(overview)) {
    return safeConfiguredBudgetUsd;
  }

  return Math.max(
    safeConfiguredBudgetUsd,
    overview.totalEquity,
    overview.availableEquity,
    overview.cashAvailableUsd,
  );
}

export function resolveEffectiveLiveTradingBudgetRemainingUsd(input: {
  overview?: AccountOverview;
  configuredBudgetUsd?: number;
  usedBudgetUsd?: number;
}): number {
  const configuredBudgetUsd = Math.max(0, input.configuredBudgetUsd ?? 0);

  if (hasBrokerAccountSnapshot(input.overview)) {
    return Number(
      resolveEffectiveLiveTradingBudgetUsd(
        input.overview,
        configuredBudgetUsd,
      ).toFixed(2),
    );
  }

  return configuredBudgetUsd > 0
    ? Number(
        Math.max(
          0,
          configuredBudgetUsd - Math.max(0, input.usedBudgetUsd ?? 0),
        ).toFixed(2),
      )
    : 0;
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

export async function getAccountOverview(
  symbol?: string,
): Promise<AccountOverview> {
  const managedSpotSummary = await getManagedSpotPositionSummary().catch(
    () => ({
      positions: [],
      unrealizedPnl: 0,
      notionalUsd: 0,
    }),
  );
  const emptyOverview = buildEmptyOverview(
    symbol,
    !hasOkxTradingCredentials()
      ? "OKX private credentials are not configured."
      : undefined,
  );

  if (!hasOkxTradingCredentials()) {
    return {
      ...emptyOverview,
      unrealizedPnl: managedSpotSummary.unrealizedPnl,
      notionalUsd: managedSpotSummary.notionalUsd,
    };
  }

  try {
    const symbolParts = parseSpotSymbol(symbol);
    const accountState = await getCachedAccountState();
    const balance = accountState.balance;
    const fundingBalanceRows = accountState.fundingBalances;

    let maxAvailRows: OkxMaxAvailRow[] = [];
    let buyingPowerWarning: string | undefined;

    if (symbol && !symbolParts) {
      try {
        maxAvailRows = await okxPrivateGet<OkxMaxAvailRow>(
          OKX_ENDPOINTS.maxAvailSize,
          new URLSearchParams({
            instId: symbol,
            tdMode: "cash",
          }),
        );
      } catch (error) {
        if (error instanceof OkxRequestError && error.status === 400) {
          buyingPowerWarning =
            "OKX rejected the buying power lookup for this symbol. Balance data is still available.";
        } else {
          throw error;
        }
      }
    }

    const buyingPower = maxAvailRows[0];
    const tradingBalances = mapTradingBalances(balance?.details);
    const fundingBalances = mapFundingBalances(fundingBalanceRows);
    const derivedSpotBuyingPower: SpotBuyingPower | undefined = symbolParts
      ? {
          symbol,
          quoteCurrency: symbolParts.quote,
          baseCurrency: symbolParts.base,
          buy:
            tradingBalances.find(
              (detail) => detail.currency === symbolParts.quote,
            )?.availableBalance ?? 0,
          sell:
            tradingBalances.find(
              (detail) => detail.currency === symbolParts.base,
            )?.availableBalance ?? 0,
        }
      : undefined;

    const requestBuyingPower: SpotBuyingPower = {
      symbol,
      quoteCurrency: symbolParts?.quote,
      baseCurrency: symbolParts?.base,
      buy: parseNumber(buyingPower?.availBuy, 0),
      sell: parseNumber(buyingPower?.availSell, 0),
    };

    const fallbackBuyingPower: SpotBuyingPower | undefined =
      !symbolParts && tradingBalances.length > 0
        ? {
            symbol,
            quoteCurrency: undefined,
            baseCurrency: undefined,
            buy: tradingBalances.reduce(
              (sum, b) => sum + b.availableBalance,
              0,
            ),
            sell: 0,
          }
        : undefined;

    const finalBuyingPower =
      requestBuyingPower.buy > 0 || requestBuyingPower.sell > 0
        ? requestBuyingPower
        : (fallbackBuyingPower ?? requestBuyingPower);

    const totalAvailableEquity = parseNumber(balance?.availEq, 0);
    const derivedAvailableEquity =
      totalAvailableEquity > 0
        ? totalAvailableEquity
        : tradingBalances.reduce(
            (sum, detail) => sum + approximateAvailableUsd(detail),
            0,
          );
    const cashAvailableUsd = buildCashAvailableUsd(tradingBalances, symbol);

    const brokerUnrealizedPnl = parseNumber(balance?.upl, 0);
    const brokerNotionalUsd = parseNumber(balance?.notionalUsd, 0);

    return {
      totalEquity: parseNumber(balance?.totalEq, 0),
      availableEquity: derivedAvailableEquity,
      cashAvailableUsd,
      adjustedEquity: parseNumber(balance?.adjEq, 0),
      isoEquity: parseNumber(balance?.isoEq, 0),
      unrealizedPnl: Number(
        (brokerUnrealizedPnl + managedSpotSummary.unrealizedPnl).toFixed(8),
      ),
      marginRatio: toMarginRatio(balance?.imr, balance?.mmr),
      notionalUsd: Number(
        (brokerNotionalUsd + managedSpotSummary.notionalUsd).toFixed(8),
      ),
      buyingPower: derivedSpotBuyingPower ?? finalBuyingPower,
      tradingBalances,
      fundingBalances,
      accountMode: getOkxAccountModeLabel(),
      updatedAt: new Date(accountState.fetchedAt).toISOString(),
      warning: mergeWarnings(
        derivedSpotBuyingPower ||
          maxAvailRows.length > 0 ||
          fundingBalances.length > 0
          ? undefined
          : buyingPowerWarning,
        accountState.warning,
      ),
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
