CREATE TABLE `domain_event` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`actor_user_id` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_event_dedupe_key_unique` ON `domain_event` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `domain_event_aggregate_idx` ON `domain_event` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE INDEX `domain_event_type_idx` ON `domain_event` (`event_type`);--> statement-breakpoint
CREATE TABLE `event_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`consumer` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`delivered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `domain_event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_delivery_event_consumer_idx` ON `event_delivery` (`event_id`,`consumer`);--> statement-breakpoint
CREATE INDEX `event_delivery_status_next_idx` ON `event_delivery` (`status`,`next_attempt_at`);