import type { ReviewState, Status } from "./core";

/**
 * The stage rules (plan §3.1, extended by migration 131). Pure: the service loads the project,
 * asks here, and writes what comes back. The board shows `message` when a move is refused.
 *
 *   IDEA -> PLANNING -> IN_PROGRESS (Building) -> TESTING -> COMPLETED
 *   - forward moves may skip Planning/Testing, but nothing reaches COMPLETED before Building;
 *   - backward moves are always allowed (from COMPLETED with a reason);
 *   - ON_HOLD pauses any working stage (with a reason) and remembers it in paused_from;
 *     resuming goes to any working stage, never straight to COMPLETED;
 *   - leaving IDEA (except to pause) needs the concept note; completing needs an outcome.
 *   Review state belongs to staff, except that completing asks for verification and
 *   reopening clears it.
 */

export interface LifecycleProject {
  status: Status;
  review_state: ReviewState;
  archived: boolean;
  hasConcept: boolean;
  paused_from?: Status | null;
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
      paused_from: Status | null;
      setStarted: boolean;
      setCompleted: boolean;
      clearCompleted: boolean;
      outcomeSummary?: string;
      note: string | null;
    }
  | { ok: false; code: string; message: string; field?: string };

export const ORDER: Record<Exclude<Status, "ON_HOLD">, number> = { IDEA: 0, PLANNING: 1, IN_PROGRESS: 2, TESTING: 3, COMPLETED: 4 };
export const MIN_OUTCOME = 20;
export const MIN_REASON = 5;

/** Where a project really is on the path (a paused project counts where it paused). */
export const pathStage = (s: Status, pausedFrom?: Status | null): Exclude<Status, "ON_HOLD"> =>
  s === "ON_HOLD" ? ((pausedFrom && pausedFrom !== "ON_HOLD" ? pausedFrom : "IDEA") as Exclude<Status, "ON_HOLD">) : s;

export function transition(p: LifecycleProject, input: TransitionInput): TransitionResult {
  const to = input.to;
  if (!(to in ORDER) && to !== "ON_HOLD") return { ok: false, code: "BAD_STATUS", message: "Unknown status" };
  if (p.archived) return { ok: false, code: "ARCHIVED", message: "Restore the project before moving it" };
  if (to === p.status) return { ok: false, code: "SAME_STATUS", message: "The project is already there" };
  const reason = String(input.reason ?? "").trim();
  const outcome = String(input.outcomeSummary ?? "").trim();

  if (to === "ON_HOLD") {
    if (p.status === "COMPLETED") return { ok: false, code: "PAUSE_NOT_ALLOWED", message: "A completed project can't be put on hold" };
    if (reason.length < MIN_REASON) return { ok: false, code: "REASON_REQUIRED", message: "Say why it is paused", field: "reason" };
    return { ok: true, status: "ON_HOLD", review_state: p.review_state, paused_from: p.status, setStarted: false, setCompleted: false, clearCompleted: false, note: reason.slice(0, 500) };
  }

  if (!p.hasConcept && to !== "IDEA") {
    return { ok: false, code: "CONCEPT_REQUIRED", message: "Add the concept note first", field: "concept" };
  }
  const from = pathStage(p.status, p.paused_from);
  if (input.correction) {
    if (reason.length < MIN_REASON) return { ok: false, code: "REASON_REQUIRED", message: "Say why the status is corrected", field: "reason" };
  } else {
    if (to === "COMPLETED" && p.status === "ON_HOLD") return { ok: false, code: "RESUME_FIRST", message: "Resume the project before completing it", field: "status" };
    if (to === "COMPLETED" && ORDER[from] < ORDER.IN_PROGRESS) {
      return { ok: false, code: "SKIP_NOT_ALLOWED", message: "Build it first: move it to Building", field: "status" };
    }
    if (to === "COMPLETED" && outcome.length < MIN_OUTCOME) {
      return { ok: false, code: "OUTCOME_REQUIRED", message: `Describe the result (at least ${MIN_OUTCOME} characters)`, field: "outcomeSummary" };
    }
    if (p.status === "COMPLETED" && reason.length < MIN_REASON) {
      return { ok: false, code: "REASON_REQUIRED", message: "Say why the project is reopened", field: "reason" };
    }
  }

  let review: ReviewState = p.review_state;
  if (to === "COMPLETED") review = "AWAITING_VERIFICATION";
  else if (p.status === "COMPLETED") review = "NONE";

  return {
    ok: true,
    status: to,
    review_state: review,
    paused_from: null,
    setStarted: ORDER[to as Exclude<Status, "ON_HOLD">] >= ORDER.PLANNING,
    setCompleted: to === "COMPLETED",
    clearCompleted: p.status === "COMPLETED",
    outcomeSummary: to === "COMPLETED" && outcome ? outcome.slice(0, 3000) : undefined,
    note: reason ? reason.slice(0, 500) : null,
  };
}

/** Default progress of a stage when there are no milestones and no manual value. */
const STAGE_FLOOR: Record<Exclude<Status, "ON_HOLD">, number> = { IDEA: 0, PLANNING: 15, IN_PROGRESS: 40, TESTING: 80, COMPLETED: 100 };
const STAGE_CAP: Record<Exclude<Status, "ON_HOLD">, number> = { IDEA: 20, PLANNING: 40, IN_PROGRESS: 99, TESTING: 99, COMPLETED: 100 };

/** Progress shown on a card: milestones when there are some, else the student's slider, else the stage. */
export function progressOf(
  p: { status: Status; paused_from?: Status | null; progress_mode: "AUTO" | "MANUAL"; progress_manual: number | null },
  milestones: { total: number; done: number },
): number {
  const stage = pathStage(p.status, p.paused_from);
  if (stage === "COMPLETED") return 100;
  const cap = STAGE_CAP[stage];
  if (p.progress_mode === "MANUAL" || milestones.total === 0) {
    const m = p.progress_manual ?? STAGE_FLOOR[stage];
    return Math.max(0, Math.min(cap, Math.round(Number(m))));
  }
  return Math.min(cap, Math.round((milestones.done / milestones.total) * 100));
}

export type Health = "ON_TRACK" | "STALE" | "OVERDUE" | "BLOCKED" | "DONE" | "IDLE" | "PAUSED";

/** Health dot (plan §3.7 + stage windows). Computed on read, never stored. */
export function healthOf(
  p: { status: Status; last_activity_at: string | Date; target_date: string | null; stage_end?: string | null },
  extra: { overdueMilestones: number; lastUpdateBlocked: boolean },
  now: Date,
  staleDays: number,
): Health {
  if (p.status === "COMPLETED") return "DONE";
  if (p.status === "ON_HOLD") return "PAUSED";
  const today = now.toISOString().slice(0, 10);
  const working = p.status === "PLANNING" || p.status === "IN_PROGRESS" || p.status === "TESTING";
  if ((p.target_date && p.target_date < today && p.status !== "IDEA") || (p.stage_end && p.stage_end < today) || extra.overdueMilestones > 0) return "OVERDUE";
  if (!working) return "IDLE";
  if (extra.lastUpdateBlocked) return "BLOCKED";
  const last = new Date(p.last_activity_at).getTime();
  if (now.getTime() - last >= staleDays * 86_400_000) return "STALE";
  return "ON_TRACK";
}
