CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`round_key` text(100) NOT NULL,
	`type` text(10) NOT NULL,
	`status` text(20) DEFAULT 'SCHEDULED' NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`lock_time` integer NOT NULL,
	`gold_start_price` text,
	`gold_end_price` text,
	`btc_start_price` text,
	`btc_end_price` text,
	`winner` text(10),
	`total_gold_bets` integer DEFAULT 0,
	`total_btc_bets` integer DEFAULT 0,
	`total_pool` integer DEFAULT 0,
	`sui_pool_address` text(66),
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_round_key_unique` ON `rounds` (`round_key`);--> statement-breakpoint
CREATE INDEX `rounds_status_idx` ON `rounds` (`status`);--> statement-breakpoint
CREATE INDEX `rounds_type_idx` ON `rounds` (`type`);--> statement-breakpoint
CREATE INDEX `rounds_start_time_idx` ON `rounds` (`start_time`);--> statement-breakpoint
CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_address` text(66) NOT NULL,
	`prediction` text(10) NOT NULL,
	`amount` integer NOT NULL,
	`currency` text(10) NOT NULL,
	`payout` integer,
	`sui_tx_hash` text(66),
	`created_at` integer,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bets_round_idx` ON `bets` (`round_id`);--> statement-breakpoint
CREATE INDEX `bets_user_idx` ON `bets` (`user_address`);--> statement-breakpoint
CREATE INDEX `bets_round_user_idx` ON `bets` (`round_id`,`user_address`);