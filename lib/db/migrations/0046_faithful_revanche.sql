ALTER TABLE `request` ADD `fulfilment_mode` text DEFAULT 'partner_delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE `request` ADD `pickup_handed_over_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `request` ADD `pickup_handed_over_at` integer;