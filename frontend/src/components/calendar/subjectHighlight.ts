/**
 * "Where else is this subject?" highlighting for the timetable grids.
 *
 * Hovering (or focusing) one lesson picks out every other lesson of the same
 * subject across the week, so a teacher can see all of a subject's periods at
 * a glance. Matching is by subject — not by class group — so the same subject
 * taught to two groups lights up in both, while a different subject sharing
 * a row or a group does not.
 */

export interface SubjectLike {
  subject_id?: number | null;
  subject_name?: string | null;
}

/** Stable identity for a subject. Prefers the id; falls back to the name so
 *  legacy slots with no id still group together. */
export const subjectKey = (slot: SubjectLike): string | null => {
  if (slot.subject_id != null) return `id:${slot.subject_id}`;
  const name = slot.subject_name?.trim();
  return name ? `name:${name}` : null;
};

export type HighlightState = "match" | "dimmed" | "idle";

/** How a slot should render while `hovered` (a subject key, or null when
 *  nothing is hovered) is active. */
export const highlightState = (
  hovered: string | null,
  slot: SubjectLike,
): HighlightState => {
  if (!hovered) return "idle";
  return subjectKey(slot) === hovered ? "match" : "dimmed";
};

/** Number of lessons per subject key, for the legend counts. */
export const countPeriodsBySubject = (
  slots: SubjectLike[],
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const s of slots) {
    const key = subjectKey(s);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};
