import { eq } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourSetting } from "../../db/officeHoursSchema";
import { ValidationError } from "../../errors/CustomError";
import { clockOrThrow, now } from "./common";

/**
 * School-wide office-hours policy (plan §6.8): one row, id = 1. Cached for a
 * minute in this (single) process and dropped on save.
 */
export type OfficeHourSettings = typeof OfficeHourSetting.$inferSelect;

const DEFAULTS: OfficeHourSettings = {
  id: 1,
  student_lock_mode: "TERM",
  allow_any_student: 0,
  band_start: "16:20",
  band_end: "17:20",
  allowed_window_start: "16:00",
  allowed_window_end: "18:00",
  default_capacity: 15,
  max_capacity: 40,
  roster_cutoff_time: "14:00",
  late_after_minutes: 10,
  register_edit_days: 7,
  auto_close_unmarked: 0,
  escalation_consecutive_l1: 2,
  escalation_month_l1: 2,
  escalation_consecutive_l2: 3,
  rate_band_consistent: 90,
  rate_band_watch: 80,
  min_sessions_for_rate: 3,
  parent_notifications: "ESCALATIONS",
  qr_checkin_enabled: 0,
  updated_by: null,
  updated_at: null,
};

let cache: { at: number; value: OfficeHourSettings } | null = null;
const TTL_MS = 60_000;

export const invalidateSettings = () => {
  cache = null;
};

export const getSettings = async (): Promise<OfficeHourSettings> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const [row] = await db.select().from(OfficeHourSetting).where(eq(OfficeHourSetting.id, 1)).limit(1);
  const value = row ?? DEFAULTS;
  cache = { at: Date.now(), value };
  return value;
};

const INT_FIELDS: Array<[keyof OfficeHourSettings, number, number]> = [
  ["default_capacity", 1, 200],
  ["max_capacity", 1, 200],
  ["late_after_minutes", 0, 60],
  ["register_edit_days", 0, 60],
  ["escalation_consecutive_l1", 1, 20],
  ["escalation_month_l1", 1, 20],
  ["escalation_consecutive_l2", 1, 30],
  ["rate_band_consistent", 1, 100],
  ["rate_band_watch", 1, 100],
  ["min_sessions_for_rate", 1, 50],
];
const CLOCK_FIELDS: Array<keyof OfficeHourSettings> = [
  "band_start",
  "band_end",
  "allowed_window_start",
  "allowed_window_end",
  "roster_cutoff_time",
];
const BOOL_FIELDS: Array<keyof OfficeHourSettings> = ["allow_any_student", "auto_close_unmarked", "qr_checkin_enabled"];

/** Validate and save a partial settings update. Returns the saved row. */
export const saveSettings = async (input: Record<string, unknown>, actorId: number) => {
  const current = await getSettings();
  const next: Record<string, unknown> = {};
  const errors: Array<{ field: string; message: string }> = [];

  if (input.student_lock_mode !== undefined) {
    if (input.student_lock_mode !== "TERM" && input.student_lock_mode !== "WEEKDAY") {
      errors.push({ field: "student_lock_mode", message: "Must be TERM or WEEKDAY" });
    } else next.student_lock_mode = input.student_lock_mode;
  }
  if (input.parent_notifications !== undefined) {
    if (!["OFF", "ESCALATIONS", "WEEKLY"].includes(String(input.parent_notifications))) {
      errors.push({ field: "parent_notifications", message: "Must be OFF, ESCALATIONS or WEEKLY" });
    } else next.parent_notifications = input.parent_notifications;
  }
  for (const f of CLOCK_FIELDS) {
    if (input[f] === undefined) continue;
    try {
      clockOrThrow(input[f], f);
      next[f] = input[f];
    } catch {
      errors.push({ field: f, message: "Must be a time like 16:20" });
    }
  }
  for (const [f, min, max] of INT_FIELDS) {
    if (input[f] === undefined) continue;
    const n = Number(input[f]);
    if (!Number.isInteger(n) || n < min || n > max) errors.push({ field: f, message: `Must be a whole number from ${min} to ${max}` });
    else next[f] = n;
  }
  for (const f of BOOL_FIELDS) {
    if (input[f] === undefined) continue;
    next[f] = input[f] === true || input[f] === 1 || input[f] === "1" ? 1 : 0;
  }
  if (errors.length) throw new ValidationError("Some settings are invalid", errors);

  const merged = { ...current, ...next } as OfficeHourSettings;
  const m = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  if (m(merged.band_end) <= m(merged.band_start)) errors.push({ field: "band_end", message: "Must be after the band start" });
  if (m(merged.allowed_window_end) <= m(merged.allowed_window_start)) {
    errors.push({ field: "allowed_window_end", message: "Must be after the window start" });
  }
  if (m(merged.band_start) < m(merged.allowed_window_start) || m(merged.band_end) > m(merged.allowed_window_end)) {
    errors.push({ field: "band_start", message: "The band must sit inside the allowed window" });
  }
  if (merged.default_capacity > merged.max_capacity) errors.push({ field: "default_capacity", message: "Cannot exceed the maximum capacity" });
  if (merged.rate_band_watch > merged.rate_band_consistent) {
    errors.push({ field: "rate_band_watch", message: "The watch threshold cannot be above the consistent threshold" });
  }
  if (errors.length) throw new ValidationError("Some settings are invalid", errors);

  await db
    .insert(OfficeHourSetting)
    .values({ ...(next as any), id: 1, updated_by: actorId, updated_at: now() })
    .onDuplicateKeyUpdate({ set: { ...(next as any), updated_by: actorId, updated_at: now() } });
  invalidateSettings();
  return getSettings();
};

/** The subset the teacher and student UIs need. */
export const publicConfig = (s: OfficeHourSettings) => ({
  band_start: s.band_start,
  band_end: s.band_end,
  allowed_window_start: s.allowed_window_start,
  allowed_window_end: s.allowed_window_end,
  default_capacity: s.default_capacity,
  max_capacity: s.max_capacity,
  roster_cutoff_time: s.roster_cutoff_time,
  student_lock_mode: s.student_lock_mode,
  allow_any_student: s.allow_any_student === 1,
  late_after_minutes: s.late_after_minutes,
  register_edit_days: s.register_edit_days,
  qr_checkin_enabled: s.qr_checkin_enabled === 1,
  rate_band_consistent: s.rate_band_consistent,
  rate_band_watch: s.rate_band_watch,
  min_sessions_for_rate: s.min_sessions_for_rate,
});
