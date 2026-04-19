import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { SwarmRunResult } from "@/types/swarm";
import type {
  Order,
  TradeDecisionSnapshot,
  TradeExecutionContext,
  TradePerformanceMetrics,
} from "@/types/trade";

export const swarmRuns = pgTable(
  "swarm_runs",
  {
    id: text("id").primaryKey(),
    timestamp: timestamp("timestamp", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    cached: boolean("cached").notNull(),
    totalElapsedMs: integer("total_elapsed_ms").notNull(),
    consensus: jsonb("consensus")
      .$type<SwarmRunResult["consensus"]>()
      .notNull(),
  },
  (table) => [
    index("swarm_runs_timestamp_idx").on(table.timestamp),
    index("swarm_runs_symbol_timeframe_idx").on(table.symbol, table.timeframe),
  ],
);

export const tradeExecutions = pgTable(
  "trade_executions",
  {
    id: text("id").primaryKey(),
    timestamp: timestamp("timestamp", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    symbol: text("symbol").notNull(),
    order: jsonb("order").$type<Order>().notNull(),
    success: boolean("success").notNull(),
    decisionSnapshot: jsonb("decision_snapshot").$type<TradeDecisionSnapshot>(),
    executionContext: jsonb("execution_context").$type<TradeExecutionContext>(),
    performance: jsonb("performance").$type<TradePerformanceMetrics>(),
  },
  (table) => [
    index("trade_executions_timestamp_idx").on(table.timestamp),
    index("trade_executions_symbol_timestamp_idx").on(
      table.symbol,
      table.timestamp,
    ),
  ],
);
