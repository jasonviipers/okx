import {
  bigint,
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import type { OpenPositionRecord } from "@/lib/store/open-positions";

export const openPositions = pgTable(
  "open_positions",
  {
    orderId: text("order_id").primaryKey(),
    instId: text("inst_id").notNull(),
    direction: text("direction")
      .$type<OpenPositionRecord["direction"]>()
      .notNull(),
    entryPrice: numeric("entry_price", { mode: "number" }).notNull(),
    size: numeric("size", { mode: "number" }).notNull(),
    remainingSize: numeric("remaining_size", { mode: "number" }).notNull(),
    stopLoss: numeric("stop_loss", { mode: "number" }),
    takeProfitLevels: jsonb("take_profit_levels").$type<number[]>().notNull(),
    tpHitCount: bigint("tp_hit_count", { mode: "number" }).notNull(),
    trailingStopActive: boolean("trailing_stop_active").notNull(),
    trailingStopPrice: numeric("trailing_stop_price", { mode: "number" }),
    trailingStopAnchorPrice: numeric("trailing_stop_anchor_price", {
      mode: "number",
    }),
    trailingStopDistancePct: numeric("trailing_stop_distance_pct", {
      mode: "number",
    }).notNull(),
    exchangePositionMissingCount: bigint("exchange_position_missing_count", {
      mode: "number",
    }).notNull(),
    lastKnownPrice: numeric("last_known_price", { mode: "number" }),
    lastCheckedAt: bigint("last_checked_at", { mode: "number" }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("open_positions_inst_id_idx").on(table.instId),
    index("open_positions_timestamp_idx").on(table.timestamp),
  ],
);
