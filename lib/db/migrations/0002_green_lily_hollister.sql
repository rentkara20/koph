CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`i18n_key` text NOT NULL,
	`i18n_data` text,
	`link_url` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `signature_item_condition` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`request_item_id` text NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`received_quantity` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_item_id`) REFERENCES `request_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signature_item_condition_sig_idx` ON `signature_item_condition` (`signature_request_id`);--> statement-breakpoint
ALTER TABLE `customer_contact` ADD `is_authorized_signatory` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `signed_at_tz` text DEFAULT 'Asia/Riyadh' NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `audit_data_hash` text;--> statement-breakpoint
ALTER TABLE `partner_task` ADD `contact_id` text REFERENCES customer_contact(id);--> statement-breakpoint
ALTER TABLE `partner_task` ADD `execution_mode` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX `partner_task_request_idx` ON `partner_task` (`request_id`);--> statement-breakpoint
CREATE INDEX `partner_task_partner_status_idx` ON `partner_task` (`partner_id`,`status`);--> statement-breakpoint
ALTER TABLE `payment_batch` ADD `statement_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_batch_statement_token_unique` ON `payment_batch` (`statement_token`);--> statement-breakpoint
ALTER TABLE `request` ADD `receiver_contact_id` text REFERENCES customer_contact(id);--> statement-breakpoint
ALTER TABLE `request` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `request` ADD `destination` text;--> statement-breakpoint
ALTER TABLE `request` ADD `scheduled_at` integer;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `signatory_role` text DEFAULT 'receiver' NOT NULL;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `parent_signature_request_id` text;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `signatory_contact_id` text REFERENCES customer_contact(id);--> statement-breakpoint
ALTER TABLE `signature_request` ADD `verification_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `signature_request_verification_id_unique` ON `signature_request` (`verification_id`);--> statement-breakpoint
CREATE INDEX `signature_request_request_idx` ON `signature_request` (`request_id`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `partner_payment_partner_status_idx` ON `partner_payment` (`partner_id`,`status`);--> statement-breakpoint
CREATE INDEX `partner_payment_batch_idx` ON `partner_payment` (`batch_id`);