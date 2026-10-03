import type { AgendaItem, ReminderKind } from "../../api/reminders";

/**
 * Pure helpers for the Now & Next card and reminder lists. Times are shown
 * in Africa/Kigali (UTC+2, no DST) regardless of the viewer's device zone,
 * so a teacher's laptop set to another zone still reads the school clock.
 */

const KIGALI_MS = 2 * 3_600_000;

export const kigaliClock = (iso: string | Date) => {
  const d = new Date(new Date(iso).getTime() + KIGALI_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export const kigaliYmd = (iso: string | Date) => {
  const d = new Date(new Date(iso).getTime() + KIGALI_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export interface NowNext {
  current: AgendaItem | null;
  /** 0..1 through the current item. */
  progress: number;
  next: AgendaItem | null;
  /** Milliseconds until `next` starts. */
  untilNext: number | null;
  laterToday: AgendaItem[];
  doneToday: number;
}

const endOf = (item: AgendaItem) =>
  item.end ? new Date(item.end).getTime() : new Date(item.start).getTime() + 30 * 60_000;

/** Timed things in the day's flow; deadlines are points, not blocks. */
const isBlock = (item: AgendaItem) => item.kind === "lesson" || item.kind === "activity" || item.kind === "meeting" || item.kind === "office_hours";

export const computeNowNext = (items: AgendaItem[], now: Date): NowNext => {
  const t = now.getTime();
  const today = kigaliYmd(now);
  const sorted = [...items].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const current =
    sorted.find((i) => isBlock(i) && new Date(i.start).getTime() <= t && endOf(i) > t) ?? null;
  const upcoming = sorted.filter((i) => new Date(i.start).getTime() > t);
  const next = upcoming[0] ?? null;
  const progress = current
    ? Math.min(1, Math.max(0, (t - new Date(current.start).getTime()) / (endOf(current) - new Date(current.start).getTime())))
    : 0;
  return {
    current,
    progress,
    next,
    untilNext: next ? new Date(next.start).getTime() - t : null,
    laterToday: upcoming.slice(1).filter((i) => kigaliYmd(i.start) === today),
    doneToday: sorted.filter((i) => kigaliYmd(i.start) === today && endOf(i) <= t).length,
  };
};

/** "in 4 min", "in 1 h 20 min", "in 2 days" -- short and calm. */
export const formatCountdown = (ms: number | null): string => {
  if (ms === null) return "";
  if (ms <= 30_000) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
};

/** 10 -> "10 min", 90 -> "1 h 30 min", 1440 -> "1 day". */
export const formatOffset = (minutes: number): string => {
  if (minutes === 0) return "at start";
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const KIND_META: Record<ReminderKind | "briefing" | "test", { label: string; hint: string }> = {
  lesson: { label: "Lessons", hint: "Before each lesson on your timetable" },
  activity: { label: "Activities", hint: "Assemblies, sports, clubs and other timetable events" },
  quiz_open: { label: "Quiz opens", hint: "When a quiz becomes available (Task Mentor)" },
  quiz_close: { label: "Quiz closes", hint: "Before a quiz closes — so you don’t miss the window" },
  assignment_due: { label: "Assignment due", hint: "Before homework and assignments are due" },
  meeting: { label: "Meetings", hint: "Staff and parent meetings (Tupo)" },
  office_hours: { label: "Office hours", hint: "Before office hours you run or must attend" },
  event: { label: "Other events", hint: "Anything else the school schedules for you" },
  briefing: { label: "Morning briefing", hint: "" },
  test: { label: "Test", hint: "" },
};

export const OFFSET_PRESETS = [5, 10, 15, 30, 60, 120, 1440];
