import { q, exec } from "./db";
import { parseCidr } from "./ip";

/**
 * Analytics settings (AnalyticsSetting, migration 095), cached for 30 s.
 * Defaults apply when a row is missing, so an empty table still works.
 */
export interface ActivitySettings {
  collect_enabled: boolean;
  session_timeout_min: number;
  engaged_seconds: number;
  idle_after_s: number;
  offline_after_s: number;
  background_ttl_s: number;
  raw_retention_months: number;
  session_retention_months: number;
  campus_cidrs: { cidr: string; label?: string }[] | string[];
  precise_location: "off" | "staff" | "known_users" | "everyone";
  dormant_days: number;
  bot_threshold: number;
  school_hours: { from: string; to: string; days: number[] };
  excluded_user_ids?: number[];
}

export const DEFAULT_SETTINGS: ActivitySettings = {
  collect_enabled: true,
  session_timeout_min: 30,
  engaged_seconds: 10,
  idle_after_s: 120,
  offline_after_s: 90,
  background_ttl_s: 600,
  raw_retention_months: 13,
  session_retention_months: 25,
  campus_cidrs: [],
  precise_location: "off",
  dormant_days: 14,
  bot_threshold: 60,
  school_hours: { from: "07:00", to: "18:00", days: [1, 2, 3, 4, 5] },
};

/** Bounds every editable setting is clamped to, so a typo can't disable retention etc. */
const NUMERIC_BOUNDS: Partial<Record<keyof ActivitySettings, [number, number]>> = {
  session_timeout_min: [5, 475],
  engaged_seconds: [10, 60],
  idle_after_s: [30, 1800],
  offline_after_s: [45, 600],
  background_ttl_s: [60, 3600],
  raw_retention_months: [1, 13],
  session_retention_months: [1, 25],
  dormant_days: [1, 365],
  bot_threshold: [10, 100],
};

let cache: { at: number; value: ActivitySettings } | null = null;
const TTL_MS = 30_000;

export const getSettings = async (): Promise<ActivitySettings> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value: ActivitySettings = { ...DEFAULT_SETTINGS };
  try {
    const rows = await q<{ setting_key: string; value: any }>(
      "SELECT setting_key, value FROM AnalyticsSetting",
    );
    for (const r of rows) {
      const v = typeof r.value === "string" ? safeJson(r.value) : r.value;
      if (v !== undefined && r.setting_key in DEFAULT_SETTINGS) (value as any)[r.setting_key] = v;
      if (r.setting_key === "excluded_user_ids") value.excluded_user_ids = v;
    }
  } catch {
    // Un-migrated server: defaults.
  }
  // Hard switch for incidents: ACTIVITY_COLLECT=off wins over the stored setting.
  if (String(process.env.ACTIVITY_COLLECT ?? "").toLowerCase() === "off") value.collect_enabled = false;
  cache = { at: Date.now(), value };
  return value;
};

/** Synchronous read of the last cached value (hot paths that cannot await). */
export const cachedSettings = (): ActivitySettings => cache?.value ?? DEFAULT_SETTINGS;

export const invalidateSettings = () => {
  cache = null;
};

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** Validate and persist a partial update. Returns the new settings. */
export const updateSettings = async (
  patch: Partial<ActivitySettings>,
  actorId: number,
): Promise<ActivitySettings> => {
  const clean: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    const key = k as keyof ActivitySettings;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
      const [lo, hi] = NUMERIC_BOUNDS[key] ?? [-Infinity, Infinity];
      clean[k] = Math.min(hi, Math.max(lo, Math.round(n)));
    } else if (typeof def === "boolean") {
      clean[k] = raw === true || (raw as unknown) === "true";
    } else if (key === "precise_location") {
      if (!["off", "staff", "known_users", "everyone"].includes(String(raw)))
        throw new Error("precise_location must be off | staff | known_users | everyone");
      clean[k] = raw;
    } else if (key === "campus_cidrs") {
      const list = Array.isArray(raw) ? raw : [];
      clean[k] = list
        .map((e: any) => (typeof e === "string" ? { cidr: e } : e))
        .filter((e: any) => e && typeof e.cidr === "string" && parseCidr(e.cidr))
        .map((e: any) => ({ cidr: e.cidr.trim(), label: String(e.label || "campus").slice(0, 40) }))
        .slice(0, 200);
    } else if (key === "school_hours") {
      const v = raw as any;
      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!v || !hhmm.test(v.from) || !hhmm.test(v.to)) throw new Error("school_hours needs from/to as HH:MM");
      clean[k] = {
        from: v.from,
        to: v.to,
        days: (Array.isArray(v.days) ? v.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6),
      };
    }
  }
  for (const [k, v] of Object.entries(clean)) {
    await exec(
      `INSERT INTO AnalyticsSetting (setting_key, value, updated_by, updated_at)
       VALUES (?, CAST(? AS JSON), ?, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
      [k, JSON.stringify(v), actorId],
    );
  }
  invalidateSettings();
  return getSettings();
};

/** The campus/network label for an IP, if any configured range contains it. */
export const campusRanges = (s: ActivitySettings) =>
  (s.campus_cidrs as any[])
    .map((e) => (typeof e === "string" ? { cidr: e, label: "campus" } : e))
    .map((e) => ({ label: e.label || "campus", m: parseCidr(e.cidr) }))
    .filter((e) => e.m) as { label: string; m: { buf: Buffer; bits: number } }[];
