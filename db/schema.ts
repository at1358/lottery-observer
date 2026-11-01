import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const sources = sqliteTable('sources', {
 id: text('id').primaryKey(), name: text('name').notNull(), url: text('url').notNull().default(''),
 kind: text('kind').notNull(), year: integer('year').notNull(), selector: text('selector').notNull().default('body'),
 sample: text('sample').notNull().default(''),
 contentUrl: text('content_url').notNull().default(''),
 entryMode:text('entry_mode').notNull().default('direct'),entryKeyword:text('entry_keyword').notNull().default(''),entryLine:text('entry_line').notNull().default(''),
 locatorIdentity: text('locator_identity'), autoRelocate: integer('auto_relocate').notNull().default(1),
 scheduleMode: text('schedule_mode').notNull().default('inherit'),
 dailyTime: text('daily_time').notNull().default('16:30'),
 cutoffTime: text('cutoff_time').notNull().default('21:35'),
 trackingFrom: text('tracking_from'),
 folderId: text('folder_id'), sortOrder: integer('sort_order').notNull().default(0), deletedBatch: text('deleted_batch'),
 enabled: integer('enabled').notNull().default(0), interval: integer('interval').notNull().default(60),
 lastRun: text('last_run'), nextRun: text('next_run'), error: text('error'), createdAt: text('created_at').notNull(),
});
export const predictions = sqliteTable('predictions', {
 id: text('id').primaryKey(), sourceId: text('source_id').notNull(), year: integer('year').notNull(),
 issue: text('issue').notNull(), kind: text('kind').notNull(), raw: text('raw').notNull(),
 parsed: text('parsed').notNull(), firstSeen: text('first_seen').notNull(), lastSeen: text('last_seen').notNull(),
 historical: integer('historical').notNull().default(0), changed: integer('changed').notNull().default(0),
 deletedBatch: text('deleted_batch'),
 latestRaw:text('latest_raw'),latestParsed:text('latest_parsed'),latestKind:text('latest_kind'),latestVersion:integer('latest_version').notNull().default(0),retroactive:integer('retroactive').notNull().default(0),firstVerdict:text('first_verdict'),
}, t => [uniqueIndex('prediction_key').on(t.sourceId,t.year,t.issue)]);
export const draws = sqliteTable('draws', {
 id: text('id').primaryKey(), year: integer('year').notNull(), issue: text('issue').notNull(),
 number: integer('number').notNull(), zodiac: text('zodiac'), element: text('element'),
 numbers: text('numbers').notNull().default('[]'), zodiacs: text('zodiacs').notNull().default('[]'),
 drawDate: text('draw_date'),
 drawnAt: text('drawn_at'), provenance: text('provenance').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('draw_key').on(t.year,t.issue)]);
export const jobs = sqliteTable('jobs', {
 id: text('id').primaryKey(), sourceId: text('source_id'), name: text('name').notNull(), status: text('status').notNull(),
 message: text('message').notNull(), count: integer('count').notNull().default(0), createdAt: text('created_at').notNull(),
});
export const revisions = sqliteTable('revisions', {
 id: text('id').primaryKey(), predictionId: text('prediction_id').notNull(), raw: text('raw').notNull(), createdAt: text('created_at').notNull(),
 changeType:text('change_type').notNull().default('legacy'),metadata:text('metadata'),version:integer('version'),
},t=>[uniqueIndex('revisions_prediction_version').on(t.predictionId,t.version).where(sql`${t.version} IS NOT NULL`)]);
export const snapshots = sqliteTable('snapshots', {
 id: text('id').primaryKey(), sourceId: text('source_id').notNull(), html: text('html').notNull(), createdAt: text('created_at').notNull(),
});
export const settings = sqliteTable('settings', {key: text('key').primaryKey(),value: text('value').notNull()});
export const collectionPeriods = sqliteTable('collection_periods', {
 id: text('id').primaryKey(), sourceId: text('source_id').notNull(), year: integer('year').notNull(), issue: text('issue').notNull(),
 deadlineAt: text('deadline_at').notNull(), status: text('status').notNull(), reason: text('reason').notNull(), finalizedAt: text('finalized_at').notNull(),
 deletedBatch: text('deleted_batch'),
}, t=>[uniqueIndex('collection_period_key').on(t.sourceId,t.year,t.issue)]);
export const folders = sqliteTable('folders',{id:text('id').primaryKey(),name:text('name').notNull(),parentId:text('parent_id'),sortOrder:integer('sort_order').notNull().default(0),deletedBatch:text('deleted_batch'),createdAt:text('created_at').notNull()});
export const trash = sqliteTable('trash',{id:text('id').primaryKey(),type:text('type').notNull(),name:text('name').notNull(),count:integer('count').notNull(),payload:text('payload').notNull(),createdAt:text('created_at').notNull(),restoredAt:text('restored_at')});
export const users=sqliteTable('app_users',{id:text('id').primaryKey(),username:text('username').notNull().unique(),name:text('name').notNull(),passwordHash:text('password_hash').notNull(),role:text('role').notNull(),enabled:integer('enabled').notNull().default(1),createdAt:text('created_at').notNull(),lastLogin:text('last_login')});
export const sessions=sqliteTable('app_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull()});
export const loginAttempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),resetAt:text('reset_at').notNull()});
