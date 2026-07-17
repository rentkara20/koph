CREATE TABLE `supplier_return` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`purchase_order_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`resolution` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`reason` text NOT NULL,
	`rma_reference` text,
	`replacement_asset_id` text,
	`returned_at` integer,
	`resolved_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`replacement_asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `supplier_return_asset_idx` ON `supplier_return` (`asset_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `supplier_return_po_idx` ON `supplier_return` (`purchase_order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `supplier_return_status_idx` ON `supplier_return` (`status`);