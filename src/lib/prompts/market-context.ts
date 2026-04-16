import type { MarketContext } from "@/types/market";

export function summarizeMarketContext(ctx: MarketContext): string {
  const lastCandle = ctx.candles.at(-1);
  const firstCandle = ctx.candles.at(0);
  const prevCandle = ctx.candles.at(-2);

  // ── Price metrics ──────────────────────────────────────────────
  const spreadPct =
    ctx.ticker.last > 0
      ? ((ctx.ticker.ask - ctx.ticker.bid) / ctx.ticker.last) * 100
      : 0;

  const movePct =
    lastCandle && firstCandle && firstCandle.close > 0
      ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
      : 0;

  // ── Candle anatomy ─────────────────────────────────────────────
  const candleBody = lastCandle
    ? Math.abs(lastCandle.close - lastCandle.open)
    : 0;
  const candleRange = lastCandle ? lastCandle.high - lastCandle.low : 0;
  const bodyRatio = candleRange > 0 ? (candleBody / candleRange) * 100 : 0;
  const lastDirection = lastCandle
    ? lastCandle.close >= lastCandle.open
      ? "bullish"
      : "bearish"
    : "unknown";
  const upperWick = lastCandle
    ? lastCandle.high - Math.max(lastCandle.open, lastCandle.close)
    : 0;
  const lowerWick = lastCandle
    ? Math.min(lastCandle.open, lastCandle.close) - lastCandle.low
    : 0;

  // ── Candle-over-candle momentum ────────────────────────────────
  const candleMomentum =
    lastCandle && prevCandle
      ? lastCandle.close > prevCandle.close
        ? "advancing"
        : lastCandle.close < prevCandle.close
          ? "declining"
          : "flat"
      : "n/a";

  // ── Order book depth & imbalance ───────────────────────────────
  const bidDepth = ctx.orderbook.bids.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const askDepth = ctx.orderbook.asks.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  const totalDepth = bidDepth + askDepth;
  const bidPct =
    totalDepth > 0 ? ((bidDepth / totalDepth) * 100).toFixed(1) : "0.0";
  const askPct =
    totalDepth > 0 ? ((askDepth / totalDepth) * 100).toFixed(1) : "0.0";
  const imbalanceLabel =
    totalDepth > 0
      ? bidDepth / askDepth > 1.3
        ? "bid-heavy (buying pressure)"
        : askDepth / bidDepth > 1.3
          ? "ask-heavy (selling pressure)"
          : "balanced"
      : "unknown";

  // ── Spread quality classification ─────────────────────────────
  const spreadQuality =
    spreadPct < 0.05
      ? "tight (excellent liquidity)"
      : spreadPct < 0.2
        ? "normal"
        : spreadPct < 0.5
          ? "wide (elevated friction)"
          : "very wide (high friction — penalize signal)";

  // ── Volatility proxy (range vs price) ─────────────────────────
  const rangeVsPrice =
    lastCandle && ctx.ticker.last > 0
      ? ((candleRange / ctx.ticker.last) * 100).toFixed(3)
      : "0.000";

  // ── Candle pattern flag ────────────────────────────────────────
  let candlePattern = "standard";
  if (bodyRatio < 15) {
    candlePattern = "indecision (doji/spinning top) — HOLD bias";
  } else if (bodyRatio > 75 && upperWick < candleBody * 0.1) {
    candlePattern = `strong ${lastDirection} marubozu`;
  } else if (lowerWick > candleBody * 2 && lastDirection === "bullish") {
    candlePattern = "hammer / pin bar (bullish rejection)";
  } else if (upperWick > candleBody * 2 && lastDirection === "bearish") {
    candlePattern = "shooting star / pin bar (bearish rejection)";
  }

  // ── Build the context block ────────────────────────────────────
  return [
    "╔═══════════════════════════════════════════════════════════╗",
    "  MARKET CONTEXT SNAPSHOT",
    "╚═══════════════════════════════════════════════════════════╝",
    "",
    "── PRICE & TICKER ───────────────────────────────────────────",
    `  Last price      : ${ctx.ticker.last.toFixed(2)}`,
    `  Bid / Ask       : ${ctx.ticker.bid.toFixed(2)} / ${ctx.ticker.ask.toFixed(2)}`,
    `  Spread          : ${spreadPct.toFixed(3)}%  →  ${spreadQuality}`,
    `  24h change      : ${ctx.ticker.change24h.toFixed(2)}%`,
    `  20-bar move     : ${movePct.toFixed(2)}%  (first→last close)`,
    "",
    "── LAST CANDLE ANATOMY ──────────────────────────────────────",
    `  Direction       : ${lastDirection}`,
    `  OHLC            : O ${lastCandle?.open.toFixed(2) ?? "n/a"}` +
      `  H ${lastCandle?.high.toFixed(2) ?? "n/a"}` +
      `  L ${lastCandle?.low.toFixed(2) ?? "n/a"}` +
      `  C ${lastCandle?.close.toFixed(2) ?? "n/a"}`,
    `  Body / Range    : ${bodyRatio.toFixed(1)}%  (body-to-range ratio)`,
    `  Upper wick      : ${upperWick.toFixed(4)}`,
    `  Lower wick      : ${lowerWick.toFixed(4)}`,
    `  Range vs price  : ${rangeVsPrice}%  (volatility proxy)`,
    `  Pattern flag    : ${candlePattern}`,
    `  Candle momentum : ${candleMomentum}  (vs prior bar)`,
    "",
    "── ORDER BOOK DEPTH ─────────────────────────────────────────",
    `  Bid depth       : ${bidDepth.toFixed(4)}  (${bidPct}% of total)`,
    `  Ask depth       : ${askDepth.toFixed(4)}  (${askPct}% of total)`,
    `  Book imbalance  : ${imbalanceLabel}`,
    "",
    "── AGENT NOTES ──────────────────────────────────────────────",
    "  • Spread and depth are primary execution-quality filters.",
    "    High spread or thin depth should widen stop assumptions",
    "    and reduce position sizing in risk calculations.",
    "  • Book imbalance is a short-term order flow signal; it can",
    "    reverse quickly — weight it less than candle structure.",
    "  • A low body-to-range ratio (<15%) signals indecision;",
    "    increase your HOLD bias unless confluence is very strong.",
    "  • The 20-bar move indicates medium-term momentum direction.",
    "    Counter-trend setups require significantly higher confluence.",
    "─────────────────────────────────────────────────────────────",
  ].join("\n");
}
