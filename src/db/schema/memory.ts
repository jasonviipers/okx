import {
  boolean,
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import type { Timeframe } from "@/types/market";
import type { TradeSignal } from "@/types/swarm";

export const swarmMemory = pgTable(
  "swarm_memory",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").$type<Timeframe>().notNull(),
    signal: text("signal").$type<TradeSignal>().notNull(),
    confidence: numeric("confidence", { mode: "number" }).notNull(),
    agreement: numeric("agreement", { mode: "number" }).notNull(),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason"),
    price: numeric("price", { mode: "number" }).notNull(),
    change24h: numeric("change24h", { mode: "number" }).notNull(),
    spreadBps: numeric("spread_bps", { mode: "number" }).notNull(),
    volatilityPct: numeric("volatility_pct", { mode: "number" }).notNull(),
    imbalance: numeric("imbalance", { mode: "number" }).notNull(),
    summary: text("summary").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("swarm_memory_created_at_idx").on(table.createdAt),
    index("swarm_memory_symbol_timeframe_created_at_idx").on(
      table.symbol,
      table.timeframe,
      table.createdAt,
    ),
    index("swarm_memory_embedding_cosine_idx")
      .using("ivfflat", table.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  ],
);
