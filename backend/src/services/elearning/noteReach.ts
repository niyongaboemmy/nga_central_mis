/**
 * Does a lesson note actually reach students through e-learning, and if not,
 * what is the next thing standing in the way?
 *
 * A note is only readable on a course when every link in the chain is open:
 * the note is published, it sits on a week, its item is visible, the week is
 * open (published, or scheduled with its date passed) and the course is
 * published. The teacher used to see "on e-learning" as soon as a note was
 * placed, even while the week or course was still hidden, so a page could say
 * "5 of 5 on e-learning" while no student could open any of them.
 */

export type ReachState = "LIVE" | "SCHEDULED" | "BLOCKED" | "OFF_COURSE";

export type ReachFix =
  | "publish_note"
  | "place"
  | "show_item"
  | "publish_week"
  | "publish_course";

export interface ReachStep {
  key: "note" | "placed" | "item" | "week" | "course";
  ok: boolean;
  label: string;
  /** Why this step isn't done yet, in the teacher's words. */
  detail?: string;
  /** The one action that clears it, when there is one. */
  fix?: ReachFix;
}

export interface ReachInput {
  note_status: "DRAFT" | "PUBLISHED" | string | null;
  placement: {
    is_published: boolean;
    section_status: "HIDDEN" | "SCHEDULED" | "PUBLISHED" | string;
    section_unlock_at: Date | string | null;
    course_status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  } | null;
  /** Whether a course exists for the note's subject + class group (only read when unplaced). */
  has_course?: boolean;
}

export interface Reach {
  state: ReachState;
  /** For SCHEDULED: when the week opens (ISO). */
  opens_at: string | null;
  /** First step that isn't done, as a short phrase for chips ("Week is hidden"). */
  blocker: string | null;
  steps: ReachStep[];
}

const toDate = (v: Date | string | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function computeNoteReach(input: ReachInput, now: Date = new Date()): Reach {
  const steps: ReachStep[] = [];
  const notePublished = input.note_status === "PUBLISHED";
  steps.push(
    notePublished
      ? { key: "note", ok: true, label: "Note is published" }
      : {
          key: "note",
          ok: false,
          label: "Note is a draft",
          detail: "Students can't read a draft, even on the course.",
          fix: "publish_note",
        },
  );

  const p = input.placement;
  if (!p) {
    steps.push({
      key: "placed",
      ok: false,
      label: "Not on a course week",
      detail: input.has_course === false
        ? "There is no e-learning course for this subject and class yet."
        : "Choose the week students should read it in.",
      fix: input.has_course === false ? undefined : "place",
    });
    return { state: "OFF_COURSE", opens_at: null, blocker: "Not on e-learning", steps };
  }
  steps.push({ key: "placed", ok: true, label: "On a course week" });

  steps.push(
    p.is_published
      ? { key: "item", ok: true, label: "Visible in the week" }
      : {
          key: "item",
          ok: false,
          label: "Hidden in the week",
          detail: "The note is on the week but switched off for students.",
          fix: "show_item",
        },
  );

  const unlock = toDate(p.section_unlock_at);
  const weekOpen =
    p.section_status === "PUBLISHED" ||
    (p.section_status === "SCHEDULED" && !!unlock && unlock.getTime() <= now.getTime());
  const weekScheduled = p.section_status === "SCHEDULED" && !weekOpen;
  steps.push(
    weekOpen
      ? { key: "week", ok: true, label: "Week is open" }
      : weekScheduled
        ? {
            key: "week",
            ok: false,
            label: unlock ? "Week opens on a date" : "Week is scheduled",
            detail: unlock
              ? `Students get it automatically on ${unlock.toISOString().slice(0, 10)}.`
              : "The week is scheduled without a date.",
            fix: "publish_week",
          }
        : {
            key: "week",
            ok: false,
            label: "Week is hidden",
            detail: "Nothing in this week shows until the week is published.",
            fix: "publish_week",
          },
  );

  const courseOpen = p.course_status === "PUBLISHED";
  steps.push(
    courseOpen
      ? { key: "course", ok: true, label: "Course is published" }
      : p.course_status === "ARCHIVED"
        ? {
            key: "course",
            ok: false,
            label: "Course is archived",
            detail: "Archived courses are closed to students.",
          }
        : {
            key: "course",
            ok: false,
            label: "Course is a draft",
            detail: "Publish the course so students can open it.",
            fix: "publish_course",
          },
  );

  const firstBlocked = steps.find((s) => !s.ok);
  if (!firstBlocked) return { state: "LIVE", opens_at: null, blocker: null, steps };

  // Only the week's date is left: it will go live on its own.
  const onlyWaitingForDate =
    weekScheduled && !!unlock && steps.filter((s) => !s.ok).every((s) => s.key === "week");
  if (onlyWaitingForDate) {
    return { state: "SCHEDULED", opens_at: unlock!.toISOString(), blocker: firstBlocked.label, steps };
  }
  return { state: "BLOCKED", opens_at: null, blocker: firstBlocked.label, steps };
}
