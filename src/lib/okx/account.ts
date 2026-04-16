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

export async function getAccountOverview(
  symbol?: string,
): Promise<AccountOverview> {
  const emptyOverview: AccountOverview = {
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
    warning: !hasOkxTradingCredentials()
      ? "OKX private credentials are not configured."
      : undefined,
  };

  if (!hasOkxTradingCredentials()) {
    return emptyOverview;
  }

  try {
    const symbolParts = parseSpotSymbol(symbol);
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
    const balance = balanceRows[0];

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

    return {
      totalEquity: toNumber(balance?.totalEq),
      availableEquity: toNumber(balance?.availEq),
      adjustedEquity: toNumber(balance?.adjEq),
      isoEquity: toNumber(balance?.isoEq),
      unrealizedPnl: toNumber(balance?.upl),
      marginRatio: toMarginRatio(balance?.imr, balance?.mmr),
      notionalUsd: toNumber(balance?.notionalUsd),
      buyingPower: derivedSpotBuyingPower ?? requestBuyingPower,
      tradingBalances,
      fundingBalances,
      accountMode: getOkxAccountModeLabel(),
      updatedAt: new Date().toISOString(),
      warning:
        derivedSpotBuyingPower ||
        maxAvailRows.length > 0 ||
        fundingBalances.length > 0
          ? undefined
          : buyingPowerWarning,
    };
  } catch (error) {
    if (
      error instanceof OkxRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return {
        ...emptyOverview,
        warning: `OKX private account request was rejected. ${getOkxPrivateAuthHint()}`,
      };
    }

    throw error;
  }
}
