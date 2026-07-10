PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`order_line_id` text,
	`order_id` text,
	`purchase_order_line_id` text,
	`purchase_order_id` text,
	`serial_number` text,
	`supplier_id` text,
	`purchase_cost` real,
	`purchase_date` integer,
	`warranty_end` integer,
	`asset_tag` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`current_request_id` text,
	`current_customer_id` text,
	`retired_at` integer,
	`retirement_reason` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_line`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_line`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_unit_single_origin_chk" CHECK(("__new_order_unit"."order_line_id" IS NOT NULL AND "__new_order_unit"."purchase_order_line_id" IS NULL) OR ("__new_order_unit"."order_line_id" IS NULL AND "__new_order_unit"."purchase_order_line_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_order_unit`("id", "order_line_id", "order_id", "purchase_order_line_id", "purchase_order_id", "serial_number", "supplier_id", "purchase_cost", "purchase_date", "warranty_end", "asset_tag", "status", "location", "current_request_id", "current_customer_id", "retired_at", "retirement_reason", "notes", "created_at", "updated_at") SELECT "id", "order_line_id", "order_id", NULL, NULL, "serial_number", "supplier_id", "purchase_cost", "purchase_date", "warranty_end", "asset_tag", "status", "location", "current_request_id", "current_customer_id", "retired_at", "retirement_reason", "notes", "created_at", "updated_at" FROM `order_unit`;--> statement-breakpoint
DROP TABLE `order_unit`;--> statement-breakpoint
ALTER TABLE `__new_order_unit` RENAME TO `order_unit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `order_unit_order_idx` ON `order_unit` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_unit_line_idx` ON `order_unit` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_unit_po_line_idx` ON `order_unit` (`purchase_order_line_id`);--> statement-breakpoint
CREATE INDEX `order_unit_status_idx` ON `order_unit` (`status`);--> statement-breakpoint
CREATE INDEX `order_unit_serial_idx` ON `order_unit` (`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_unit_asset_tag_idx` ON `order_unit` (`asset_tag`);