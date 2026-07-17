CREATE TABLE `company_location` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'warehouse' NOT NULL,
	`contact_name` text,
	`contact_mobile` text,
	`city` text,
	`address` text,
	`maps_link` text,
	`working_hours` text,
	`access_notes` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_location_active_idx` ON `company_location` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_location_single_default_idx` ON `company_location` (`is_default`) WHERE "company_location"."is_default" = 1;