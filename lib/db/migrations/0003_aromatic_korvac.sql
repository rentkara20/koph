CREATE TABLE `order_line` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`rental_months` integer,
	`unit_price_monthly` real,
	`line_total` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_line_order_idx` ON `order_line` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`order_line_id` text NOT NULL,
	`order_id` text NOT NULL,
	`serial_number` text,
	`supplier_id` text,
	`purchase_cost` real,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_line`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_unit_order_idx` ON `order_unit` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_unit_line_idx` ON `order_unit` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_unit_status_idx` ON `order_unit` (`status`);--> statement-breakpoint
CREATE INDEX `order_unit_serial_idx` ON `order_unit` (`serial_number`);--> statement-breakpoint
CREATE TABLE `order` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`contact_person` text,
	`contact_mobile` text,
	`contact_email` text,
	`quote_date` integer,
	`rental_period_months` integer,
	`additional_period_months` integer,
	`total` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_order_number_unique` ON `order` (`order_number`);--> statement-breakpoint
CREATE INDEX `order_customer_idx` ON `order` (`customer_id`);--> statement-breakpoint
CREATE TABLE `supplier` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`address` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `request_item` ADD `order_unit_id` text REFERENCES order_unit(id);