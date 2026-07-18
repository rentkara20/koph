PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_supplier_rfq` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_supplier_rfq`("id", "sourcing_request_id", "supplier_id", "status", "sent_at", "created_at", "updated_at") SELECT "id", "sourcing_request_id", "supplier_id", "status", "sent_at", "created_at", "updated_at" FROM `supplier_rfq`;--> statement-breakpoint
DROP TABLE `supplier_rfq`;--> statement-breakpoint
ALTER TABLE `__new_supplier_rfq` RENAME TO `supplier_rfq`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `supplier_rfq_request_idx` ON `supplier_rfq` (`sourcing_request_id`);--> statement-breakpoint
CREATE INDEX `supplier_rfq_supplier_idx` ON `supplier_rfq` (`supplier_id`);