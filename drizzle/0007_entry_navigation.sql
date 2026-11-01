ALTER TABLE `sources` ADD `entry_mode` text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `entry_keyword` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `entry_line` text DEFAULT '' NOT NULL;