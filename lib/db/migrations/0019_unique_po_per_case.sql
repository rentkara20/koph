DROP INDEX `purchase_order_case_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_order_case_idx` ON `purchase_order` (`procurement_case_id`);