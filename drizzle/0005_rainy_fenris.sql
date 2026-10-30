CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_batch` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trash` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`count` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`restored_at` text
);
--> statement-breakpoint
CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`last_login` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_username_unique` ON `app_users` (`username`);--> statement-breakpoint
ALTER TABLE `collection_periods` ADD `deleted_batch` text;--> statement-breakpoint
ALTER TABLE `predictions` ADD `deleted_batch` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `folder_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `deleted_batch` text;
--> statement-breakpoint
INSERT OR IGNORE INTO folders(id,name,sort_order,created_at) SELECT 'kind:' || kind,kind,0,MIN(created_at) FROM sources GROUP BY kind;
--> statement-breakpoint
UPDATE sources SET folder_id='kind:' || kind;
