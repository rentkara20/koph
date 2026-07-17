ALTER TABLE `request` ADD `delivery_part_number` integer;--> statement-breakpoint
WITH `ranked_deliveries` AS (
	SELECT
		`request`.`id` AS `id`,
		ROW_NUMBER() OVER (
			PARTITION BY trim(`request`.`quote_number`)
			ORDER BY `request`.`created_at`, `request`.`id`
		) AS `part_number`
	FROM `request`
	INNER JOIN `request_type` ON `request`.`type_id` = `request_type`.`id`
	WHERE `request_type`.`slug` = 'delivery'
		AND `request`.`quote_number` IS NOT NULL
		AND trim(`request`.`quote_number`) <> ''
)
UPDATE `request`
SET `delivery_part_number` = (
	SELECT `part_number`
	FROM `ranked_deliveries`
	WHERE `ranked_deliveries`.`id` = `request`.`id`
)
WHERE `request`.`id` IN (SELECT `id` FROM `ranked_deliveries`);--> statement-breakpoint
CREATE UNIQUE INDEX `request_order_delivery_part_unique_idx` ON `request` (`quote_number`,`delivery_part_number`) WHERE "request"."quote_number" IS NOT NULL AND "request"."delivery_part_number" IS NOT NULL;
