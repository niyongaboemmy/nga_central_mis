import type { TeacherOverview } from "../../api/dashboard";

// ─── Urgency triage ─────────────────────────────────────────────────────────
//
// A dashboard that lists everything outstanding as one flat pile is not
// "notifying" — it is wallpaper. A teacher's outstanding work falls into three
// genuinely different tiers, and the page only earns attention if it says
// which tier something is in and *why*:
//
//   blocking  Someone else is already waiting, or a deadline has passed.
//             A rejected scheme sits in the validator's queue until the
//             teacher revises it; a scheme never submitted after the term has
//             started is both a compliance breach and the thing every lesson
//             note, lesson plan and e-learning course hangs off.
//
//   slipping  Nothing is blocked yet, but the gap is widening on its own —
//             a scheme with fewer weeks planned than the term has run, an
//             empty scheme, a course whose material students still cannot
//             open. Left alone these become blocking.
//
//   tidy      Personal housekeeping. Nobody is waiting; it costs the teacher
//             nothing to leave it until Friday.
//
// The ordering matters more than the styling: the first thing on screen has
// to be the thing that is actually stopping someone.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "blocking" | "slipping" | "tidy";

export type ActionKind =
  | "scheme-rejected"
  | "scheme-missing"
  | "scheme-empty"
  | "scheme-behind"
  | "course-draft"
  | "note-draft";

export interface ActionItem {
  key: ActionKind;
  severity: Severity;
  /** How many things this row stands for — drives the badge. */
  count: number;
  title: string;
  /**
   * The individual things this row stands for — one entry per subject/class
   * or document. Kept as a list rather than a pre-joined sentence so the UI
   * can render them as chips; joining them here produced a comma-spliced
   * paragraph that truncated mid-item.
   */
  entities: string[];
  /** What actually happens if it is ignored. The "notifying" half. */
  why: string;
  to: string;
  cta: string;
}

export const SEVERITY_ORDER: Severity[] = ["blocking", "slipping", "tidy"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: "Blocking",
  slipping: "Slipping",
  tidy: "Tidy up",
};

/**
 * Which week of the term today falls in, 1-based. Returns null when the term
 * has no start date on record — every rule that needs it then stands down
 * rather than guessing, since a wrong week would invent urgency.
 */
export const weekOfTerm = (
  termStart: string | null,
  today: Date = new Date(),
): number | null => {
  if (!termStart) return null;
  const start = new Date(termStart);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return null; // term hasn't started
  return Math.floor(days / 7) + 1;
};

const named = (rows: { subject_name: string; class_group_name: string }[]) =>
  rows.map((r) => `${r.subject_name} · ${r.class_group_name}`);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Turn an overview payload into a severity-ordered action list.
 *
 * Pure on purpose: the interesting part of this page is the triage, so it is
 * testable without rendering anything.
 */
export const buildActionItems = (
  data: TeacherOverview,
  week: number | null,
): ActionItem[] => {
  const items: ActionItem[] = [];
  const rows = data.schemes.rows;

  const rejected = rows.filter(
    (s) => s.status === "submitted" && s.validation_status === "REJECTED",
  );
  if (rejected.length > 0) {
    items.push({
      key: "scheme-rejected",
      severity: "blocking",
      count: rejected.length,
      title: `${rejected.length} ${plural(rejected.length, "scheme", "schemes")} sent back for revision`,
      entities: named(rejected),
      why:
        rejected[0].validation_comment?.trim() ||
        "Your validator is waiting on the revision before it can be approved.",
      to: "/scheme-of-work",
      cta: "Revise",
    });
  }

  const missing = rows.filter((s) => s.status === "pending");
  if (missing.length > 0) {
    // Before the term is properly underway this is a to-do; once teaching has
    // started it is overdue, and everything downstream is blocked on it.
    const started = week !== null && week >= 2;
    items.push({
      key: "scheme-missing",
      severity: started ? "blocking" : "slipping",
      count: missing.length,
      title: `${missing.length} ${plural(missing.length, "scheme", "schemes")} of work not submitted`,
      entities: named(missing),
      why: started
        ? `Teaching is in week ${week} — lesson notes, plans and courses all hang off the scheme.`
        : "Submit before teaching starts so lesson notes and courses can be built on it.",
      to: "/scheme-of-work",
      cta: "Submit",
    });
  }

  const empty = rows.filter(
    (s) => s.status === "submitted" && s.entries_count === 0,
  );
  if (empty.length > 0) {
    items.push({
      key: "scheme-empty",
      severity: "slipping",
      count: empty.length,
      title: `${empty.length} ${plural(empty.length, "scheme has", "schemes have")} no weeks planned`,
      entities: named(empty),
      why: "An empty scheme cannot be validated and seeds no course content.",
      to: "/scheme-of-work",
      cta: "Add weeks",
    });
  }

  // Planned weeks should keep pace with the calendar. Only schemes that have
  // been started are judged — a missing one is already reported above, and
  // counting it twice would double the alarm for a single piece of work.
  const behind =
    week === null
      ? []
      : rows.filter(
          (s) =>
            s.status === "submitted" &&
            s.entries_count > 0 &&
            s.entries_count < week,
        );
  if (behind.length > 0) {
    items.push({
      key: "scheme-behind",
      severity: "slipping",
      count: behind.length,
      title: `${behind.length} ${plural(behind.length, "scheme is", "schemes are")} behind the calendar`,
      entities: behind.map(
        (s) =>
          `${s.subject_name} · ${s.class_group_name} (${s.entries_count}/${week} weeks)`,
      ),
      why: `The term is in week ${week}; plan the weeks you have already taught.`,
      to: "/scheme-of-work",
      cta: "Plan",
    });
  }

  if (data.courses.drafts > 0) {
    items.push({
      key: "course-draft",
      severity: "slipping",
      count: data.courses.drafts,
      title: `${data.courses.drafts} e-learning ${plural(data.courses.drafts, "course is", "courses are")} unpublished`,
      entities: data.courses.recent
        .filter((c) => c.status === "DRAFT")
        .map((c) => c.title),
      why: "Students cannot open the material until the course is published.",
      to: "/elearning/courses",
      cta: "Publish",
    });
  }

  if (data.lessonNotes.drafts > 0) {
    items.push({
      key: "note-draft",
      severity: "tidy",
      count: data.lessonNotes.drafts,
      title: `${data.lessonNotes.drafts} lesson ${plural(data.lessonNotes.drafts, "note is", "notes are")} still in draft`,
      entities: data.lessonNotes.recent_drafts.map((n) => n.title),
      why: "Drafts are private — publish to share them with your class.",
      to: "/lesson-notes",
      cta: "Finish",
    });
  }

  return items.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
};

/** How many individual things each tier stands for. */
export const countsBySeverity = (items: ActionItem[]) =>
  items.reduce(
    (acc, item) => {
      acc[item.severity] += item.count;
      return acc;
    },
    { blocking: 0, slipping: 0, tidy: 0 } as Record<Severity, number>,
  );
