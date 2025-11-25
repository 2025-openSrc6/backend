CREATE TABLE `shop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text(20) NOT NULL,
	`name` text(100) NOT NULL,
	`description` text,
	`price` integer NOT NULL,
	`currency` text(10) NOT NULL,
	`tier` text(20),
	`metadata` text,
	`image_url` text,
	`available` integer DEFAULT true NOT NULL,
	`requires_nickname` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shop_items_category` ON `shop_items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_shop_items_available` ON `shop_items` (`available`);