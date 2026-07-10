CREATE TABLE `commercial_approval` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_id` text NOT NULL,
	`decision` text NOT NULL,
	`approver_id` text NOT NULL,
	`notes` text,
	`decided_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `commercial_evaluation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commercial_approval_evaluation_idx` ON `commercial_approval` (`evaluation_id`);--> statement-breakpoint
CREATE TABLE `commercial_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
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
CREATE INDEX `commercial_evaluation_request_idx` ON `commercial_evaluation` (`sourcing_request_id`);--> statement-breakpoint
CREATE TABLE `procurement_case` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`sourcing_request_id` text,
	`commercial_approval_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`erp_system` text,
	`external_po_ref` text,
	`external_po_created_at` integer,
	`previous_case_id` text,
	`superseded_by_case_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commercial_approval_id`) REFERENCES `commercial_approval`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`superseded_by_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `procurement_case_sourcing_request_idx` ON `procurement_case` (`sourcing_request_id`);--> statement-breakpoint
CREATE INDEX `procurement_case_status_idx` ON `procurement_case` (`status`);--> statement-breakpoint
CREATE TABLE `sourcing_request` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`order_id` text,
	`order_line_id` text,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_line`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sourcing_request_order_idx` ON `sourcing_request` (`order_id`);--> statement-breakpoint
CREATE INDEX `sourcing_request_status_idx` ON `sourcing_request` (`status`);--> statement-breakpoint
CREATE TABLE `supplier_quotation_line` (
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`item_description` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price` real,
	`lead_time_days` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quotation_id`) REFERENCES `supplier_quotation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplier_quotation_line_quotation_idx` ON `supplier_quotation_line` (`quotation_id`);--> statement-breakpoint
CREATE TABLE `supplier_quotation` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`valid_until` integer,
	`notes` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`rfq_id`) REFERENCES `supplier_rfq`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_quotation_rfq_idx` ON `supplier_quotation` (`rfq_id`);--> statement-breakpoint
CREATE TABLE `supplier_rfq` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_rfq_request_idx` ON `supplier_rfq` (`sourcing_request_id`);--> statement-breakpoint
CREATE INDEX `supplier_rfq_supplier_idx` ON `supplier_rfq` (`supplier_id`);--> statement-breakpoint
ALTER TABLE `purchase_order` ADD `procurement_case_id` text REFERENCES procurement_case(id);--> statement-breakpoint
CREATE INDEX `purchase_order_case_idx` ON `purchase_order` (`procurement_case_id`);