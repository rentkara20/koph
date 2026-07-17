ALTER TABLE `order_line` ADD `type` text DEFAULT 'rental_asset' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_unit` ADD `kind` text DEFAULT 'rental' NOT NULL;--> statement-breakpoint
CREATE INDEX `order_unit_kind_idx` ON `order_unit` (`kind`);