CREATE TABLE `csv_import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`success_rows` integer DEFAULT 0 NOT NULL,
	`error_rows` integer DEFAULT 0 NOT NULL,
	`valid_rows_json` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`committed_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `csv_import_batch_module_idx` ON `csv_import_batch` (`module`);--> statement-breakpoint
CREATE TABLE `csv_import_row_error` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`raw_row_json` text NOT NULL,
	`error_message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `csv_import_batch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `csv_import_row_error_batch_idx` ON `csv_import_row_error` (`batch_id`);