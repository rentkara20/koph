CREATE TABLE `delivery_snapshot_amendment` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`delivery_task_item_id` text NOT NULL,
	`field_changed` text NOT NULL,
	`original_value` text NOT NULL,
	`corrected_value` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delivery_task_item_id`) REFERENCES `delivery_task_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `delivery_task_item` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_task_id` text NOT NULL,
	`request_item_id` text NOT NULL,
	`qty_planned` integer NOT NULL,
	`qty_delivered` integer DEFAULT 0 NOT NULL,
	`reported_serial` text,
	`reported_by` text,
	`reported_at` integer,
	`corrected_serial` text,
	`corrected_by` text,
	`corrected_at` integer,
	`verification_status` text DEFAULT 'unreported' NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`relink_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_item_id`) REFERENCES `request_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`corrected_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_task_item_task_item_idx` ON `delivery_task_item` (`partner_task_id`,`request_item_id`);--> statement-breakpoint
CREATE INDEX `delivery_task_item_request_item_idx` ON `delivery_task_item` (`request_item_id`);--> statement-breakpoint
CREATE TABLE `partner_payment_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_task_id` text NOT NULL,
	`decision` text NOT NULL,
	`approved_amount` real,
	`reason` text,
	`decided_by` text NOT NULL,
	`decided_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_payment_decision_partner_task_id_unique` ON `partner_payment_decision` (`partner_task_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_request_item` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`serial_number` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`accessories` text,
	`notes` text,
	`order_unit_id` text,
	`delivered_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_unit_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "request_item_order_unit_qty_chk" CHECK("order_unit_id" IS NULL OR "quantity" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_request_item`("id", "request_id", "description", "brand", "model", "serial_number", "quantity", "accessories", "notes", "order_unit_id", "created_at", "updated_at") SELECT "id", "request_id", "description", "brand", "model", "serial_number", "quantity", "accessories", "notes", "order_unit_id", "created_at", "updated_at" FROM `request_item`;--> statement-breakpoint
DROP TABLE `request_item`;--> statement-breakpoint
ALTER TABLE `__new_request_item` RENAME TO `request_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;