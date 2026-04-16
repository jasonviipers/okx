import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Timeframe } from "@/types/market";
import type { TradeSignal } from "@/types/swarm";

export const swarmMemory = sqliteTable("swarm_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").$type<Timeframe>().notNull(),
  signal: text("signal").$type<TradeSignal>().notNull(),
  confidence: real("confidence").notNull(),
  agreement: real("agreement").notNull(),
  blocked: integer("blocked", { mode: "boolean" }).notNull(),
  blockReason: text("block_reason"),
  price: real("price").notNull(),
  change24h: real("change24h").notNull(),
  spreadBps: real("spread_bps").notNull(),
  volatilityPct: real("volatility_pct").notNull(),
  imbalance: real("imbalance").notNull(),
  summary: text("summary").notNull(),
});
