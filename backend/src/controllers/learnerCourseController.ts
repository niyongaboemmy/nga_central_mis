import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  AcademicTerm,
  ClassGroup,
  Course,
  LessonNote,
  Subject,
  SubjectDocument,
  UserProfile,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import storageService from "../utils/fileServer";
import logger from "../utils/logger";
import { listMemberCourseIds, loadMemberCourse, isCourseMember } from "../services/elearning/courseMembership";
import { publishDueSections } from "../services/elearning/courseSeeding";
import { loadCourseHeader, loadCourseTree, loadItemWithCourse } from "../services/elearning/courseTree";
import { leave, recordProgress, touch } from "../services/elearning/livePresence";
import {
  applyAction,
  deriveLearnerSections,
  LearnerItem,
  loadPrerequisites,
  loadProgressMap,
  logLearningEvent,
  recordHeartbeat,
  summariseCourse,
} from "../services/elearning/courseProgress";

/** The display name the teacher's live view shows. */
async function learnerName(userId: number): Promise<string> {
  const [p] = await db
    .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);
  return `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || `Student #${userId}`;
}

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

/** The full learner projection of one course: header + derived sections + summary. */
async function learnerCoursePayload(courseId: number, userId: number) {
  const course = await loadMemberCourse(courseId, userId);
  // DRAFT/ARCHIVED courses don't exist as far as a student is concerned.
  if (course.status !== "PUBLISHED") throw new NotFoundError("Course not found");
  await publishDueSections(course.course_id);
  const [header, tree] = await Promise.all([loadCourseHeader(course), loadCourseTree(course)]);
  const itemIds = tree.flatMap((s) => s.items.map((i) => i.item_id));
  const [progress, prerequisites] = await Promise.all([
    loadProgressMap(itemIds, userId),
    loadPrerequisites(tree.map((s) => s.section_id)),
  ]);
  const sections = deriveLearnerSections(tree, progress, {
    sequential: !!course.require_sequential_progress,
    prerequisites,
  });
  return { ...header, sections, summary: summariseCourse(sections) };
}

/** Finds one visible item in a derived learner course (404 if hidden / not a member). */
async function findLearnerItem(itemId: number, userId: number) {
  const row = await loadItemWithCourse(itemId);
  if (!row) throw new NotFoundError("Item not found");
  if (row.course.status !== "PUBLISHED" || !(await isCourseMember(row.course, userId))) throw new NotFoundError("Item not found");
  const payload = await learnerCoursePayload(row.course.course_id, userId);
  const section = payload.sections.find((s) => s.section_id === row.section.section_id);
  const item = section?.items.find((i) => i.item_id === itemId);
  if (!section || !item) throw new NotFoundError("Item not found");
  return { row, payload, section, item };
}

// ======================
// MY COURSES
// ======================

export const listMyLearningCourses = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  await publishDueSections();
  const ids = await listMemberCourseIds(userId);
  if (ids.length === 0) return successResponse(res, "My courses", []);

  const rows = await db
    .select({
      course: Course,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_name: ClassGroup.name,
      term_name: AcademicTerm.name,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(Course)
    .innerJoin(Subject, eq(Subject.subject_id, Course.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, Course.class_group_id))
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, Course.academic_term_id))
    .leftJoin(UserProfile, eq(UserProfile.user_id, Course.owner_user_id))
    .where(inArray(Course.course_id, ids));

  const cards = [];
  for (const r of rows) {
    const tree = await loadCourseTree(r.course);
    const itemIds = tree.flatMap((s) => s.items.map((i) => i.item_id));
    const [progress, prerequisites] = await Promise.all([
      loadProgressMap(itemIds, userId),
      loadPrerequisites(tree.map((s) => s.section_id)),
    ]);
    const sections = deriveLearnerSections(tree, progress, {
      sequential: !!r.course.require_sequential_progress,
      prerequisites,
    });
    const summary = summariseCourse(sections);
    const lastActivity = [...progress.values()]
      .map((p) => p.last_viewed_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];
    cards.push({
      course_id: r.course.course_id,
      title: r.course.title,
      description: r.course.description,
      icon: r.course.icon,
      cover_color: r.course.cover_color || r.subject_color,
      subject_id: r.course.subject_id,
      subject_name: r.subject_name,
      subject_code: r.subject_code,
      class_group_name: r.class_group_name,
      term_name: r.term_name,
      teacher_name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
      published_sections: sections.length,
      last_activity_at: lastActivity || null,
      ...summary,
    });
  }
  cards.sort((a, b) => {
    // Courses with a current week first, then by most recent activity.
    if (!!a.current_section !== !!b.current_section) return a.current_section ? -1 : 1;
    return new Date(b.last_activity_at || 0).getTime() - new Date(a.last_activity_at || 0).getTime();
  });
  successResponse(res, "My courses", cards);
});

export const getMyLearningCourse = asyncHandler(async (req: any, res: any) => {
  const payload = await learnerCoursePayload(parseId(req.params.id, "course id"), req.user.userId);
  successResponse(res, "Course", payload);
});

// ======================
// ITEMS
// ======================

/** Resolves an item for the reader and records the VIEWED event (which completes VIEW items). */
export const openMyItem = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const userId = req.user.userId;
  const { row, payload, section, item } = await findLearnerItem(itemId, userId);
  if (item.locked) {
    return successResponse(res, "Locked", { item, section: { section_id: section.section_id, title: section.title }, locked: true });
  }

  const { progress, justCompleted } = await applyAction(row.item, userId, { kind: "VIEW" });
  await logLearningEvent({
    actor_user_id: userId,
    verb: "VIEWED",
    object_type: "COURSE_ITEM",
    object_id: itemId,
    course_item_id: itemId,
    context: { course_id: row.course.course_id, section_id: section.section_id, source: "MIS" },
  });
  if (justCompleted) {
    await logLearningEvent({
      actor_user_id: userId,
      verb: "COMPLETED",
      object_type: "COURSE_ITEM",
      object_id: itemId,
      course_item_id: itemId,
      context: { course_id: row.course.course_id, section_id: section.section_id, via: "VIEW" },
    });
  }

  // Live: the teacher sees who is on which item, and the first open of an item lands as
  // "started". Presence is best-effort — it must never fail opening a lesson.
  try {
    const name = await learnerName(userId);
    touch(row.course.course_id, { user_id: userId, name }, {
      item_id: itemId,
      item_title: row.item.title,
      item_type: row.item.item_type,
      section_id: section.section_id,
      section_title: section.title,
      state: progress.state,
      seconds_spent: progress.seconds_spent,
    });
    if (progress.view_count <= 1) {
      recordProgress(row.course.course_id, {
        user_id: userId, name, item_id: itemId, item_title: row.item.title, item_type: row.item.item_type,
        section_id: section.section_id, section_title: section.title, verb: "started", at: Date.now(),
      });
    }
    if (justCompleted) {
      recordProgress(row.course.course_id, {
        user_id: userId, name, item_id: itemId, item_title: row.item.title, item_type: row.item.item_type,
        section_id: section.section_id, section_title: section.title, verb: "completed", at: Date.now(),
      });
    }
  } catch (error) {
    logger.warn("live presence failed on item open", { error, itemId });
  }

  // Type-specific body. Notes go through the existing shared-note reader (by note_id);
  // documents stream through /file; pages/videos/links/checks carry their content here.
  let content: any = null;
  switch (row.item.item_type) {
    case "LESSON_NOTE":
      content = { note_id: row.item.ref_id };
      break;
    case "SUBJECT_DOCUMENT": {
      const [doc] = await db
        .select({
          original_name: SubjectDocument.original_name,
          mime_type: SubjectDocument.mime_type,
          file_size: SubjectDocument.file_size,
          file_extension: SubjectDocument.file_extension,
          description: SubjectDocument.description,
        })
        .from(SubjectDocument)
        .where(eq(SubjectDocument.document_id, row.item.ref_id!))
        .limit(1);
      content = doc ? { ...doc, file_url: `/elearning/my/items/${itemId}/file` } : null;
      break;
    }
    case "PAGE":
      content = { content_html: row.item.content_html || "", content_json: row.item.content_json };
      break;
    case "VIDEO":
    case "LINK":
    case "TASKMENTOR_QUIZ":
    case "TASKMENTOR_ASSIGNMENT":
    case "DISCUSSION":
      content = { ...(row.item.content_json as any), external_url: row.item.external_url };
      break;
    case "KNOWLEDGE_CHECK": {
      // Never ship the answers — scoring happens server-side.
      const kc = (row.item.content_json as any) || { questions: [] };
      content = {
        questions: (kc.questions || []).map((q: any) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options })),
      };
      break;
    }
    default:
      content = null;
  }

  const all = payload.sections.flatMap((s) => s.items.filter((i) => i.item_type !== "HEADER"));
  const idx = all.findIndex((i) => i.item_id === itemId);
  const neighbour = (i: LearnerItem | undefined) =>
    i ? { item_id: i.item_id, title: i.title, item_type: i.item_type, locked: i.locked, section_id: i.section_id } : null;

  successResponse(res, "Item", {
    item: {
      ...item,
      state: progress.state,
      completed_at: progress.completed_at,
      seconds_spent: progress.seconds_spent,
      last_position: progress.last_position,
      best_score_pct: progress.best_score_pct ? Number(progress.best_score_pct) : null,
    },
    just_completed: justCompleted,
    content,
    section: { section_id: section.section_id, title: section.title, state: section.state },
    course: {
      course_id: row.course.course_id,
      title: row.course.title,
      subject_name: payload.subject.name,
      cover_color: row.course.cover_color || payload.subject.color,
      icon: row.course.icon,
    },
    prev: neighbour(all[idx - 1]),
    next: neighbour(all[idx + 1]),
    locked: false,
  });
});

/** Student-readable file stream for SUBJECT_DOCUMENT items (teacher-only download today). Re-checks membership. */
export const streamMyItemFile = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const { row, item } = await findLearnerItem(itemId, req.user.userId);
  if (item.locked) throw new NotFoundError("Item not found");

  if (row.item.item_type === "SUBJECT_DOCUMENT") {
    const [doc] = await db.select().from(SubjectDocument).where(eq(SubjectDocument.document_id, row.item.ref_id!)).limit(1);
    if (!doc) throw new NotFoundError("File not found");
    if (!(await storageService.fileExists(doc.file_path))) throw new NotFoundError("File not found on server");
    const buffer = await storageService.downloadToBuffer(doc.file_path);
    const mime = doc.file_extension?.toLowerCase() === "pdf" ? "application/pdf" : doc.mime_type || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${doc.original_name}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(buffer);
  }
  if (row.item.item_type === "LESSON_NOTE") {
    const [note] = await db
      .select({ file_path: LessonNote.file_path, title: LessonNote.title })
      .from(LessonNote)
      .where(eq(LessonNote.note_id, row.item.ref_id!))
      .limit(1);
    if (!note?.file_path) throw new NotFoundError("PDF not found");
    const buffer = await storageService.downloadToBuffer(note.file_path);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${note.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}.pdf"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(buffer);
  }
  throw new NotFoundError("This item has no file");
});

/** {seconds, position} every ~30 s while an item is open. Fire-and-forget on the client. */
/**
 * The student is no longer on this item — sent as a beacon when the reader unmounts, the
 * tab is hidden, or the page unloads. Presence otherwise lingered for the whole stale
 * window, which is most wrong on LINK items: reading the material *requires* leaving the
 * tab, so the teacher saw "learning right now" for someone who had gone.
 *
 * Deliberately cheap and forgiving: no body, no DB write, and an unknown item or a
 * duplicate beacon is still a 200 — a departure signal must never fail noisily on unload.
 */
export const leaveMyItem = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  try {
    const { row } = await findLearnerItem(itemId, req.user.userId);
    leave(row.course.course_id, req.user.userId);
  } catch (error) {
    logger.warn("live presence failed on leave", { error, itemId });
  }
  successResponse(res, "ok", null);
});

export const heartbeatMyItem = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const { row, item } = await findLearnerItem(itemId, req.user.userId);
  if (item.locked) throw new NotFoundError("Item not found");
  const seconds = Number(req.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new ValidationError("seconds must be a non-negative number");
  const progress = await recordHeartbeat(row.item, req.user.userId, seconds, req.body?.position);
  try {
    touch(row.course.course_id, { user_id: req.user.userId, name: await learnerName(req.user.userId) }, {
      item_id: itemId,
      item_title: row.item.title,
      item_type: row.item.item_type,
      section_id: row.section.section_id,
      section_title: row.section.title,
      state: progress.state,
      seconds_spent: progress.seconds_spent,
    });
  } catch (error) {
    logger.warn("live presence failed on heartbeat", { error, itemId });
  }
  successResponse(res, "ok", { seconds_spent: progress.seconds_spent, state: progress.state });
});

/** "Mark as done" — completes MARK_DONE (and VIEW) items; a no-op for rules that need a result. */
export const markMyItemDone = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const userId = req.user.userId;
  const { row, section, item } = await findLearnerItem(itemId, userId);
  if (item.locked) throw new NotFoundError("Item not found");
  if (["SUBMIT", "MIN_SCORE"].includes(row.item.completion_rule)) {
    throw new ValidationError("This item completes when your result arrives — it can't be marked done by hand");
  }
  if (row.item.completion_rule === "NONE") throw new ValidationError("This item has no completion to record");

  const { progress, justCompleted } = await applyAction(row.item, userId, { kind: "MARK_DONE" });
  await logLearningEvent({
    actor_user_id: userId,
    verb: "MARKED_DONE",
    object_type: "COURSE_ITEM",
    object_id: itemId,
    course_item_id: itemId,
    context: { course_id: row.course.course_id, section_id: section.section_id },
  });
  if (justCompleted) {
    await logLearningEvent({
      actor_user_id: userId,
      verb: "COMPLETED",
      object_type: "COURSE_ITEM",
      object_id: itemId,
      course_item_id: itemId,
      context: { course_id: row.course.course_id, section_id: section.section_id, via: "MARK_DONE" },
    });
  }
  if (justCompleted) {
    try {
      recordProgress(row.course.course_id, {
        user_id: userId, name: await learnerName(userId), item_id: itemId, item_title: row.item.title,
        item_type: row.item.item_type, section_id: section.section_id, section_title: section.title,
        verb: "completed", at: Date.now(),
      });
    } catch (error) {
      logger.warn("live progress failed on mark done", { error, itemId });
    }
  }
  const after = await learnerCoursePayload(row.course.course_id, userId);
  const sectionAfter = after.sections.find((s) => s.section_id === section.section_id)!;
  const sectionJustCompleted = justCompleted && sectionAfter.state === "completed";
  if (sectionJustCompleted) {
    await logLearningEvent({
      actor_user_id: userId,
      verb: "COMPLETED",
      object_type: "COURSE_SECTION",
      object_id: section.section_id,
      context: { course_id: row.course.course_id },
    });
  }
  successResponse(res, "Done", {
    state: progress.state,
    completed_at: progress.completed_at,
    just_completed: justCompleted,
    section_just_completed: sectionJustCompleted,
    section: { section_id: sectionAfter.section_id, title: sectionAfter.title, state: sectionAfter.state, criteria: [...new Map(sectionAfter.items.flatMap((i) => i.criteria).map((c) => [c.criteria_id, c])).values()] },
    summary: after.summary,
  });
});

/** Which section of a course covers a given date — the calendar slot → "Open lesson content" link. */
export const findMySectionForDate = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const subjectId = parseId(req.query.subject_id, "subject id");
  const classGroupId = parseId(req.query.class_group_id, "class group id");
  const date = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const ids = await listMemberCourseIds(userId);
  if (ids.length === 0) return successResponse(res, "No course", null);
  const courses = await db
    .select()
    .from(Course)
    .where(and(inArray(Course.course_id, ids), eq(Course.subject_id, subjectId), eq(Course.class_group_id, classGroupId)));
  for (const course of courses) {
    const tree = await loadCourseTree(course);
    const section = tree.find(
      (s) => s.status === "PUBLISHED" && s.start_date && s.start_date.slice(0, 10) <= date && (s.end_date || s.start_date).slice(0, 10) >= date,
    );
    if (section) {
      return successResponse(res, "Section", { course_id: course.course_id, section_id: section.section_id, title: section.title });
    }
  }
  successResponse(res, "No section for that date", null);
});

