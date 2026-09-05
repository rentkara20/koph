ALTER TABLE `order_unit` ADD `ownership` text DEFAULT 'kara' NOT NULL;--> statement-breakpoint
CREATE INDEX `order_unit_ownership_idx` ON `order_unit` (`ownership`);--> statement-breakpoint
--> Backfill: a sold unit's ownership had already transferred to the customer.
--> Every other historical row is a KARA asset (the column default).
UPDATE `order_unit` SET `ownership` = 'customer' WHERE `status` = 'sold';
