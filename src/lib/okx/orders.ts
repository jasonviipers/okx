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
import { getTicker, getTickers } from "@/lib/okx/market";
import { getOpenPositions } from "@/lib/store/open-positions";
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
  tradeId?: string;
  instId: string;
  side: OrderSide;
  state: string;
  ordType?: string;
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

function toManagedPosition(input: {
  symbol: string;
  direction: "BUY" | "SELL";
  size: number;
  entryPrice: number;
  currentPrice: number;
  openedAt: string;
}): Position {
  const signedPnl =
    input.direction === "BUY"
      ? (input.currentPrice - input.entryPrice) * input.size
      : (input.entryPrice - input.currentPrice) * input.size;
  const entryNotional = input.entryPrice * input.size;

  return {
    symbol: input.symbol,
    side: input.direction === "BUY" ? "buy" : "sell",
    size: input.size,
    entryPrice: input.entryPrice,
    currentPrice: input.currentPrice,
    pnl: Number(signedPnl.toFixed(8)),
    pnlPercent:
      entryNotional > 0
        ? Number(((signedPnl / entryNotional) * 100).toFixed(4))
        : 0,
    openedAt: input.openedAt,
  };
}

export async function getManagedSpotPositions(): Promise<Position[]> {
  const openPositions = await getOpenPositions();
  const activePositions = openPositions.filter(
    (position) => position.remainingSize > 0 && position.entryPrice > 0,
  );

  if (activePositions.length === 0) {
    return [];
  }

  const tickers = await getTickers(
    activePositions.map((position) => position.instId),
  );
  const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  return activePositions.map((position) =>
    toManagedPosition({
      symbol: position.instId,
      direction: position.direction,
      size: position.remainingSize,
      entryPrice: position.entryPrice,
      currentPrice:
        tickerMap.get(position.instId)?.last ??
        position.lastKnownPrice ??
        position.entryPrice,
      openedAt: new Date(position.timestamp).toISOString(),
    }),
  );
}

export async function getManagedSpotPositionSummary(): Promise<{
  positions: Position[];
  unrealizedPnl: number;
  notionalUsd: number;
}> {
  const positions = await getManagedSpotPositions();

  return {
    positions,
    unrealizedPnl: Number(
      positions.reduce((sum, position) => sum + position.pnl, 0).toFixed(8),
    ),
    notionalUsd: Number(
      positions
        .reduce(
          (sum, position) => sum + position.currentPrice * position.size,
          0,
        )
        .toFixed(8),
    ),
  };
}

export async function getPositions(): Promise<Position[]> {
  const managedSpotPositions = await getManagedSpotPositions();

  if (!hasOkxTradingCredentials()) {
    return managedSpotPositions;
  }

  let rows: OkxPositionRow[];
  try {
    rows = await okxPrivateGet<OkxPositionRow>(OKX_ENDPOINTS.positions);
  } catch (error) {
    if (
      error instanceof OkxRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      return managedSpotPositions;
    }

    throw error;
  }

  const tickers = await getTickers(rows.map((row) => row.instId));
  const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  const derivativePositions = rows
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

  return derivativePositions.length > 0
    ? derivativePositions
    : managedSpotPositions;
}
