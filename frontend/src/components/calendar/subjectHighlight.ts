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
  /** Set on the admin grid's custom-activity pseudo-slots (see CalendarGrid). */
  __activity?: { activity_name?: string | null } | null;
}

/** Stable identity for a subject. Prefers the id; falls back to the name so
 *  legacy slots with no id still group together. Custom activities (events)
 *  have no real subject id, so they group by name instead — every recurring
 *  "Supervised Self Study" lights up together, but never alongside a lesson. */
export const subjectKey = (slot: SubjectLike): string | null => {
  if (slot.__activity) {
    const name = (slot.__activity.activity_name ?? slot.subject_name)
      ?.trim()
      .toLowerCase();
    return name ? `activity:${name}` : null;
  }
  if (slot.subject_id != null) return `id:${slot.subject_id}`;
  const name = slot.subject_name?.trim();
  return name ? `name:${name}` : null;
};

/** "match": the hovered subject — gets the focus ring. "other": some other
 *  subject while one is hovered — rendered exactly as normal. "idle": nothing
 *  hovered. */
export type HighlightState = "match" | "other" | "idle";

/** How a slot should render while `hovered` (a subject key, or null when
 *  nothing is hovered) is active. */
export const highlightState = (
  hovered: string | null,
  slot: SubjectLike,
): HighlightState => {
  if (!hovered) return "idle";
  return subjectKey(slot) === hovered ? "match" : "other";
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
