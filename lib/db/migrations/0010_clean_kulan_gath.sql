ALTER TABLE `attachment` ADD `provider` text DEFAULT 'vercel_blob' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachment` ADD `provider_file_id` text;--> statement-breakpoint
ALTER TABLE `attachment` ADD `provider_url` text;--> statement-breakpoint
ALTER TABLE `attachment` ADD `storage_path` text;--> statement-breakpoint
ALTER TABLE `attachment` ADD `sensitivity` text DEFAULT 'sensitive' NOT NULL;