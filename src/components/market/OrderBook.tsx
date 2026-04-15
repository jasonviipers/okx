"use client";

import type { OrderBook as OrderBookData } from "@/types/market";

interface OrderBookProps {
  orderbook: OrderBookData;
}

export function OrderBook({ orderbook }: OrderBookProps) {
  return (
    <div className="bloomberg-panel h-full flex flex-col">
      <div className="bloomberg-panel-header">
        <h3>Order Book</h3>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {orderbook.asks.length}×{orderbook.bids.length}
        </span>
      </div>

      <table className="bloomberg-table flex-1">
        <thead>
          <tr>
            <th className="text-right bloomberg-col-md">Price</th>
            <th className="text-right bloomberg-col-sm">Size</th>
            <th className="text-right bloomberg-col-sm">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...orderbook.asks].reverse().map((ask) => (
            <tr key={`ask-${ask.price}-${ask.size}`}>
              <td className="text-right bloomberg-value-negative tabular-nums">
                {ask.price}
              </td>
              <td className="text-right text-[var(--foreground)] tabular-nums">
                {ask.size}
              </td>
              <td className="text-right text-[var(--muted-foreground)] tabular-nums">
                {ask.size.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-center text-[10px] text-[var(--terminal-gold)] py-0.5 border-y border-[var(--border)] tabular-nums font-bold">
        Spread:{" "}
        {(
          (orderbook.asks[0]?.price ?? 0) - (orderbook.bids[0]?.price ?? 0)
        ).toFixed(2)}
      </div>

      <table className="bloomberg-table">
        <tbody>
          {orderbook.bids.map((bid) => (
            <tr key={`bid-${bid.price}-${bid.size}`}>
              <td className="text-right bloomberg-value-positive tabular-nums bloomberg-col-md">
                {bid.price}
              </td>
              <td className="text-right text-[var(--foreground)] tabular-nums bloomberg-col-sm">
                {bid.size}
              </td>
              <td className="text-right text-[var(--muted-foreground)] tabular-nums bloomberg-col-sm">
                {bid.size.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
