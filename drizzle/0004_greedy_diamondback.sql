CREATE TABLE `collection_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`year` integer NOT NULL,
	`issue` text NOT NULL,
	`deadline_at` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`finalized_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_period_key` ON `collection_periods` (`source_id`,`year`,`issue`);--> statement-breakpoint
ALTER TABLE `draws` ADD `numbers` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `draws` ADD `zodiacs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `draws` ADD `draw_date` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `cutoff_time` text DEFAULT '21:35' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `tracking_from` text;
--> statement-breakpoint
UPDATE sources SET tracking_from=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE enabled=1 AND tracking_from IS NULL;
