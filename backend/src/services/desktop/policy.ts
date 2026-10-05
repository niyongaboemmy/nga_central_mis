import type { Occurrence } from "../reminders/occurrences";
import { addDaysYmd, kigaliInstant, kigaliParts } from "../reminders/time";

/**
 * When NGA Desktop's games and the student AI pause (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §6.1):
 * the person's lessons today (timetable) and exam windows (Task Mentor quizzes).
 *
 * Task Mentor sends each quiz as two point events (quiz_open / quiz_close) with no
 * "exam" flag. A quiz whose window is at most EXAM_MAX_MS long is treated as a timed
 * test (exam lock); longer ones are homework and lock nothing.
 */
export const EXAM_MAX_MS = 4 * 60 * 60 * 1000;

export interface LockWindow {
  from: string;
  to: string;
  kind: "lesson" | "exam";
  label: string;
  /** For a lesson: whether this person teaches or attends it. */
  role?: "teaching" | "attending" | "other";
}

export interface Policy {
  generatedAt: string;
  /** Re-fetch by then (end of the Kigali day). */
  validUntil: string;
  timezone: "Africa/Kigali";
  windows: LockWindow[];
  exam: { active: boolean; until: string | null; label: string | null };
}

const QUIZ_REF = /:(quiz_open|quiz_close):quiz-(\d+)-(?:open|close)$/;

export function examWindows(occ: Occurrence[]): LockWindow[] {
  const quizzes = new Map<string, { open?: Occurrence; close?: Occurrence }>();
  for (const o of occ) {
    const m = QUIZ_REF.exec(o.sourceRef);
    if (!m) continue;
    const q = quizzes.get(m[2]) ?? {};
    if (m[1] === "quiz_open") q.open = o;
    else q.close = o;
    quizzes.set(m[2], q);
  }
  const out: LockWindow[] = [];
  for (const { open, close } of quizzes.values()) {
    if (!open || !close) continue;
    const span = close.start.getTime() - open.start.getTime();
    if (span <= 0 || span > EXAM_MAX_MS) continue;
    out.push({ from: open.start.toISOString(), to: close.start.toISOString(), kind: "exam", label: open.title.replace(/\s*(opens|is open|starts)\b.*$/i, "").trim() || open.title });
  }
  return out;
}

export function buildPolicy(occ: Occurrence[], now = new Date()): Policy {
  const today = kigaliParts(now).ymd;
  const dayEnd = kigaliInstant(addDaysYmd(today, 1), 0);
  const lessons: LockWindow[] = occ
    .filter((o) => o.kind === "lesson" && o.end)
    .map((o) => ({ from: o.start.toISOString(), to: o.end!.toISOString(), kind: "lesson" as const, label: o.title, role: o.role }));
  const windows = [...lessons, ...examWindows(occ)].sort((a, b) => a.from.localeCompare(b.from));
  const t = now.toISOString();
  const exam = windows.find((w) => w.kind === "exam" && w.from <= t && t < w.to) ?? null;
  return {
    generatedAt: t,
    validUntil: dayEnd.toISOString(),
    timezone: "Africa/Kigali",
    windows,
    exam: { active: !!exam, until: exam?.to ?? null, label: exam?.label ?? null },
  };
}

/** The range to load: all of today (Kigali), plus the morning after for quiz closes. */
export function policyRange(now = new Date()): { from: Date; to: Date } {
  const today = kigaliParts(now).ymd;
  return { from: kigaliInstant(today, 0), to: kigaliInstant(addDaysYmd(today, 1), 6 * 60) };
}
