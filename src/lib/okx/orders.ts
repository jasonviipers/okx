import "server-only";

import {
  getConfiguredPosSideForOrder,
  getOkxAccountModeLabel,
  getOkxTradeModeForMarketType,
  hasOkxTradingCredentials,
  OKX_ENDPOINTS,
} from "@/lib/configs/okx";
import {
  OkxRequestError,
  okxPrivateGet,
  okxPrivatePost,
} from "@/lib/okx/client";
import {
  estimateInstrumentNotionalUsd,
  getInstrumentRules,
} from "@/lib/okx/instruments";
import { resolveMarketType, toOkxInstType } from "@/lib/okx/market-types";
import { getTicker } from "@/lib/okx/market";
import type {
  MarginMode,
  MarketType,
  Order,
  OrderSide,
  OrderType,
  Position,
  PositionSide,
} from "@/types/trade";

interface PlaceOrderInput {
  symbol: string;
  marketType?: MarketType;
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number;
  tdMode?: MarginMode;
  posSide?: PositionSide;
  reduceOnly?: boolean;
  currentPositionSide?: PositionSide;
}

interface OkxOrderRow {
  ordId: string;
}

interface OkxPositionRow {
  instId: string;
  instType?: string;
  mgnMode?: "cross" | "isolated";
  posSide: "long" | "short" | "net";
  pos: string;
  avgPx: string;
  upl: string;
  uplRatio: string;
  cTime: string;
  markPx?: string;
  notionalUsd?: string;
}

export interface OkxTradeUpdateRow {
  ordId: string;
  instId: string;
  side: OrderSide;
  state: string;
  fillPx?: string;
  fillSz?: string;
  fillTime?: string;
  fillNotionalUsd?: string;
  avgPx?: string;
  accFillSz?: string;
}

function buildTradeUpdateParams(symbol?: string) {
  const params = new URLSearchParams();

  if (symbol) {
    params.set("instId", symbol);
    params.set("instType", toOkxInstType(resolveMarketType(symbol)));
  }

  return params;
}

async function getTradeUpdatesFromEndpoint(
  path: string,
  symbol?: string,
): Promise<OkxTradeUpdateRow[]> {
  if (!hasOkxTradingCredentials()) {
    return [];
  }

  try {
    return await okxPrivateGet<OkxTradeUpdateRow>(
      path,
      buildTradeUpdateParams(symbol),
    );
  } catch (error) {
    if (
      error instanceof OkxRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return [];
    }

    throw error;
  }
}

export async function getTradeUpdates(
  symbol?: string,
): Promise<OkxTradeUpdateRow[]> {
  const [recent, archive] = await Promise.all([
    getTradeUpdatesFromEndpoint(OKX_ENDPOINTS.fills, symbol),
    getTradeUpdatesFromEndpoint(OKX_ENDPOINTS.fillsHistory, symbol),
  ]);

  return [...recent, ...archive];
}

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const marketType = resolveMarketType(input.symbol, input.marketType);
  const instrumentRules = await getInstrumentRules(input.symbol, marketType);
  const referencePrice = input.price ?? (await getTicker(input.symbol)).last;
  const notionalUsd = estimateInstrumentNotionalUsd(
    instrumentRules,
    referencePrice,
    input.size,
  );
  const orderType = input.type === "market" ? "market" : "limit";
  const tdMode = input.tdMode ?? getOkxTradeModeForMarketType(marketType);
  const posSide =
    input.posSide ??
    getConfiguredPosSideForOrder({
      marketType,
      side: input.side,
      reduceOnly: input.reduceOnly,
      currentPositionSide: input.currentPositionSide,
    });

  if (!hasOkxTradingCredentials()) {
    return {
      id: `sim_${Date.now()}`,
      symbol: input.symbol,
      marketType,
      side: input.side,
      type: input.type,
      size: input.size,
      notionalUsd,
      price: input.price,
      filledPrice: referencePrice,
      referencePrice,
      status: "filled",
      createdAt: new Date().toISOString(),
      filledAt: new Date().toISOString(),
      accountMode: getOkxAccountModeLabel(),
      tdMode,
      posSide,
      reduceOnly: input.reduceOnly,
    };
  }

  const response = await okxPrivatePost<OkxOrderRow>(OKX_ENDPOINTS.placeOrder, {
    instId: input.symbol,
    tdMode,
    side: input.side,
    posSide: marketType === "spot" ? undefined : posSide,
    ordType: orderType,
    sz: String(input.size),
    px: input.price ? String(input.price) : undefined,
    reduceOnly:
      marketType === "spot" || input.reduceOnly !== true ? undefined : "true",
    // The execution layer computes `size` in base units. For SPOT market
    // orders, OKX defaults BUY quantities to quote_ccy unless tgtCcy is set.
    tgtCcy:
      marketType === "spot" && orderType === "market" ? "base_ccy" : undefined,
  });

  return {
    id: response[0]?.ordId ?? `okx_${Date.now()}`,
    symbol: input.symbol,
    marketType,
    side: input.side,
    type: input.type,
    size: input.size,
    notionalUsd,
    price: input.price,
    referencePrice,
    status: "pending",
    createdAt: new Date().toISOString(),
    okxOrderId: response[0]?.ordId,
    accountMode: getOkxAccountModeLabel(),
    tdMode,
    posSide,
    reduceOnly: input.reduceOnly,
  };
}

export async function getPositions(): Promise<Position[]> {
  if (!hasOkxTradingCredentials()) {
    return [];
  }

  let rows: OkxPositionRow[];
  try {
    rows = await okxPrivateGet<OkxPositionRow>(OKX_ENDPOINTS.positions);
  } catch (error) {
    if (
      error instanceof OkxRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return [];
    }

    throw error;
  }

  const nonZeroRows = rows.filter((row) => Number(row.pos) !== 0);
  const tickers = await Promise.all(
    nonZeroRows.map((row) => getTicker(row.instId)),
  );
  const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  return nonZeroRows.map((row) => {
    const rawPosition = Number(row.pos);
    const currentPrice = Number(
      row.markPx ?? tickerMap.get(row.instId)?.last ?? row.avgPx,
    );
    const resolvedSide =
      row.posSide === "short" || (row.posSide === "net" && rawPosition < 0)
        ? "sell"
        : "buy";
    const size = Math.abs(rawPosition);

    return {
      symbol: row.instId,
      marketType: resolveMarketType(
        row.instId,
        row.instType === undefined
          ? undefined
          : row.instType === "SPOT"
            ? "spot"
            : row.instType === "SWAP"
              ? "swap"
              : row.instType === "FUTURES"
                ? "futures"
                : undefined,
      ),
      side: resolvedSide,
      posSide:
        row.posSide === "long" ||
        row.posSide === "short" ||
        row.posSide === "net"
          ? row.posSide
          : undefined,
      size,
      entryPrice: Number(row.avgPx),
      currentPrice,
      pnl: Number(row.upl),
      pnlPercent: Number(row.uplRatio) * 100,
      notionalUsd: Number(row.notionalUsd ?? size * currentPrice),
      marginMode: row.mgnMode,
      openedAt: new Date(Number(row.cTime)).toISOString(),
    } satisfies Position;
  });
}
