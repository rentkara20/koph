ALTER TABLE `partner_task` ADD `scheduled_at` integer;--> statement-breakpoint
ALTER TABLE `partner_task` ADD `time_window` text;--> statement-breakpoint
CREATE INDEX `partner_task_scheduled_idx` ON `partner_task` (`scheduled_at`);