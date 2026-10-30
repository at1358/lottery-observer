PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_draws` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`issue` text NOT NULL,
	`number` integer NOT NULL,
	`zodiac` text,
	`element` text,
	`drawn_at` text,
	`provenance` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_draws`("id", "year", "issue", "number", "zodiac", "element", "drawn_at", "provenance", "updated_at") SELECT "id", "year", "issue", "number", "zodiac", "element", "drawn_at", "provenance", "updated_at" FROM `draws`;--> statement-breakpoint
DROP TABLE `draws`;--> statement-breakpoint
ALTER TABLE `__new_draws` RENAME TO `draws`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `draw_key` ON `draws` (`year`,`issue`);