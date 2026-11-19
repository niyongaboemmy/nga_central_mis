/**
 * Estimated hours from commit times (git-hours style; GIT_AUTOMATED_REPORTING_ANALYSIS.md §8).
 *
 * Per person and Kigali day: commits sorted by authored time; a gap of at most GAP minutes
 * continues a session; each session starts with FIRST minutes of work before its first
 * commit; a day is capped at CAP hours. The day's time is shared across tasks by commit
 * weight (files changed, at least 1). Always an ESTIMATE the developer confirms.
 */

export const GAP_MIN = 120;
export const FIRST_MIN = 30;
export const DAY_CAP_H = 10;

export interface TimedCommit {
  at: Date;
  taskKey: string; // task id as text, or "" for unlinked
  weight: number;
}

/** Kigali (UTC+2, no DST) calendar day of a moment. */
export const kigaliDay = (d: Date) => new Date(d.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);

export const roundHalf = (h: number) => Math.max(0.5, Math.round(h * 2) / 2);

/** Minutes worked in one day's commits (sorted inside). */
export function dayMinutes(times: Date[], gap = GAP_MIN, first = FIRST_MIN, capH = DAY_CAP_H): number {
  const t = [...times].sort((a, b) => a.getTime() - b.getTime());
  if (!t.length) return 0;
  let total = first;
  for (let i = 1; i < t.length; i++) {
    const diff = (t[i].getTime() - t[i - 1].getTime()) / 60_000;
    total += diff <= gap ? diff : first;
  }
  return Math.min(total, capH * 60);
}

/** Estimated hours per task key over any number of days. */
export function estimateByTask(commits: TimedCommit[]): Map<string, number> {
  const byDay = new Map<string, TimedCommit[]>();
  for (const c of commits) {
    const d = kigaliDay(c.at);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(c);
  }
  const minutes = new Map<string, number>();
  for (const list of byDay.values()) {
    const total = dayMinutes(list.map((c) => c.at));
    const w = list.reduce((s, c) => s + Math.max(1, c.weight), 0);
    for (const c of list) minutes.set(c.taskKey, (minutes.get(c.taskKey) ?? 0) + (total * Math.max(1, c.weight)) / w);
  }
  const out = new Map<string, number>();
  for (const [k, m] of minutes) out.set(k, roundHalf(m / 60));
  return out;
}
