ALTER TABLE `customer_signature` ADD `geo_latitude` real;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `geo_longitude` real;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `geo_accuracy` real;--> statement-breakpoint
ALTER TABLE `customer_signature` ADD `geo_unavailable_reason` text;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `created_by_agent_id` text REFERENCES partner(id);--> statement-breakpoint
ALTER TABLE `signature_request` ADD `channel` text DEFAULT 'agent_device' NOT NULL;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `sent_at` integer;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `opened_at` integer;--> statement-breakpoint
ALTER TABLE `signature_request` ADD `rejection_reason` text;--> statement-breakpoint
CREATE INDEX `signature_request_channel_status_idx` ON `signature_request` (`channel`,`status`);