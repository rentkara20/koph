CREATE INDEX `request_item_request_idx` ON `request_item` (`request_id`);--> statement-breakpoint
CREATE INDEX `request_item_order_unit_idx` ON `request_item` (`order_unit_id`);--> statement-breakpoint
CREATE INDEX `attachment_entity_idx` ON `attachment` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `signature_request_partner_task_request_idx` ON `signature_request` (`partner_task_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `signature_request_parent_idx` ON `signature_request` (`parent_signature_request_id`);--> statement-breakpoint
CREATE INDEX `signature_event_signature_request_idx` ON `signature_event` (`signature_request_id`);--> statement-breakpoint
CREATE INDEX `customer_signature_signature_request_idx` ON `customer_signature` (`signature_request_id`);--> statement-breakpoint
CREATE INDEX `task_service_partner_task_idx` ON `task_service` (`partner_task_id`);--> statement-breakpoint
CREATE INDEX `task_service_service_idx` ON `task_service` (`service_id`);--> statement-breakpoint
CREATE INDEX `payment_batch_partner_idx` ON `payment_batch` (`partner_id`);--> statement-breakpoint
CREATE INDEX `order_unit_current_request_idx` ON `order_unit` (`current_request_id`);
