CREATE TABLE `draws` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`issue` text NOT NULL,
	`number` integer NOT NULL,
	`zodiac` text,
	`element` text,
	`drawn_at` text NOT NULL,
	`provenance` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draw_key` ON `draws` (`year`,`issue`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`year` integer NOT NULL,
	`issue` text NOT NULL,
	`kind` text NOT NULL,
	`raw` text NOT NULL,
	`parsed` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`historical` integer DEFAULT 0 NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_key` ON `predictions` (`source_id`,`year`,`issue`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_id` text NOT NULL,
	`raw` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`html` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`year` integer NOT NULL,
	`selector` text DEFAULT 'body' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`interval` integer DEFAULT 60 NOT NULL,
	`last_run` text,
	`next_run` text,
	`error` text,
	`created_at` text NOT NULL
);
