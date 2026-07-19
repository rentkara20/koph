PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_partner_task` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`procurement_case_id` text,
	`purchase_order_id` text,
	`kind` text DEFAULT 'request' NOT NULL,
	`destination_location` text,
	`ad_hoc_title` text,
	`ad_hoc_reason` text,
	`partner_id` text NOT NULL,
	`contract_id` text,
	`contact_id` text,
	`task_type_id` text,
	`execution_mode` text DEFAULT 'manual' NOT NULL,
	`photo_required` integer DEFAULT true NOT NULL,
	`task_token` text NOT NULL,
	`task_token_expires_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`failure_reason` text,
	`failure_notes` text,
	`signoff_quantity` integer,
	`assigned_by` text,
	`assigned_at` integer,
	`accepted_at` integer,
	`completed_at` integer,
	`arrived_at` integer,
	`picked_up_at` integer,
	`closed_by` text,
	`closed_at` integer,
	`delivered_at` integer,
	`signature_received_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procurement_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `partner_contract`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `customer_contact`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "partner_task_single_origin_chk" CHECK(("__new_partner_task"."kind" = 'request' AND "__new_partner_task"."purchase_order_id" IS NULL) OR ("__new_partner_task"."kind" = 'supplier_pickup' AND "__new_partner_task"."purchase_order_id" IS NOT NULL AND "__new_partner_task"."request_id" IS NULL) OR ("__new_partner_task"."kind" = 'ad_hoc' AND "__new_partner_task"."request_id" IS NULL AND "__new_partner_task"."purchase_order_id" IS NULL AND "__new_partner_task"."procurement_case_id" IS NULL))
);
--> statement-breakpoint
-- NOTE: ad_hoc_title / ad_hoc_reason are new columns; they do NOT exist on the
-- old partner_task, so they are omitted from this copy and default to NULL for
-- existing rows. (drizzle-kit generated them into the SELECT by mistake.)
INSERT INTO `__new_partner_task`("id", "request_id", "procurement_case_id", "purchase_order_id", "kind", "destination_location", "partner_id", "contract_id", "contact_id", "task_type_id", "execution_mode", "photo_required", "task_token", "task_token_expires_at", "status", "notes", "failure_reason", "failure_notes", "signoff_quantity", "assigned_by", "assigned_at", "accepted_at", "completed_at", "arrived_at", "picked_up_at", "closed_by", "closed_at", "delivered_at", "signature_received_at", "created_at", "updated_at") SELECT "id", "request_id", "procurement_case_id", "purchase_order_id", "kind", "destination_location", "partner_id", "contract_id", "contact_id", "task_type_id", "execution_mode", "photo_required", "task_token", "task_token_expires_at", "status", "notes", "failure_reason", "failure_notes", "signoff_quantity", "assigned_by", "assigned_at", "accepted_at", "completed_at", "arrived_at", "picked_up_at", "closed_by", "closed_at", "delivered_at", "signature_received_at", "created_at", "updated_at" FROM `partner_task`;--> statement-breakpoint
DROP TABLE `partner_task`;--> statement-breakpoint
ALTER TABLE `__new_partner_task` RENAME TO `partner_task`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `partner_task_task_token_unique` ON `partner_task` (`task_token`);--> statement-breakpoint
CREATE INDEX `partner_task_request_idx` ON `partner_task` (`request_id`);--> statement-breakpoint
CREATE INDEX `partner_task_partner_status_idx` ON `partner_task` (`partner_id`,`status`);--> statement-breakpoint
CREATE INDEX `partner_task_po_idx` ON `partner_task` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `partner_task_case_idx` ON `partner_task` (`procurement_case_id`);