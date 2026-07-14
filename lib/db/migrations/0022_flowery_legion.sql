CREATE TABLE `communication_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`channel` text NOT NULL,
	`message_type` text NOT NULL,
	`recipient` text,
	`status` text DEFAULT 'prepared' NOT NULL,
	`prepared_by` text,
	`prepared_at` integer NOT NULL,
	`confirmed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `communication_log_entity_idx` ON `communication_log` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `position` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `signature_method` text DEFAULT 'electronic' NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `delivery_outcome` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `remarks` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `snapshot` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `uploaded_file_url` text;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `uploaded_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `uploaded_at` integer;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `approved_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `review_notes` text;--> statement-breakpoint
ALTER TABLE `partner_task` ADD `delivered_at` integer;--> statement-breakpoint
ALTER TABLE `partner_task` ADD `signature_received_at` integer;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `otp_hash` text;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `otp_expires_at` integer;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `otp_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `otp_verified_at` integer;