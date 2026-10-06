import { sql } from "drizzle-orm";
import { db } from "../../db";
import { addDaysYmd, kigaliParts } from "../reminders/time";

/**
 * NGA Desktop games: the school's switches and each person's play time
 * (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §6.7). Admins change the settings from the
 * MIS "Desktop tools" page (Phase 7); until then the defaults below apply.
 */
export const GAME_IDS = [
  "igisoro", "number-place", "picture-logic", "lights-out", "mines", "sliding-15", "merge-2048",
  "pairs", "echo", "five-letter", "word-search", "math-sprint", "code-breaker", "four-in-a-row", "snake",
  "breathe", "stretch",
] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Learning games count half towards the daily budget; reset activities don't count. */
export const LEARNING = new Set<string>(["pairs", "five-letter", "word-search", "math-sprint"]);
export const RESET = new Set<string>(["breathe", "stretch"]);

export interface GameSettings {
  enabled: boolean;
  /** Switched off by the school. */
  disabled: string[];
  dailyBudgetMin: number;
  sessionCapMin: number;
  cooldownMin: number;
  /** "HH:MM" Kigali; games rest between them (overnight allowed). */
  quietHours: [string, string] | null;
  /** Staff play without a daily budget unless set. */
  staffBudgetMin: number | null;
  /** Igisoro's rules vary by region: it stays off until a super admin approves them. */
  igisoro: { approved: boolean; variant: string | null; approvedBy: number | null; approvedAt: string | null };
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  enabled: true,
  disabled: [],
  dailyBudgetMin: 30,
  sessionCapMin: 10,
  cooldownMin: 5,
  quietHours: ["21:30", "06:00"],
  staffBudgetMin: null,
  igisoro: { approved: false, variant: null, approvedBy: null, approvedAt: null },
};

/** Stored value over the defaults, field by field (unknown fields dropped). */
export function mergeSettings(stored: unknown): GameSettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<GameSettings>;
  const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  const hhmm = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_GAME_SETTINGS.enabled,
    disabled: Array.isArray(s.disabled) ? s.disabled.filter((x): x is string => typeof x === "string" && (GAME_IDS as readonly string[]).includes(x)) : [],
    dailyBudgetMin: num(s.dailyBudgetMin, DEFAULT_GAME_SETTINGS.dailyBudgetMin, 0, 600),
    sessionCapMin: num(s.sessionCapMin, DEFAULT_GAME_SETTINGS.sessionCapMin, 1, 120),
    cooldownMin: num(s.cooldownMin, DEFAULT_GAME_SETTINGS.cooldownMin, 0, 60),
    quietHours: s.quietHours === null ? null : Array.isArray(s.quietHours) && hhmm(s.quietHours[0]) && hhmm(s.quietHours[1]) ? [s.quietHours[0], s.quietHours[1]] : DEFAULT_GAME_SETTINGS.quietHours,
    staffBudgetMin: s.staffBudgetMin === null || s.staffBudgetMin === undefined ? null : num(s.staffBudgetMin, 0, 0, 600),
    igisoro: { ...DEFAULT_GAME_SETTINGS.igisoro, ...(s.igisoro && typeof s.igisoro === "object" ? s.igisoro : {}) },
  };
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

export async function loadGameSettings(): Promise<GameSettings> {
  try {
    const r = rows(await db.execute(sql`SELECT value FROM DesktopToolSetting WHERE setting_key = 'games' LIMIT 1`));
    const raw = r[0]?.value;
    return mergeSettings(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch (e: any) {
    // Migration 105 not applied yet: the defaults still work.
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE") return DEFAULT_GAME_SETTINGS;
    throw e;
  }
}

/** Minutes counted against today's budget (learning × 0.5, resets free). */
export function weightedMinutes(perGame: Array<{ game: string; seconds: number }>): number {
  const s = perGame.reduce((sum, g) => sum + (RESET.has(g.game) ? 0 : LEARNING.has(g.game) ? g.seconds / 2 : g.seconds), 0);
  return Math.round((s / 60) * 10) / 10;
}

export async function playedToday(userId: number, now = new Date()): Promise<Array<{ game: string; seconds: number }>> {
  try {
    const day = kigaliParts(now).ymd;
    const r = rows(await db.execute(sql`SELECT game_id AS game, SUM(seconds) AS seconds FROM DesktopGameUsage WHERE user_id = ${userId} AND day = ${day} GROUP BY game_id`));
    return r.map((x: any) => ({ game: String(x.game), seconds: Number(x.seconds) }));
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE") return [];
    throw e;
  }
}

export interface UsageEntry {
  day: string;
  game: string;
  seconds: number;
}

/** Valid entries only: known game, today or yesterday (Kigali), 0 < seconds ≤ 1 day. Pure. */
export function cleanUsage(entries: unknown, now = new Date()): UsageEntry[] {
  if (!Array.isArray(entries)) return [];
  const today = kigaliParts(now).ymd;
  const days = new Set([today, addDaysYmd(today, -1)]);
  return entries
    .filter((e: any) => e && typeof e.day === "string" && days.has(e.day) && (GAME_IDS as readonly string[]).includes(e.game) && Number.isFinite(e.seconds) && e.seconds > 0)
    .slice(0, 100)
    .map((e: any) => ({ day: e.day, game: e.game, seconds: Math.min(86_400, Math.floor(e.seconds)) }));
}

export async function recordUsage(userId: number, deviceId: string, entries: UsageEntry[]): Promise<number> {
  for (const e of entries) {
    await db.execute(sql`
      INSERT INTO DesktopGameUsage (user_id, day, game_id, device_id, seconds, updated_at)
      VALUES (${userId}, ${e.day}, ${e.game}, ${deviceId}, ${e.seconds}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE seconds = GREATEST(seconds, VALUES(seconds)), updated_at = UTC_TIMESTAMP()`);
  }
  return entries.length;
}

/** The policy's games block for one person. */
export function gamesBlock(settings: GameSettings, persona: string, played: Array<{ game: string; seconds: number }>) {
  const off = new Set(settings.disabled);
  if (!settings.igisoro.approved) off.add("igisoro");
  const staff = persona !== "student";
  return {
    enabled: settings.enabled && persona !== "parent",
    allowed: settings.enabled ? GAME_IDS.filter((g) => !off.has(g)) : [],
    dailyBudgetMin: staff ? settings.staffBudgetMin : settings.dailyBudgetMin,
    usedTodayMin: weightedMinutes(played),
    sessionCapMin: settings.sessionCapMin,
    cooldownMin: settings.cooldownMin,
    quietHours: settings.quietHours,
    learning: [...LEARNING],
    igisoroVariant: settings.igisoro.approved ? settings.igisoro.variant : null,
  };
}

/** Igisoro rule sets the desktop knows (nga-desktop src/tools/games/igisoro). */
export const IGISORO_VARIANTS = ["standard", "beginner"] as const;

/**
 * An admin's change, applied to the current settings. Pure. Anyone with
 * DESKTOP_TOOLS_CONFIGURE changes the switches, budgets and hours; only a super
 * admin approves Igisoro (its rules vary by region), and the approval records who
 * and when.
 */
export function applySettingsUpdate(current: GameSettings, input: unknown, actor: { userId: number; superAdmin: boolean }, now = new Date()): GameSettings {
  const next = mergeSettings(input);
  if (!actor.superAdmin) return { ...next, igisoro: current.igisoro };
  const want = (input as any)?.igisoro ?? {};
  const approved = want.approved === true;
  const variant = (IGISORO_VARIANTS as readonly string[]).includes(want.variant) ? want.variant : approved ? "standard" : null;
  if (!approved) return { ...next, igisoro: { approved: false, variant, approvedBy: null, approvedAt: null } };
  // Re-saving an approved Igisoro with the same variant keeps the original approval.
  const same = current.igisoro.approved && current.igisoro.variant === variant;
  return {
    ...next,
    igisoro: same ? current.igisoro : { approved: true, variant, approvedBy: actor.userId, approvedAt: now.toISOString() },
  };
}

export async function saveGameSettings(settings: GameSettings, userId: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO DesktopToolSetting (setting_key, value, updated_by, updated_at)
    VALUES ('games', ${JSON.stringify(settings)}, ${userId}, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`);
}

/** Totals only (plan §6.7.5 layer 10): minutes and players per game over the last `days` Kigali days. */
export async function usageSummary(days = 7, now = new Date()): Promise<{ from: string; to: string; games: Array<{ game: string; minutes: number; players: number }>; players: number; minutes: number }> {
  const to = kigaliParts(now).ymd;
  const from = addDaysYmd(to, -(days - 1));
  try {
    const r = rows(await db.execute(sql`
      SELECT game_id AS game, ROUND(SUM(seconds) / 60) AS minutes, COUNT(DISTINCT user_id) AS players
      FROM DesktopGameUsage WHERE day BETWEEN ${from} AND ${to} GROUP BY game_id ORDER BY minutes DESC`));
    const t = rows(await db.execute(sql`SELECT COUNT(DISTINCT user_id) AS players, ROUND(SUM(seconds) / 60) AS minutes FROM DesktopGameUsage WHERE day BETWEEN ${from} AND ${to}`));
    return {
      from, to,
      games: r.map((x: any) => ({ game: String(x.game), minutes: Number(x.minutes), players: Number(x.players) })),
      players: Number(t[0]?.players ?? 0),
      minutes: Number(t[0]?.minutes ?? 0),
    };
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE") return { from, to, games: [], players: 0, minutes: 0 };
    throw e;
  }
}
