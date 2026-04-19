import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { OutcomeWindow } from "@/types/history";

export const outcomeWindows = pgTable(
  "outcome_windows",
  {
    orderId: text("order_id").primaryKey(),
    symbol: text("symbol").notNull(),
    direction: text("direction").$type<OutcomeWindow["direction"]>().notNull(),
    entryPrice: numeric("entry_price", { mode: "number" }).notNull(),
    entryTime: timestamp("entry_time", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    returnAt5m: numeric("return_at_5m", { mode: "number" }),
    returnAt15m: numeric("return_at_15m", { mode: "number" }),
    returnAt1h: numeric("return_at_1h", { mode: "number" }),
    returnAt4h: numeric("return_at_4h", { mode: "number" }),
    exitPrice: numeric("exit_price", { mode: "number" }),
    exitTime: timestamp("exit_time", {
      mode: "string",
      withTimezone: true,
    }),
    realizedPnl: numeric("realized_pnl", { mode: "number" }),
    realizedSlippageBps: numeric("realized_slippage_bps", {
      mode: "number",
    }),
    featureSnapshot: jsonb("feature_snapshot")
      .$type<Record<string, number>>()
      .notNull(),
    decisionConfidence: numeric("decision_confidence", {
      mode: "number",
    }).notNull(),
    expectedNetEdgeBps: numeric("expected_net_edge_bps", {
      mode: "number",
    }).notNull(),
    regime: text("regime").notNull(),
    selectedEngine: text("selected_engine").notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    index("outcome_windows_symbol_updated_at_idx").on(
      table.symbol,
      table.updatedAt,
    ),
    index("outcome_windows_regime_engine_idx").on(
      table.regime,
      table.selectedEngine,
    ),
  ],
);
