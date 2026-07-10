CREATE TABLE `accessory_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`accessory_item_id` text NOT NULL,
	`accessory_unit_id` text,
	`qty` integer,
	`checklist_state` text DEFAULT 'delivered' NOT NULL,
	`notes` text,
	`by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accessory_unit_id`) REFERENCES `accessory_unit`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `accessory_attachment_entity_idx` ON `accessory_attachment` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `accessory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`category` text NOT NULL,
	`requires_serial` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accessory_stock` (
	`id` text PRIMARY KEY NOT NULL,
	`accessory_item_id` text NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accessory_stock_item_location_idx` ON `accessory_stock` (`accessory_item_id`,`location`);--> statement-breakpoint
CREATE TABLE `accessory_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`accessory_item_id` text NOT NULL,
	`serial_number` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `accessory_unit_item_idx` ON `accessory_unit` (`accessory_item_id`);--> statement-breakpoint
CREATE TABLE `purchase_order_line` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`item_description` text NOT NULL,
	`brand` text,
	`model` text,
	`requires_serial` integer DEFAULT true NOT NULL,
	`qty_ordered` integer NOT NULL,
	`qty_received` integer DEFAULT 0 NOT NULL,
	`unit_cost` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_order_line_po_idx` ON `purchase_order_line` (`purchase_order_id`);--> statement-breakpoint
CREATE TABLE `purchase_order` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`invoice_ref` text,
	`ordered_at` integer,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_order_po_number_unique` ON `purchase_order` (`po_number`);--> statement-breakpoint
CREATE INDEX `purchase_order_supplier_idx` ON `purchase_order` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `warranty_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`warranty_batch_id` text NOT NULL,
	`status` text DEFAULT 'assigned_not_activated' NOT NULL,
	`activation_due_at` integer,
	`start_at` integer,
	`end_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warranty_batch_id`) REFERENCES `warranty_batch`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `warranty_assignment_asset_idx` ON `warranty_assignment` (`asset_id`);--> statement-breakpoint
CREATE INDEX `warranty_assignment_status_idx` ON `warranty_assignment` (`status`);--> statement-breakpoint
CREATE TABLE `warranty_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`warranty_product_id` text NOT NULL,
	`source` text NOT NULL,
	`purchase_order_id` text,
	`invoice_ref` text,
	`units_covered` integer DEFAULT 1 NOT NULL,
	`units_assigned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`warranty_product_id`) REFERENCES `warranty_product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `warranty_batch_product_idx` ON `warranty_batch` (`warranty_product_id`);--> statement-breakpoint
CREATE TABLE `warranty_product` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`duration_months` integer NOT NULL,
	`provider_name` text,
	`created_at` integer NOT NULL
);
