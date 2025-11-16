CREATE TABLE `chart_data` (
	`id` text PRIMARY KEY NOT NULL,
	`asset` text(10) NOT NULL,
	`timestamp` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real DEFAULT 0 NOT NULL,
	`volatility` real,
	`average_volatility` real,
	`volatility_change_rate` real,
	`volatility_score` real,
	`movement_intensity` real,
	`trend_strength` real,
	`relative_position` real,
	`rsi` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chart_data_asset_timestamp` ON `chart_data` (`asset`,`timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chart_data_unique_asset_timestamp` ON `chart_data` (`asset`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_chart_data_timestamp` ON `chart_data` (`timestamp`);--> statement-breakpoint
CREATE TABLE `volatility_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`asset` text(10) NOT NULL,
	`timestamp` integer NOT NULL,
	`std_dev` real NOT NULL,
	`percent_change` real NOT NULL,
	`atr` real,
	`bollinger_upper` real,
	`bollinger_middle` real,
	`bollinger_lower` real,
	`bollinger_bandwidth` real,
	`macd` real,
	`macd_signal` real,
	`macd_histogram` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_volatility_snapshots_asset_timestamp` ON `volatility_snapshots` (`asset`,`timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_volatility_snapshots_unique_asset_timestamp` ON `volatility_snapshots` (`asset`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_volatility_snapshots_timestamp` ON `volatility_snapshots` (`timestamp`);