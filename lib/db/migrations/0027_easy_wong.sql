CREATE TABLE `customer_contact_location` (
	`contact_id` text NOT NULL,
	`location_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `customer_contact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `customer_location`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_contact_location_unique_idx` ON `customer_contact_location` (`contact_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `customer_contact_location_location_idx` ON `customer_contact_location` (`location_id`);--> statement-breakpoint
CREATE TABLE `customer_location` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'office' NOT NULL,
	`city` text,
	`address` text,
	`maps_link` text,
	`google_place_id` text,
	`latitude` real,
	`longitude` real,
	`working_hours` text,
	`access_notes` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_location_customer_idx` ON `customer_location` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_location_single_default_idx` ON `customer_location` (`customer_id`,`is_default`) WHERE "customer_location"."is_default" = 1;--> statement-breakpoint
ALTER TABLE `request` ADD `customer_location_id` text REFERENCES customer_location(id);--> statement-breakpoint
ALTER TABLE `request` ADD `location_name_snapshot` text;--> statement-breakpoint
ALTER TABLE `request` ADD `location_address_snapshot` text;--> statement-breakpoint
ALTER TABLE `request` ADD `location_maps_link_snapshot` text;--> statement-breakpoint
ALTER TABLE `request` ADD `location_latitude_snapshot` real;--> statement-breakpoint
ALTER TABLE `request` ADD `location_longitude_snapshot` real;