CREATE TABLE "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		);
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`i18n_key` text NOT NULL,
	`i18n_data` text,
	`performed_by` text,
	`performed_as` text DEFAULT 'user' NOT NULL,
	`ip_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`performed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_url` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`uploaded_by` text,
	`upload_source` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL
, `provider` text DEFAULT 'vercel_blob' NOT NULL, `provider_file_id` text, `provider_url` text, `storage_path` text, `sensitivity` text DEFAULT 'sensitive' NOT NULL);
CREATE TABLE `consent_version` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`text_en` text NOT NULL,
	`text_ar` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `customer_signature` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`national_id` text,
	`signature_data` text NOT NULL,
	`consent_version` text,
	`consent_accepted_at` integer,
	`signed_at` integer NOT NULL,
	`ip_address` text, signed_at_tz TEXT NOT NULL DEFAULT 'Asia/Riyadh', user_agent TEXT, audit_data_hash TEXT,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consent_version`) REFERENCES `consent_version`(`version`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `customer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`address` text,
	`maps_link` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `partner_contract` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`service_type_id` text,
	`pricing_model` text DEFAULT 'per_order' NOT NULL,
	`unit_price` real NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `partner_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`partner_task_id` text NOT NULL,
	`batch_id` text,
	`pricing_model` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` real NOT NULL,
	`total_amount` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `payment_batch`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `partner_task` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`partner_id` text NOT NULL,
	`contract_id` text,
	`task_type_id` text,
	`task_token` text NOT NULL,
	`task_token_expires_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`failure_reason` text,
	`failure_notes` text,
	`signoff_quantity` integer,
	`assigned_by` text,
	`assigned_at` integer,
	`accepted_at` integer,
	`completed_at` integer,
	`closed_by` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, contact_id TEXT REFERENCES customer_contact(id) ON DELETE SET NULL, `execution_mode` text DEFAULT 'manual' NOT NULL, `photo_required` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `partner_contract`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `partner` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer, `activation_token` text, `activation_token_expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `payment_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`period` text NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generated_at` integer NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`sent_at` integer,
	`paid_at` integer,
	`notes` text, statement_token text,
	FOREIGN KEY (`partner_id`) REFERENCES `partner`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `request_item` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`serial_number` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`accessories` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, "order_unit_id" text REFERENCES order_unit(id) ON DELETE set null ON UPDATE no action,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `request_type` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
, `proof_config` text);
CREATE TABLE `request` (
	`id` text PRIMARY KEY NOT NULL,
	`request_number` text NOT NULL,
	`tracking_code` text NOT NULL,
	`type_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`sales_ref` text,
	`po_number` text,
	`delivery_date` integer,
	`collection_date` integer,
	`time_window` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`require_national_id` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer, quote_number TEXT, receiver_contact_id TEXT REFERENCES customer_contact(id) ON DELETE SET NULL, `origin` text, `destination` text, `scheduled_at` integer,
	FOREIGN KEY (`type_id`) REFERENCES `request_type`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `services_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `signature_event` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`event_type` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `signature_request` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`partner_task_id` text,
	`initiated_by` text DEFAULT 'admin' NOT NULL,
	`initiator_id` text,
	`customer_id` text NOT NULL,
	`document_name` text NOT NULL,
	`document_url` text,
	`secure_token` text NOT NULL,
	`require_national_id` integer DEFAULT false NOT NULL,
	`otp_enabled` integer DEFAULT false NOT NULL,
	`expiry_enabled` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`reminder_enabled` integer DEFAULT false NOT NULL,
	`reminder_sent_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, verification_id TEXT, `signatory_role` text DEFAULT 'receiver' NOT NULL, `parent_signature_request_id` text, "signatory_contact_id" text REFERENCES customer_contact(id) ON DELETE set null ON UPDATE no action,
	FOREIGN KEY (`request_id`) REFERENCES `request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiator_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `task_service` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_task_id` text NOT NULL,
	`service_id` text NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`notes` text,
	FOREIGN KEY (`partner_task_id`) REFERENCES `partner_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
, `disabled_at` integer);
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`i18n_key` text NOT NULL,
	`i18n_data` text,
	`link_url` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` integer,
	`created_at` integer NOT NULL, `dedupe_key` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `signature_item_condition` (
	`id` text PRIMARY KEY NOT NULL,
	`signature_request_id` text NOT NULL,
	`request_item_id` text NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`received_quantity` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`signature_request_id`) REFERENCES `signature_request`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_item_id`) REFERENCES `request_item`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE "customer_contact" (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`mobile` text,
	`email` text,
	`city` text,
	`address` text,
	`maps_link` text,
	`notes` text,
	`is_authorized_signatory` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `order_line` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`description` text NOT NULL,
	`brand` text,
	`model` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`rental_months` integer,
	`unit_price_monthly` real,
	`line_total` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `order` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`contact_person` text,
	`contact_mobile` text,
	`contact_email` text,
	`quote_date` integer,
	`rental_period_months` integer,
	`additional_period_months` integer,
	`total` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `supplier` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`mobile` text,
	`email` text,
	`city` text,
	`address` text,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE "asset_event" (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`request_id` text,
	`customer_id` text,
	`notes` text,
	`by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE maintenance_order (
    id text PRIMARY KEY,
    asset_id text NOT NULL REFERENCES order_unit(id) ON DELETE CASCADE,
    issue text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    cost real,
    vendor_notes text,
    opened_by text,
    opened_at integer NOT NULL,
    closed_at integer
  );
CREATE TABLE customer_portal_token (
    id text PRIMARY KEY,
    customer_id text NOT NULL UNIQUE REFERENCES customer(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    created_at integer NOT NULL
  );
CREATE TABLE customer_callback_request (
    id text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    request_id text,
    kind text NOT NULL,
    message text,
    resolved_at integer,
    created_at integer NOT NULL
  );
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `failure_reason` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `user_invite` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `domain_event` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`actor_user_id` text,
	`occurred_at` integer NOT NULL
);
CREATE TABLE `event_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`consumer` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`delivered_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `domain_event`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `accessory_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`accessory_item_id` text NOT NULL,
	`accessory_unit_id` text,
	`qty` integer,
	`checklist_state` text DEFAULT 'delivered' NOT NULL,
	`notes` text,
	`by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accessory_unit_id`) REFERENCES `accessory_unit`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE TABLE `accessory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`category` text NOT NULL,
	`requires_serial` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `accessory_stock` (
	`id` text PRIMARY KEY NOT NULL,
	`accessory_item_id` text NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `accessory_unit` (
	`id` text PRIMARY KEY NOT NULL,
	`accessory_item_id` text NOT NULL,
	`serial_number` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`accessory_item_id`) REFERENCES `accessory_item`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `purchase_order_line` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`item_description` text NOT NULL,
	`brand` text,
	`model` text,
	`requires_serial` integer DEFAULT true NOT NULL,
	`qty_ordered` integer NOT NULL,
	`qty_received` integer DEFAULT 0 NOT NULL,
	`unit_cost` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `status` text DEFAULT 'active' NOT NULL, `cancelled_at` integer, `cancel_reason` text,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `warranty_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`warranty_batch_id` text NOT NULL,
	`status` text DEFAULT 'assigned_not_activated' NOT NULL,
	`activation_due_at` integer,
	`start_at` integer,
	`end_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `order_unit`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warranty_batch_id`) REFERENCES `warranty_batch`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `warranty_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`warranty_product_id` text NOT NULL,
	`source` text NOT NULL,
	`purchase_order_id` text,
	`invoice_ref` text,
	`units_covered` integer DEFAULT 1 NOT NULL,
	`units_assigned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`warranty_product_id`) REFERENCES `warranty_product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE TABLE `warranty_product` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text NOT NULL,
	`duration_months` integer NOT NULL,
	`provider_name` text,
	`created_at` integer NOT NULL
);
CREATE TABLE "order_unit" (
	`id` text PRIMARY KEY NOT NULL,
	`order_line_id` text,
	`order_id` text,
	`purchase_order_line_id` text,
	`purchase_order_id` text,
	`serial_number` text,
	`supplier_id` text,
	`purchase_cost` real,
	`purchase_date` integer,
	`warranty_end` integer,
	`asset_tag` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`location` text DEFAULT 'main_warehouse' NOT NULL,
	`current_request_id` text,
	`current_customer_id` text,
	`retired_at` integer,
	`retirement_reason` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_line`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_line`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_unit_single_origin_chk" CHECK(("order_unit"."order_line_id" IS NOT NULL AND "order_unit"."purchase_order_line_id" IS NULL) OR ("order_unit"."order_line_id" IS NULL AND "order_unit"."purchase_order_line_id" IS NOT NULL))
);
CREATE TABLE `commercial_approval` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_id` text NOT NULL,
	`decision` text NOT NULL,
	`approver_id` text NOT NULL,
	`notes` text,
	`decided_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `commercial_evaluation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `commercial_evaluation` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
	`chosen_quotation_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_quotation_id`) REFERENCES `supplier_quotation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `procurement_case` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`sourcing_request_id` text,
	`commercial_approval_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`erp_system` text,
	`external_po_ref` text,
	`external_po_created_at` integer,
	`previous_case_id` text,
	`superseded_by_case_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `supplier_id` text REFERENCES supplier(id),
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commercial_approval_id`) REFERENCES `commercial_approval`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`superseded_by_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `sourcing_request` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`order_id` text,
	`order_line_id` text,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `external_ref` text, `title` text,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_line`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `supplier_quotation_line` (
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`item_description` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price` real,
	`lead_time_days` integer,
	`created_at` integer NOT NULL, `sourcing_request_item_id` text REFERENCES sourcing_request_item(id), `offered_part_number` text, `offered_spec` text, `currency` text DEFAULT 'SAR', `tax_rate` real, `availability` text, `warranty` text, `valid_until` integer, `upgrades_note` text, `upgrades_cost` real,
	FOREIGN KEY (`quotation_id`) REFERENCES `supplier_quotation`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `supplier_quotation` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`valid_until` integer,
	`notes` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`rfq_id`) REFERENCES `supplier_rfq`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `supplier_rfq` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE "purchase_order" (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`invoice_ref` text,
	`ordered_at` integer,
	`notes` text,
	`procurement_case_id` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procurement_case_id`) REFERENCES `procurement_case`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `commercial_evaluation_line` (
	`id` text PRIMARY KEY NOT NULL,
	`evaluation_id` text NOT NULL,
	`sourcing_request_item_id` text NOT NULL,
	`chosen_quotation_line_id` text NOT NULL,
	`reason` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `commercial_evaluation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourcing_request_item_id`) REFERENCES `sourcing_request_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_quotation_line_id`) REFERENCES `supplier_quotation_line`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `sourcing_request_item` (
	`id` text PRIMARY KEY NOT NULL,
	`sourcing_request_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`customer_description` text NOT NULL,
	`supplier_description` text NOT NULL,
	`part_number` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sourcing_request_id`) REFERENCES `sourcing_request`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `supplier_rfq_item` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`sourcing_request_item_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rfq_id`) REFERENCES `supplier_rfq`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourcing_request_item_id`) REFERENCES `sourcing_request_item`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `consent_version_version_unique` ON `consent_version` (`version`);
CREATE UNIQUE INDEX `customer_signature_signature_request_id_unique` ON `customer_signature` (`signature_request_id`);
CREATE UNIQUE INDEX `partner_payment_partner_task_id_unique` ON `partner_payment` (`partner_task_id`);
CREATE UNIQUE INDEX `partner_task_task_token_unique` ON `partner_task` (`task_token`);
CREATE UNIQUE INDEX `request_type_slug_unique` ON `request_type` (`slug`);
CREATE UNIQUE INDEX `request_request_number_unique` ON `request` (`request_number`);
CREATE UNIQUE INDEX `request_tracking_code_unique` ON `request` (`tracking_code`);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE UNIQUE INDEX `signature_request_secure_token_unique` ON `signature_request` (`secure_token`);
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
CREATE INDEX partner_task_request_idx ON partner_task (request_id);
CREATE INDEX partner_task_partner_status_idx ON partner_task (partner_id, status);
CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id);
CREATE INDEX signature_request_request_idx ON signature_request (request_id);
CREATE INDEX partner_payment_partner_status_idx ON partner_payment (partner_id, status);
CREATE INDEX partner_payment_batch_idx ON partner_payment (batch_id);
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);
CREATE INDEX `signature_item_condition_sig_idx` ON `signature_item_condition` (`signature_request_id`);
CREATE UNIQUE INDEX `payment_batch_statement_token_unique` ON `payment_batch` (`statement_token`);
CREATE UNIQUE INDEX `signature_request_verification_id_unique` ON `signature_request` (`verification_id`);
CREATE INDEX `order_line_order_idx` ON `order_line` (`order_id`);
CREATE UNIQUE INDEX `order_order_number_unique` ON `order` (`order_number`);
CREATE INDEX `order_customer_idx` ON `order` (`customer_id`);
CREATE INDEX request_customer_idx ON request (customer_id);
CREATE INDEX request_status_idx ON request (status);
CREATE INDEX customer_contact_customer_idx ON customer_contact (customer_id);
CREATE INDEX `asset_event_asset_idx` ON `asset_event` (`asset_id`,`created_at`);
CREATE UNIQUE INDEX `partner_activation_token_unique` ON `partner` (`activation_token`);
CREATE INDEX maintenance_order_asset_idx ON maintenance_order (asset_id);
CREATE INDEX maintenance_order_status_idx ON maintenance_order (status);
CREATE INDEX customer_callback_customer_idx ON customer_callback_request (customer_id);
CREATE UNIQUE INDEX `failure_reason_slug_unique` ON `failure_reason` (`slug`);
CREATE UNIQUE INDEX `user_invite_token_unique` ON `user_invite` (`token`);
CREATE UNIQUE INDEX `customer_portal_token_customer_id_unique` ON `customer_portal_token` (`customer_id`);
CREATE UNIQUE INDEX `customer_portal_token_token_unique` ON `customer_portal_token` (`token`);
CREATE UNIQUE INDEX `domain_event_dedupe_key_unique` ON `domain_event` (`dedupe_key`);
CREATE INDEX `domain_event_aggregate_idx` ON `domain_event` (`aggregate_type`,`aggregate_id`);
CREATE INDEX `domain_event_type_idx` ON `domain_event` (`event_type`);
CREATE UNIQUE INDEX `event_delivery_event_consumer_idx` ON `event_delivery` (`event_id`,`consumer`);
CREATE INDEX `event_delivery_status_next_idx` ON `event_delivery` (`status`,`next_attempt_at`);
CREATE INDEX `accessory_attachment_entity_idx` ON `accessory_attachment` (`entity_type`,`entity_id`);
CREATE UNIQUE INDEX `accessory_stock_item_location_idx` ON `accessory_stock` (`accessory_item_id`,`location`);
CREATE INDEX `accessory_unit_item_idx` ON `accessory_unit` (`accessory_item_id`);
CREATE INDEX `purchase_order_line_po_idx` ON `purchase_order_line` (`purchase_order_id`);
CREATE INDEX `warranty_assignment_asset_idx` ON `warranty_assignment` (`asset_id`);
CREATE INDEX `warranty_assignment_status_idx` ON `warranty_assignment` (`status`);
CREATE INDEX `warranty_batch_product_idx` ON `warranty_batch` (`warranty_product_id`);
CREATE INDEX `order_unit_order_idx` ON `order_unit` (`order_id`);
CREATE INDEX `order_unit_line_idx` ON `order_unit` (`order_line_id`);
CREATE INDEX `order_unit_po_line_idx` ON `order_unit` (`purchase_order_line_id`);
CREATE INDEX `order_unit_status_idx` ON `order_unit` (`status`);
CREATE INDEX `order_unit_serial_idx` ON `order_unit` (`serial_number`);
CREATE UNIQUE INDEX `order_unit_asset_tag_idx` ON `order_unit` (`asset_tag`);
CREATE UNIQUE INDEX `notification_dedupe_key_idx` ON `notification` (`dedupe_key`);
CREATE INDEX `order_unit_current_customer_idx` ON `order_unit` (`current_customer_id`);
CREATE INDEX `commercial_approval_evaluation_idx` ON `commercial_approval` (`evaluation_id`);
CREATE INDEX `commercial_evaluation_request_idx` ON `commercial_evaluation` (`sourcing_request_id`);
CREATE INDEX `procurement_case_sourcing_request_idx` ON `procurement_case` (`sourcing_request_id`);
CREATE INDEX `procurement_case_status_idx` ON `procurement_case` (`status`);
CREATE INDEX `sourcing_request_order_idx` ON `sourcing_request` (`order_id`);
CREATE INDEX `sourcing_request_status_idx` ON `sourcing_request` (`status`);
CREATE INDEX `supplier_quotation_line_quotation_idx` ON `supplier_quotation_line` (`quotation_id`);
CREATE INDEX `supplier_quotation_rfq_idx` ON `supplier_quotation` (`rfq_id`);
CREATE INDEX `supplier_rfq_request_idx` ON `supplier_rfq` (`sourcing_request_id`);
CREATE INDEX `supplier_rfq_supplier_idx` ON `supplier_rfq` (`supplier_id`);
CREATE UNIQUE INDEX `purchase_order_po_number_unique` ON `purchase_order` (`po_number`);
CREATE INDEX `purchase_order_supplier_idx` ON `purchase_order` (`supplier_id`);
CREATE INDEX `commercial_evaluation_line_evaluation_idx` ON `commercial_evaluation_line` (`evaluation_id`);
CREATE INDEX `commercial_evaluation_line_item_idx` ON `commercial_evaluation_line` (`sourcing_request_item_id`);
CREATE INDEX `sourcing_request_item_request_idx` ON `sourcing_request_item` (`sourcing_request_id`);
CREATE INDEX `sourcing_request_item_part_number_idx` ON `sourcing_request_item` (`part_number`);
CREATE INDEX `supplier_rfq_item_rfq_idx` ON `supplier_rfq_item` (`rfq_id`);
CREATE INDEX `supplier_rfq_item_item_idx` ON `supplier_rfq_item` (`sourcing_request_item_id`);
CREATE INDEX `sourcing_request_external_ref_idx` ON `sourcing_request` (`external_ref`);
CREATE INDEX `supplier_quotation_line_item_idx` ON `supplier_quotation_line` (`sourcing_request_item_id`);
CREATE INDEX `supplier_quotation_line_part_number_idx` ON `supplier_quotation_line` (`offered_part_number`);
CREATE UNIQUE INDEX `purchase_order_case_idx` ON `purchase_order` (`procurement_case_id`);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'9f60c7388a6e80b1a92e82a1b6428f4f392fa41ffea1263bc9ec6d76aac85c67',1781735233057);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'ae9d88d12814185cedb4c80bab0d5e90e3301fdf5c34741fc4781d0ac3554a7f',1781785757661);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'67ac5c037aca46c5936f420202edc7adfec16af68a368ba92e0c7865cecba0e0',1783150248862);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'6d1f7abe8de89e49ac78209ca958a700c0560749a0202b09f6ec362dbcc981b3',1783360457606);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'deb669ae0301e2f8df0774c5ac7c6b793d1540db7e0800e1e8b9c8e52a53df33',1783431268925);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'25914a295e0ac3db93eb32fb590fef3b6ad7509812f265b5a6193bc57e3f877b',1783455144544);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'2ea508979c530df997a705a3b665d8785f545c97d5d1fcf7de7faffad02a184a',1783476495581);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'fe24dd787152248937242dbc9674ffe85a1c0c84a2683784854ed5f0427d606a',1783476495582);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'bed345c4f046fb4ec2b9161e1492094f34b39d5f8af497857978e1f6d4d00a20',1783633410700);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'477c64650591c4a232392b56b4019081e96ad5e48c8355bb4d4bd6fe0d1532db',1783669642371);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'9bcb4139f2fc5f45b402a0ee5af4162cac5777b8bf53651cbcdb4f6257b813e6',1783671551054);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'db7f32a1fab6cc0753d149778da37d105be4fd14f9a2914c721cfda1fa39f68b',1783674007796);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'242afc0bc7be194f51fbcc8f37a35779ea4649f1ce449e323620b0c93868bbec',1783675491932);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'b4154dd7987863af81e1d102501e1669fd6f863dc2b1ad0178f4b926a4472e5d',1783692646444);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'fef51eb34df9bfefce7cfaebf387483e9f4b87e1e986abb645634c4e9ae75df6',1783694818193);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'aa453760d090710f7f01033ff3ea2bb26a3691fb8c9b83bde3f92de2711634c8',1783710817052);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'e24fa09e7bf2f8a6113f106487c5fc470fe9e654efdef25badae8ce8ae903d2b',1783711655461);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'c90dc88a934d43ef2a00396a1f1f789f5a29eb53e6996ea84d87eedbe39fdfa3',1783783766154);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'94012fcf3b95ac7b101cea9c1985bff861d8f762522568a612282ea5b23d8678',1783864944924);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'f19e9d95b8fdaad46d60f5b366313c6241716905296a77b64371381413a58372',1783872560991);
INSERT INTO "__drizzle_migrations" ("id","hash","created_at") VALUES (NULL,'3292da3505cb20eb294679d4ab862e5fbc2085b3b864edc0c9454c2ecf4fdaf0',1783878746530);
INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","access_token_expires_at","refresh_token_expires_at","scope","password","created_at","updated_at") VALUES ('REfUR8S8eBGPXxj3EuBEjF527rHee3ZH','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','credential','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',NULL,NULL,NULL,NULL,NULL,NULL,'56d77bebd6716c25c5a8f64ee3815cc0:4c91df2fd752ac914d7440635c9cf22e00a4547dbca7749423c9c0d7dbbb22be7fdc10a3c5fa30180343a968a7ace50222f21a91f2deed217cdf098d2d8e7e62',1781736012912,1781736012912);
INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","access_token_expires_at","refresh_token_expires_at","scope","password","created_at","updated_at") VALUES ('jca43j7ppbsbimqje79hkiuh','vbponm2vqagxicujmgmsrvhr','credential','vbponm2vqagxicujmgmsrvhr',NULL,NULL,NULL,NULL,NULL,NULL,'e4c4609b90fb2802a9d4c58c06736517:da20cba73c1950c6e43cd959c26b19ecde322a23b2af4f6173b1c312f0e4c1fdf4d19a2bad642173635c5904214546fdb9c90b340b0d1be2e017cf6cbdfd8620',1783512519909,1783512519909);
INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","access_token_expires_at","refresh_token_expires_at","scope","password","created_at","updated_at") VALUES ('Nem6SGJGMtOhRqbfwWgpaAREJMWfWq07','O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL','credential','O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL',NULL,NULL,NULL,NULL,NULL,NULL,'bb392d8154fa79853368ec2387e64371:5046aed9b5084d3e14896f5e67fefe806317ba98a64caae2f1fd473d61060032c96dc93705835784a4a07ce64b7bae57275dad418a841b089808327dfef91bbd',1783882594939,1783882594939);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('tvnz2i05plg1j02hpa578x3g','request','cwz14115ktn45qxe327zcu3z','created','activity.requestCreated',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783151711220);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('hxo8iqym8cqy9h76igjnlj53','request','cwz14115ktn45qxe327zcu3z','task_assigned','activity.taskAssigned',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783151854227);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('ld75j2vs7oy5o56i6qloricm','request','cwz14115ktn45qxe327zcu3z','status_changed','activity.statusChanged','{"status":"assigned"}',NULL,'system',NULL,1783151854567);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('joxymmj5a2dnzwkeesxa1wtp','request','cwz14115ktn45qxe327zcu3z','task_accept','activity.task_accept',NULL,NULL,'partner_link',NULL,1783153191861);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('bqfzav69j1ixqlss9y90dn6e','request','cwz14115ktn45qxe327zcu3z','task_start','activity.task_start',NULL,NULL,'partner_link',NULL,1783153654026);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('h13zxkjltmze3nsqjpldsah2','request','cwz14115ktn45qxe327zcu3z','status_changed','activity.statusChanged','{"status":"in_progress"}',NULL,'system',NULL,1783153655684);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('o2heb3924nonqjgrduows78z','request','adzsjrmbuq7enjmso4x11qi5','created','activity.requestCreated',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783360481673);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('vu9ahz5cj37yxmbeyml7c15b','request','adzsjrmbuq7enjmso4x11qi5','receiver_set','activity.receiverSet',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783360495118);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('y2bj4qnhafz2xfqw0mo8yav5','request','adzsjrmbuq7enjmso4x11qi5','receiver_set','activity.receiverSet',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783360500110);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('rc0sz95zn7cli6oox5pn4kt8','request','adzsjrmbuq7enjmso4x11qi5','task_assigned','activity.taskAssigned',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783360645621);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('s1u9585tqq0hx2waz2p2l2nf','request','adzsjrmbuq7enjmso4x11qi5','status_changed','activity.statusChanged','{"status":"assigned"}',NULL,'system',NULL,1783360646297);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('rnruoq9izz27v7t1tfo8uog3','request','adzsjrmbuq7enjmso4x11qi5','task_accept','activity.task_accept',NULL,NULL,'partner_link',NULL,1783360696400);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('q0weawj893xzxden51nmi827','request','adzsjrmbuq7enjmso4x11qi5','task_start','activity.task_start',NULL,NULL,'partner_link',NULL,1783360702867);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('ru88129h6sds70mxp9qw9vkj','request','adzsjrmbuq7enjmso4x11qi5','status_changed','activity.statusChanged','{"status":"in_progress"}',NULL,'system',NULL,1783360703536);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('rgp7ksfeqvkmnlhd9849n53k','signature_request','xmzwm257qkvdku1p8ghsl7pl','signature_request_signed','activity.signatureRequestSigned','{"fullName":"LeanNode"}',NULL,'system',NULL,1783360769713);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('jq8uxrz1jv5cot22tbr7lpmf','request','ehtefziel5uiu27q18h9u50s','created','activity.requestCreated',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783362463837);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('llm12beotgr7q9ehunjf33e3','request','ehtefziel5uiu27q18h9u50s','receiver_set','activity.receiverSet',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783362468764);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('kk826y3ga91d3fpj40m4dc10','request','ehtefziel5uiu27q18h9u50s','logistics_updated','activity.logisticsUpdated',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783362506352);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('mm0altutpazfrpurru048fjj','request','ehtefziel5uiu27q18h9u50s','task_assigned','activity.taskAssigned',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783362538607);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('vwjm11qnj1031hc89cewe7zt','request','ehtefziel5uiu27q18h9u50s','status_changed','activity.statusChanged','{"status":"assigned"}',NULL,'system',NULL,1783362539140);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('ezkrhpec9f9poyw77agixrgu','request','ehtefziel5uiu27q18h9u50s','task_accept','activity.task_accept',NULL,NULL,'partner_link',NULL,1783362856208);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('rwjefkiqcgko0eyg904o2fbr','request','ehtefziel5uiu27q18h9u50s','task_start','activity.task_start',NULL,NULL,'partner_link',NULL,1783364264788);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('y5x1cwcpc9or610c2v4p0z15','request','ehtefziel5uiu27q18h9u50s','status_changed','activity.statusChanged','{"status":"in_progress"}',NULL,'system',NULL,1783364265390);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('qk2qmk799uz68ufi1oiycl4g','signature_request','leclgtlcxrhqa5pi98jzto30','signature_request_created','activity.signatureRequestCreated','{"documentName":"Device Collection"}','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783364999239);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('g2zh4uicdhtd8kc4mtkkhrfa','signature_request','leclgtlcxrhqa5pi98jzto30','signature_request_sent','activity.signatureRequestSent',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783365026047);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('oi0r8rr8h5t0tgqlfyzau2nc','signature_request','leclgtlcxrhqa5pi98jzto30','signature_request_signed','activity.signatureRequestSigned','{"fullName":"dhuha alsubaie"}',NULL,'system',NULL,1783373310170);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('o23fd9ily4j8x0zy0uskk5da','request','ehtefziel5uiu27q18h9u50s','task_mark_failed','activity.task_mark_failed',NULL,NULL,'partner_link',NULL,1783373638772);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('gwb461cos7we66vwlqpo3wk4','request','ehtefziel5uiu27q18h9u50s','status_changed','activity.statusChanged','{"status":"failed"}',NULL,'system',NULL,1783373639281);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('p8jmgl74k47fybdk226qfzv4','signature_request','fjzv1ub0u97ykv43rdsucfqt','authorized_signoff_requested','activity.authorizedSignoffRequested',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783379667037);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('nnerwz42p8wv1ij02a9k9r5r','request','ehtefziel5uiu27q18h9u50s','status_changed','activity.statusChanged','{"status":"draft"}','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783415936926);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('jby0745xb201borv2v7dby2e','request','ehtefziel5uiu27q18h9u50s','task_force_completed','activity.taskForceCompleted',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783419271777);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('st92s9pi7u4ggrdbyrlnj5lz','request','ehtefziel5uiu27q18h9u50s','status_changed','activity.statusChanged','{"status":"assigned"}',NULL,'system',NULL,1783419272855);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('kqmylq1ua0lo7ppjup1odvmk','request','ta51q7ha044v1t3bpi4ycwux','created','activity.requestCreated',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783439682044);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('bwesq580rarp7p2suc80gwe2','request','ta51q7ha044v1t3bpi4ycwux','receiver_set','activity.receiverSet',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783456409008);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('sxsfancljslmnaao41u08bwt','request','ta51q7ha044v1t3bpi4ycwux','task_assigned','activity.taskAssigned',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','user',NULL,1783456428745);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('k7x7heoqkzaapeygarz8odjd','request','ta51q7ha044v1t3bpi4ycwux','status_changed','activity.statusChanged','{"status":"assigned"}',NULL,'system',NULL,1783456429257);
INSERT INTO "activity_log" ("id","entity_type","entity_id","action","i18n_key","i18n_data","performed_by","performed_as","ip_address","created_at") VALUES ('gsygujsmn7j63f6z88vg9j9r','request','adzsjrmbuq7enjmso4x11qi5','task_mark_done','activity.task_mark_done',NULL,NULL,'partner_link',NULL,1783889184935);
INSERT INTO "consent_version" ("id","version","text_en","text_ar","is_active","created_at") VALUES ('w8wyiojth9g6xy3mc3qbdvo7','1.0','I confirm that the information I have provided is accurate and complete. I understand that my National ID / Iqama number and signature will be stored securely and used solely for the purpose of verifying this transaction in accordance with applicable data protection regulations.','أؤكد أن المعلومات التي قدمتها دقيقة وكاملة. أفهم أن رقم هويتي الوطنية / الإقامة وتوقيعي سيتم تخزينهما بشكل آمن واستخدامهما فقط لأغراض التحقق من هذه المعاملة وفقاً للوائح حماية البيانات المعمول بها.',1,1781736009962);
INSERT INTO "customer_signature" ("id","signature_request_id","full_name","mobile","national_id","signature_data","consent_version","consent_accepted_at","signed_at","ip_address","signed_at_tz","user_agent","audit_data_hash") VALUES ('fp1rg3gg4omjxytpx36201te','xmzwm257qkvdku1p8ghsl7pl','LeanNode','','2300930498','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATMAAADXCAYAAAB2+rZ+AAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAABM6ADAAQAAAABAAAA1wAAAAD9C5qmAAAhL0lEQVR4Ae2dWYxdyVnHz9168ZoZe2Z6erPdHnd7d3sIIwiCZAYpJIgXCMNLFCkvKEGKBBJIKEqUlygjBSEigWAkXokEJJA3yEiJJhMEYkQmGu9L227b3e72vrTddvfd+b7uruu6davOds859yz/qxmfrdZf1fn3V9+pU8ey8AMBEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEACB4Ankgk8SKYJAuglseWnPhc2bBnYXCoW8ZeXzuVwzl7OScSs1ms3m4rXFf7Ya97+UtlZKRgukjTrqExmBV3YdWC0Wi6Uca856rjn6RZZ/UjIijeOi0qbZbDStxuLVhX9JmuChVZPS21DOFoGdI1PL/QP9A6RJpFDrXRgK1cIT2g4LXqPerC/MniqGlkkXCUPMuoCHqOETGN57pFrI5wsQq/BZe8mB7bhmo9G4cflUwUu8MMNCzMKki7R9ERjbd6wRtnixlUG/tX/UQsrXKNjaf3zjVqu12r0bC/9kWctfVeMk63jL3w9PTHwln29Ztl3jJmbN+UsnyYfYux/ErHfskfMGgZG9R2vk0uIhY1f9kW8oTpK3rECVSqV6d/7CIED7IdAueF7ahun3Qti66jx+ECEOCBCBbWR9PfJ4g6yJVK1Wq9y6dm4AFHtDgB6olPv6+kpObdcLQYOY9aZPZDZXL0NIviFWVlZW792Y2ZRZYDGvuFN7zs2ciExjIsso5m2C4oVMwKnTc/akXeRUbjZuXImPUzlkLKlK3tTGUQkaxCxV3Sl+lRl97Wg9Tz9Tydj6unn73v/UHi/8pikMzieLwPjkdMeDlVqtXl+cPR3qlA6IWbL6SWJKOzxx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PhRbfKofTo7BlhiJWGf2ciDsdxAgYPegZh1YcCIBBEIXs24Z0PBxtVgsFWkhV55ruyZOYqtLG5aYjgrOgUD6CUQuZurDgA3EdvrkqhUgYq4wOQaiT9815BXAxyePnZ+bOXnAMSICgECPCYQ+DNO9UB5knSFiQdJcT0vXZiRw7zab9b+emzk9G3yOSBEEuifg/vNFPvNisfEZ1TYap8tLBcG5b4vJ18V8xTpOEatyZGrFP7GswhUSuge7pqa/KF/DPgjEgUDolhlXcpi+6l2gH++bxpOy6LH+0X8NmtO6dGfu/A6Oh1/0BEi4eM7ZdkPOP6XO873rMyf+03Adp0EgUgKRiFmkNUJmgRLYNXn8z+lPy+co0Tfo/21q4vSKxcj8xY8X1fM4BoGoCUDMoiae4PxG9x//dL7R/DJVgf9f+0HMBAlse00AYtbrFkhg/uOTRyZyueIX6RXOj67PfPzjBFYBRQYBEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAifwP8DC+RQBC8fSMoAAAAASUVORK5CYII=',NULL,1783360768916,1783360768916,'46.152.27.125','Asia/Riyadh','Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1','sha256:52bdded0cad2ba6736ba593ef9d43948302c4073d6b949133538a04352071fc6');
INSERT INTO "customer_signature" ("id","signature_request_id","full_name","mobile","national_id","signature_data","consent_version","consent_accepted_at","signed_at","ip_address","signed_at_tz","user_agent","audit_data_hash") VALUES ('yzowf6m1lchjxvg6dqwohnfn','leclgtlcxrhqa5pi98jzto30','dhuha alsubaie','0554414303','1123849158','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAoAAAADcCAYAAADgHhCGAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAACgKADAAQAAAABAAAA3AAAAACwuU0+AAAmh0lEQVR4Ae3dC3hcZZ3H8XMmTVtKC6UUgZJMoLSTcGuSFlZl1xUWRVFwH2V9UFd8VBTdZ73g/bY+q4/gZWVXRcUb4gVXXBRWFC8IurKiLChkkgJmJi20M2lri8XSC70kOWd/7ySTniRzztxnzsx8z/OEnDnnPe/lc9Lkz/ue9z2WxYYAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIBAgwnYDVZfqosAAg0ocNzq/puPiLivMFUfH5+Y2Lpx/bwGbAZVRgABBJpGINI0LaEhCCAQWoGFtnNZtnJtbZG27D7fEUAAAQTqI8D/hdfHnVIRaFkB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+7QCv/cVUgZpEEAAAQQQQCBcAr4P74ermtTGK6BlVtL6PCN4V0xm6bm8q9Mjgx/OpD365ad0njDyDSXq0yk9r+e2KWjzZjO1r1X6pvZynz98iWZzDKUTA72Hj7CHAAIIIIAAAo0okCsiaMR2tFSdFQBmY7ZMu03wly94KxnItXalkvGSh5FLLpcLEUAAAQQQQKBqAvQAVo22Ohmbod/ZOZcT/JnhXHUmOuoc3KN8BzSs+0p93z67DD4jgAACCCCAQPMIEAA2z72c05KpnsFDOvGE+gh/rOHbf5qTiAMIIIAAAggg0HICDAE34C1XL+ABjfmq5rZ58G+DPe58OrVx6NsN2BSqjAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAJFCfw/9fTDQx0yPmMAAAAASUVORK5CYII=','1.0',1783373309507,1783373309507,'77.232.122.174','Asia/Riyadh','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1','sha256:42650e77a05ec9c99dee1d208420c3631c7c7c14cfd3944ce6d0fc11a1da3fb3');
INSERT INTO "customer" ("id","name","contact_person","mobile","email","city","address","maps_link","notes","created_by","created_at","updated_at","deleted_at") VALUES ('ifyosp3y64ahrjfwujprell0','شركة إمدادات المركبة للتجارة','Emad Daghreri','+966544909444','emad@autobia.sa','DMM',NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1781750669820,1783151733855,NULL);
INSERT INTO "customer" ("id","name","contact_person","mobile","email","city","address","maps_link","notes","created_by","created_at","updated_at","deleted_at") VALUES ('qmmiqo0va3lc7ek2woaj7p6r','LeanNode','Hamad Almugbel','+966542345666','hamad@leannode.com','RUH',NULL,'https://maps.app.goo.gl/zJdsqnGePqTUSD8o9?g_st=ic',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783358055797,1783361934159,NULL);
INSERT INTO "customer" ("id","name","contact_person","mobile","email","city","address","maps_link","notes","created_by","created_at","updated_at","deleted_at") VALUES ('yokefh6mpsk34j7dg16gjehe','Rent Kara','Saad Zaitooni','+966 53 600 5831','saad.zaitooni@rentkara.com','RUH',NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783362201437,1783362351809,NULL);
INSERT INTO "customer" ("id","name","contact_person","mobile","email","city","address","maps_link","notes","created_by","created_at","updated_at","deleted_at") VALUES ('vapemtzehk8shsxwrapcd6fl','Probuy','Ibrahim Abuljadayel','+966581144897','Ibrahim@probuy.me',NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783417917001,1783417917001,NULL);
INSERT INTO "customer" ("id","name","contact_person","mobile","email","city","address","maps_link","notes","created_by","created_at","updated_at","deleted_at") VALUES ('cye41h0kkf4ppr3ynp1hpu3w','JeelPay','Ahmed Almutairi','+966544909444','a.almutairi@jeel.com','RUH',NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783774770631,1783774770631,NULL);
INSERT INTO "partner_contract" ("id","partner_id","name","service_type_id","pricing_model","unit_price","start_date","end_date","status","created_at","updated_at") VALUES ('k8pnjzryescsqmvbwgb35gpv','iiwfklhqv1rrhzz9ahp4ea99','Delivery','i6v6jo5n8rb8ysr6n4ufcduc','per_order',40,NULL,NULL,'active',1781822273848,1781822273848);
INSERT INTO "partner_contract" ("id","partner_id","name","service_type_id","pricing_model","unit_price","start_date","end_date","status","created_at","updated_at") VALUES ('l2awm73yudm2nlqmv4y5hllk','iiwfklhqv1rrhzz9ahp4ea99','Software Services','o86pyvmaa4ktp7b517r5tiyb','per_item',15,NULL,NULL,'active',1781822328339,1781822328339);
INSERT INTO "partner_contract" ("id","partner_id","name","service_type_id","pricing_model","unit_price","start_date","end_date","status","created_at","updated_at") VALUES ('iwt57tqceyyp8ciknjsf3vl5','iiwfklhqv1rrhzz9ahp4ea99','Hardware Services','o86pyvmaa4ktp7b517r5tiyb','per_order',15,NULL,NULL,'active',1781822354117,1781822354117);
INSERT INTO "partner_contract" ("id","partner_id","name","service_type_id","pricing_model","unit_price","start_date","end_date","status","created_at","updated_at") VALUES ('n3b8liw702ygombfikuuy611','qtf1zy993pr583jzp4hl2ey8','Delivery','i6v6jo5n8rb8ysr6n4ufcduc','per_order',40,NULL,NULL,'active',1783880181985,1783880181985);
INSERT INTO "partner_contract" ("id","partner_id","name","service_type_id","pricing_model","unit_price","start_date","end_date","status","created_at","updated_at") VALUES ('ktijzl4kc87r6p2kn79i3rqe','qtf1zy993pr583jzp4hl2ey8','Collection','inqyhlb9cap7250sx0q7u4ro','per_order',40,NULL,NULL,'active',1783880210479,1783880210479);
INSERT INTO "partner_payment" ("id","partner_id","partner_task_id","batch_id","pricing_model","quantity","unit_price","total_amount","status","notes","created_at","updated_at") VALUES ('kkg937n12323ydd4brzst51r','iiwfklhqv1rrhzz9ahp4ea99','d3jnl1o6fm58vbhpoe65jjk2',NULL,'per_order',1,40,40,'pending',NULL,1783419271073,1783419271073);
INSERT INTO "partner_task" ("id","request_id","partner_id","contract_id","task_type_id","task_token","task_token_expires_at","status","notes","failure_reason","failure_notes","signoff_quantity","assigned_by","assigned_at","accepted_at","completed_at","closed_by","closed_at","created_at","updated_at","contact_id","execution_mode","photo_required") VALUES ('z89i0l3e5q4fe075i0rb9zx0','cwz14115ktn45qxe327zcu3z','iiwfklhqv1rrhzz9ahp4ea99','k8pnjzryescsqmvbwgb35gpv',NULL,'QUaT6wItDQdEXpJp7J1JrA35iRxvfMvurqqEpG55NyFxHk1y',1783358242435,'cancelled','من الصباح للمساء',NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783151854096,1783153191567,NULL,NULL,NULL,1783151854098,1783358242435,'hur2jc4q5vv7iux0sns5rz2j','manual',1);
INSERT INTO "partner_task" ("id","request_id","partner_id","contract_id","task_type_id","task_token","task_token_expires_at","status","notes","failure_reason","failure_notes","signoff_quantity","assigned_by","assigned_at","accepted_at","completed_at","closed_by","closed_at","created_at","updated_at","contact_id","execution_mode","photo_required") VALUES ('zdrqfnlnnwkdoklvit45mwmq','adzsjrmbuq7enjmso4x11qi5','iiwfklhqv1rrhzz9ahp4ea99','k8pnjzryescsqmvbwgb35gpv',NULL,'Bl5YXGx01MhPad9cVrHTvmQff1Ovd8krZVVz742jqiM3Mm54',1783965445420,'in_progress','ضروري كلمها وانت في الطريق',NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783360645421,1783360696057,NULL,NULL,NULL,1783360645422,1783360702681,'buphkxnw58cmxurm1z8zlwt1','manual',1);
INSERT INTO "partner_task" ("id","request_id","partner_id","contract_id","task_type_id","task_token","task_token_expires_at","status","notes","failure_reason","failure_notes","signoff_quantity","assigned_by","assigned_at","accepted_at","completed_at","closed_by","closed_at","created_at","updated_at","contact_id","execution_mode","photo_required") VALUES ('d3jnl1o6fm58vbhpoe65jjk2','ehtefziel5uiu27q18h9u50s','iiwfklhqv1rrhzz9ahp4ea99','k8pnjzryescsqmvbwgb35gpv',NULL,'mZZmfsDDTkU6cvyVgLhvPYNgFoWJAdg5oeHUjelgjHEurkAo',1783373638643,'closed','كلمها الله يسعدك قبل ماتروح لها ','customer_unavailable','',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783362538470,1783362856035,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783419270509,1783362538470,1783419270509,'vpesi7sc7x7d0i16rvrop0ux','manual',1);
INSERT INTO "partner_task" ("id","request_id","partner_id","contract_id","task_type_id","task_token","task_token_expires_at","status","notes","failure_reason","failure_notes","signoff_quantity","assigned_by","assigned_at","accepted_at","completed_at","closed_by","closed_at","created_at","updated_at","contact_id","execution_mode","photo_required") VALUES ('ohf38oyma2trxpdpti0r8xwz','ta51q7ha044v1t3bpi4ycwux','w8weqfwb575yxfceb0k66qjn',NULL,NULL,'uqKSNgX3cCQWzT554ZQBWycSKmibe6uUt33HovPdlILFjMlT',1784061228620,'pending',NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783456428622,NULL,NULL,NULL,NULL,1783456428622,1783456428622,'oc6t7kz4e56nxjymwq245bqi','api_courier',1);
INSERT INTO "partner" ("id","user_id","name","contact_person","mobile","email","city","status","notes","created_at","updated_at","deleted_at","activation_token","activation_token_expires_at") VALUES ('iiwfklhqv1rrhzz9ahp4ea99',NULL,'iMac Center','حبيب القرشي','+966 53 006 3736','Hbieb555@gmailcom','RUH','active',NULL,1781750767651,1783435640794,NULL,'OkPHOIyiifMb362prMaemJqXPdLST1e1v7V2kv0cK6S3ms2S',1783694840794);
INSERT INTO "partner" ("id","user_id","name","contact_person","mobile","email","city","status","notes","created_at","updated_at","deleted_at","activation_token","activation_token_expires_at") VALUES ('fz5r44w4y5diazc8rnbxxxjk',NULL,'AbdelRahman Ali','AbdelRahman Ali','+966539676684','Abdelrahman.ali@rentkara.com','RUH','active',NULL,1783408177325,1783408177325,NULL,NULL,NULL);
INSERT INTO "partner" ("id","user_id","name","contact_person","mobile","email","city","status","notes","created_at","updated_at","deleted_at","activation_token","activation_token_expires_at") VALUES ('w8weqfwb575yxfceb0k66qjn',NULL,'SMSA','حامد خوارزمي ','+966 59 407 4183',NULL,NULL,'active',NULL,1783439793716,1783439793716,NULL,NULL,NULL);
INSERT INTO "partner" ("id","user_id","name","contact_person","mobile","email","city","status","notes","created_at","updated_at","deleted_at","activation_token","activation_token_expires_at") VALUES ('qtf1zy993pr583jzp4hl2ey8','O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL','X','أحمد محمد','+966545192437',NULL,'RUH','active',NULL,1783880151427,1783882595399,NULL,NULL,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('zc7dzznkyaksbwrs53t8622e','cwz14115ktn45qxe327zcu3z','Laptop jkhjh','Dell ','knk','sdsdfesf',1,NULL,NULL,1783151711051,1783151711051,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('y8fbc04hdnf53uhb11n3qk2j','cwz14115ktn45qxe327zcu3z','jhkhk','lj;lj;','lml;j;','hkjh',1,NULL,NULL,1783151711051,1783151711051,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('zbfk9q05gzfqzm8q5vnlga55','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0KSR98',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('fmvbjgifo0esfzrn3bdbrj4d','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0KSR9M',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('z2sl2azr12qz3305aeuxh9jb','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0KSR8D',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('djk598txtr2yuzg32z16y6q8','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0LZTBW',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('xmix6rhxgczi7i8tvler2kbx','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0KL8VK',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('fa0g3m8dol35srymx3hkmd7g','adzsjrmbuq7enjmso4x11qi5','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro','Lenovo','L14','PW0KL8V7',1,NULL,NULL,1783360481513,1783360481513,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('txmh6coyu1lis01bx010ibik','ehtefziel5uiu27q18h9u50s','ThinkPad, L13, i7-1255U, 16GB Ram, 256GB Storage','Lenovo','L13','PW02S3VV',1,NULL,NULL,1783362463632,1783362463632,NULL);
INSERT INTO "request_item" ("id","request_id","description","brand","model","serial_number","quantity","accessories","notes","created_at","updated_at","order_unit_id") VALUES ('nc8kh20x5rli5wcycy87duou','ta51q7ha044v1t3bpi4ycwux','Apple MacBook Pro, M5 Max, 18 Core CPU and 32 Core GPU, 36GB, 2TB SSD, 16 Inch, Space Black',NULL,NULL,'CPV6TJN425',1,NULL,NULL,1783439681434,1783439681434,'y0y9tv3b00d9dpfh1olqdtx2');
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('i6v6jo5n8rb8ysr6n4ufcduc','delivery','Delivery','توصيل',1,1,1781736009238,NULL);
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('inqyhlb9cap7250sx0q7u4ro','collection','Collection','استلام',1,2,1781736009238,NULL);
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('afjy491dz5b1xh2v7861t335','swap','Swap','استبدال',1,3,1781736009238,NULL);
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('o86pyvmaa4ktp7b517r5tiyb','installation','Installation','تركيب',1,4,1781736009238,NULL);
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('tjyne889wfuie7xqgznscu9o','maintenance','Maintenance','صيانة',1,5,1781736009238,NULL);
INSERT INTO "request_type" ("id","slug","name_en","name_ar","is_active","sort_order","created_at","proof_config") VALUES ('s47d2rui2rs27xg4y6mvp4fh','inspection','Inspection','فحص',1,6,1781736009238,NULL);
INSERT INTO "request" ("id","request_number","tracking_code","type_id","customer_id","sales_ref","po_number","delivery_date","collection_date","time_window","status","require_national_id","notes","created_by","created_at","updated_at","deleted_at","quote_number","receiver_contact_id","origin","destination","scheduled_at") VALUES ('cwz14115ktn45qxe327zcu3z','KR-2026-00007','64WQ2S','i6v6jo5n8rb8ysr6n4ufcduc','ifyosp3y64ahrjfwujprell0',NULL,NULL,1783123200000,NULL,'9 to 5 ','in_progress',1,'kjlkjjljlkjlk','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783151710787,1783153655336,1783358242344,'11223',NULL,NULL,NULL,NULL);
INSERT INTO "request" ("id","request_number","tracking_code","type_id","customer_id","sales_ref","po_number","delivery_date","collection_date","time_window","status","require_national_id","notes","created_by","created_at","updated_at","deleted_at","quote_number","receiver_contact_id","origin","destination","scheduled_at") VALUES ('adzsjrmbuq7enjmso4x11qi5','KR-2026-00008','TRMVSW','i6v6jo5n8rb8ysr6n4ufcduc','qmmiqo0va3lc7ek2woaj7p6r',NULL,NULL,1783296000000,NULL,'9 to 5 ','in_progress',1,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783360481257,1783360703369,NULL,'10669','buphkxnw58cmxurm1z8zlwt1',NULL,NULL,NULL);
INSERT INTO "request" ("id","request_number","tracking_code","type_id","customer_id","sales_ref","po_number","delivery_date","collection_date","time_window","status","require_national_id","notes","created_by","created_at","updated_at","deleted_at","quote_number","receiver_contact_id","origin","destination","scheduled_at") VALUES ('ehtefziel5uiu27q18h9u50s','KR-2026-00009','9TZKRN','i6v6jo5n8rb8ysr6n4ufcduc','yokefh6mpsk34j7dg16gjehe',NULL,NULL,1783382400000,NULL,'9 to 5 ','assigned',1,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783362463429,1783419272577,NULL,NULL,'vpesi7sc7x7d0i16rvrop0ux','مخزن كارا بالعليا','ضحي',1783371600000);
INSERT INTO "request" ("id","request_number","tracking_code","type_id","customer_id","sales_ref","po_number","delivery_date","collection_date","time_window","status","require_national_id","notes","created_by","created_at","updated_at","deleted_at","quote_number","receiver_contact_id","origin","destination","scheduled_at") VALUES ('ta51q7ha044v1t3bpi4ycwux','KR-2026-00010','4K97QZ','i6v6jo5n8rb8ysr6n4ufcduc','vapemtzehk8shsxwrapcd6fl',NULL,NULL,1783468800000,NULL,NULL,'assigned',0,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783439681149,1783456429161,NULL,'10676','oc6t7kz4e56nxjymwq245bqi',NULL,NULL,NULL);
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('PvlKKm974q0aqMI6EfxKHEDwktpDzI1a',1782340813,'3fYpZfUV4By2izkSLUR78zjaRzxZiV2o',1781736013336,1781736013336,'','','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('IlQqrYTwximcSpZQZhWR1aj4ZNLYIpuF',1782340833,'NqhIPtMfFUKTksi0YfgsU2XR6QyuaeqS',1781736033781,1781736033781,'','','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('SGCmnQIOybqb9WWsSSIMZOU3K3Brk17Q',1782353574,'E3xhKl22BN7lh44Uu3fccDGCFzJPFLtA',1781748774117,1781748774117,'151.254.84.173','curl/8.7.1','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('Fwdi1esJ7EaX3OZIenFwF4iIK7yQb0BS',1782725486,'aC4RO7trT9NPpCRgoIRpKnmGyjSemraf',1781749401685,1782120686598,'151.254.84.173','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('MCXPdqZQc4uvGxxqIty5KYjuj0Qoxt9w',1782461567,'T1jmqNhxq69o4jIbYgNTIexm9V8R0CL0',1781767646284,1781856767452,'151.254.78.6','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('EVxF5VXqvF9RGE3Vgf88R68kiOTVDuKR',1782982943,'mgV2vNDYzROVA8KT8W3J7hTMA6wrLtBa',1782378143657,1782378143657,'2.90.38.227','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('MVB4afIF03k6fUsBeW8ulNBhQCSuXmSr',1784039054,'xzpaMe2vxmDoMSZxixyfJQTX4yspZaMr',1783107779401,1783434254994,'188.50.54.19','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('RZEc4AiVgPDvjIiS2MqJdHY1RQ0xywop',1784037622,'ZyEubupbMkLyZmDJmqb4gDxIhAHD3c7J',1783159599748,1783432822819,'77.31.194.215','Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/149.0.7827.137 Mobile/15E148 Safari/604.1','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('51FUeCvbs66RsydWsZT4R9J5BqYvIcwA',1784023380,'jEIhmvRF7TVaQJVW0wl6h4HhGcuOT3ZV',1783418580971,1783418580971,'0000:0000:0000:0000:0000:0000:0000:0000','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.18286.2 Chrome/148.0.7778.271 Electron/42.5.1 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('DtnoyXD0qF3R0ZBYmp8CbZaQOw6p61Xc',1784030843,'SrvVFXDlKmllSSW8MjTjl9wi0XkOqe4E',1783426043328,1783426043328,'0000:0000:0000:0000:0000:0000:0000:0000','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.18286.2 Chrome/148.0.7778.271 Electron/42.5.1 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('eT0t8ODA89e9vq40qRaYwaU3ueriJfma',1784443861,'iK1W2Aez7FmuOc6ZAX4LLkGsnokDjkXW',1783431215448,1783839061256,'51.39.228.171','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('CFIICOJNJmAHhKMcUOkr7NqeBv01EKaE',1784117486,'MS8zFJ6V3AG1Xh9ZDc3JrwYdjXBJqhPV',1783512686572,1783512686572,'51.39.228.171','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('7LDLEiMYi2mdf5No94g7r8qgdgr8Aux1',1784118743,'ZhO61ZDU1NTkGR2HC99IxIiKFRlEfbIQ',1783513943589,1783513943589,'51.39.228.171','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('yQe9pzuxhWjojEnlOLUjCBzXE7mTcuuc',1784465960,'6uEtfnsT8UQcocpCUg86btFpUqbBVSKB',1783514650937,1783861160951,'51.39.228.171','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('10cadf12mmfNm7GXobU62UEGoIHjFdEL',1784501355,'O9z83khYZzgAyxCzfKVn3fCyQ4HZ4X6X',1783808683931,1783896555669,'188.50.61.167','Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.7871.51 Mobile/15E148 Safari/604.1','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('pU7253oSL4tVEl0i0uUKT0C0ApHuWp1k',1784473174,'DIljogtWpwzaBjj9SMtLYf4MUX9jFy79',1783868374617,1783868374617,'51.36.51.176','Mozilla/5.0 (Android 9; Mobile; rv:107.0) Gecko/107.0 Firefox/107.0','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('ThZS9ChYwtMUG54WKa5fnjAX5DrlWo2E',1784487395,'al3BMbtrUuVSntJcZ2aszrGzLOpEhzAB',1783882595055,1783882595055,'','','O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('H5pNJtAluyVURraWlrrDOEeq04JcsxN9',1784487402,'4blQaYE0fLI0ocfecg6tVOmkZPNl7lUG',1783882602403,1783882602403,'77.232.123.55','Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36','O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL');
INSERT INTO "session" ("id","expires_at","token","created_at","updated_at","ip_address","user_agent","user_id") VALUES ('NkuWpbPr7ZOL5tYzwtmMCMGUkfcPiJLB',1784492770,'7mQq6AXTW2eC5THm4S23hHgz7hb00dNf',1783887970324,1783887970324,'188.50.32.101','curl/8.7.1','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "signature_event" ("id","signature_request_id","event_type","ip_address","user_agent","metadata","created_at") VALUES ('jnvddte5qquk0sosb6bw6hjo','xmzwm257qkvdku1p8ghsl7pl','signed',NULL,NULL,NULL,1783360769369);
INSERT INTO "signature_event" ("id","signature_request_id","event_type","ip_address","user_agent","metadata","created_at") VALUES ('o4bz9occg2jczxcbccm4ki9v','leclgtlcxrhqa5pi98jzto30','sent',NULL,NULL,NULL,1783365025827);
INSERT INTO "signature_event" ("id","signature_request_id","event_type","ip_address","user_agent","metadata","created_at") VALUES ('va25o5827lw91eupvj82n759','leclgtlcxrhqa5pi98jzto30','opened','46.152.27.125','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,1783365033059);
INSERT INTO "signature_event" ("id","signature_request_id","event_type","ip_address","user_agent","metadata","created_at") VALUES ('vkoi7dupt563r3cqff0nmser','leclgtlcxrhqa5pi98jzto30','signed','77.232.122.174','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',NULL,1783373309754);
INSERT INTO "signature_event" ("id","signature_request_id","event_type","ip_address","user_agent","metadata","created_at") VALUES ('m0jc9gqvp65ibgtq7zhubdq6','fjzv1ub0u97ykv43rdsucfqt','opened','93.168.10.217','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL,1783379694835);
INSERT INTO "signature_request" ("id","request_id","partner_task_id","initiated_by","initiator_id","customer_id","document_name","document_url","secure_token","require_national_id","otp_enabled","expiry_enabled","expires_at","reminder_enabled","reminder_sent_at","status","created_at","updated_at","verification_id","signatory_role","parent_signature_request_id","signatory_contact_id") VALUES ('xmzwm257qkvdku1p8ghsl7pl','adzsjrmbuq7enjmso4x11qi5','zdrqfnlnnwkdoklvit45mwmq','partner',NULL,'qmmiqo0va3lc7ek2woaj7p6r','Delivery Note',NULL,'e2c89c07122891f398e323586783e4e4a57b9c88da422b039203a5589bf0072a',1,0,0,NULL,0,NULL,'signed',1783360768376,1783360768916,'AUD-KG7XXZ','receiver',NULL,NULL);
INSERT INTO "signature_request" ("id","request_id","partner_task_id","initiated_by","initiator_id","customer_id","document_name","document_url","secure_token","require_national_id","otp_enabled","expiry_enabled","expires_at","reminder_enabled","reminder_sent_at","status","created_at","updated_at","verification_id","signatory_role","parent_signature_request_id","signatory_contact_id") VALUES ('leclgtlcxrhqa5pi98jzto30','ehtefziel5uiu27q18h9u50s',NULL,'admin','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','yokefh6mpsk34j7dg16gjehe','Delivery Note',NULL,'2a670eea44e4e85e9a18074b452b19e22dc5d1f7a22886e59f525f55990a702a',1,0,0,NULL,0,NULL,'signed',1783364999089,1783373309507,'AUD-9DYA7D','receiver',NULL,NULL);
INSERT INTO "signature_request" ("id","request_id","partner_task_id","initiated_by","initiator_id","customer_id","document_name","document_url","secure_token","require_national_id","otp_enabled","expiry_enabled","expires_at","reminder_enabled","reminder_sent_at","status","created_at","updated_at","verification_id","signatory_role","parent_signature_request_id","signatory_contact_id") VALUES ('fjzv1ub0u97ykv43rdsucfqt','ehtefziel5uiu27q18h9u50s',NULL,'admin','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','yokefh6mpsk34j7dg16gjehe','Delivery Note',NULL,'a32f3d2021ec8ae11fb6f7d12d29a7e65f1c7ab6e61f00d8e8e7be9e9b02dee2',1,0,0,NULL,0,NULL,'opened',1783379666882,1783379694702,NULL,'authorized','leclgtlcxrhqa5pi98jzto30','po5ccz3gl555pg2k837kfwd7');
INSERT INTO "user" ("id","name","email","email_verified","image","role","lang","created_at","updated_at","deleted_at","disabled_at") VALUES ('kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','Abdelrahman Ali','abdelrahman.ali@rentkara.com',1,NULL,'admin','en',1781736012763,1781736012763,NULL,NULL);
INSERT INTO "user" ("id","name","email","email_verified","image","role","lang","created_at","updated_at","deleted_at","disabled_at") VALUES ('vbponm2vqagxicujmgmsrvhr','Temp Finance Tester','temp-finance-test@rentkara.com',1,NULL,'finance','en',1783512425508,1783514424899,NULL,1783514424899);
INSERT INTO "user" ("id","name","email","email_verified","image","role","lang","created_at","updated_at","deleted_at","disabled_at") VALUES ('O0FKUpkDwrPGAcNQeJdT6rRnLLEXPFGL','X','xahmad80@gmail.com',1,NULL,'partner','en',1783882594788,1783882594788,NULL,NULL);
INSERT INTO "notification" ("id","user_id","type","i18n_key","i18n_data","link_url","entity_type","entity_id","read_at","created_at","dedupe_key") VALUES ('f5o5w7vo1obebvt6zumrfsq3','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','customer_signed','notifications.customerSigned','{"customerName":"dhuha alsubaie","requestNumber":"KR-2026-00009"}','/admin/requests/ehtefziel5uiu27q18h9u50s','signature_request','leclgtlcxrhqa5pi98jzto30',1783374929288,1783373310600,NULL);
INSERT INTO "notification" ("id","user_id","type","i18n_key","i18n_data","link_url","entity_type","entity_id","read_at","created_at","dedupe_key") VALUES ('x22x8mgp1pwa5iz5c48sm4b9','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh','task_pending_signoff','notifications.taskPendingSignoff',NULL,'/admin/requests','task','ztest_photoreq01',NULL,1783889186817,'zm64si8vlisq2h396iu9hroz:kb0Sn8iriF6VMKo39rpYEHog5ojawlfh');
INSERT INTO "signature_item_condition" ("id","signature_request_id","request_item_id","condition","received_quantity","notes","created_at") VALUES ('mo7jm2us82u98rsweyf5xy06','leclgtlcxrhqa5pi98jzto30','txmh6coyu1lis01bx010ibik','good',NULL,NULL,1783373309839);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('hur2jc4q5vv7iux0sns5rz2j','ifyosp3y64ahrjfwujprell0','ِعلي فرحات',NULL,'+966592887327',NULL,'RUH','الدور الأول مكتب رقم ٨  - مدخل المكاتب بجوار  مطعم دوار السعاده','https://maps.google.com?q=Elegant%20Centre,%203429-3467%20Al%20Jamiah%20St,%20Al%20Malaz,%20Riyadh%2012642,%20Saudi%20Arabia&ftid=0x3e2f0438bdbdb62d:0xb965b3ccc002ff33&entry=gps&shh=CAE&lucs=,94297699,94231188,94280568,47071704,94218641,100808654,94282134,100813469,94286869,100820242&g_st=ic',NULL,0,1783151797634,1783357945371);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('buphkxnw58cmxurm1z8zlwt1','qmmiqo0va3lc7ek2woaj7p6r','سارة الفيصل',NULL,'+966556098997',NULL,'RUH','الدور الاول - أعلي مقهي دانكن','https://maps.app.goo.gl/zJdsqnGePqTUSD8o9?g_st=ic',NULL,0,1783358129188,1783360809588);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('kddmajrqq3chpoaoa2mcl9dv','qmmiqo0va3lc7ek2woaj7p6r','Nouf Aljumaah','HR Manager','+966532576578',NULL,'RUH','الدور الاول - أعلي مقهي دانكن','https://maps.app.goo.gl/zJdsqnGePqTUSD8o9?g_st=ic',NULL,1,1783358228499,1783360818694);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('vpesi7sc7x7d0i16rvrop0ux','yokefh6mpsk34j7dg16gjehe','ضحي','SDR','+966 55 441 4303','dhuha_alsubaie1@outlook.com','RUH',NULL,'https://www.google.com/maps?q=24.583454132080078,46.591182708740234&z=17&hl=en',NULL,0,1783362312275,1783364963712);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('po5ccz3gl555pg2k837kfwd7','yokefh6mpsk34j7dg16gjehe','Hind Alshammari','Head Of Business Unit','+966554367982','hind.alshammari@rentkara.com','RUH',NULL,NULL,NULL,1,1783379633239,1783379633239);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('oc6t7kz4e56nxjymwq245bqi','vapemtzehk8shsxwrapcd6fl','سمير الجعيبان',NULL,'+966504841008',NULL,'DMM',NULL,'https://maps.google.com/?q=26.387039,50.107239',NULL,0,1783418085012,1783418085012);
INSERT INTO "customer_contact" ("id","customer_id","name","role","mobile","email","city","address","maps_link","notes","is_authorized_signatory","created_at","updated_at") VALUES ('yfc2mzny6v846nxw7zfes6m6','cye41h0kkf4ppr3ynp1hpu3w','Ahmed Almutairi','HR Manager','+966544909444',NULL,'RUH','اعلي بنك البلاد الدور الثاني مكتب ١٢','https://maps.app.goo.gl/U3v1ugboMjUxa47V6?g_st=ic',NULL,1,1783775649111,1783775649111);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('lcy2mqo87yameyorexr6qmsa','ccxazt2xv69rh9uid06wndh7','Apple MacBook Pro, M5 Max, 18 Core CPU and 32 Core GPU, 36GB, 2TB SSD, 16 Inch, Space Black',NULL,NULL,1,NULL,NULL,NULL,NULL,1783431881117,1783431881117);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6','ThinkPad L14, U7-255U, Ram 32GB, Storage 512GB, Win 11 Pro',NULL,NULL,6,NULL,NULL,NULL,NULL,1783432262767,1783432262767);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('x3jghyxabpcwq4r5cit4gz0v','uifntatltq92a63uxw2jf7c0','Samsung Odyssey G6 Curved Smart Gaming Monitor 32- inch 2k QHD 2560x1440, Display HDR 600, VA Panel Technology, 1ms Response Time, 240Hz Refresh Rate, Wi-Fi, Bluetooth, Free Sync Premium Pro, Operating System Tizen - Black',NULL,NULL,3,NULL,NULL,NULL,NULL,1783850528668,1783850528668);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('i6zesbb34u52bwzwkhb3b53t','uifntatltq92a63uxw2jf7c0','HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax',NULL,NULL,1,NULL,NULL,NULL,NULL,1783850528668,1783850528668);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('xwijc0vglfkto9ze6v21bqtk','uifntatltq92a63uxw2jf7c0','SAMSUNG Galaxy A27, 5G, Ram 6GB + Storage 128 GB',NULL,NULL,1,NULL,NULL,NULL,NULL,1783850528668,1783850528668);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('iit63lgrk05utcwylvhrwfsq','tzro80jbteifp60ihep1pzka','ThinkPad L14, U7-255U, Ram 16GB, Storage 512GB, Win 11 Pro',NULL,NULL,1,NULL,NULL,NULL,NULL,1783863529096,1783863529096);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('vgymj0k2l6vicrj3tzdgbp16','tzro80jbteifp60ihep1pzka','Lenovo ThinkVision T27-40 Computer Monitor 27-Inch Full HD 1920x1080, IPS Panel Technology, Low Blue Light - Black',NULL,NULL,1,NULL,NULL,NULL,NULL,1783863529096,1783863529096);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('dqvc9wpesb38nc1jrnypufpz','oz2evlucuwxb5e83vcdqgr0t','APPLE MacBook Pro, Apple M5 Pro, with 18-core CPU and 20-core GPU, 24GB, 2TB SSD, 14 Inch',NULL,NULL,1,NULL,NULL,NULL,NULL,1783865182850,1783865182850);
INSERT INTO "order_line" ("id","order_id","description","brand","model","quantity","rental_months","unit_price_monthly","line_total","notes","created_at","updated_at") VALUES ('s4bdmwal8kxhw1m97oscynk7','oz2evlucuwxb5e83vcdqgr0t','16-inch MacBook Pro, M5 Max, 18-core CPU, 40-core GPU, 16-core Neural Engine, Ram 64GB, Storage 2TB',NULL,NULL,1,NULL,NULL,NULL,NULL,1783865182850,1783865182850);
INSERT INTO "order" ("id","order_number","customer_id","contact_person","contact_mobile","contact_email","quote_date","rental_period_months","additional_period_months","total","status","notes","created_by","created_at","updated_at","deleted_at") VALUES ('ccxazt2xv69rh9uid06wndh7','10676','vapemtzehk8shsxwrapcd6fl',NULL,NULL,NULL,1782950400000,NULL,NULL,NULL,'confirmed',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783431880992,1783432100444,NULL);
INSERT INTO "order" ("id","order_number","customer_id","contact_person","contact_mobile","contact_email","quote_date","rental_period_months","additional_period_months","total","status","notes","created_by","created_at","updated_at","deleted_at") VALUES ('gpggm9y6tyvwpjovl41qzlo6','10669','qmmiqo0va3lc7ek2woaj7p6r',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'fulfilled',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783432262645,1783435953663,NULL);
INSERT INTO "order" ("id","order_number","customer_id","contact_person","contact_mobile","contact_email","quote_date","rental_period_months","additional_period_months","total","status","notes","created_by","created_at","updated_at","deleted_at") VALUES ('uifntatltq92a63uxw2jf7c0','10682','cye41h0kkf4ppr3ynp1hpu3w',NULL,NULL,NULL,1783382400000,NULL,NULL,NULL,'draft',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783850528525,1783850528525,NULL);
INSERT INTO "order" ("id","order_number","customer_id","contact_person","contact_mobile","contact_email","quote_date","rental_period_months","additional_period_months","total","status","notes","created_by","created_at","updated_at","deleted_at") VALUES ('tzro80jbteifp60ihep1pzka','10684','qmmiqo0va3lc7ek2woaj7p6r',NULL,NULL,NULL,1783468800000,NULL,NULL,NULL,'draft',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783863528933,1783863528933,NULL);
INSERT INTO "order" ("id","order_number","customer_id","contact_person","contact_mobile","contact_email","quote_date","rental_period_months","additional_period_months","total","status","notes","created_by","created_at","updated_at","deleted_at") VALUES ('oz2evlucuwxb5e83vcdqgr0t','10668','cye41h0kkf4ppr3ynp1hpu3w',NULL,NULL,NULL,1783382400000,NULL,NULL,NULL,'draft',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865182715,1783865182715,NULL);
INSERT INTO "supplier" ("id","name","contact_person","mobile","email","city","address","notes","created_by","created_at","updated_at","deleted_at") VALUES ('ckm1eqotp5036c76mpho472g','Golden Technology','طه خلف','+966 53 098 0422',NULL,'RUH',NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783431952274,1783431960541,NULL);
INSERT INTO "supplier" ("id","name","contact_person","mobile","email","city","address","notes","created_by","created_at","updated_at","deleted_at") VALUES ('cblu7vtm5m54g9w5tno32aky','قصر الحاسبات','عبدالرحمن خليفه','+966 54 444 9882',NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783432302908,1783432377961,NULL);
INSERT INTO "supplier" ("id","name","contact_person","mobile","email","city","address","notes","created_by","created_at","updated_at","deleted_at") VALUES ('l0f4qsgf0jfp0m3udl3unff2','ميدان الشراع','Emad Alzanaty','+966 55 801 9409',NULL,'RUH',NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783432354164,1783432354164,NULL);
INSERT INTO "supplier" ("id","name","contact_person","mobile","email","city","address","notes","created_by","created_at","updated_at","deleted_at") VALUES ('oig1r87e0j5s0votgpzs604d','شركة اصوات الفضاء','علي ابو ناصر','+966500273203',NULL,NULL,'المرسلات',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783877830821,1783877830821,NULL);
INSERT INTO "supplier" ("id","name","contact_person","mobile","email","city","address","notes","created_by","created_at","updated_at","deleted_at") VALUES ('y5pugn95jiwqvz74u24is726','اكسترا',NULL,NULL,NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783877935783,1783877935783,NULL);
INSERT INTO "asset_event" ("id","asset_id","type","from_status","to_status","request_id","customer_id","notes","by_user_id","created_at") VALUES ('z6hcyk2xb1mqp3ukj4ieuhw1','y0y9tv3b00d9dpfh1olqdtx2','assigned',NULL,'assigned','ta51q7ha044v1t3bpi4ycwux','vapemtzehk8shsxwrapcd6fl',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783439681850);
INSERT INTO "customer_portal_token" ("id","customer_id","token","created_at") VALUES ('e8pv7za9npqsm1z5jmftu51y','cye41h0kkf4ppr3ynp1hpu3w','U5GiRoWDC4kcohAW88jrIPBTAAFWNtlgf5CuXSzN13OVHAZ9',1783774778481);
INSERT INTO "app_setting" ("key","value","updated_by","updated_at") VALUES ('proofEnforcementEnabled','false',NULL,1783667452542);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('o0n11fy5q485siqiyttzg8ca','customer_unavailable','Customer unavailable','العميل غير متوفر',1,1,1783459409165);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('fy9pn7do9szxm12yc4srzjq2','wrong_address','Wrong address','عنوان خاطئ',1,2,1783459409165);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('x31bvjzhfgzjxe2ptb1zakdm','item_damaged','Item damaged','الجهاز تالف',1,3,1783459409165);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('a7uv8poyad6542pjxy1gpwhy','access_denied','Access denied','تم رفض الدخول',1,4,1783459409165);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('w76kh88lwao7pndenain7o3w','customer_rescheduled','Customer rescheduled','أعاد العميل الجدولة',1,5,1783459409165);
INSERT INTO "failure_reason" ("id","slug","name_en","name_ar","is_active","sort_order","created_at") VALUES ('woybygzbe6d8dn3ujbhxzdb7','other','Other','أخرى',1,6,1783459409165);
INSERT INTO "user_invite" ("id","user_id","token","expires_at","accepted_at","created_by","created_at") VALUES ('ye8xy4o59uan2tfafjq4x1ow','vbponm2vqagxicujmgmsrvhr','9YWtAcDqv1uYcmKUca6C2jOokqPQCllh5QZuPjnTP72naOvL',1783771625910,1783512520091,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783512425911);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('r8693ex2sgne22ho1q356f93','procurement_case','yr34xa0m3q8jbbbpk25wpwx6','ProcurementCaseCreated','{"source":"system_manual","sourcingRequestId":null}','procurement_case:yr34xa0m3q8jbbbpk25wpwx6:ProcurementCaseCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783773808459);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('hpt8cjlt5as8fq9i7w6r3x53','purchase_order','ukty495a3ydn9fkkv2rd9ctg','PurchaseOrderCreated','{"poNumber":"PO-10378","supplierId":"ckm1eqotp5036c76mpho472g","lineCount":2}','purchase_order:ukty495a3ydn9fkkv2rd9ctg:PurchaseOrderCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783773809086);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('qzkuiypuqpst34dq2wanxc9i','sourcing_request','mdjq56dc15ll9dyhqak49j0d','SourcingRequestCreated','{"sourceType":"customer_order","orderId":"uifntatltq92a63uxw2jf7c0","externalRef":null,"itemCount":1}','sourcing_request:mdjq56dc15ll9dyhqak49j0d:SourcingRequestCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783852944969);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('e9dbnfyut8wfkrp3x1zyin7r','supplier_rfq','skpax2kz9j0w9dbv6oi8f8fq','SupplierRfqSent','{"sourcingRequestId":"mdjq56dc15ll9dyhqak49j0d","supplierId":"ckm1eqotp5036c76mpho472g","itemIds":["fy7f5ypa3tz44z7nc8g9jow2"]}','supplier_rfq:skpax2kz9j0w9dbv6oi8f8fq:SupplierRfqSent','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783852965596);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('nsdyptfzhui6z56agxnrs9ph','supplier_quotation','vdopi9qkpidwxqq61eba17km','SupplierQuotationSubmitted','{"rfqId":"skpax2kz9j0w9dbv6oi8f8fq","lineCount":1}','supplier_quotation:vdopi9qkpidwxqq61eba17km:SupplierQuotationSubmitted','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854415517);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('sb03l7sw0lwgc1xn4lsjw4xa','commercial_evaluation','k3ee60hyjqiki1zet5crdy35','CommercialEvaluationCreated','{"sourcingRequestId":"mdjq56dc15ll9dyhqak49j0d","awardCount":1}','commercial_evaluation:k3ee60hyjqiki1zet5crdy35:CommercialEvaluationCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854439289);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('fajjl57htsg7evqrh1c610j3','commercial_approval','b0pp4xxfylh1vtqlqerupd8l','CommercialApprovalDecided','{"evaluationId":"k3ee60hyjqiki1zet5crdy35","decision":"approved"}','commercial_approval:b0pp4xxfylh1vtqlqerupd8l:CommercialApprovalDecided','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854449453);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('i3tny2i0dfnlrrwflu7vzzor','procurement_case','hae7sg2cxp56t1rz7udo2jip','ProcurementCaseCreated','{"source":"commercial_flow","sourcingRequestId":"mdjq56dc15ll9dyhqak49j0d","supplierId":"ckm1eqotp5036c76mpho472g"}','procurement_case:hae7sg2cxp56t1rz7udo2jip:ProcurementCaseCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854458427);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('z0hcr16hy1ox0uppazjxgz63','sourcing_request','r7xshmagwo25454givtg0ffz','SourcingRequestCreated','{"sourceType":"customer_order","orderId":"oz2evlucuwxb5e83vcdqgr0t","externalRef":null,"itemCount":1}','sourcing_request:r7xshmagwo25454givtg0ffz:SourcingRequestCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865281729);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('cytog6rty1of8pwtbmmypez2','supplier_rfq','wtvqxxd9bco0aaoh3z7ta3gg','SupplierRfqSent','{"sourcingRequestId":"r7xshmagwo25454givtg0ffz","supplierId":"ckm1eqotp5036c76mpho472g","itemIds":["jia3hf9b4e1mcqu6ilvbjyxm"]}','supplier_rfq:wtvqxxd9bco0aaoh3z7ta3gg:SupplierRfqSent','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865290419);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('z5eovlupi4hudmjcn485lyaz','supplier_quotation','j1hy5f85z245nk3cqdvikq98','SupplierQuotationSubmitted','{"rfqId":"wtvqxxd9bco0aaoh3z7ta3gg","lineCount":1}','supplier_quotation:j1hy5f85z245nk3cqdvikq98:SupplierQuotationSubmitted','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865348159);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('meuf593ubwrr10efktq2qxf9','commercial_evaluation','x3x7nhl66n6l8oaokjswouvy','CommercialEvaluationCreated','{"sourcingRequestId":"r7xshmagwo25454givtg0ffz","awardCount":1}','commercial_evaluation:x3x7nhl66n6l8oaokjswouvy:CommercialEvaluationCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865360002);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('h8rqmjl0kiw2ngd5w3jrv784','commercial_approval','uorkfr8b0myw2c3724cjesds','CommercialApprovalDecided','{"evaluationId":"x3x7nhl66n6l8oaokjswouvy","decision":"approved"}','commercial_approval:uorkfr8b0myw2c3724cjesds:CommercialApprovalDecided','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865373966);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('jpt5m7ktu35hhrupk4mvfkjz','procurement_case','ok2vyuhuz84x8xsh6fzn91ef','ProcurementCaseCreated','{"source":"commercial_flow","sourcingRequestId":"r7xshmagwo25454givtg0ffz","supplierId":"ckm1eqotp5036c76mpho472g"}','procurement_case:ok2vyuhuz84x8xsh6fzn91ef:ProcurementCaseCreated','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865381620);
INSERT INTO "domain_event" ("id","aggregate_type","aggregate_id","event_type","payload","dedupe_key","actor_user_id","occurred_at") VALUES ('zm64si8vlisq2h396iu9hroz','task','ztest_photoreq01','TaskPendingSignoff','{"fromStatus":"in_progress","toStatus":"pending_signoff"}','task:ztest_photoreq01:TaskPendingSignoff:ir5x11lvggx4cg2zxg940scm',NULL,1783889185026);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('gp4h44kbyjjjaz3rnwmp7ukc','r8693ex2sgne22ho1q356f93','projections','delivered',1,1783773808563,NULL,1783773810724,1783773808563);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('z9ssntdx6jyc94elcoliyc9h','r8693ex2sgne22ho1q356f93','notifications','delivered',1,1783773808646,NULL,1783773810961,1783773808646);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('vdyrgqfz5glpr0flcvtj8kyg','r8693ex2sgne22ho1q356f93','notion','delivered',1,1783773808724,NULL,1783773811327,1783773808724);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('fepf6udwqqfugasyzdhqcbus','hpt8cjlt5as8fq9i7w6r3x53','projections','delivered',1,1783773809166,NULL,1783773811521,1783773809166);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('m0v7qcv3ft33emzeqvzphfa3','hpt8cjlt5as8fq9i7w6r3x53','notifications','delivered',1,1783773809243,NULL,1783773812624,1783773809243);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('v8fn7iwm3ei30k0boberely1','hpt8cjlt5as8fq9i7w6r3x53','notion','delivered',1,1783773809323,NULL,1783773812791,1783773809323);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('uw71erfu2oymkahagn060ymy','qzkuiypuqpst34dq2wanxc9i','projections','delivered',1,1783852945060,NULL,1783852947348,1783852945060);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('qixhikeq3w7cu6pb338edh97','qzkuiypuqpst34dq2wanxc9i','notifications','delivered',1,1783852945155,NULL,1783852947480,1783852945155);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('pwejvbsogswp2iwame3orzxm','qzkuiypuqpst34dq2wanxc9i','notion','delivered',1,1783852945238,NULL,1783852947680,1783852945238);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('ux4ann58w5kh48ihyy99tdq2','e9dbnfyut8wfkrp3x1zyin7r','projections','delivered',1,1783852965707,NULL,1783852968299,1783852965707);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('m5p47sm82x977ngskgen2bef','e9dbnfyut8wfkrp3x1zyin7r','notifications','delivered',1,1783852965795,NULL,1783852968478,1783852965795);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('xstaqa11vl48juzh6dk6zmuq','e9dbnfyut8wfkrp3x1zyin7r','notion','delivered',1,1783852965882,NULL,1783852968633,1783852965882);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('xrl54t1bk264sfncolzz4nne','nsdyptfzhui6z56agxnrs9ph','projections','delivered',1,1783854415611,NULL,1783854418246,1783854415611);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('nzn3p5mtw5xwy3c8mgg6cbi2','nsdyptfzhui6z56agxnrs9ph','notifications','delivered',1,1783854415705,NULL,1783854418434,1783854415705);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('zqyby61um7h1f0llj8x91uiw','nsdyptfzhui6z56agxnrs9ph','notion','delivered',1,1783854415785,NULL,1783854418586,1783854415785);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('tb1bg5lvqfm0g3h78f1tni3f','sb03l7sw0lwgc1xn4lsjw4xa','projections','delivered',1,1783854439390,NULL,1783854442091,1783854439390);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('yz1y3kv0kb58kby3wusstiu6','sb03l7sw0lwgc1xn4lsjw4xa','notifications','delivered',1,1783854439489,NULL,1783854442271,1783854439489);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('w3ylmrf43lfatourdp00cauf','sb03l7sw0lwgc1xn4lsjw4xa','notion','delivered',1,1783854439570,NULL,1783854442450,1783854439570);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('oprcjm4zjr7fya3n6qw9y9k0','fajjl57htsg7evqrh1c610j3','projections','delivered',1,1783854449564,NULL,1783854452090,1783854449564);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('k06x2es2c8qyoeos23jlvgsx','fajjl57htsg7evqrh1c610j3','notifications','delivered',1,1783854449680,NULL,1783854452276,1783854449680);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('eqoxzcdl1tqmxm7a2lymizzj','fajjl57htsg7evqrh1c610j3','notion','delivered',1,1783854449767,NULL,1783854452429,1783854449767);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('pdi1zbew4v2v55z0vkkruakv','i3tny2i0dfnlrrwflu7vzzor','projections','delivered',1,1783854458511,NULL,1783854461048,1783854458511);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('zpcx5ueg5bgs1xh57fo92o7b','i3tny2i0dfnlrrwflu7vzzor','notifications','delivered',1,1783854458600,NULL,1783854461204,1783854458600);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('yn9n0s7bn4hw9b20twt633m5','i3tny2i0dfnlrrwflu7vzzor','notion','delivered',1,1783854458686,NULL,1783854461355,1783854458686);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('v93l7nmxzxz1wmen4z18px2y','z0hcr16hy1ox0uppazjxgz63','projections','delivered',1,1783865281856,NULL,1783865284319,1783865281856);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('zvksuiawwat930lws3malxd9','z0hcr16hy1ox0uppazjxgz63','notifications','delivered',1,1783865281957,NULL,1783865284524,1783865281957);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('o2tz1540d84ygo9m5mh122dw','z0hcr16hy1ox0uppazjxgz63','notion','delivered',1,1783865282042,NULL,1783865284698,1783865282042);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('vmjcjj5kuqs64behe0nh3jj0','cytog6rty1of8pwtbmmypez2','projections','delivered',1,1783865290521,NULL,1783865293177,1783865290521);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('h54snfenfu2te1puyjq4erha','cytog6rty1of8pwtbmmypez2','notifications','delivered',1,1783865290610,NULL,1783865293366,1783865290610);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('bv5ca59s6fjqt5mbnhxbg7ia','cytog6rty1of8pwtbmmypez2','notion','delivered',1,1783865290706,NULL,1783865293538,1783865290706);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('shky1e6gofgc0hmk483eqdg6','z5eovlupi4hudmjcn485lyaz','projections','delivered',1,1783865348249,NULL,1783865350747,1783865348249);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('s4qwbgzj8c46a0j011dhf2vp','z5eovlupi4hudmjcn485lyaz','notifications','delivered',1,1783865348339,NULL,1783865350896,1783865348339);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('ajmvjq921t8ska7tilb6kjq9','z5eovlupi4hudmjcn485lyaz','notion','delivered',1,1783865348417,NULL,1783865351030,1783865348417);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('m64ax3ssripkncx4u60a7k9x','meuf593ubwrr10efktq2qxf9','projections','delivered',1,1783865360089,NULL,1783865362577,1783865360089);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('pr84b8g42tb0cs1qyhx8oot9','meuf593ubwrr10efktq2qxf9','notifications','delivered',1,1783865360171,NULL,1783865362721,1783865360171);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('nb51d2fiuhvxsdz7zqluzh6i','meuf593ubwrr10efktq2qxf9','notion','delivered',1,1783865360249,NULL,1783865362864,1783865360249);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('hqti49wyatizo93f7sxx5hwo','h8rqmjl0kiw2ngd5w3jrv784','projections','delivered',1,1783865374074,NULL,1783865376579,1783865374074);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('e2gxyq1rhvhw6ez111v6uuuk','h8rqmjl0kiw2ngd5w3jrv784','notifications','delivered',1,1783865374183,NULL,1783865376750,1783865374183);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('a9fqp7qk91x0mu8e8tlzbqeu','h8rqmjl0kiw2ngd5w3jrv784','notion','delivered',1,1783865374277,NULL,1783865376903,1783865374277);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('h6zmamcadyiplce0fv7743cj','jpt5m7ktu35hhrupk4mvfkjz','projections','delivered',1,1783865381719,NULL,1783865384162,1783865381719);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('ppy6casgphm7azxprozsk314','jpt5m7ktu35hhrupk4mvfkjz','notifications','delivered',1,1783865381801,NULL,1783865384356,1783865381801);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('xuejonkwcndypfncw8j9n5t5','jpt5m7ktu35hhrupk4mvfkjz','notion','delivered',1,1783865381878,NULL,1783865384512,1783865381878);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('m2uey27pwm2u63w6zeqf35zg','zm64si8vlisq2h396iu9hroz','projections','delivered',1,1783889185103,NULL,1783889186585,1783889185103);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('askum5xqf9k2oh5befe590jv','zm64si8vlisq2h396iu9hroz','notifications','delivered',1,1783889185195,NULL,1783889186919,1783889185195);
INSERT INTO "event_delivery" ("id","event_id","consumer","status","attempts","next_attempt_at","last_error","delivered_at","created_at") VALUES ('sfx4c6d8iv9xl0m6jo6t5drf','zm64si8vlisq2h396iu9hroz','notion','delivered',1,1783889185269,NULL,1783889187016,1783889185269);
INSERT INTO "purchase_order_line" ("id","purchase_order_id","item_description","brand","model","requires_serial","qty_ordered","qty_received","unit_cost","created_at","updated_at","status","cancelled_at","cancel_reason") VALUES ('vh66uzne88lqz43616sity6k','ukty495a3ydn9fkkv2rd9ctg','HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax',NULL,NULL,1,1,0,1230,1783773808997,1783773808997,'active',NULL,NULL);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('y0y9tv3b00d9dpfh1olqdtx2','lcy2mqo87yameyorexr6qmsa','ccxazt2xv69rh9uid06wndh7',NULL,NULL,'CPV6TJN425','ckm1eqotp5036c76mpho472g',19435,NULL,NULL,NULL,'assigned','main_warehouse','ta51q7ha044v1t3bpi4ycwux','vapemtzehk8shsxwrapcd6fl',NULL,NULL,NULL,1783432100096,1783439681674);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('qz08uebock818icuciuklgee','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0KSR98','cblu7vtm5m54g9w5tno32aky',6198.5,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435952763);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('aekx243xpfwe6xoy5orcuxyj','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0KSR9M','cblu7vtm5m54g9w5tno32aky',6198.5,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435952848);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('vphlvpunyzsn9ez14ff08tpf','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0KSR8D','cblu7vtm5m54g9w5tno32aky',6198.5,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435952930);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('q9lmwhlgino08gt23ktakxen','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0LZTBW','ckm1eqotp5036c76mpho472g',NULL,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435953012);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('kd1wxmj37ena8sty0kbo5n1x','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0KL8VK','ckm1eqotp5036c76mpho472g',NULL,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435953092);
INSERT INTO "order_unit" ("id","order_line_id","order_id","purchase_order_line_id","purchase_order_id","serial_number","supplier_id","purchase_cost","purchase_date","warranty_end","asset_tag","status","location","current_request_id","current_customer_id","retired_at","retirement_reason","notes","created_at","updated_at") VALUES ('rtxfg3bnvip4qp93qpsiw8ea','r713kzb63yk7h3218cq3v8oe','gpggm9y6tyvwpjovl41qzlo6',NULL,NULL,'PW0KL8V7','l0f4qsgf0jfp0m3udl3unff2',NULL,NULL,NULL,NULL,'delivered','main_warehouse',NULL,NULL,NULL,NULL,NULL,1783432645224,1783435953170);
INSERT INTO "commercial_approval" ("id","evaluation_id","decision","approver_id","notes","decided_at","created_at") VALUES ('b0pp4xxfylh1vtqlqerupd8l','k3ee60hyjqiki1zet5crdy35','approved','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',NULL,1783854449249,1783854449249);
INSERT INTO "commercial_approval" ("id","evaluation_id","decision","approver_id","notes","decided_at","created_at") VALUES ('uorkfr8b0myw2c3724cjesds','x3x7nhl66n6l8oaokjswouvy','approved','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',NULL,1783865373793,1783865373793);
INSERT INTO "commercial_evaluation" ("id","sourcing_request_id","chosen_quotation_id","status","notes","created_by","created_at","updated_at") VALUES ('k3ee60hyjqiki1zet5crdy35','mdjq56dc15ll9dyhqak49j0d',NULL,'active',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854438885,1783854438885);
INSERT INTO "commercial_evaluation" ("id","sourcing_request_id","chosen_quotation_id","status","notes","created_by","created_at","updated_at") VALUES ('x3x7nhl66n6l8oaokjswouvy','r7xshmagwo25454givtg0ffz',NULL,'active',NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865359660,1783865359660);
INSERT INTO "procurement_case" ("id","source","sourcing_request_id","commercial_approval_id","status","erp_system","external_po_ref","external_po_created_at","previous_case_id","superseded_by_case_id","created_by","created_at","updated_at","supplier_id") VALUES ('yr34xa0m3q8jbbbpk25wpwx6','system_manual',NULL,NULL,'open',NULL,NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783773808368,1783773808368,NULL);
INSERT INTO "procurement_case" ("id","source","sourcing_request_id","commercial_approval_id","status","erp_system","external_po_ref","external_po_created_at","previous_case_id","superseded_by_case_id","created_by","created_at","updated_at","supplier_id") VALUES ('hae7sg2cxp56t1rz7udo2jip','commercial_flow','mdjq56dc15ll9dyhqak49j0d','b0pp4xxfylh1vtqlqerupd8l','open',NULL,NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783854458323,1783854458323,'ckm1eqotp5036c76mpho472g');
INSERT INTO "procurement_case" ("id","source","sourcing_request_id","commercial_approval_id","status","erp_system","external_po_ref","external_po_created_at","previous_case_id","superseded_by_case_id","created_by","created_at","updated_at","supplier_id") VALUES ('ok2vyuhuz84x8xsh6fzn91ef','commercial_flow','r7xshmagwo25454givtg0ffz','uorkfr8b0myw2c3724cjesds','open',NULL,NULL,NULL,NULL,NULL,'kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865381529,1783865381529,'ckm1eqotp5036c76mpho472g');
INSERT INTO "sourcing_request" ("id","source_type","order_id","order_line_id","description","status","created_by","created_at","updated_at","external_ref","title") VALUES ('mdjq56dc15ll9dyhqak49j0d','customer_order','uifntatltq92a63uxw2jf7c0',NULL,'HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax','handed_off','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783852944759,1783854458773,NULL,NULL);
INSERT INTO "sourcing_request" ("id","source_type","order_id","order_line_id","description","status","created_by","created_at","updated_at","external_ref","title") VALUES ('r7xshmagwo25454givtg0ffz','customer_order','oz2evlucuwxb5e83vcdqgr0t',NULL,'APPLE MacBook Pro, Apple M5 Pro, with 18-core CPU and 20-core GPU, 24GB, 2TB SSD, 14 Inch','handed_off','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783865281506,1783865381957,NULL,NULL);
INSERT INTO "supplier_quotation_line" ("id","quotation_id","item_description","qty","unit_price","lead_time_days","created_at","sourcing_request_item_id","offered_part_number","offered_spec","currency","tax_rate","availability","warranty","valid_until","upgrades_note","upgrades_cost") VALUES ('vnmwh51jpcmslhi3mh8ych3w','vdopi9qkpidwxqq61eba17km','HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax',1,1230,NULL,1783854415002,'fy7f5ypa3tz44z7nc8g9jow2',NULL,NULL,'SAR',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "supplier_quotation_line" ("id","quotation_id","item_description","qty","unit_price","lead_time_days","created_at","sourcing_request_item_id","offered_part_number","offered_spec","currency","tax_rate","availability","warranty","valid_until","upgrades_note","upgrades_cost") VALUES ('ruipxk4hpbp9ncba4us4zwp6','j1hy5f85z245nk3cqdvikq98','[MGDT4AB/A] Apple MacBook Pro, M5 Pro, 18 Core CPU and 20 Core GPU, 24GB, 2TB SSD, 14
Inch, Space Black MGDT4AB/A',1,11600,NULL,1783865347714,'jia3hf9b4e1mcqu6ilvbjyxm','MGDT4AB/A','Apple MacBook Pro, M5 Pro, 18 Core CPU and 20 Core GPU, 24GB, 2TB SSD, 14 Inch, Space Black','SAR',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO "supplier_quotation" ("id","rfq_id","valid_until","notes","status","created_at","updated_at") VALUES ('vdopi9qkpidwxqq61eba17km','skpax2kz9j0w9dbv6oi8f8fq',NULL,NULL,'submitted',1783854414861,1783854414861);
INSERT INTO "supplier_quotation" ("id","rfq_id","valid_until","notes","status","created_at","updated_at") VALUES ('j1hy5f85z245nk3cqdvikq98','wtvqxxd9bco0aaoh3z7ta3gg',NULL,NULL,'submitted',1783865347622,1783865347622);
INSERT INTO "supplier_rfq" ("id","sourcing_request_id","supplier_id","status","sent_at","created_at","updated_at") VALUES ('skpax2kz9j0w9dbv6oi8f8fq','mdjq56dc15ll9dyhqak49j0d','ckm1eqotp5036c76mpho472g','responded',1783852965384,1783852965384,1783854415143);
INSERT INTO "supplier_rfq" ("id","sourcing_request_id","supplier_id","status","sent_at","created_at","updated_at") VALUES ('wtvqxxd9bco0aaoh3z7ta3gg','r7xshmagwo25454givtg0ffz','ckm1eqotp5036c76mpho472g','responded',1783865290210,1783865290210,1783865347813);
INSERT INTO "purchase_order" ("id","supplier_id","po_number","status","invoice_ref","ordered_at","notes","procurement_case_id","created_by","created_at","updated_at") VALUES ('ukty495a3ydn9fkkv2rd9ctg','ckm1eqotp5036c76mpho472g','PO-10378','ordered',NULL,1783773808803,NULL,'yr34xa0m3q8jbbbpk25wpwx6','kb0Sn8iriF6VMKo39rpYEHog5ojawlfh',1783773808803,1783773808803);
INSERT INTO "commercial_evaluation_line" ("id","evaluation_id","sourcing_request_item_id","chosen_quotation_line_id","reason","notes","created_at") VALUES ('bod88902ygfbvesai02o9kt3','k3ee60hyjqiki1zet5crdy35','fy7f5ypa3tz44z7nc8g9jow2','vnmwh51jpcmslhi3mh8ych3w','recommended',NULL,1783854438988);
INSERT INTO "commercial_evaluation_line" ("id","evaluation_id","sourcing_request_item_id","chosen_quotation_line_id","reason","notes","created_at") VALUES ('qzf722w8aye8zudqhvxiw7qq','x3x7nhl66n6l8oaokjswouvy','jia3hf9b4e1mcqu6ilvbjyxm','ruipxk4hpbp9ncba4us4zwp6','recommended',NULL,1783865359743);
INSERT INTO "sourcing_request_item" ("id","sourcing_request_id","quantity","customer_description","supplier_description","part_number","notes","status","created_at","updated_at") VALUES ('fy7f5ypa3tz44z7nc8g9jow2','mdjq56dc15ll9dyhqak49j0d',1,'HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax','HP Color LaserJet Pro MFP 3303fdw Printer Multi-function, Color print, copy, scan, fax',NULL,NULL,'selected',1783852944868,1783854439105);
INSERT INTO "sourcing_request_item" ("id","sourcing_request_id","quantity","customer_description","supplier_description","part_number","notes","status","created_at","updated_at") VALUES ('jia3hf9b4e1mcqu6ilvbjyxm','r7xshmagwo25454givtg0ffz',1,'APPLE MacBook Pro, Apple M5 Pro, with 18-core CPU and 20-core GPU, 24GB, 2TB SSD, 14 Inch','[MGDT4AB/A] Apple MacBook Pro, M5 Pro, 18 Core CPU and 20 Core GPU, 24GB, 2TB SSD, 14
Inch, Space Black MGDT4AB/A',NULL,NULL,'selected',1783865281625,1783865359836);
INSERT INTO "supplier_rfq_item" ("id","rfq_id","sourcing_request_item_id","created_at") VALUES ('f5lzrel824f6prfjbwv5vemw','skpax2kz9j0w9dbv6oi8f8fq','fy7f5ypa3tz44z7nc8g9jow2',1783852965497);
INSERT INTO "supplier_rfq_item" ("id","rfq_id","sourcing_request_item_id","created_at") VALUES ('kim0mjq8dx38sc9eylclwxu7','wtvqxxd9bco0aaoh3z7ta3gg','jia3hf9b4e1mcqu6ilvbjyxm',1783865290320);
