import "server-only";

import {
  getOkxAccountModeLabel,
  getOkxPrivateAuthHint,
  hasOkxTradingCredentials,
  OKX_ENDPOINTS,
} from "@/lib/configs/okx";
import { OkxRequestError, okxPrivateGet } from "@/lib/okx/client";
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

let cachedAccountState: CachedAccountState | null = null;
let inFlightAccountState: Promise<CachedAccountState> | null = null;

function parseSpotSymbol(
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

function toNumber(value: string | undefined): number {
  return Number(value ?? "0");
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function accountCacheTtlMs(): number {
  return parseNumber(
    process.env.OKX_ACCOUNT_CACHE_TTL_MS,
    DEFAULT_ACCOUNT_CACHE_TTL_MS,
  );
}

function accountStaleFallbackMs(): number {
  return parseNumber(
    process.env.OKX_ACCOUNT_STALE_FALLBACK_MS,
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
  const initial = toNumber(imr);
  const maintenance = toNumber(mmr);
  if (initial <= 0 || maintenance <= 0) {
    return undefined;
  }

  return maintenance / initial;
}

function mapTradingBalances(
  details: OkxBalanceDetailRow[] | undefined,
): AccountAssetBalance[] {
  return (details ?? [])
    .map((detail) => ({
      currency: detail.ccy,
      equity: toNumber(detail.cashBal),
      availableBalance: toNumber(detail.availBal),
      availableEquity: toNumber(detail.availEq),
      usdValue: toNumber(detail.disEq),
      unrealizedPnl: toNumber(detail.upl),
    }))
    .filter((detail) => detail.equity !== 0 || detail.availableBalance !== 0)
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 8);
}

function mapFundingBalances(
  rows: OkxFundingBalanceRow[] | undefined,
): AccountAssetBalance[] {
  return (rows ?? [])
    .map((row) => ({
      currency: row.ccy,
      equity: toNumber(row.bal),
      availableBalance: toNumber(row.availBal ?? row.bal),
      availableEquity: toNumber(row.availBal ?? row.bal),
      usdValue: 0,
      unrealizedPnl: 0,
    }))
    .filter((detail) => detail.equity !== 0 || detail.availableBalance !== 0)
    .sort((a, b) => b.equity - a.equity)
    .slice(0, 8);
}

function buildEmptyOverview(
  symbol?: string,
  warning?: string,
): AccountOverview {
  return {
    totalEquity: 0,
    availableEquity: 0,
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
      buy: toNumber(buyingPower?.availBuy),
      sell: toNumber(buyingPower?.availSell),
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
        : fallbackBuyingPower ?? requestBuyingPower;

    return {
      totalEquity: toNumber(balance?.totalEq),
      availableEquity: toNumber(balance?.availEq),
      adjustedEquity: toNumber(balance?.adjEq),
      isoEquity: toNumber(balance?.isoEq),
      unrealizedPnl: toNumber(balance?.upl),
      marginRatio: toMarginRatio(balance?.imr, balance?.mmr),
      notionalUsd: toNumber(balance?.notionalUsd),
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
