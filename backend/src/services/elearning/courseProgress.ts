import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  CompletionRule,
  CourseItemProgress,
  CourseSectionPrerequisite,
  LearningEvent,
  LearningObjectType,
  LearningVerb,
} from "../../db/schema";
import { CriterionChip, TreeItem, TreeSection, isItemVisibleToStudents } from "./courseTree";
import { todayDateOnly } from "./dates";

/**
 * Completion rules (plan §3.2), as pure functions over (rule, action) plus the persistence
 * that projects them into CourseItemProgress. Every UI action and every inbound partner event
 * goes through `applyAction` so the state machine has exactly one implementation.
 */

export type ProgressAction =
  | { kind: "VIEW" }
  | { kind: "MARK_DONE" }
  | { kind: "SUBMIT" }
  | { kind: "SCORE"; score_pct: number }
  | { kind: "TEACHER_OVERRIDE" };

export type ProgressRow = typeof CourseItemProgress.$inferSelect;

/** Does `action` complete an item with `rule`? Pure — the table-driven tests exercise this directly. */
export function actionCompletes(rule: CompletionRule, action: ProgressAction, minScorePct: number | null): boolean {
  if (action.kind === "TEACHER_OVERRIDE") return true;
  switch (rule) {
    case "NONE":
      return false;
    case "VIEW":
      return action.kind === "VIEW" || action.kind === "MARK_DONE";
    case "MARK_DONE":
      return action.kind === "MARK_DONE";
    case "SUBMIT":
      return action.kind === "SUBMIT" || action.kind === "SCORE";
    case "MIN_SCORE":
      return action.kind === "SCORE" && action.score_pct >= (minScorePct ?? 100);
    default:
      return false;
  }
}

const completedVia = (action: ProgressAction): ProgressRow["completed_via"] => {
  switch (action.kind) {
    case "VIEW":
      return "VIEW";
    case "MARK_DONE":
      return "MARK_DONE";
    case "TEACHER_OVERRIDE":
      return "TEACHER";
    default:
      return "EVENT";
  }
};

export async function loadProgress(itemId: number, userId: number): Promise<ProgressRow | null> {
  const [row] = await db
    .select()
    .from(CourseItemProgress)
    .where(and(eq(CourseItemProgress.item_id, itemId), eq(CourseItemProgress.user_id, userId)))
    .limit(1);
  return row || null;
}

/**
 * Applies one action to one (item, student). Returns the new row and whether this call is
 * the one that completed the item (so callers can celebrate exactly once).
 */
export async function applyAction(
  item: { item_id: number; completion_rule: CompletionRule; min_score_pct: number | null },
  userId: number,
  action: ProgressAction,
): Promise<{ progress: ProgressRow; justCompleted: boolean }> {
  const existing = await loadProgress(item.item_id, userId);
  const now = new Date();
  const completes = actionCompletes(item.completion_rule, action, item.min_score_pct);
  const wasCompleted = existing?.state === "COMPLETED";

  const patch: Partial<typeof CourseItemProgress.$inferInsert> = {};
  if (action.kind === "VIEW") {
    patch.last_viewed_at = now;
    patch.view_count = (existing?.view_count || 0) + 1;
    if (!existing?.first_viewed_at) patch.first_viewed_at = now;
    if (!wasCompleted) patch.state = "IN_PROGRESS";
  }
  if (action.kind === "SCORE") {
    const best = existing?.best_score_pct ? Number(existing.best_score_pct) : null;
    if (best === null || action.score_pct > best) patch.best_score_pct = String(action.score_pct) as any;
    if (!wasCompleted) patch.state = "IN_PROGRESS";
  }
  if (action.kind === "SUBMIT" && !wasCompleted) patch.state = "IN_PROGRESS";
  if (completes && !wasCompleted) {
    patch.state = "COMPLETED";
    patch.completed_at = now;
    patch.completed_via = completedVia(action);
  }

  if (!existing) {
    await db.insert(CourseItemProgress).values({
      item_id: item.item_id,
      user_id: userId,
      state: "NOT_STARTED",
      view_count: 0,
      seconds_spent: 0,
      ...patch,
    });
  } else if (Object.keys(patch).length > 0) {
    await db
      .update(CourseItemProgress)
      .set(patch)
      .where(and(eq(CourseItemProgress.item_id, item.item_id), eq(CourseItemProgress.user_id, userId)));
  }
  const progress = (await loadProgress(item.item_id, userId))!;
  return { progress, justCompleted: completes && !wasCompleted };
}

/** Heartbeat: accumulate reading time (capped) and remember where the student is. */
export async function recordHeartbeat(
  item: { item_id: number; estimated_minutes: number | null },
  userId: number,
  seconds: number,
  position: unknown,
): Promise<ProgressRow> {
  const existing = await loadProgress(item.item_id, userId);
  // Cap at 2× the estimate (or 3 h when unknown) so an open tab can't inflate engagement.
  const cap = item.estimated_minutes ? item.estimated_minutes * 60 * 2 : 3 * 60 * 60;
  const add = Math.max(0, Math.min(120, Math.floor(seconds || 0)));
  const total = Math.min(cap, (existing?.seconds_spent || 0) + add);
  const patch: Partial<typeof CourseItemProgress.$inferInsert> = {
    seconds_spent: total,
    last_viewed_at: new Date(),
  };
  if (position !== undefined) patch.last_position = position ?? null;
  if (!existing) {
    await db.insert(CourseItemProgress).values({
      item_id: item.item_id,
      user_id: userId,
      state: "IN_PROGRESS",
      first_viewed_at: new Date(),
      view_count: 1,
      ...patch,
    });
  } else {
    if (existing.state === "NOT_STARTED") patch.state = "IN_PROGRESS";
    await db
      .update(CourseItemProgress)
      .set(patch)
      .where(and(eq(CourseItemProgress.item_id, item.item_id), eq(CourseItemProgress.user_id, userId)));
  }
  return (await loadProgress(item.item_id, userId))!;
}

/** Append one xAPI-lite statement. Idempotent on (source_system, idempotency_key). Returns false on a replay. */
export async function logLearningEvent(input: {
  actor_user_id: number;
  verb: LearningVerb;
  object_type: LearningObjectType;
  object_id: number;
  course_item_id?: number | null;
  result?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  source_system?: string;
  occurred_at?: Date;
  idempotency_key?: string | null;
}): Promise<boolean> {
  try {
    await db.insert(LearningEvent).values({
      actor_user_id: input.actor_user_id,
      verb: input.verb,
      object_type: input.object_type,
      object_id: input.object_id,
      course_item_id: input.course_item_id ?? null,
      result_json: input.result ?? null,
      context_json: input.context ?? null,
      source_system: input.source_system || "MIS",
      occurred_at: input.occurred_at || new Date(),
      idempotency_key: input.idempotency_key ?? null,
    });
    return true;
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Course-level derivation: section state, locks, %, next item — the learner payload.
// ----------------------------------------------------------------------------

export type SectionState = "locked" | "unlocked" | "started" | "completed";

export interface LearnerItem extends TreeItem {
  state: ProgressRow["state"];
  completed_at: Date | null;
  best_score_pct: number | null;
  seconds_spent: number;
  last_position: unknown;
  /** Sequential progress: the item before this one isn't done yet. */
  locked: boolean;
}

export interface LearnerCriterion extends CriterionChip {
  /** NOT_STARTED = nothing aligned done; IN_PROGRESS = aligned item opened; COMPLETED = aligned item done. */
  state: ProgressRow["state"];
  /** No visible item in this week addresses it yet (the teacher still has a gap). */
  unplanned: boolean;
}

export interface LearnerSection extends Omit<TreeSection, "items"> {
  items: LearnerItem[];
  criteria_progress: LearnerCriterion[];
  state: SectionState;
  required_total: number;
  required_done: number;
  is_current_week: boolean;
  lock_reason: string | null;
}

export async function loadProgressMap(itemIds: number[], userId: number): Promise<Map<number, ProgressRow>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(CourseItemProgress)
    .where(and(eq(CourseItemProgress.user_id, userId), inArray(CourseItemProgress.item_id, itemIds)));
  return new Map(rows.map((r) => [r.item_id, r]));
}

export const isCurrentWeek = (section: { start_date: string | null; end_date: string | null }, today = new Date()): boolean => {
  if (!section.start_date) return false;
  const t = todayDateOnly(today);
  const start = String(section.start_date).slice(0, 10);
  const end = section.end_date ? String(section.end_date).slice(0, 10) : start;
  return start <= t && t <= end;
};

/**
 * Projects the full tree into what one student sees: hidden/unpublished sections and items
 * removed, per-item state merged, section state + locks derived. Pure given its inputs.
 */
export function deriveLearnerSections(
  sections: TreeSection[],
  progress: Map<number, ProgressRow>,
  opts: { sequential: boolean; prerequisites: Map<number, number[]>; today?: Date },
): LearnerSection[] {
  const visible = sections
    .filter((s) => s.status === "PUBLISHED")
    .map((s) => ({ ...s, items: s.items.filter(isItemVisibleToStudents) }));

  const sectionDone = new Map<number, boolean>();
  const out: LearnerSection[] = [];
  let previousItemDone = true; // sequential lock carries across sections

  for (const s of visible) {
    const isDone = (i: TreeItem) => progress.get(i.item_id)?.state === "COMPLETED";
    const completable = s.items.filter((i) => i.completion_rule !== "NONE");
    const required = completable.filter((i) => i.is_required);
    const requiredDone = required.filter(isDone).length;
    // ALL: every required item done; ONE: any required item done. A week with only optional
    // items completes when all of them are done; a week with nothing completable never does.
    let complete: boolean;
    if (required.length > 0) {
      complete = s.requirement_type === "ONE" ? requiredDone > 0 : requiredDone === required.length;
    } else {
      complete = completable.length > 0 && completable.every(isDone);
    }
    const started = s.items.some((i) => (progress.get(i.item_id)?.state || "NOT_STARTED") !== "NOT_STARTED");

    const unmet = (opts.prerequisites.get(s.section_id) || []).filter((req) => sectionDone.get(req) === false);
    let lock_reason: string | null = null;
    if (unmet.length > 0) {
      const names = unmet.map((id) => sections.find((x) => x.section_id === id)?.title || "an earlier week");
      lock_reason = `Finish ${names.join(" and ")} first`;
    }

    const items: LearnerItem[] = s.items.map((i) => {
      const p = progress.get(i.item_id);
      let locked = false;
      if (opts.sequential && lock_reason === null) {
        locked = !previousItemDone && i.completion_rule !== "NONE";
        if (i.completion_rule !== "NONE") previousItemDone = !!p && p.state === "COMPLETED";
      } else if (opts.sequential) {
        locked = true;
      }
      return {
        ...i,
        state: p?.state || "NOT_STARTED",
        completed_at: p?.completed_at || null,
        best_score_pct: p?.best_score_pct ? Number(p.best_score_pct) : null,
        seconds_spent: p?.seconds_spent || 0,
        last_position: p?.last_position ?? null,
        locked: locked || lock_reason !== null,
      };
    });

    const state: SectionState = lock_reason ? "locked" : complete ? "completed" : started ? "started" : "unlocked";
    sectionDone.set(s.section_id, state === "completed");
    // "You covered 2.1 and 2.2": each target criterion's state follows the items aligned to it.
    const criteria_progress: LearnerCriterion[] = s.criteria.map((c) => {
      const aligned = s.items.filter((i) => i.item_type !== "HEADER" && i.criteria.some((x) => x.criteria_id === c.criteria_id));
      const states = aligned.map((i) => progress.get(i.item_id)?.state || "NOT_STARTED");
      return {
        ...c,
        unplanned: aligned.length === 0,
        state: states.includes("COMPLETED") ? "COMPLETED" : states.includes("IN_PROGRESS") ? "IN_PROGRESS" : "NOT_STARTED",
      };
    });
    out.push({
      ...s,
      items,
      criteria_progress,
      state,
      required_total: required.length,
      required_done: requiredDone,
      is_current_week: isCurrentWeek(s, opts.today),
      lock_reason,
    });
  }
  return out;
}

export function summariseCourse(sections: LearnerSection[]) {
  const all = sections.flatMap((s) => s.items).filter((i) => i.completion_rule !== "NONE");
  const required = all.filter((i) => i.is_required);
  const done = required.filter((i) => i.state === "COMPLETED").length;
  const pct = required.length === 0 ? 0 : Math.round((done / required.length) * 100);
  const now = new Date();
  const overdue = all.filter((i) => i.due_at && new Date(i.due_at) < now && i.state !== "COMPLETED");
  const dueSoon = all.filter(
    (i) => i.due_at && new Date(i.due_at) >= now && new Date(i.due_at).getTime() - now.getTime() < 7 * 86400000 && i.state !== "COMPLETED",
  );
  const current = sections.find((s) => s.is_current_week);
  // "Continue": first incomplete unlocked item in the current week, else anywhere in order.
  const pick = (list: LearnerItem[]) => list.find((i) => i.state !== "COMPLETED" && !i.locked) || null;
  const nextItem = (current && pick(current.items)) || pick(sections.flatMap((s) => s.items)) || null;
  const lastViewed = all
    .filter((i) => i.state === "IN_PROGRESS")
    .sort((a, b) => (b.seconds_spent || 0) - (a.seconds_spent || 0))[0] || null;
  return {
    percent: pct,
    required_total: required.length,
    required_done: done,
    overdue_count: overdue.length,
    due_soon: dueSoon.slice(0, 5).map((i) => ({ item_id: i.item_id, title: i.title, due_at: i.due_at, item_type: i.item_type })),
    current_section: current ? { section_id: current.section_id, title: current.title, state: current.state } : null,
    next_item: nextItem
      ? {
          item_id: nextItem.item_id,
          title: nextItem.title,
          item_type: nextItem.item_type,
          estimated_minutes: nextItem.estimated_minutes,
          section_id: nextItem.section_id,
          state: nextItem.state,
        }
      : null,
    resume_item: lastViewed ? { item_id: lastViewed.item_id, title: lastViewed.title, item_type: lastViewed.item_type } : null,
    sections_completed: sections.filter((s) => s.state === "completed").length,
    sections_total: sections.length,
    criteria_total: sections.reduce((n, s) => n + s.criteria_progress.length, 0),
    criteria_covered: sections.reduce((n, s) => n + s.criteria_progress.filter((c) => c.state === "COMPLETED").length, 0),
    // Near-goal nudge (UX plan §4.4): only weeks that are ≥ 60 % done — far-goal pressure is out.
    near_goal: sections
      .filter((s) => s.state !== "completed" && s.state !== "locked" && s.required_total > 1 && s.required_done / s.required_total >= 0.6)
      .map((s) => ({ section_id: s.section_id, title: s.title, remaining: s.required_total - s.required_done }))
      .slice(0, 2),
  };
}

export async function loadPrerequisites(sectionIds: number[]): Promise<Map<number, number[]>> {
  if (sectionIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(CourseSectionPrerequisite)
    .where(inArray(CourseSectionPrerequisite.section_id, sectionIds));
  const map = new Map<number, number[]>();
  for (const r of rows) {
    if (!map.has(r.section_id)) map.set(r.section_id, []);
    map.get(r.section_id)!.push(r.requires_section_id);
  }
  return map;
}

/** Aggregated progress for a whole class: per item → {viewed, completed, avg_seconds, avg_score}. */
export async function aggregateItemProgress(itemIds: number[]) {
  if (itemIds.length === 0) return new Map<number, { viewed: number; completed: number; avg_seconds: number; avg_score: number | null }>();
  const rows = await db
    .select({
      item_id: CourseItemProgress.item_id,
      viewed: sql<number>`SUM(CASE WHEN ${CourseItemProgress.state} <> 'NOT_STARTED' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${CourseItemProgress.state} = 'COMPLETED' THEN 1 ELSE 0 END)`,
      avg_seconds: sql<number>`AVG(${CourseItemProgress.seconds_spent})`,
      avg_score: sql<number | null>`AVG(${CourseItemProgress.best_score_pct})`,
    })
    .from(CourseItemProgress)
    .where(inArray(CourseItemProgress.item_id, itemIds))
    .groupBy(CourseItemProgress.item_id);
  return new Map(
    rows.map((r) => [
      r.item_id,
      {
        viewed: Number(r.viewed || 0),
        completed: Number(r.completed || 0),
        avg_seconds: Math.round(Number(r.avg_seconds || 0)),
        avg_score: r.avg_score === null ? null : Math.round(Number(r.avg_score)),
      },
    ]),
  );
}
