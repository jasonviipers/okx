import type { MarketContext } from "@/types/market";

export function buildBaseSystemPrompt(ctx: MarketContext): string {
  return [
    "You are part of a trading swarm analyzing one market snapshot.",
    `Symbol: ${ctx.symbol}`,
    `Timeframe: ${ctx.timeframe}`,
    "Return a disciplined trade signal using only the supplied context.",
    "If the setup is unclear or risky, prefer HOLD.",
  ].join("\n");
}
