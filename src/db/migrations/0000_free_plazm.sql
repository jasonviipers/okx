CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "autonomy_state" (
	"id" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"decision" text NOT NULL,
	"confidence" numeric NOT NULL,
	"target_size" numeric NOT NULL,
	"normalized_size" numeric,
	"status" text NOT NULL,
	"reason" text,
	"response" jsonb,
	"decision_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarm_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"cached" boolean NOT NULL,
	"total_elapsed_ms" integer NOT NULL,
	"consensus" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"order" jsonb NOT NULL,
	"success" boolean NOT NULL,
	"decision_snapshot" jsonb,
	"execution_context" jsonb,
	"performance" jsonb
);
--> statement-breakpoint
CREATE TABLE "swarm_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"signal" text NOT NULL,
	"confidence" numeric NOT NULL,
	"agreement" numeric NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"price" numeric NOT NULL,
	"change24h" numeric NOT NULL,
	"spread_bps" numeric NOT NULL,
	"volatility_pct" numeric NOT NULL,
	"imbalance" numeric NOT NULL,
	"summary" text NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "open_positions" (
	"order_id" text PRIMARY KEY NOT NULL,
	"inst_id" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric NOT NULL,
	"size" numeric NOT NULL,
	"remaining_size" numeric NOT NULL,
	"stop_loss" numeric,
	"take_profit_levels" jsonb NOT NULL,
	"tp_hit_count" bigint NOT NULL,
	"trailing_stop_active" boolean NOT NULL,
	"trailing_stop_price" numeric,
	"trailing_stop_anchor_price" numeric,
	"trailing_stop_distance_pct" numeric NOT NULL,
	"exchange_position_missing_count" bigint NOT NULL,
	"last_known_price" numeric,
	"last_checked_at" bigint,
	"timestamp" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_windows" (
	"order_id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric NOT NULL,
	"entry_time" timestamp with time zone NOT NULL,
	"return_at_5m" numeric,
	"return_at_15m" numeric,
	"return_at_1h" numeric,
	"return_at_4h" numeric,
	"exit_price" numeric,
	"exit_time" timestamp with time zone,
	"realized_pnl" numeric,
	"realized_slippage_bps" numeric,
	"feature_snapshot" jsonb NOT NULL,
	"decision_confidence" numeric NOT NULL,
	"expected_net_edge_bps" numeric NOT NULL,
	"regime" text NOT NULL,
	"selected_engine" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "execution_intents_created_at_idx" ON "execution_intents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_intents_symbol_created_at_idx" ON "execution_intents" USING btree ("symbol","created_at");--> statement-breakpoint
CREATE INDEX "swarm_runs_timestamp_idx" ON "swarm_runs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "swarm_runs_symbol_timeframe_idx" ON "swarm_runs" USING btree ("symbol","timeframe");--> statement-breakpoint
CREATE INDEX "trade_executions_timestamp_idx" ON "trade_executions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "trade_executions_symbol_timestamp_idx" ON "trade_executions" USING btree ("symbol","timestamp");--> statement-breakpoint
CREATE INDEX "swarm_memory_created_at_idx" ON "swarm_memory" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "swarm_memory_symbol_timeframe_created_at_idx" ON "swarm_memory" USING btree ("symbol","timeframe","created_at");--> statement-breakpoint
CREATE INDEX "swarm_memory_embedding_cosine_idx" ON "swarm_memory" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "open_positions_inst_id_idx" ON "open_positions" USING btree ("inst_id");--> statement-breakpoint
CREATE INDEX "open_positions_timestamp_idx" ON "open_positions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "outcome_windows_symbol_updated_at_idx" ON "outcome_windows" USING btree ("symbol","updated_at");--> statement-breakpoint
CREATE INDEX "outcome_windows_regime_engine_idx" ON "outcome_windows" USING btree ("regime","selected_engine");