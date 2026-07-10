ALTER TABLE `notification` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe_key_idx` ON `notification` (`dedupe_key`);