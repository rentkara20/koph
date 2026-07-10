PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_order` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`invoice_ref` text,
	`ordered_at` integer,
	`notes` text,
	`procurement_case_id` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procurement_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_purchase_order`("id", "supplier_id", "po_number", "status", "invoice_ref", "ordered_at", "notes", "procurement_case_id", "created_by", "created_at", "updated_at") SELECT "id", "supplier_id", "po_number", "status", "invoice_ref", "ordered_at", "notes", "procurement_case_id", "created_by", "created_at", "updated_at" FROM `purchase_order`;--> statement-breakpoint
DROP TABLE `purchase_order`;--> statement-breakpoint
ALTER TABLE `__new_purchase_order` RENAME TO `purchase_order`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_order_po_number_unique` ON `purchase_order` (`po_number`);--> statement-breakpoint
CREATE INDEX `purchase_order_supplier_idx` ON `purchase_order` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_case_idx` ON `purchase_order` (`procurement_case_id`);