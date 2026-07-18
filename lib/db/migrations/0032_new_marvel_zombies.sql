ALTER TABLE `warranty_batch` ADD `supplier_id` text REFERENCES supplier(id);--> statement-breakpoint
CREATE INDEX `warranty_batch_supplier_idx` ON `warranty_batch` (`supplier_id`);