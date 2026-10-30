ALTER TABLE `sources` ADD `content_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `schedule_mode` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `daily_time` text DEFAULT '16:30' NOT NULL;