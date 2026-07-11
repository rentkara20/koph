CREATE TABLE `commercial_evaluation_line` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_id` text NOT NULL,
	`sourcing_request_item_id` text NOT NULL,
	`chosen_quotation_line_id` text NOT NULL,
	`reason` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `commercial_evaluation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourcing_request_item_id`) REFERENCES `sourcing_request_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_quotation_line_id`) REFERENCES `supplier_quotation_line`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commercial_evaluation_line_evaluation_idx` ON `commercial_evaluation_line` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `commercial_evaluation_line_item_idx` ON `commercial_evaluation_line` (`sourcing_request_item_id`);--> statement-breakpoint
CREATE TABLE `sourcing_request_item` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`customer_description` text NOT NULL,
	`supplier_description` text NOT NULL,
	`part_number` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sourcing_request_item_request_idx` ON `sourcing_request_item` (`sourcing_request_id`);--> statement-breakpoint
CREATE INDEX `sourcing_request_item_part_number_idx` ON `sourcing_request_item` (`part_number`);--> statement-breakpoint
CREATE TABLE `supplier_rfq_item` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`sourcing_request_item_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rfq_id`) REFERENCES `supplier_rfq`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourcing_request_item_id`) REFERENCES `sourcing_request_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_rfq_item_rfq_idx` ON `supplier_rfq_item` (`rfq_id`);--> statement-breakpoint
CREATE INDEX `supplier_rfq_item_item_idx` ON `supplier_rfq_item` (`sourcing_request_item_id`);--> statement-breakpoint
ALTER TABLE `procurement_case` ADD `supplier_id` text REFERENCES supplier(id);--> statement-breakpoint
ALTER TABLE `sourcing_request` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `sourcing_request` ADD `title` text;--> statement-breakpoint
CREATE INDEX `sourcing_request_external_ref_idx` ON `sourcing_request` (`external_ref`);--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `sourcing_request_item_id` text REFERENCES sourcing_request_item(id);--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `offered_part_number` text;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `offered_spec` text;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `currency` text DEFAULT 'SAR';--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `tax_rate` real;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `availability` text;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `warranty` text;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `valid_until` integer;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `upgrades_note` text;--> statement-breakpoint
ALTER TABLE `supplier_quotation_line` ADD `upgrades_cost` real;--> statement-breakpoint
CREATE INDEX `supplier_quotation_line_item_idx` ON `supplier_quotation_line` (`sourcing_request_item_id`);--> statement-breakpoint
CREATE INDEX `supplier_quotation_line_part_number_idx` ON `supplier_quotation_line` (`offered_part_number`);