import type { ReviewState, Status } from "./core";

/**
 * The status rules (plan §3.1-§3.2). Pure: the service loads the project, asks here, and
 * writes what comes back. The board shows `message` when a move is refused.
 *
 *   IDEA -> IN_PROGRESS -> COMPLETED, back one step at any time, never IDEA -> COMPLETED.
 *   Completing needs an outcome summary; reopening a completed project needs a reason.
 *   Review state belongs to staff, except that completing asks for verification and
 *   reopening clears it.
 */

export interface LifecycleProject {
  status: Status;
  review_state: ReviewState;
  archived: boolean;
  hasConcept: boolean;
}

export interface TransitionInput {
  to: Status;
  outcomeSummary?: string | null;
  reason?: string | null;
  /** a staff correction (SIDE_PROJECTS_MANAGE_ANY): may skip steps, always with a reason */
  correction?: boolean;
}

export type TransitionResult =
  | {
      ok: true;
      status: Status;
      review_state: ReviewState;
      setStarted: boolean;
      setCompleted: boolean;
      clearCompleted: boolean;
      outcomeSummary?: string;
      note: string | null;
    }
  | { ok: false; code: string; message: string; field?: string };

const ORDER: Record<Status, number> = { IDEA: 0, IN_PROGRESS: 1, COMPLETED: 2 };
export const MIN_OUTCOME = 20;
export const MIN_REASON = 5;

export function transition(p: LifecycleProject, input: TransitionInput): TransitionResult {
  const to = input.to;
  if (!(to in ORDER)) return { ok: false, code: "BAD_STATUS", message: "Unknown status" };
  if (p.archived) return { ok: false, code: "ARCHIVED", message: "Restore the project before moving it" };
  if (to === p.status) return { ok: false, code: "SAME_STATUS", message: "The project is already there" };
  if (!p.hasConcept && to !== "IDEA") {
    return { ok: false, code: "CONCEPT_REQUIRED", message: "Add the concept note first", field: "concept" };
  }
  const reason = String(input.reason ?? "").trim();
  if (input.correction) {
    if (reason.length < MIN_REASON) return { ok: false, code: "REASON_REQUIRED", message: "Say why the status is corrected", field: "reason" };
  } else if (ORDER[to] - ORDER[p.status] > 1) {
    return { ok: false, code: "SKIP_NOT_ALLOWED", message: "Start the work first: move it to In progress", field: "status" };
  }

  const outcome = String(input.outcomeSummary ?? "").trim();
  if (to === "COMPLETED" && !input.correction && outcome.length < MIN_OUTCOME) {
    return { ok: false, code: "OUTCOME_REQUIRED", message: `Describe the result (at least ${MIN_OUTCOME} characters)`, field: "outcomeSummary" };
  }
  if (p.status === "COMPLETED" && !input.correction && reason.length < MIN_REASON) {
    return { ok: false, code: "REASON_REQUIRED", message: "Say why the project is reopened", field: "reason" };
  }

  let review: ReviewState = p.review_state;
  if (to === "COMPLETED") review = "AWAITING_VERIFICATION";
  else if (p.status === "COMPLETED") review = "NONE";

  return {
    ok: true,
    status: to,
    review_state: review,
    setStarted: ORDER[to] >= 1,
    setCompleted: to === "COMPLETED",
    clearCompleted: p.status === "COMPLETED",
    outcomeSummary: to === "COMPLETED" && outcome ? outcome.slice(0, 3000) : undefined,
    note: reason ? reason.slice(0, 500) : null,
  };
}

/** Progress shown on a card: milestones when there are some, else the student's slider. */
export function progressOf(p: { status: Status; progress_mode: "AUTO" | "MANUAL"; progress_manual: number | null }, milestones: { total: number; done: number }): number {
  if (p.status === "COMPLETED") return 100;
  if (p.progress_mode === "MANUAL" || milestones.total === 0) {
    const m = Number(p.progress_manual ?? (p.status === "IN_PROGRESS" ? 10 : 0));
    return Math.max(0, Math.min(p.status === "IDEA" ? 20 : 99, Math.round(m)));
  }
  // An idea is never more than 20% done, whatever was ticked while planning it.
  return Math.min(p.status === "IDEA" ? 20 : 99, Math.round((milestones.done / milestones.total) * 100));
}

export type Health = "ON_TRACK" | "STALE" | "OVERDUE" | "BLOCKED" | "DONE" | "IDLE";

/** Health dot (plan §3.7). Computed on read, never stored. */
export function healthOf(
  p: { status: Status; last_activity_at: string | Date; target_date: string | null },
  extra: { overdueMilestones: number; lastUpdateBlocked: boolean },
  now: Date,
  staleDays: number,
): Health {
  if (p.status === "COMPLETED") return "DONE";
  const today = now.toISOString().slice(0, 10);
  if (p.status === "IN_PROGRESS") {
    if ((p.target_date && p.target_date < today) || extra.overdueMilestones > 0) return "OVERDUE";
    if (extra.lastUpdateBlocked) return "BLOCKED";
    const last = new Date(p.last_activity_at).getTime();
    if (now.getTime() - last >= staleDays * 86_400_000) return "STALE";
    return "ON_TRACK";
  }
  return "IDLE";
}
