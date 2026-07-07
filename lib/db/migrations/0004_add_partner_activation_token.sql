CREATE TABLE `asset_event` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`request_id` text,
	`customer_id` text,
	`notes` text,
	`by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_event_asset_idx` ON `asset_event` (`asset_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `order_unit` ADD `purchase_date` integer;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `warranty_end` integer;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `asset_tag` text;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `location` text DEFAULT 'main_warehouse' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `current_request_id` text;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `current_customer_id` text;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `retired_at` integer;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `retirement_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `order_unit_asset_tag_idx` ON `order_unit` (`asset_tag`);--> statement-breakpoint
ALTER TABLE `partner` ADD `activation_token` text;--> statement-breakpoint
ALTER TABLE `partner` ADD `activation_token_expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `partner_activation_token_unique` ON `partner` (`activation_token`);--> statement-breakpoint
CREATE INDEX `customer_contact_customer_idx` ON `customer_contact` (`customer_id`);--> statement-breakpoint
CREATE INDEX `request_customer_idx` ON `request` (`customer_id`);--> statement-breakpoint
CREATE INDEX `request_status_idx` ON `request` (`status`);