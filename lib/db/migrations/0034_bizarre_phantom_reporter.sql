PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_commercial_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text,
	`chosen_quotation_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_quotation_id`) REFERENCES `supplier_quotation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_commercial_evaluation`("id", "sourcing_request_id", "chosen_quotation_id", "status", "notes", "created_by", "created_at", "updated_at") SELECT "id", "sourcing_request_id", "chosen_quotation_id", "status", "notes", "created_by", "created_at", "updated_at" FROM `commercial_evaluation`;--> statement-breakpoint
DROP TABLE `commercial_evaluation`;--> statement-breakpoint
ALTER TABLE `__new_commercial_evaluation` RENAME TO `commercial_evaluation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `commercial_evaluation_request_idx` ON `commercial_evaluation` (`sourcing_request_id`);