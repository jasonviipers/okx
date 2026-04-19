import "server-only";

import {
  getOkxAccountModeLabel,
  hasOkxTradingCredentials,
  OKX_ENDPOINTS,
} from "@/lib/configs/okx";
import {
  OkxRequestError,
  okxPrivateGet,
  okxPrivatePost,
} from "@/lib/okx/client";
import { getTicker } from "@/lib/okx/market";
import type { Order, OrderSide, OrderType, Position } from "@/types/trade";

interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  price?: number;
}

interface OkxOrderRow {
  ordId: string;
}

interface OkxPositionRow {
  instId: string;
  posSide: "long" | "short" | "net";
  pos: string;
  avgPx: string;
  upl: string;
  uplRatio: string;
  cTime: string;
  markPx?: string;
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
  const params = new URLSearchParams({
    instType: "SPOT",
  });

  if (symbol) {
    params.set("instId", symbol);
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
  const referencePrice = input.price ?? (await getTicker(input.symbol)).last;
  const notionalUsd = Number((referencePrice * input.size).toFixed(8));
  const orderType = input.type === "market" ? "market" : "limit";

  if (!hasOkxTradingCredentials()) {
    return {
      id: `sim_${Date.now()}`,
      symbol: input.symbol,
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
    };
  }

  const response = await okxPrivatePost<OkxOrderRow>(OKX_ENDPOINTS.placeOrder, {
    instId: input.symbol,
    tdMode: "cash",
    side: input.side,
    ordType: orderType,
    sz: String(input.size),
    px: input.price ? String(input.price) : undefined,
    // The execution layer computes `size` in base units. For SPOT market
    // orders, OKX defaults BUY quantities to quote_ccy unless tgtCcy is set.
    tgtCcy: orderType === "market" ? "base_ccy" : undefined,
  });

  return {
    id: response[0]?.ordId ?? `okx_${Date.now()}`,
    symbol: input.symbol,
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

  const tickers = await Promise.all(rows.map((row) => getTicker(row.instId)));
  const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  return rows
    .filter((row) => Number(row.pos) !== 0)
    .map((row) => {
      const currentPrice = Number(
        row.markPx ?? tickerMap.get(row.instId)?.last ?? row.avgPx,
      );
      return {
        symbol: row.instId,
        side: row.posSide === "short" ? "sell" : "buy",
        size: Number(row.pos),
        entryPrice: Number(row.avgPx),
        currentPrice,
        pnl: Number(row.upl),
        pnlPercent: Number(row.uplRatio) * 100,
        openedAt: new Date(Number(row.cTime)).toISOString(),
      } satisfies Position;
    });
}
