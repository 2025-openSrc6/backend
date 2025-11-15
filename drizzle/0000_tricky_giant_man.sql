CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`sui_address` text(80) NOT NULL,
	`nickname` text(50),
	`profile_color` text(20) DEFAULT '#3B82F6' NOT NULL,
	`del_balance` integer DEFAULT 0 NOT NULL,
	`crystal_balance` integer DEFAULT 0 NOT NULL,
	`total_bets` integer DEFAULT 0 NOT NULL,
	`total_wins` integer DEFAULT 0 NOT NULL,
	`total_volume` integer DEFAULT 0 NOT NULL,
	`last_attendance_at` integer,
	`attendance_streak` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_sui_address` ON `users` (`sui_address`);--> statement-breakpoint
CREATE INDEX `idx_users_created_at` ON `users` (`created_at`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`round_number` integer NOT NULL,
	`type` text(10) NOT NULL,
	`status` text(20) DEFAULT 'SCHEDULED' NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`lock_time` integer NOT NULL,
	`gold_start_price` text,
	`gold_end_price` text,
	`btc_start_price` text,
	`btc_end_price` text,
	`start_price_source` text(20),
	`start_price_is_fallback` integer DEFAULT false NOT NULL,
	`start_price_fallback_reason` text,
	`end_price_source` text(20),
	`end_price_is_fallback` integer DEFAULT false NOT NULL,
	`end_price_fallback_reason` text,
	`price_snapshot_start_at` integer,
	`price_snapshot_end_at` integer,
	`gold_change_percent` text,
	`btc_change_percent` text,
	`total_pool` integer DEFAULT 0 NOT NULL,
	`total_gold_bets` integer DEFAULT 0 NOT NULL,
	`total_btc_bets` integer DEFAULT 0 NOT NULL,
	`total_bets_count` integer DEFAULT 0 NOT NULL,
	`winner` text(10),
	`platform_fee_rate` text(10) DEFAULT '0.05' NOT NULL,
	`platform_fee_collected` integer DEFAULT 0 NOT NULL,
	`sui_pool_address` text(100),
	`sui_settlement_object_id` text(100),
	`betting_opened_at` integer,
	`betting_locked_at` integer,
	`round_ended_at` integer,
	`settlement_completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rounds_type_status` ON `rounds` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_rounds_start_time` ON `rounds` (`start_time`);--> statement-breakpoint
CREATE INDEX `idx_rounds_round_number` ON `rounds` (`round_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rounds_type_round_number` ON `rounds` (`type`,`round_number`);--> statement-breakpoint
CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`prediction` text(10) NOT NULL,
	`amount` integer NOT NULL,
	`currency` text(10) DEFAULT 'DEL' NOT NULL,
	`result_status` text(20) DEFAULT 'PENDING' NOT NULL,
	`settlement_status` text(20) DEFAULT 'PENDING' NOT NULL,
	`payout_amount` integer DEFAULT 0 NOT NULL,
	`sui_bet_object_id` text(100),
	`sui_tx_hash` text(130),
	`sui_payout_tx_hash` text(130),
	`sui_tx_timestamp` integer,
	`sui_payout_timestamp` integer,
	`created_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bets_round_id` ON `bets` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_user_id` ON `bets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_bets_settlement_status` ON `bets` (`settlement_status`);--> statement-breakpoint
CREATE INDEX `idx_bets_result_status` ON `bets` (`result_status`);--> statement-breakpoint
CREATE INDEX `idx_bets_created_at` ON `bets` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bets_user_round` ON `bets` (`user_id`,`round_id`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text,
	`gold_price` text NOT NULL,
	`btc_price` text NOT NULL,
	`source` text(20) NOT NULL,
	`snapshot_type` text(10) NOT NULL,
	`snapshot_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_price_snapshots_round_id` ON `price_snapshots` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_price_snapshots_snapshot_at` ON `price_snapshots` (`snapshot_at`);--> statement-breakpoint
CREATE INDEX `idx_price_snapshots_type` ON `price_snapshots` (`snapshot_type`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`winner` text(10) NOT NULL,
	`total_pool` integer NOT NULL,
	`winning_pool` integer NOT NULL,
	`losing_pool` integer NOT NULL,
	`platform_fee` integer NOT NULL,
	`payout_pool` integer NOT NULL,
	`payout_ratio` text(20) NOT NULL,
	`total_winners` integer NOT NULL,
	`total_losers` integer NOT NULL,
	`sui_settlement_object_id` text(100),
	`calculated_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settlements_round_id` ON `settlements` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_settlements_completed_at` ON `settlements` (`completed_at`);--> statement-breakpoint
CREATE TABLE `point_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text(30) NOT NULL,
	`currency` text(10) NOT NULL,
	`amount` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reference_id` text,
	`reference_type` text(20),
	`description` text,
	`sui_tx_hash` text(130),
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_point_tx_user_id` ON `point_transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_point_tx_type` ON `point_transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_point_tx_created_at` ON `point_transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_point_tx_reference` ON `point_transactions` (`reference_type`,`reference_id`);--> statement-breakpoint
CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text(20) NOT NULL,
	`tier` text(5),
	`name` text(100) NOT NULL,
	`description` text,
	`purchase_price` integer,
	`currency` text(10),
	`sui_nft_object_id` text(100),
	`ipfs_metadata_url` text,
	`image_url` text,
	`properties` text,
	`acquired_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_achievements_user_id` ON `achievements` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_achievements_type` ON `achievements` (`type`);--> statement-breakpoint
CREATE INDEX `idx_achievements_tier` ON `achievements` (`tier`);--> statement-breakpoint
CREATE TABLE `round_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`from_status` text(20) NOT NULL,
	`to_status` text(20) NOT NULL,
	`triggered_by` text(20) NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_round_transitions_round_id` ON `round_transitions` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_round_transitions_created_at` ON `round_transitions` (`created_at`);