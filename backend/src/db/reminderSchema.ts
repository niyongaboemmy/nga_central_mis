import {
  mysqlTable,
  bigint,
  varchar,
  datetime,
  tinyint,
  int,
  text,
  json,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Reminder Hub tables (migration 092, REMINDERS_SOLUTION_PROPOSAL.md §5).
 * Kept out of schema.ts, like accessSchema.ts, so the feature's data model
 * reads as one unit.
 *
 * Every scheduling DATETIME is a UTC instant: Drizzle writes and reads Date
 * values for these columns as UTC text. Raw SQL must bind that same UTC text
 * (dispatcher.toDbUtc), never a bare Date or NOW() -- mysql2 would format
 * those in the host's zone. created_at/updated_at keep CURRENT_TIMESTAMP
 * defaults; they are bookkeeping, not scheduling.
 */

export const ReminderPreference = mysqlTable("ReminderPreference", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  enabled: tinyint("enabled").notNull().default(0),
  settings: json("settings"),
  quiet_start: varchar("quiet_start", { length: 5 }).notNull().default("21:00"),
  quiet_end: varchar("quiet_end", { length: 5 }).notNull().default("06:00"),
  morning_briefing: tinyint("morning_briefing").notNull().default(1),
  channels: json("channels"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const PushSubscription = mysqlTable("PushSubscription", {
  subscription_id: bigint("subscription_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  endpoint_hash: varchar("endpoint_hash", { length: 64 }).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  user_agent: varchar("user_agent", { length: 300 }),
  platform: varchar("platform", { length: 30 }),
  browser: varchar("browser", { length: 30 }),
  installed: tinyint("installed").notNull().default(0),
  failure_count: int("failure_count").notNull().default(0),
  last_success_at: datetime("last_success_at"),
  last_seen_at: datetime("last_seen_at"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const ReminderSource = mysqlTable("ReminderSource", {
  source_id: bigint("source_id", { mode: "number" }).primaryKey().autoincrement(),
  source_app: varchar("source_app", { length: 30 }).notNull(),
  source_type: varchar("source_type", { length: 30 }).notNull(),
  external_id: varchar("external_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: varchar("body", { length: 500 }),
  link: varchar("link", { length: 500 }),
  location: varchar("location", { length: 150 }),
  starts_at: datetime("starts_at").notNull(),
  ends_at: datetime("ends_at"),
  critical: tinyint("critical").notNull().default(0),
  audience_user_ids: json("audience_user_ids").notNull(),
  /** Students enrolled in this MIS subject (current year) are in the audience too. */
  audience_subject_id: bigint("audience_subject_id", { mode: "number" }),
  cancelled_at: datetime("cancelled_at"),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const ReminderJob = mysqlTable("ReminderJob", {
  job_id: bigint("job_id", { mode: "number" }).primaryKey().autoincrement(),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  dedupe_key: varchar("dedupe_key", { length: 191 }).notNull(),
  source_type: varchar("source_type", { length: 30 }).notNull(),
  source_ref: varchar("source_ref", { length: 100 }),
  title: varchar("title", { length: 255 }).notNull(),
  body: varchar("body", { length: 500 }),
  link: varchar("link", { length: 500 }),
  location: varchar("location", { length: 150 }),
  event_start: datetime("event_start").notNull(),
  event_end: datetime("event_end"),
  offset_min: int("offset_min").notNull().default(0),
  fire_at: datetime("fire_at").notNull(),
  critical: tinyint("critical").notNull().default(0),
  status: varchar("status", { length: 12 }).notNull().default("pending"),
  channels: varchar("channels", { length: 100 }),
  attempts: int("attempts").notNull().default(0),
  claim_token: varchar("claim_token", { length: 36 }),
  claimed_at: datetime("claimed_at"),
  sent_at: datetime("sent_at"),
  acked_at: datetime("acked_at"),
  escalated_at: datetime("escalated_at"),
  last_error: varchar("last_error", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updated_at: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const CalendarFeedToken = mysqlTable("CalendarFeedToken", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  token: varchar("token", { length: 64 }).notNull(),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  last_fetched_at: datetime("last_fetched_at"),
});

// ─── Channels (migration 093) ───────────────────────────────────────────────

export const TelegramLink = mysqlTable("TelegramLink", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  chat_id: bigint("chat_id", { mode: "number" }).notNull(),
  username: varchar("username", { length: 64 }),
  linked_at: datetime("linked_at").default(sql`CURRENT_TIMESTAMP`),
});

export const TelegramLinkCode = mysqlTable("TelegramLinkCode", {
  code: varchar("code", { length: 64 }).primaryKey(),
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  expires_at: datetime("expires_at").notNull(),
});

export const GoogleCalendarLink = mysqlTable("GoogleCalendarLink", {
  user_id: bigint("user_id", { mode: "number" }).primaryKey(),
  google_email: varchar("google_email", { length: 255 }),
  refresh_token_enc: text("refresh_token_enc").notNull(),
  calendar_id: varchar("calendar_id", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  last_sync_at: datetime("last_sync_at"),
  last_error: varchar("last_error", { length: 500 }),
  created_at: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const GoogleCalendarEvent = mysqlTable("GoogleCalendarEvent", {
  user_id: bigint("user_id", { mode: "number" }).notNull(),
  occurrence_key: varchar("occurrence_key", { length: 191 }).notNull(),
  event_id: varchar("event_id", { length: 255 }).notNull(),
  content_hash: varchar("content_hash", { length: 40 }).notNull(),
  starts_at: datetime("starts_at").notNull(),
});
