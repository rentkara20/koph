CREATE TABLE `label_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_file` text,
	`base_url` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `label_batch_created_idx` ON `label_batch` (`created_at`);--> statement-breakpoint
CREATE TABLE `label_device` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`serial_key` text NOT NULL,
	`brand` text,
	`model` text,
	`device_type` text,
	`notes` text,
	`printed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `label_batch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `label_device_batch_idx` ON `label_device` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `label_device_serial_key_uq` ON `label_device` (`serial_key`);