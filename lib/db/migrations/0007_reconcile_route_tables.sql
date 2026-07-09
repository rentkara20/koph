-- Reconciliation migration: these three tables existed in schema.ts and in the
-- drizzle snapshot, but no .sql migration ever created them — they were only
-- created in production out-of-band via POST /api/admin/migrate. A fresh
-- `drizzle-kit migrate` (new env / staging) was therefore missing them.
-- This migration adds the missing DDL so every environment converges.
--
-- Shapes mirror meta/0006_snapshot.json exactly (so `drizzle-kit generate`
-- stays silent). IF NOT EXISTS makes this a safe no-op on production, which
-- already has these tables (all currently 0 rows).
CREATE TABLE IF NOT EXISTS `maintenance_order` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`issue` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`cost` real,
	`vendor_notes` text,
	`opened_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `maintenance_order_asset_idx` ON `maintenance_order` (`asset_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `maintenance_order_status_idx` ON `maintenance_order` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_portal_token` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `customer_portal_token_customer_id_unique` ON `customer_portal_token` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `customer_portal_token_token_unique` ON `customer_portal_token` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_callback_request` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`request_id` text,
	`kind` text NOT NULL,
	`message` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `customer_callback_customer_idx` ON `customer_callback_request` (`customer_id`);
