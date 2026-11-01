ALTER TABLE `predictions` ADD `latest_raw` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `latest_parsed` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `latest_kind` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `latest_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `predictions` ADD `retroactive` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `predictions` ADD `first_verdict` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `change_type` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `revisions` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `version` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_prediction_version` ON `revisions` (`prediction_id`,`version`) WHERE "revisions"."version" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `locator_identity` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `auto_relocate` integer DEFAULT 1 NOT NULL;