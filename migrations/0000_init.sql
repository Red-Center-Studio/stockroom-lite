-- Binwright Lite: first migration. Creates every table and the single settings row.
-- Wrangler applies files in this folder in order (npm run db:migrate:local, or npm run deploy).

CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "user_role_check" CHECK("user"."role" IS NULL OR "user"."role" IN ('admin', 'manager', 'staff'))
);
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_user_idx` ON `session` (`user_id`);

CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `account_user_idx` ON `account` (`user_id`);

CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);

CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`business_name` text DEFAULT 'My Business' NOT NULL,
	`support_email` text DEFAULT '' NOT NULL,
	`setup_help_url` text DEFAULT 'https://redcenterstudio.com/binwright/' NOT NULL,
	`show_setup_offer` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`unit_system` text DEFAULT 'metric' NOT NULL,
	`date_format` text DEFAULT 'dmy' NOT NULL,
	`time_zone` text DEFAULT '' NOT NULL,
	`location_word` text DEFAULT 'Location' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
INSERT INTO `app_settings` (`id`) VALUES (1);

CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'storeroom' NOT NULL,
	`parent_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX `location_name_idx` ON `location` (`name`);

CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`supplier_code` text DEFAULT '' NOT NULL,
	`unit_cost` real,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX `item_name_idx` ON `item` (`name`);
CREATE INDEX `item_category_idx` ON `item` (`category`);

CREATE TABLE `stock_level` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`on_hand` real DEFAULT 0 NOT NULL,
	`min_qty` real,
	`par_qty` real,
	`last_counted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `stock_level_item_location_idx` ON `stock_level` (`item_id`,`location_id`);
CREATE INDEX `stock_level_location_idx` ON `stock_level` (`location_id`);

CREATE TABLE `movement` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`type` text NOT NULL,
	`qty_delta` real NOT NULL,
	`balance_after` real NOT NULL,
	`unit_cost` real,
	`reference` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`transfer_id` text,
	`user_id` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX `movement_level_idx` ON `movement` (`item_id`,`location_id`,`occurred_at`);
CREATE INDEX `movement_occurred_idx` ON `movement` (`occurred_at`);
