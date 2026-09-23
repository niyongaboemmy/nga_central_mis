import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { CourseItemProgress, CourseSection, CourseSectionPrerequisite, LearningEvent, UserProfile } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { assertCanBuildCourse, listCourseMembers, loadCourse, CourseRow } from "../services/elearning/courseMembership";
import { loadCourseTree, loadItemWithCourse, loadSectionWithCourse, isItemVisibleToStudents } from "../services/elearning/courseTree";
import {
  aggregateItemProgress,
  applyAction,
  deriveLearnerSections,
  loadPrerequisites,
  logLearningEvent,
} from "../services/elearning/courseProgress";
import { notifyNudge, notifyResultReceived } from "../services/elearning/courseNotifications";
import { listRecent, listTopics, listWatchers, subscribe } from "../services/elearning/livePresence";
import { buildSectionJourney, courseCoverage } from "../services/elearning/courseCoverage";

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

/**
 * Class-wide analytics for one course (plan §3.3 `GET /courses/:id/analytics`): a funnel per
 * section, per-item view/completion counts, a per-student table, and the "stuck" list.
 * Shared by the teacher Insights tab and the admin drill-down.
 */
export async function buildCourseAnalytics(course: CourseRow) {
  const [tree, members] = await Promise.all([loadCourseTree(course), listCourseMembers(course)]);
  const visibleSections = tree.filter((s) => s.status === "PUBLISHED").map((s) => ({ ...s, items: s.items.filter(isItemVisibleToStudents) }));
  const itemIds = visibleSections.flatMap((s) => s.items.map((i) => i.item_id));
  const memberIds = members.map((m) => m.user_id);
  const total = members.length;

  const [agg, rows, prerequisites] = await Promise.all([
    aggregateItemProgress(itemIds),
    itemIds.length && memberIds.length
      ? db
          .select()
          .from(CourseItemProgress)
          .where(and(inArray(CourseItemProgress.item_id, itemIds), inArray(CourseItemProgress.user_id, memberIds)))
      : Promise.resolve([] as (typeof CourseItemProgress.$inferSelect)[]),
    loadPrerequisites(tree.map((s) => s.section_id)),
  ]);

  const byUser = new Map<number, Map<number, (typeof rows)[number]>>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    byUser.get(r.user_id)!.set(r.item_id, r);
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const students = members.map((m) => {
    const progress = byUser.get(m.user_id) || new Map();
    const derived = deriveLearnerSections(tree, progress, { sequential: !!course.require_sequential_progress, prerequisites });
    const items = derived.flatMap((s) => s.items).filter((i) => i.completion_rule !== "NONE");
    const required = items.filter((i) => i.is_required);
    const done = required.filter((i) => i.state === "COMPLETED").length;
    const lastSeen = [...progress.values()].map((p: any) => p.last_viewed_at).filter(Boolean).sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const seconds = [...progress.values()].reduce((n: number, p: any) => n + (p.seconds_spent || 0), 0);
    const overdue = items.filter((i) => i.due_at && new Date(i.due_at) < now && i.state !== "COMPLETED").length;
    const current = derived.find((s) => s.is_current_week);
    const status: "not_started" | "behind" | "on_track" | "done" =
      required.length > 0 && done === required.length
        ? "done"
        : progress.size === 0
          ? "not_started"
          : overdue > 0 || (current && current.required_total > 0 && current.required_done === 0 && (!lastSeen || new Date(lastSeen) < weekAgo))
            ? "behind"
            : "on_track";
    return {
      user_id: m.user_id,
      name: m.name,
      percent: required.length ? Math.round((done / required.length) * 100) : 0,
      required_done: done,
      required_total: required.length,
      overdue,
      seconds_spent: seconds,
      last_seen_at: lastSeen,
      status,
      sections: derived.map((s) => ({ section_id: s.section_id, state: s.state, done: s.required_done, total: s.required_total })),
    };
  });

  const sections = visibleSections.map((s) => {
    const items = s.items.map((i) => {
      const a = agg.get(i.item_id) || { viewed: 0, completed: 0, avg_seconds: 0, avg_score: null };
      return {
        item_id: i.item_id,
        title: i.title,
        item_type: i.item_type,
        completion_rule: i.completion_rule,
        is_required: i.is_required,
        viewed: a.viewed,
        completed: a.completed,
        avg_seconds: a.avg_seconds,
        avg_score: a.avg_score,
        viewed_pct: total ? Math.round((a.viewed / total) * 100) : 0,
        completed_pct: total ? Math.round((a.completed / total) * 100) : 0,
      };
    });
    const completedStudents = students.filter((st) => st.sections.find((x) => x.section_id === s.section_id)?.state === "completed").length;
    const startedStudents = students.filter((st) => ["started", "completed"].includes(st.sections.find((x) => x.section_id === s.section_id)?.state || "")).length;
    return {
      section_id: s.section_id,
      title: s.title,
      week_number: s.week_number,
      start_date: s.start_date,
      end_date: s.end_date,
      started: startedStudents,
      completed: completedStudents,
      started_pct: total ? Math.round((startedStudents / total) * 100) : 0,
      completed_pct: total ? Math.round((completedStudents / total) * 100) : 0,
      items,
    };
  });

  const activeThisWeek = students.filter((s) => s.last_seen_at && new Date(s.last_seen_at) >= weekAgo).length;
  const percents = students.map((s) => s.percent).sort((a, b) => a - b);
  const median = percents.length ? percents[Math.floor(percents.length / 2)] : 0;

  return {
    course_id: course.course_id,
    members: total,
    active_this_week: activeThisWeek,
    median_percent: median,
    not_started: students.filter((s) => s.status === "not_started").length,
    behind: students.filter((s) => s.status === "behind").length,
    done: students.filter((s) => s.status === "done").length,
    sections,
    students: students.sort((a, b) => a.name.localeCompare(b.name)),
    stuck: students.filter((s) => s.status === "behind" || s.status === "not_started").map((s) => ({ user_id: s.user_id, name: s.name, status: s.status })),
  };
}

/**
 * `GET /courses/:id/live` — who is learning this course right now, as Server-Sent Events.
 * EventSource can't set an Authorization header, so the shared `authenticate` middleware's
 * `?token=` fallback carries the session. X-Accel-Buffering tells nginx not to buffer the
 * stream, which would otherwise hold every event until the connection closed.
 */
export const streamCourseLive = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
  res.write(
    `data: ${JSON.stringify({
      type: "presence",
      watchers: listWatchers(course.course_id),
      topics: listTopics(course.course_id),
      recent: listRecent(course.course_id),
      at: Date.now(),
    })}\n\n`,
  );

  const detach = subscribe(course.course_id, res);
  req.on("close", () => {
    detach();
    res.end();
  });
});

/** Polling fallback for the same data (used when EventSource can't connect). */
export const getCourseLiveSnapshot = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  successResponse(res, "Live", {
    watchers: listWatchers(course.course_id),
    topics: listTopics(course.course_id),
    recent: listRecent(course.course_id),
    at: Date.now(),
  });
});

/** Curriculum coverage: targets per week vs items, gaps, course-wide element coverage. */
export const getCourseCoverage = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  successResponse(res, "Coverage", await courseCoverage(course));
});

/** "Build this week's journey" — fills a week's gaps from the teacher's own aligned notes. */
export const buildJourney = asyncHandler(async (req: any, res: any) => {
  const row = await loadSectionWithCourse(parseId(req.params.id, "section id"));
  if (!row) throw new NotFoundError("Section not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const result = await buildSectionJourney(row.course, row.section.section_id, req.user.userId);
  if (!result) throw new NotFoundError("Section not found");
  successResponse(res, result.added.length ? `Added ${result.added.length} note(s)` : "No matching notes to add", result);
});

export const getCourseAnalytics = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  successResponse(res, "Analytics", await buildCourseAnalytics(course));
});

/** Anonymised "what students asked the AI" per section (Phase 5 input for the next lesson). */
export const getCourseQuestions = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  const rows = await db
    .select({ context_json: LearningEvent.context_json, result_json: LearningEvent.result_json, occurred_at: LearningEvent.occurred_at })
    .from(LearningEvent)
    .where(and(eq(LearningEvent.verb, "ASKED_AI"), eq(LearningEvent.object_type, "COURSE"), eq(LearningEvent.object_id, course.course_id)))
    .orderBy(desc(LearningEvent.occurred_at))
    .limit(200);
  successResponse(
    res,
    "Questions",
    rows.map((r) => ({
      question: (r.result_json as any)?.question || "",
      section_id: (r.context_json as any)?.section_id ?? null,
      grounded: (r.result_json as any)?.grounded ?? null,
      asked_at: r.occurred_at,
    })),
  );
});

/** Teacher override — completes an item for one student; audited via ActivityLog (plan §3.2). */
export const overrideItemProgress = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const studentId = parseId(req.params.userId, "student id");
  const row = await loadItemWithCourse(itemId);
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const members = await listCourseMembers(row.course);
  if (!members.some((m) => m.user_id === studentId)) throw new ValidationError("That student is not a member of this course");

  const { progress, justCompleted } = await applyAction(row.item, studentId, { kind: "TEACHER_OVERRIDE" });
  await logLearningEvent({
    actor_user_id: studentId,
    verb: "COMPLETED",
    object_type: "COURSE_ITEM",
    object_id: itemId,
    course_item_id: itemId,
    context: { course_id: row.course.course_id, section_id: row.section.section_id, via: "TEACHER", teacher_user_id: req.user.userId, reason: req.body?.reason || null },
  });
  await recordActivity(
    studentId,
    "COURSE_PROGRESS_OVERRIDE",
    `Marked "${row.item.title}" complete for student ${studentId}${req.body?.reason ? ` — ${req.body.reason}` : ""}`,
    "CourseItem",
    itemId,
    { course_id: row.course.course_id, reason: req.body?.reason || null },
    req.user.userId,
  );
  successResponse(res, justCompleted ? "Marked complete" : "Already complete", { state: progress.state, completed_via: progress.completed_via });
});

/** Friendly nudge to selected students (UX plan §3.2 Insights → Nudge). */
export const nudgeStudents = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  const ids: number[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number).filter((n: number) => Number.isFinite(n)) : [];
  if (ids.length === 0) throw new ValidationError("Pick at least one student");
  const members = await listCourseMembers(course);
  const targets = ids.filter((id) => members.some((m) => m.user_id === id));
  if (targets.length === 0) throw new ValidationError("None of those students are in this course");
  const [teacher] = await db
    .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, req.user.userId))
    .limit(1);
  const teacherName = `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim();
  await notifyNudge(course, targets, teacherName, req.user.userId, typeof req.body?.message === "string" ? req.body.message : undefined);
  successResponse(res, "Nudge sent", { sent: targets.length });
});

/** Section prerequisites (Canvas prerequisite_module_ids) — opt-in locks. */
export const setSectionPrerequisites = asyncHandler(async (req: any, res: any) => {
  const row = await loadSectionWithCourse(parseId(req.params.id, "section id"));
  if (!row) throw new NotFoundError("Section not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const raw: unknown[] = Array.isArray(req.body?.requires_section_ids) ? req.body.requires_section_ids : [];
  const ids: number[] = [...new Set(raw.map((v) => Number(v)))].filter((n) => Number.isFinite(n) && n > 0);
  if (ids.includes(row.section.section_id)) throw new ValidationError("A week can't require itself");
  if (ids.length) {
    const valid = await db
      .select({ section_id: CourseSection.section_id })
      .from(CourseSection)
      .where(and(eq(CourseSection.course_id, row.course.course_id), inArray(CourseSection.section_id, ids)));
    if (valid.length !== ids.length) throw new ValidationError("Prerequisites must be weeks of this course");
  }
  await db.delete(CourseSectionPrerequisite).where(eq(CourseSectionPrerequisite.section_id, row.section.section_id));
  if (ids.length) {
    await db.insert(CourseSectionPrerequisite).values(ids.map((requires_section_id) => ({ section_id: row.section.section_id, requires_section_id })));
  }
  successResponse(res, "Prerequisites updated", { section_id: row.section.section_id, requires_section_ids: ids });
});

export const getSectionPrerequisites = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  const sections = await db.select({ section_id: CourseSection.section_id }).from(CourseSection).where(eq(CourseSection.course_id, course.course_id));
  const map = await loadPrerequisites(sections.map((s) => s.section_id));
  successResponse(res, "Prerequisites", Object.fromEntries([...map.entries()]));
});

// ----------------------------------------------------------------------------
// Integrations: inbound xAPI-lite statements from Task Mentor / Tupo.
// ----------------------------------------------------------------------------

const VERBS = new Set(["VIEWED", "PROGRESSED", "COMPLETED", "MARKED_DONE", "ATTEMPTED", "SCORED", "PASSED", "FAILED", "SUBMITTED", "COMMENTED", "ASKED_AI"]);
const OBJECTS = new Set(["COURSE_ITEM", "COURSE_SECTION", "COURSE", "LESSON_NOTE", "TASKMENTOR_QUIZ", "TASKMENTOR_ASSIGNMENT", "TUPO_THREAD"]);

/**
 * `POST /integrations/learning-events` — batch of statements, idempotent on
 * (source_system, idempotency_key). Resolves the course item by (object_type, object_id)
 * for Task Mentor / Tupo objects and projects the result onto CourseItemProgress.
 */
export const ingestLearningEvents = asyncHandler(async (req: any, res: any) => {
  const source = String(req.service?.name || "PARTNER").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || "PARTNER";
  const events: any[] = Array.isArray(req.body?.events) ? req.body.events : Array.isArray(req.body) ? req.body : [];
  if (events.length === 0) throw new ValidationError("events[] is required");
  if (events.length > 500) throw new ValidationError("At most 500 events per batch");

  const results: { index: number; status: "accepted" | "duplicate" | "rejected"; reason?: string; course_item_id?: number | null }[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i] || {};
    const actor = Number(e.actor_user_id);
    const verb = String(e.verb || "").toUpperCase();
    const objectType = String(e.object_type || "").toUpperCase();
    const objectId = Number(e.object_id);
    if (!Number.isFinite(actor) || actor <= 0 || !VERBS.has(verb) || !OBJECTS.has(objectType) || !Number.isFinite(objectId)) {
      results.push({ index: i, status: "rejected", reason: "actor_user_id, verb, object_type and object_id are required" });
      continue;
    }
    const idem = typeof e.idempotency_key === "string" && e.idempotency_key ? e.idempotency_key.slice(0, 120) : null;
    const occurred = e.occurred_at ? new Date(e.occurred_at) : new Date();

    // Resolve the course item: explicit course_item_id, or (type, ref) for TM/Tupo objects.
    let itemRow: Awaited<ReturnType<typeof loadItemWithCourse>> | null = null;
    if (e.course_item_id) itemRow = await loadItemWithCourse(Number(e.course_item_id));
    if (!itemRow && objectType !== "COURSE_ITEM" && objectType !== "COURSE" && objectType !== "COURSE_SECTION") {
      const typeMap: Record<string, string> = { TASKMENTOR_QUIZ: "TASKMENTOR_QUIZ", TASKMENTOR_ASSIGNMENT: "TASKMENTOR_ASSIGNMENT", TUPO_THREAD: "DISCUSSION", LESSON_NOTE: "LESSON_NOTE" };
      const [hit] = await db.execute(
        sql`SELECT item_id FROM CourseItem WHERE item_type = ${typeMap[objectType]} AND ref_id = ${objectId} ORDER BY item_id DESC LIMIT 1`,
      );
      const found = (hit as any)?.[0]?.item_id;
      if (found) itemRow = await loadItemWithCourse(Number(found));
    }
    if (!itemRow && objectType === "COURSE_ITEM") itemRow = await loadItemWithCourse(objectId);

    const inserted = await logLearningEvent({
      actor_user_id: actor,
      verb: verb as any,
      object_type: objectType as any,
      object_id: objectId,
      course_item_id: itemRow?.item.item_id ?? null,
      result: e.result && typeof e.result === "object" ? e.result : null,
      context: { ...(e.context && typeof e.context === "object" ? e.context : {}), source, course_id: itemRow?.course.course_id ?? null },
      source_system: source,
      occurred_at: Number.isNaN(occurred.getTime()) ? new Date() : occurred,
      idempotency_key: idem,
    }).catch((err) => {
      if (err?.code === "ER_NO_REFERENCED_ROW_2") return null;
      throw err;
    });
    if (inserted === null) {
      results.push({ index: i, status: "rejected", reason: "actor_user_id is not an MIS user" });
      continue;
    }
    if (!inserted) {
      results.push({ index: i, status: "duplicate", course_item_id: itemRow?.item.item_id ?? null });
      continue;
    }

    // Project onto progress when the event closes a SUBMIT / MIN_SCORE item.
    if (itemRow && (verb === "SUBMITTED" || verb === "SCORED" || verb === "PASSED" || verb === "COMPLETED")) {
      const score = Number(e.result?.score_pct);
      const action = verb === "SUBMITTED" ? { kind: "SUBMIT" as const } : Number.isFinite(score) ? { kind: "SCORE" as const, score_pct: score } : verb === "PASSED" || verb === "COMPLETED" ? { kind: "SUBMIT" as const } : null;
      if (action) {
        const { justCompleted } = await applyAction(itemRow.item, actor, action);
        if (justCompleted) {
          await notifyResultReceived(itemRow.course.course_id, itemRow.item.item_id, actor, itemRow.item.title, Number.isFinite(score) ? score : null);
        }
      }
    }
    results.push({ index: i, status: "accepted", course_item_id: itemRow?.item.item_id ?? null });
  }
  successResponse(res, "Events processed", {
    accepted: results.filter((r) => r.status === "accepted").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    results,
  });
});

/** `GET /integrations/sync/courses` — published courses + items referencing partner objects. */
export const syncCourses = asyncHandler(async (req: any, res: any) => {
  const rows = await db.execute(sql`
    SELECT c.course_id, c.title, c.subject_id, c.class_group_id, c.academic_term_id, c.status,
           s.section_id, s.title AS section_title, s.status AS section_status,
           i.item_id, i.item_type, i.ref_id, i.title AS item_title, i.completion_rule, i.min_score_pct, i.due_at
    FROM Course c
    JOIN CourseSection s ON s.course_id = c.course_id
    JOIN CourseItem i ON i.section_id = s.section_id
    WHERE c.status = 'PUBLISHED'
      AND i.item_type IN ('TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','DISCUSSION')
    ORDER BY c.course_id, s.position, i.position
  `);
  const list = ((rows as any)[0] || []) as any[];
  const byCourse = new Map<number, any>();
  for (const r of list) {
    if (!byCourse.has(r.course_id)) {
      byCourse.set(r.course_id, { course_id: r.course_id, title: r.title, subject_id: r.subject_id, class_group_id: r.class_group_id, academic_term_id: r.academic_term_id, items: [] });
    }
    byCourse.get(r.course_id).items.push({
      item_id: r.item_id,
      item_type: r.item_type,
      ref_id: r.ref_id,
      title: r.item_title,
      section_id: r.section_id,
      section_title: r.section_title,
      section_status: r.section_status,
      completion_rule: r.completion_rule,
      min_score_pct: r.min_score_pct,
      due_at: r.due_at,
      return_url: `/my-learning/courses/${r.course_id}/items/${r.item_id}`,
    });
  }
  void req;
  successResponse(res, "Courses", [...byCourse.values()]);
});
