ALTER TABLE `order_unit` ADD `current_order_id` text REFERENCES `order`(id);--> statement-breakpoint
ALTER TABLE `order_unit` ADD `current_order_line_id` text REFERENCES order_line(id);--> statement-breakpoint
CREATE INDEX `order_unit_current_order_idx` ON `order_unit` (`current_order_id`);--> statement-breakpoint
CREATE INDEX `order_unit_current_order_line_idx` ON `order_unit` (`current_order_line_id`);