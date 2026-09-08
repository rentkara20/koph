CREATE TABLE `device_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`serial_number` text NOT NULL,
	`holder_name` text NOT NULL,
	`holder_email` text NOT NULL,
	`holder_mobile` text NOT NULL,
	`holder_secret` text NOT NULL,
	`consent_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`claimed_at` integer NOT NULL,
	`released_at` integer,
	`release_reason` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "device_claim_status_ck" CHECK("device_claim"."status" IN ('active','released'))
);
--> statement-breakpoint
CREATE INDEX `device_claim_serial_idx` ON `device_claim` (`serial_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_claim_active_serial_uq` ON `device_claim` (`serial_number`) WHERE "device_claim"."status" = 'active';--> statement-breakpoint
CREATE TABLE `device_service_request` (
	`id` text PRIMARY KEY NOT NULL,
	`serial_number` text NOT NULL,
	`claim_id` text,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`admin_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `device_claim`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "device_service_request_status_ck" CHECK("device_service_request"."status" IN ('submitted','applied','rejected'))
);
--> statement-breakpoint
CREATE INDEX `device_service_request_serial_idx` ON `device_service_request` (`serial_number`);--> statement-breakpoint
CREATE INDEX `device_service_request_status_idx` ON `device_service_request` (`status`);