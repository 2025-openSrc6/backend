ALTER TABLE `rounds` ADD `payout_pool` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rounds_type_start_time` ON `rounds` (`type`,`start_time`);