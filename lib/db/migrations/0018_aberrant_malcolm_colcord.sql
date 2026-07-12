ALTER TABLE `purchase_order_line` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD `cancel_reason` text;