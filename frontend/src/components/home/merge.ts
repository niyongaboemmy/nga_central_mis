import type { AttentionItem, GlanceTile, HomeLens, HomeOverview, Tier, TodayLesson } from "./contract";
import type { AppMeeting, AppState, AppUpdate } from "./appContract";

// ─── Home, the pure half ────────────────────────────────────────────────────
//
// Everything on the page that is a decision rather than a pixel lives here, so
// it can be tested without rendering: which lens is showing, how items rank,
// what the one "Next up" card says, and which tier label a reader sees.
// ─────────────────────────────────────────────────────────────────────────────

export const EVERYTHING = "EVERYTHING";
export const TIERS: Tier[] = ["blocking", "slipping", "tidy"];

export type Audience = "staff" | "learner";

/** Tier names in the reader's words: a student's work is "overdue", not "blocking". */
export const TIER_LABEL: Record<Audience, Record<Tier, string>> = {
  staff: { blocking: "Needs you now", slipping: "Coming up", tidy: "When you can" },
  learner: { blocking: "Overdue", slipping: "Due soon", tidy: "When you can" },
};

export const audienceOf = (data: Pick<HomeOverview, "viewer" | "lenses">): Audience =>
  data.viewer.persona === "STUDENT" || data.viewer.persona === "PARENT" ? "learner" : "staff";

const TIER_WEIGHT: Record<Tier, number> = { blocking: 3000, slipping: 2000, tidy: 1000 };
const LENS_BONUS: Record<string, number> = {
  TEACHING: 30,
  SELF: 30,
  CLASS_GROUP: 20,
  MENTEES: 20,
  GRADE: 10,
  DEPARTMENT: 10,
  PROGRAM: 10,
  SCHOOL: 0,
  PLATFORM: 0,
};

const hoursBetween = (from: string, to: Date) => (to.getTime() - new Date(from).getTime()) / 3_600_000;

/**
 * Ranking (plan §13): tier first, then how long someone has waited, how far
 * past due it is, how soon it is due, and a small nudge for the lenses that
 * are the reader's own work.
 */
export const scoreItem = (item: AttentionItem, now: Date): number => {
  let score = TIER_WEIGHT[item.tier];
  if (item.waiting_since) score += Math.min(300, Math.max(0, hoursBetween(item.waiting_since, now)));
  if (item.due_at) {
    const hoursLate = hoursBetween(item.due_at, now);
    score += hoursLate > 0 ? Math.min(500, hoursLate * 2) : -Math.min(200, -hoursLate);
  }
  score += LENS_BONUS[item.lens.split(":")[0]] ?? 0;
  return score;
};

export const rankItems = (items: AttentionItem[], now: Date = new Date()): AttentionItem[] =>
  [...items].sort((a, b) => scoreItem(b, now) - scoreItem(a, now) || a.title.localeCompare(b.title));

/** Items for the lens being looked at. */
export const itemsForLens = (items: AttentionItem[], lens: string): AttentionItem[] =>
  lens === EVERYTHING ? items : items.filter((i) => i.lens === lens);

export const groupByTier = (items: AttentionItem[]): Record<Tier, AttentionItem[]> => ({
  blocking: items.filter((i) => i.tier === "blocking"),
  slipping: items.filter((i) => i.tier === "slipping"),
  tidy: items.filter((i) => i.tier === "tidy"),
});

/** How many things are waiting per lens -- the switcher's badges (tidy doesn't count). */
export const pressureByLens = (items: AttentionItem[]): Record<string, number> => {
  const out: Record<string, number> = { [EVERYTHING]: 0 };
  for (const i of items) {
    if (i.tier === "tidy") continue;
    out[i.lens] = (out[i.lens] ?? 0) + 1;
    out[EVERYTHING] += 1;
  }
  return out;
};

/**
 * Depth guard (plan §3.2), behind the server's own: a summary-depth item never
 * renders names, whatever the payload says.
 */
export const safeEntities = (item: AttentionItem): string[] => (item.depth === "summary" ? [] : item.entities);

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export type LessonState = "done" | "now" | "next" | "later";

export const lessonState = (lesson: TodayLesson, nowMinutes: number, nextKey: string | null): LessonState => {
  const start = toMinutes(lesson.start_time);
  const end = toMinutes(lesson.end_time);
  if (end <= nowMinutes) return "done";
  if (start <= nowMinutes) return "now";
  return lesson.lesson_key === nextKey ? "next" : "later";
};

export const nextLessonKey = (lessons: TodayLesson[], nowMinutes: number): string | null =>
  lessons.find((l) => toMinutes(l.start_time) > nowMinutes)?.lesson_key ?? null;

export type Hero =
  | { kind: "item"; item: AttentionItem }
  | { kind: "lesson"; lesson: TodayLesson; state: "now" | "next"; minutesAway: number }
  | { kind: "clear"; nextTeachingDay: HomeOverview["today"]["next_teaching_day"] };

/**
 * The single "Next up" card: the most urgent blocking item; otherwise the
 * lesson happening now or next; otherwise the most pressing coming-up item;
 * otherwise "all caught up".
 */
export const pickHero = (
  items: AttentionItem[],
  lessons: TodayLesson[],
  nowMinutes: number,
  nextTeachingDay: HomeOverview["today"]["next_teaching_day"],
): Hero => {
  const blocking = items.find((i) => i.tier === "blocking");
  if (blocking) return { kind: "item", item: blocking };
  const now = lessons.find((l) => toMinutes(l.start_time) <= nowMinutes && toMinutes(l.end_time) > nowMinutes);
  if (now) return { kind: "lesson", lesson: now, state: "now", minutesAway: 0 };
  const next = lessons.find((l) => toMinutes(l.start_time) > nowMinutes);
  if (next) return { kind: "lesson", lesson: next, state: "next", minutesAway: toMinutes(next.start_time) - nowMinutes };
  const slipping = items.find((i) => i.tier === "slipping");
  if (slipping) return { kind: "item", item: slipping };
  return { kind: "clear", nextTeachingDay };
};

/** A switcher only earns its place when there is more than one lens to switch between. */
export const switcherLenses = (lenses: HomeLens[]): HomeLens[] => (lenses.length >= 2 ? lenses : []);

export const greeting = (date: Date = new Date()): string => {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const relativeTime = (iso: string | null | undefined, now: Date = new Date()): string => {
  if (!iso) return "";
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

// ─── Other apps (H3) ────────────────────────────────────────────────────────


export interface MergedApps {
  items: AttentionItem[];
  tiles: GlanceTile[];
  updates: AppUpdate[];
  /** lesson_key -> register status, from Discipline & Attendance. */
  registerMarks: Record<string, "done" | "missing" | "upcoming">;
  comms: { chat_unread: number; mentions: number; mail_unread: number; meetings: AppMeeting[]; app_url: string | null } | null;
}

/**
 * Fold the apps' answers into Home. Only apps that answered "ok" contribute;
 * "not_yours" register marks are dropped (someone else's lesson).
 */
export const mergeApps = (states: AppState[]): MergedApps => {
  const out: MergedApps = { items: [], tiles: [], updates: [], registerMarks: {}, comms: null };
  for (const s of states) {
    if (s.status !== "ok" || !("summary" in s) || !s.summary) continue;
    out.items.push(...s.summary.items);
    out.tiles.push(...s.summary.tiles);
    out.updates.push(...s.summary.updates);
    for (const m of s.summary.today_marks) {
      if (m.status !== "not_yours") out.registerMarks[m.lesson_key] = m.status;
    }
    if (s.summary.comms) out.comms = { ...s.summary.comms, app_url: s.summary.app_url };
  }
  return out;
};
