import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { StoredExecutionIntent } from "@/types/history";
import type { TradeDecisionSnapshot } from "@/types/trade";
import type { TradeSignal } from "@/types/swarm";

export const executionIntents = pgTable(
  "execution_intents",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    decision: text("decision").$type<TradeSignal>().notNull(),
    confidence: numeric("confidence", { mode: "number" }).notNull(),
    targetSize: numeric("target_size", { mode: "number" }).notNull(),
    normalizedSize: numeric("normalized_size", { mode: "number" }),
    status: text("status").$type<StoredExecutionIntent["status"]>().notNull(),
    reason: text("reason"),
    response: jsonb("response").$type<unknown>(),
    decisionSnapshot: jsonb("decision_snapshot")
      .$type<TradeDecisionSnapshot>()
      .notNull(),
  },
  (table) => [
    index("execution_intents_created_at_idx").on(table.createdAt),
    index("execution_intents_symbol_created_at_idx").on(
      table.symbol,
      table.createdAt,
    ),
  ],
);
