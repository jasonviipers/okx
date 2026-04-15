import { hasOkxTradingCredentials, OKX_ENDPOINTS } from "@/lib/configs/okx";
import { okxPrivateGet, okxPrivatePost } from "@/lib/okx/client";
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

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  if (!hasOkxTradingCredentials()) {
    const price = input.price ?? (await getTicker(input.symbol)).last;
    return {
      id: `sim_${Date.now()}`,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      size: input.size,
      price: input.price,
      filledPrice: price,
      status: "filled",
      createdAt: new Date().toISOString(),
      filledAt: new Date().toISOString(),
    };
  }

  const response = await okxPrivatePost<OkxOrderRow>(OKX_ENDPOINTS.placeOrder, {
    instId: input.symbol,
    tdMode: "cash",
    side: input.side,
    ordType: input.type === "market" ? "market" : "limit",
    sz: String(input.size),
    px: input.price ? String(input.price) : undefined,
  });

  return {
    id: response[0]?.ordId ?? `okx_${Date.now()}`,
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    size: input.size,
    price: input.price,
    status: "pending",
    createdAt: new Date().toISOString(),
    okxOrderId: response[0]?.ordId,
  };
}

export async function getPositions(): Promise<Position[]> {
  if (!hasOkxTradingCredentials()) {
    return [];
  }

  const rows = await okxPrivateGet<OkxPositionRow>(OKX_ENDPOINTS.positions);
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
