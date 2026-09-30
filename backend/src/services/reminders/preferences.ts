import { eq } from "drizzle-orm";
import { db } from "../../db";
import { ReminderPreference } from "../../db/reminderSchema";
import { ValidationError } from "../../errors/CustomError";
import { parseClock } from "./time";

/**
 * What a reminder can be about. Lessons and activities come from the MIS
 * timetable; the rest are pushed in by the other NGA apps through the Source
 * API (quizzes and assignments from Task Mentor, meetings from Tupo).
 */
export const REMINDER_KINDS = [
  "lesson",
  "activity",
  "quiz_open",
  "quiz_close",
  "assignment_due",
  "meeting",
  "event",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface KindSetting {
  enabled: boolean;
  /** Minutes before the event, largest first. At most three. */
  offsets: number[];
}

export type ReminderSettings = Record<ReminderKind, KindSetting>;

/** Extra delivery channels (in-app and Web Push are always on). */
export interface ChannelChoices {
  /** Telegram messages, once the chat is linked. */
  telegram: boolean;
  /** Email for critical reminders nobody acknowledged (opt-in). */
  email: boolean;
  /** Mirror into the connected Google Calendar. */
  googleCalendar: boolean;
}

export const DEFAULT_CHANNELS: ChannelChoices = { telegram: true, email: false, googleCalendar: true };

export const normalizeChannels = (raw: unknown): ChannelChoices => {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    telegram: src.telegram === undefined ? DEFAULT_CHANNELS.telegram : Boolean(src.telegram),
    email: src.email === undefined ? DEFAULT_CHANNELS.email : Boolean(src.email),
    googleCalendar: src.googleCalendar === undefined ? DEFAULT_CHANNELS.googleCalendar : Boolean(src.googleCalendar),
  };
};

export interface ReminderPreferences {
  enabled: boolean;
  channels: ChannelChoices;
  settings: ReminderSettings;
  quietStart: string;
  quietEnd: string;
  morningBriefing: boolean;
  /** True once the user has chosen their own lesson offsets (see expander). */
  lessonCustomized?: boolean;
}

/** Defaults from the proposal's routing table (§8). */
export const DEFAULT_SETTINGS: ReminderSettings = {
  lesson: { enabled: true, offsets: [10] },
  activity: { enabled: true, offsets: [10] },
  quiz_open: { enabled: true, offsets: [30] },
  quiz_close: { enabled: true, offsets: [60, 15] },
  assignment_due: { enabled: true, offsets: [1440, 120] },
  meeting: { enabled: true, offsets: [15] },
  event: { enabled: true, offsets: [30] },
};

export const MAX_OFFSET_MIN = 7 * 24 * 60;
const MAX_OFFSETS_PER_KIND = 3;

export const DEFAULT_PREFERENCES: ReminderPreferences = {
  enabled: false,
  channels: DEFAULT_CHANNELS,
  settings: DEFAULT_SETTINGS,
  quietStart: "21:00",
  quietEnd: "06:00",
  morningBriefing: true,
};

const cleanOffsets = (raw: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(raw)) return fallback;
  const values = raw
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= MAX_OFFSET_MIN);
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  return unique.slice(0, MAX_OFFSETS_PER_KIND);
};

/**
 * Merge stored/submitted settings over the defaults. Unknown kinds are
 * dropped, bad offsets filtered, so a stale client can never store a shape
 * the engine can't read.
 */
export const normalizeSettings = (raw: unknown): ReminderSettings => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  const out = {} as ReminderSettings;
  for (const kind of REMINDER_KINDS) {
    const base = DEFAULT_SETTINGS[kind];
    const given = source[kind];
    if (!given || typeof given !== "object") {
      out[kind] = { enabled: base.enabled, offsets: [...base.offsets] };
      continue;
    }
    out[kind] = {
      enabled: given.enabled === undefined ? base.enabled : Boolean(given.enabled),
      offsets: cleanOffsets(given.offsets, [...base.offsets]),
    };
  }
  return out;
};

const parseSettingsColumn = (value: unknown): unknown => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

/** The overrides a user actually chose (kinds they never touched are absent). */
const loadStored = async (userId: number) => {
  const [row] = await db
    .select()
    .from(ReminderPreference)
    .where(eq(ReminderPreference.user_id, userId))
    .limit(1);
  const stored = row ? parseSettingsColumn(row.settings) : null;
  return { row, overrides: stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {} };
};

export const getPreferences = async (userId: number): Promise<ReminderPreferences> => {
  const { row, overrides } = await loadStored(userId);
  if (!row) return { ...DEFAULT_PREFERENCES, channels: { ...DEFAULT_CHANNELS }, settings: normalizeSettings(null), lessonCustomized: false };
  return {
    enabled: Number(row.enabled) === 1,
    channels: normalizeChannels(parseSettingsColumn(row.channels)),
    settings: normalizeSettings(overrides),
    lessonCustomized: Array.isArray((overrides as any).lesson?.offsets),
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    morningBriefing: Number(row.morning_briefing) === 1,
  };
};

export interface PreferencesPatch {
  enabled?: unknown;
  channels?: unknown;
  settings?: unknown;
  quietStart?: unknown;
  quietEnd?: unknown;
  morningBriefing?: unknown;
}

const validClock = (value: unknown, field: string): string => {
  const minutes = parseClock(typeof value === "string" ? value : null);
  if (minutes === null) throw new ValidationError(`${field} must be a time like 21:00`);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

/** Apply a partial update; fields left out keep their stored value. */
export const savePreferences = async (
  userId: number,
  patch: PreferencesPatch,
): Promise<ReminderPreferences> => {
  const current = await getPreferences(userId);
  const { overrides } = await loadStored(userId);

  // Persist only the kinds the user has ever changed, each one cleaned. The
  // rest keep following DEFAULT_SETTINGS (and the teacher lesson default).
  const nextOverrides: Record<string, KindSetting> = {};
  const patchSettings =
    patch.settings && typeof patch.settings === "object" ? (patch.settings as Record<string, unknown>) : {};
  for (const kind of REMINDER_KINDS) {
    const given = patchSettings[kind] ?? overrides[kind];
    if (!given || typeof given !== "object") continue;
    const merged = { ...((overrides[kind] as object) ?? {}), ...(given as object) } as any;
    const clean = normalizeSettings({ [kind]: merged })[kind];
    nextOverrides[kind] = Array.isArray(merged.offsets)
      ? clean
      : ({ enabled: clean.enabled } as KindSetting);
  }

  const next: ReminderPreferences = {
    enabled: patch.enabled === undefined ? current.enabled : Boolean(patch.enabled),
    channels:
      patch.channels === undefined
        ? current.channels
        : normalizeChannels({ ...current.channels, ...(patch.channels as object) }),
    settings: normalizeSettings(nextOverrides),
    lessonCustomized: Array.isArray((nextOverrides as any).lesson?.offsets),
    quietStart: patch.quietStart === undefined ? current.quietStart : validClock(patch.quietStart, "quietStart"),
    quietEnd: patch.quietEnd === undefined ? current.quietEnd : validClock(patch.quietEnd, "quietEnd"),
    morningBriefing:
      patch.morningBriefing === undefined ? current.morningBriefing : Boolean(patch.morningBriefing),
  };

  const values = {
    enabled: next.enabled ? 1 : 0,
    channels: next.channels,
    settings: nextOverrides,
    quiet_start: next.quietStart,
    quiet_end: next.quietEnd,
    morning_briefing: next.morningBriefing ? 1 : 0,
  };
  await db
    .insert(ReminderPreference)
    .values({ user_id: userId, ...values })
    .onDuplicateKeyUpdate({ set: values });
  return next;
};
