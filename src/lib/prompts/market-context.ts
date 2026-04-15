import type { MarketContext } from "@/types/market";

export function summarizeMarketContext(ctx: MarketContext): string {
  const lastCandle = ctx.candles.at(-1);
  const firstCandle = ctx.candles.at(0);
  const spreadPct =
    ctx.ticker.last > 0
      ? ((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 100
      : 0;
  const movePct =
    lastCandle && firstCandle && firstCandle.close > 0
      ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
      : 0;

  return [
    `Last price: ${ctx.ticker.last.toFixed(2)}`,
    `24h change: ${ctx.ticker.change24h.toFixed(2)}%`,
    `Spread: ${spreadPct.toFixed(3)}%`,
    `20-bar move: ${movePct.toFixed(2)}%`,
    `Bid depth: ${ctx.orderbook.bids.reduce((sum, level) => sum + level.size, 0).toFixed(4)}`,
    `Ask depth: ${ctx.orderbook.asks.reduce((sum, level) => sum + level.size, 0).toFixed(4)}`,
  ].join("\n");
}
