CREATE TABLE `swarm_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`symbol` text NOT NULL,
	`timeframe` text NOT NULL,
	`signal` text NOT NULL,
	`confidence` real NOT NULL,
	`agreement` real NOT NULL,
	`blocked` integer NOT NULL,
	`block_reason` text,
	`price` real NOT NULL,
	`change24h` real NOT NULL,
	`spread_bps` real NOT NULL,
	`volatility_pct` real NOT NULL,
	`imbalance` real NOT NULL,
	`summary` text NOT NULL
);
