CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`i18n_key` text NOT NULL,
	`i18n_data` text,
	`performed_by` text,
	`performed_as` text DEFAULT 'user' NOT NULL,
	`ip_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`performed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`uploaded_by` text,
	`upload_source` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consent_version` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`text_en` text NOT NULL,
	`text_ar` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_version_version_unique` ON `consent_version` (`version`);--> statement-breakpoint
CREATE TABLE `customer_signature` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`national_id` text,
	`signature_data` text NOT NULL,
	`consent_version` text,
	`consent_accepted_at` integer,
	`signed_at` integer NOT NULL,
	`ip_address` text,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consent_version`) REFERENCES `consent_version`(`version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_signature_signature_request_id_unique` ON `customer_signature` (`signature_request_id`);--> statement-breakpoint
CREATE TABLE `customer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`address` text,
	`maps_link` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_contract` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`service_type_id` text,
	`pricing_model` text DEFAULT 'per_order' NOT NULL,
	`unit_price` real NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`partner_task_id` text NOT NULL,
	`batch_id` text,
	`pricing_model` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` real NOT NULL,
	`total_amount` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `payment_batch`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_payment_partner_task_id_unique` ON `partner_payment` (`partner_task_id`);--> statement-breakpoint
CREATE TABLE `partner_task` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`partner_id` text NOT NULL,
	`contract_id` text,
	`task_type_id` text,
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
	`closed_by` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `partner_contract`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_task_task_token_unique` ON `partner_task` (`task_token`);--> statement-breakpoint
CREATE TABLE `partner` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`period` text NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generated_at` integer NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`sent_at` integer,
	`paid_at` integer,
	`notes` text,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `request_item` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`serial_number` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`accessories` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `request_type` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_type_slug_unique` ON `request_type` (`slug`);--> statement-breakpoint
CREATE TABLE `request` (
	`id` text PRIMARY KEY NOT NULL,
	`request_number` text NOT NULL,
	`tracking_code` text NOT NULL,
	`type_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`sales_ref` text,
	`po_number` text,
	`delivery_date` integer,
	`collection_date` integer,
	`time_window` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`require_national_id` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_request_number_unique` ON `request` (`request_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `request_tracking_code_unique` ON `request` (`tracking_code`);--> statement-breakpoint
CREATE TABLE `services_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `signature_event` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`event_type` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `signature_request` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`partner_task_id` text,
	`initiated_by` text DEFAULT 'admin' NOT NULL,
	`initiator_id` text,
	`customer_id` text NOT NULL,
	`document_name` text NOT NULL,
	`document_url` text,
	`secure_token` text NOT NULL,
	`require_national_id` integer DEFAULT false NOT NULL,
	`otp_enabled` integer DEFAULT false NOT NULL,
	`expiry_enabled` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`reminder_enabled` integer DEFAULT false NOT NULL,
	`reminder_sent_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signature_request_secure_token_unique` ON `signature_request` (`secure_token`);--> statement-breakpoint
CREATE TABLE `task_service` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_task_id` text NOT NULL,
	`service_id` text NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`notes` text,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
