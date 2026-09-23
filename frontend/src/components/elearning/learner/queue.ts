import type { CourseItemType } from "../../../api/elearning";
import type { LearnerCourseCard } from "../../../api/elearning";
import { learnerRoutes } from "../../../api/elearning";

// ─── The queue ──────────────────────────────────────────────────────────────
//
// The home screen used to spend three separate cards — "This week", "Due soon"
// and "Keep going" — on what is really one question: *what should I open now?*
// Each was half empty most of the time, and none of them was ranked against
// the others, so an assignment due tomorrow sat visually below a week that had
// merely opened.
//
// They collapse into one ranked list. The ordering is the point: overdue, then
// dated work by how soon it is due, then the open week, then the nearly
// finished section worth closing out.
// ─────────────────────────────────────────────────────────────────────────────

export type QueueKind = "overdue" | "due" | "week" | "goal";

export interface QueueEntry {
  id: string;
  kind: QueueKind;
  title: string;
  subtitle: string;
  /** Short right-aligned tag: a due date, a count. */
  meta: string | null;
  to: string;
  itemType?: CourseItemType;
  color?: string | null;
}

const KIND_RANK: Record<QueueKind, number> = {
  overdue: 0,
  due: 1,
  week: 2,
  goal: 3,
};

const dueLabel = (iso: string, now: Date): string => {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "";
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 6) return due.toLocaleDateString("en-GB", { weekday: "short" });
  return due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/**
 * Everything worth opening, most urgent first.
 *
 * `excludeCourseId` is the course already shown in the hero — repeating its
 * next item directly beside itself is noise, not reinforcement.
 */
export const buildQueue = (
  cards: LearnerCourseCard[],
  options: { excludeCourseId?: number | null; now?: Date; limit?: number } = {},
): QueueEntry[] => {
  const { excludeCourseId = null, now = new Date(), limit = 6 } = options;
  const entries: (QueueEntry & { sortAt: number })[] = [];

  for (const card of cards) {
    if (card.overdue_count > 0) {
      entries.push({
        id: `overdue-${card.course_id}`,
        kind: "overdue",
        title: `${card.overdue_count} overdue`,
        subtitle: card.subject_name,
        // No "Past due" tag: the title already says it, and repeating it made
        // the phrase appear twice on one screen alongside the greeting.
        meta: null,
        to: learnerRoutes.course(card.course_id),
        color: card.cover_color,
        sortAt: -card.overdue_count,
      });
    }

    for (const due of card.due_soon || []) {
      entries.push({
        id: `due-${due.item_id}`,
        kind: "due",
        title: due.title,
        subtitle: card.subject_name,
        meta: dueLabel(due.due_at, now),
        to: learnerRoutes.item(card.course_id, due.item_id),
        itemType: due.item_type,
        color: card.cover_color,
        sortAt: new Date(due.due_at).getTime(),
      });
    }

    if (
      card.course_id !== excludeCourseId &&
      card.current_section &&
      card.next_item
    ) {
      entries.push({
        id: `week-${card.course_id}`,
        kind: "week",
        title: card.next_item.title,
        subtitle: `${card.subject_name} · ${card.current_section.title.split(" — ")[0]}`,
        meta: card.next_item.estimated_minutes
          ? `${card.next_item.estimated_minutes} min`
          : null,
        to: learnerRoutes.item(card.course_id, card.next_item.item_id),
        itemType: card.next_item.item_type,
        color: card.cover_color,
        sortAt: 0,
      });
    }

    for (const goal of card.near_goal || []) {
      entries.push({
        id: `goal-${card.course_id}-${goal.section_id}`,
        kind: "goal",
        title: `${goal.remaining} left in ${goal.title.split(" — ")[0]}`,
        subtitle: card.subject_name,
        meta: null,
        to: learnerRoutes.course(card.course_id, goal.section_id),
        color: card.cover_color,
        sortAt: goal.remaining,
      });
    }
  }

  return entries
    .sort(
      (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.sortAt - b.sortAt,
    )
    .slice(0, limit)
    .map(({ sortAt: _sortAt, ...entry }) => entry);
};
