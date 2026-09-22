import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  AcademicTerm,
  ClassGroup,
  COMPLETION_RULES,
  COURSE_ITEM_TYPES,
  CompetencyPerformanceCriteria,
  Course,
  CourseItem,
  CourseItemCriteria,
  CourseSection,
  CourseItemType,
  LessonNote,
  LessonNoteShare,
  SchemeOfWork,
  Subject,
  SubjectCompetency,
  SubjectDocument,
  SubjectDocumentCategory,
  TeacherSubjectAssignment,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError, AuthorizationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeNoteHtml } from "../utils/sanitizeNoteHtml";
import { assertTeacherOwnsScheme } from "../utils/schemeAuthorization";
import { assertCanBuildCourse, loadCourse, CourseRow } from "../services/elearning/courseMembership";
import { ensureCourseForScheme, publishDueSections, seedItemsForCourse, syncSectionsFromScheme } from "../services/elearning/courseSeeding";
import {
  loadCourseHeader,
  loadCourseTree,
  loadItemWithCourse,
  loadSectionWithCourse,
} from "../services/elearning/courseTree";
import { notifySectionPublished } from "../services/elearning/courseNotifications";

// ======================
// HELPERS
// ======================

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

const bool = (v: unknown): 0 | 1 => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

const isHttpUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/** YouTube / Vimeo only for embeds (§2.3 "provider whitelist"). Returns a canonical embed URL. */
export const resolveVideoEmbed = (raw: string): { provider: "youtube" | "vimeo"; url: string; embed_url: string } | null => {
  if (!isHttpUrl(raw)) return null;
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { provider: "youtube", url: raw, embed_url: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = url.searchParams.get("v");
    if (!id) {
      const m = url.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{6,})/);
      id = m ? m[2] : null;
    }
    return id ? { provider: "youtube", url: raw, embed_url: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = url.pathname.match(/(\d{6,})/);
    return m ? { provider: "vimeo", url: raw, embed_url: `https://player.vimeo.com/video/${m[1]}` } : null;
  }
  return null;
};

const MAX_KC_QUESTIONS = 10;

/** Validates a knowledge-check body: MCQ / true-false, ≤ 10 questions, each with one correct answer. */
export const normaliseKnowledgeCheck = (raw: any) => {
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  if (questions.length === 0) throw new ValidationError("A knowledge check needs at least one question");
  if (questions.length > MAX_KC_QUESTIONS) {
    throw new ValidationError(`A knowledge check can have at most ${MAX_KC_QUESTIONS} questions`);
  }
  return {
    questions: questions.map((q: any, i: number) => {
      const prompt = typeof q?.prompt === "string" ? q.prompt.trim() : "";
      if (!prompt) throw new ValidationError(`Question ${i + 1} needs a prompt`);
      const type = q?.type === "TRUE_FALSE" ? "TRUE_FALSE" : "MCQ";
      const options: string[] =
        type === "TRUE_FALSE"
          ? ["True", "False"]
          : (Array.isArray(q?.options) ? q.options : []).map((o: any) => String(o ?? "").trim()).filter(Boolean);
      if (type === "MCQ" && (options.length < 2 || options.length > 6)) {
        throw new ValidationError(`Question ${i + 1} needs between 2 and 6 options`);
      }
      const correct = Number(q?.correct_index);
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        throw new ValidationError(`Question ${i + 1} needs a correct answer`);
      }
      return {
        id: typeof q?.id === "string" && q.id ? q.id.slice(0, 40) : `q${i + 1}`,
        type,
        prompt: prompt.slice(0, 1000),
        options: options.map((o) => o.slice(0, 300)),
        correct_index: correct,
        explanation: typeof q?.explanation === "string" ? q.explanation.trim().slice(0, 1000) : "",
      };
    }),
  };
};

/**
 * Builds the persisted shape of an item body from a client payload, by type. Throws on a
 * malformed body — the client only ever sees a validated, canonical item back.
 */
async function buildItemBody(
  course: CourseRow,
  userId: number,
  itemType: CourseItemType,
  body: any,
): Promise<Partial<typeof CourseItem.$inferInsert>> {
  const out: Partial<typeof CourseItem.$inferInsert> = {};
  const title = typeof body.title === "string" ? body.title.trim() : "";

  switch (itemType) {
    case "HEADER": {
      if (!title) throw new ValidationError("A header needs a title");
      out.title = title.slice(0, 255);
      out.completion_rule = "NONE";
      out.is_required = 0;
      out.ref_id = null;
      break;
    }
    case "LESSON_NOTE": {
      const noteId = parseId(body.ref_id, "note id");
      const [note] = await db
        .select({
          note_id: LessonNote.note_id,
          title: LessonNote.title,
          subject_id: LessonNote.subject_id,
          user_id: LessonNote.user_id,
          class_group_id: LessonNote.class_group_id,
        })
        .from(LessonNote)
        .where(eq(LessonNote.note_id, noteId))
        .limit(1);
      if (!note) throw new NotFoundError("Lesson note not found");
      if (note.subject_id !== course.subject_id) throw new ValidationError("That note belongs to a different subject");
      if (note.user_id !== userId && note.class_group_id !== course.class_group_id) {
        throw new AuthorizationError("You can only place your own notes, or notes written for this class group");
      }
      out.ref_id = noteId;
      out.title = (title || note.title).slice(0, 255);
      break;
    }
    case "SUBJECT_DOCUMENT": {
      const docId = parseId(body.ref_id, "document id");
      const [doc] = await db
        .select({ document_id: SubjectDocument.document_id, original_name: SubjectDocument.original_name, subject_id: SubjectDocument.subject_id })
        .from(SubjectDocument)
        .where(eq(SubjectDocument.document_id, docId))
        .limit(1);
      if (!doc) throw new NotFoundError("Material not found");
      if (doc.subject_id !== course.subject_id) throw new ValidationError("That material belongs to a different subject");
      out.ref_id = docId;
      out.title = (title || doc.original_name).slice(0, 255);
      break;
    }
    case "LINK": {
      const url = body.content_json?.url ?? body.url;
      if (!isHttpUrl(url)) throw new ValidationError("Enter a valid http(s) link");
      if (!title) throw new ValidationError("A link needs a title");
      out.title = title.slice(0, 255);
      out.external_url = url.slice(0, 1000);
      out.content_json = { url, new_tab: body.content_json?.new_tab !== false };
      out.ref_id = null;
      break;
    }
    case "PAGE": {
      if (!title) throw new ValidationError("A page needs a title");
      out.title = title.slice(0, 255);
      if (body.content_json !== undefined) out.content_json = body.content_json ?? null;
      if (typeof body.content_html === "string") out.content_html = sanitizeNoteHtml(body.content_html);
      out.ref_id = null;
      break;
    }
    case "VIDEO": {
      const url = body.content_json?.url ?? body.url;
      const embed = resolveVideoEmbed(String(url ?? ""));
      if (!embed) throw new ValidationError("Paste a YouTube or Vimeo link");
      if (!title) throw new ValidationError("A video needs a title");
      out.title = title.slice(0, 255);
      out.external_url = embed.url.slice(0, 1000);
      out.content_json = {
        ...embed,
        duration: Number.isFinite(Number(body.content_json?.duration)) ? Number(body.content_json.duration) : null,
      };
      out.ref_id = null;
      break;
    }
    case "KNOWLEDGE_CHECK": {
      if (!title) throw new ValidationError("A knowledge check needs a title");
      out.title = title.slice(0, 255);
      out.content_json = normaliseKnowledgeCheck(body.content_json ?? body);
      out.ref_id = null;
      break;
    }
    case "TASKMENTOR_QUIZ":
    case "TASKMENTOR_ASSIGNMENT":
    case "DISCUSSION": {
      const url = body.external_url ?? body.content_json?.url ?? body.url;
      if (!isHttpUrl(url)) throw new ValidationError("Enter the link students should open");
      if (!title) throw new ValidationError("Give this item a title");
      out.title = title.slice(0, 255);
      out.external_url = url.slice(0, 1000);
      out.ref_id = body.ref_id ? parseId(body.ref_id, "reference id") : null;
      break;
    }
    default:
      throw new ValidationError("Unknown item type");
  }

  if (body.description !== undefined) out.description = body.description ? String(body.description).slice(0, 5000) : null;
  if (body.completion_rule !== undefined && itemType !== "HEADER") {
    if (!COMPLETION_RULES.includes(body.completion_rule)) throw new ValidationError("Unknown completion rule");
    out.completion_rule = body.completion_rule;
  }
  if (out.completion_rule === "MIN_SCORE" || body.min_score_pct !== undefined) {
    const pct = body.min_score_pct === null || body.min_score_pct === undefined ? null : Number(body.min_score_pct);
    if (out.completion_rule === "MIN_SCORE" && (pct === null || !Number.isFinite(pct) || pct < 1 || pct > 100)) {
      throw new ValidationError("Minimum score must be between 1 and 100");
    }
    out.min_score_pct = pct;
  }
  if (body.is_required !== undefined && itemType !== "HEADER") out.is_required = bool(body.is_required);
  if (body.is_published !== undefined) out.is_published = bool(body.is_published);
  if (body.indent !== undefined) out.indent = Math.max(0, Math.min(2, Number(body.indent) || 0));
  if (body.estimated_minutes !== undefined) {
    const m = body.estimated_minutes === null || body.estimated_minutes === "" ? null : Number(body.estimated_minutes);
    if (m !== null && (!Number.isFinite(m) || m < 0 || m > 600)) throw new ValidationError("Estimated minutes must be 0–600");
    out.estimated_minutes = m;
  }
  if (body.due_at !== undefined) {
    if (!body.due_at) out.due_at = null;
    else {
      const d = new Date(body.due_at);
      if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid due date");
      out.due_at = d;
    }
  }
  return out;
}

/**
 * Placing a note in a course implicitly shares it with the course's class group so the
 * existing shared-note reader and AI tutor keep working unchanged (§3.2). Never removed on
 * item deletion — a share that existed before must survive.
 */
async function ensureClassGroupShare(noteId: number, classGroupId: number, sharedBy: number) {
  const shares = await db
    .select({ filter_type: LessonNoteShare.filter_type, filter_ids: LessonNoteShare.filter_ids })
    .from(LessonNoteShare)
    .where(eq(LessonNoteShare.note_id, noteId));
  const already = shares.some(
    (s) => s.filter_type === "class_group" && ((s.filter_ids as number[]) || []).includes(classGroupId),
  );
  if (already) return;
  await db.insert(LessonNoteShare).values({
    note_id: noteId,
    shared_by: sharedBy,
    filter_type: "class_group",
    filter_ids: [classGroupId],
    permission: "VIEW",
  });
}

async function loadBuildableCourse(courseId: number, userId: number): Promise<CourseRow> {
  const course = await loadCourse(courseId);
  await assertCanBuildCourse(course, userId);
  return course;
}

async function loadBuildableSection(sectionId: number, userId: number) {
  const row = await loadSectionWithCourse(sectionId);
  if (!row) throw new NotFoundError("Section not found");
  await assertCanBuildCourse(row.course, userId);
  return row;
}

async function loadBuildableItem(itemId: number, userId: number) {
  const row = await loadItemWithCourse(itemId);
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, userId);
  return row;
}

async function builderPayload(course: CourseRow) {
  const [header, sections] = await Promise.all([loadCourseHeader(course), loadCourseTree(course, { includeContent: true })]);
  return { ...header, sections };
}

// ======================
// COURSES
// ======================

/** Idempotent: creates the course for a scheme (seeding sections + items) or returns the existing one. */
export const createCourseFromScheme = asyncHandler(async (req: any, res: any) => {
  const schemeId = parseId(req.params.schemeId, "scheme id");
  const userId = req.user.userId;
  const [scheme] = await db.select().from(SchemeOfWork).where(eq(SchemeOfWork.scheme_id, schemeId)).limit(1);
  if (!scheme) throw new NotFoundError("Scheme of work not found");
  await assertTeacherOwnsScheme(userId, scheme.subject_id, scheme.class_group_id, scheme.academic_term_id);

  const [existing] = await db.select({ course_id: Course.course_id }).from(Course).where(eq(Course.scheme_id, schemeId)).limit(1);
  const course = await ensureCourseForScheme(schemeId, userId);
  if (!existing) {
    await recordActivity(userId, "COURSE_CREATE", `Set up e-learning course "${course.title}"`, "Course", course.course_id, { scheme_id: schemeId }, userId);
  }
  successResponse(res, existing ? "Course" : "Course created", await builderPayload(course), existing ? 200 : 201);
});

/** Does this scheme have a course yet? Cheap probe for the scheme page's "Course" tab. */
export const getCourseForScheme = asyncHandler(async (req: any, res: any) => {
  const schemeId = parseId(req.params.schemeId, "scheme id");
  const [course] = await db.select().from(Course).where(eq(Course.scheme_id, schemeId)).limit(1);
  if (!course) return successResponse(res, "No course yet", null);
  await assertCanBuildCourse(course, req.user.userId);
  const sections = await loadCourseTree(course);
  successResponse(res, "Course", {
    course_id: course.course_id,
    status: course.status,
    title: course.title,
    section_count: sections.length,
    published_sections: sections.filter((s) => s.status === "PUBLISHED").length,
    item_count: sections.reduce((n, s) => n + s.items.length, 0),
  });
});

/** The teacher's own courses (every course on a scheme they can build), newest first. */
export const listMyCourses = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const rows = await db
    .select({
      course: Course,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_name: ClassGroup.name,
      term_name: AcademicTerm.name,
      academic_year_id: AcademicTerm.academic_year_id,
    })
    .from(Course)
    .innerJoin(Subject, eq(Subject.subject_id, Course.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, Course.class_group_id))
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, Course.academic_term_id))
    .leftJoin(
      TeacherSubjectAssignment,
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, Course.subject_id),
        eq(TeacherSubjectAssignment.class_group_id, Course.class_group_id),
        eq(TeacherSubjectAssignment.academic_year_id, AcademicTerm.academic_year_id),
      ),
    )
    // The owner always sees their course; colleagues assigned to the same subject × class see it too.
    .where(or(eq(Course.owner_user_id, userId), sql`${TeacherSubjectAssignment.user_id} IS NOT NULL`))
    .orderBy(desc(Course.updated_at));
  const seen = new Set<number>();
  const courses = rows.filter((r) => (seen.has(r.course.course_id) ? false : (seen.add(r.course.course_id), true)));
  const ids = courses.map((c) => c.course.course_id);
  const counts = ids.length
    ? await db
        .select({
          course_id: CourseSection.course_id,
          sections: sql<number>`COUNT(DISTINCT ${CourseSection.section_id})`,
          published: sql<number>`SUM(CASE WHEN ${CourseSection.status} = 'PUBLISHED' THEN 1 ELSE 0 END)`,
        })
        .from(CourseSection)
        .where(inArray(CourseSection.course_id, ids))
        .groupBy(CourseSection.course_id)
    : [];
  const countBy = new Map(counts.map((c) => [c.course_id, c]));
  successResponse(
    res,
    "My courses",
    courses.map((r) => ({
      ...r.course,
      subject_name: r.subject_name,
      subject_code: r.subject_code,
      subject_color: r.subject_color,
      class_group_name: r.class_group_name,
      term_name: r.term_name,
      section_count: Number(countBy.get(r.course.course_id)?.sections || 0),
      published_sections: Number(countBy.get(r.course.course_id)?.published || 0),
    })),
  );
});

/**
 * Everything the teacher teaches this year/term, whether or not it has a scheme or a course
 * yet — the E-Learning page is driven by the teaching assignment, not by what happens to
 * exist already, so a subject can never be invisible there. Each row says how far along it
 * is: no scheme → scheme but no course → course.
 */
export const listMySchemesForCourses = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const yearId = req.query.academic_year_id ? parseId(req.query.academic_year_id, "academic year") : null;
  const termId = req.query.academic_term_id ? parseId(req.query.academic_term_id, "academic term") : null;

  const rows = await db
    .select({
      subject_id: Subject.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      academic_year_id: TeacherSubjectAssignment.academic_year_id,
      scheme_id: SchemeOfWork.scheme_id,
      validation_status: SchemeOfWork.validation_status,
      scheme_term_id: SchemeOfWork.academic_term_id,
      term_name: AcademicTerm.name,
      entries: sql<number>`(SELECT COUNT(*) FROM SchemeOfWorkEntry e WHERE e.scheme_id = ${SchemeOfWork.scheme_id})`,
      course_id: Course.course_id,
      course_status: Course.status,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(Subject, eq(Subject.subject_id, TeacherSubjectAssignment.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, TeacherSubjectAssignment.class_group_id))
    // The scheme (and therefore the course) is per term, so only join the selected one —
    // otherwise a subject taught all year would appear three times.
    .leftJoin(
      SchemeOfWork,
      and(
        eq(SchemeOfWork.subject_id, TeacherSubjectAssignment.subject_id),
        eq(SchemeOfWork.class_group_id, TeacherSubjectAssignment.class_group_id),
        termId ? eq(SchemeOfWork.academic_term_id, termId) : sql`1 = 0`,
      ),
    )
    .leftJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, SchemeOfWork.academic_term_id))
    .leftJoin(Course, eq(Course.scheme_id, SchemeOfWork.scheme_id))
    .where(and(eq(TeacherSubjectAssignment.user_id, userId), yearId ? eq(TeacherSubjectAssignment.academic_year_id, yearId) : undefined))
    .orderBy(Subject.name, ClassGroup.name);

  // One row per (subject, class group): a teacher holds one assignment per year for each.
  const seen = new Set<string>();
  successResponse(
    res,
    "My teaching",
    rows
      .filter((r) => {
        const key = `${r.subject_id}:${r.class_group_id}`;
        return seen.has(key) ? false : (seen.add(key), true);
      })
      .map((r) => ({
        ...r,
        entries: Number(r.entries || 0),
        stage: r.course_id ? "course" : r.scheme_id ? "scheme" : "nothing",
      })),
  );
});

export const getCourseBuilder = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  // Bulk scheme edits (AI generation, DOCX import, the table editor) bypass the per-entry
  // hooks, so every builder read re-syncs sections against the scheme before rendering.
  await syncSectionsFromScheme(course);
  await publishDueSections(course.course_id);
  successResponse(res, "Course", await builderPayload(course));
});

export const updateCourse = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const { title, description, status, require_sequential_progress, auto_publish_from_scheme, cover_color, icon } = req.body;
  const patch: Partial<typeof Course.$inferInsert> = {};
  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) throw new ValidationError("Title cannot be empty");
    patch.title = t.slice(0, 255);
  }
  if (description !== undefined) patch.description = description ? String(description).slice(0, 5000) : null;
  if (status !== undefined) {
    if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) throw new ValidationError("Unknown status");
    patch.status = status;
  }
  if (require_sequential_progress !== undefined) patch.require_sequential_progress = bool(require_sequential_progress);
  if (auto_publish_from_scheme !== undefined) patch.auto_publish_from_scheme = bool(auto_publish_from_scheme);
  if (cover_color !== undefined) {
    if (cover_color && !/^#[0-9a-fA-F]{6}$/.test(cover_color)) throw new ValidationError("Colour must be a hex value");
    patch.cover_color = cover_color || null;
  }
  if (icon !== undefined) patch.icon = icon ? String(icon).slice(0, 16) : null;
  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to update");

  await db.update(Course).set(patch).where(eq(Course.course_id, course.course_id));
  const updated = await loadCourse(course.course_id);

  if (patch.status === "PUBLISHED" && course.status !== "PUBLISHED") {
    // Publishing the course makes every already-due week live at once.
    const published = await publishDueSections(course.course_id);
    await recordActivity(req.user.userId, "COURSE_PUBLISH", `Published course "${updated.title}"`, "Course", course.course_id, null, req.user.userId);
    for (const sectionId of published) await notifySectionPublished(updated, sectionId, req.user.userId);
  }
  successResponse(res, "Course updated", await builderPayload(updated));
});

/** Re-runs the seeding pass — picks up notes/materials written since the course was set up. */
export const reseedCourse = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const created = await seedItemsForCourse(course, req.user.userId);
  successResponse(res, created ? `Added ${created} item(s)` : "Nothing new to add", { created, ...(await builderPayload(course)) });
});

// ======================
// SECTIONS
// ======================

export const createSection = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const title = String(req.body.title || "").trim();
  if (!title) throw new ValidationError("A section needs a title");
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseSection.position}), -1)` })
    .from(CourseSection)
    .where(eq(CourseSection.course_id, course.course_id));
  const position = req.body.position !== undefined ? Number(req.body.position) : Number(max) + 1;
  const [ins] = (await db.insert(CourseSection).values({
    course_id: course.course_id,
    title: title.slice(0, 255),
    summary: req.body.summary ? String(req.body.summary).slice(0, 5000) : null,
    position: Number.isFinite(position) ? position : Number(max) + 1,
    status: req.body.status === "PUBLISHED" ? "PUBLISHED" : "HIDDEN",
  })) as any;
  successResponse(res, "Section created", { section_id: ins.insertId, ...(await builderPayload(course)) }, 201);
});

export const updateSection = asyncHandler(async (req: any, res: any) => {
  const { section, course } = await loadBuildableSection(parseId(req.params.id, "section id"), req.user.userId);
  const { title, summary, status, unlock_at, requirement_type } = req.body;
  const patch: Partial<typeof CourseSection.$inferInsert> = {};
  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) throw new ValidationError("Title cannot be empty");
    patch.title = t.slice(0, 255);
  }
  if (summary !== undefined) patch.summary = summary ? String(summary).slice(0, 5000) : null;
  if (status !== undefined) {
    if (!["HIDDEN", "SCHEDULED", "PUBLISHED"].includes(status)) throw new ValidationError("Unknown status");
    patch.status = status;
  }
  if (unlock_at !== undefined) {
    if (!unlock_at) patch.unlock_at = null;
    else {
      const d = new Date(unlock_at);
      if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid unlock date");
      patch.unlock_at = d;
    }
  }
  if (requirement_type !== undefined) {
    if (!["ALL", "ONE"].includes(requirement_type)) throw new ValidationError("Requirement must be ALL or ONE");
    patch.requirement_type = requirement_type;
  }
  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to update");
  await db.update(CourseSection).set(patch).where(eq(CourseSection.section_id, section.section_id));

  if (patch.status === "PUBLISHED" && section.status !== "PUBLISHED" && course.status === "PUBLISHED") {
    await notifySectionPublished(course, section.section_id, req.user.userId);
  }
  successResponse(res, "Section updated", await builderPayload(course));
});

export const deleteSection = asyncHandler(async (req: any, res: any) => {
  const { section, course } = await loadBuildableSection(parseId(req.params.id, "section id"), req.user.userId);
  if (section.scheme_entry_id) {
    throw new ValidationError("A scheme week can't be deleted from the course — hide it instead, or skip the week in the scheme");
  }
  await db.delete(CourseSection).where(eq(CourseSection.section_id, section.section_id));
  successResponse(res, "Section deleted", await builderPayload(course));
});

/** Reorders manual sections only; scheme weeks keep scheme order (one source of truth). */
export const reorderSections = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const order: number[] = Array.isArray(req.body.section_ids) ? req.body.section_ids.map(Number) : [];
  if (order.length === 0) throw new ValidationError("section_ids is required");
  const sections = await db.select().from(CourseSection).where(eq(CourseSection.course_id, course.course_id));
  const known = new Set(sections.map((s) => s.section_id));
  if (order.some((id) => !known.has(id)) || new Set(order).size !== sections.length) {
    throw new ValidationError("section_ids must list every section of this course exactly once");
  }
  for (let i = 0; i < order.length; i += 1) {
    await db.update(CourseSection).set({ position: i }).where(eq(CourseSection.section_id, order[i]));
  }
  successResponse(res, "Sections reordered", await builderPayload(course));
});

// ======================
// ITEMS
// ======================

export const createItem = asyncHandler(async (req: any, res: any) => {
  const { section, course } = await loadBuildableSection(parseId(req.params.id, "section id"), req.user.userId);
  const itemType = req.body.item_type as CourseItemType;
  if (!COURSE_ITEM_TYPES.includes(itemType)) throw new ValidationError("Unknown item type");
  const body = await buildItemBody(course, req.user.userId, itemType, req.body);

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseItem.position}), -1)` })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, section.section_id));
  const requested = req.body.position !== undefined ? Number(req.body.position) : NaN;
  const position = Number.isFinite(requested) ? requested : Number(max) + 1;

  const [ins] = (await db.insert(CourseItem).values({
    section_id: section.section_id,
    item_type: itemType,
    title: body.title!,
    ...body,
    position,
    created_by: req.user.userId,
  })) as any;
  const itemId = ins.insertId as number;

  if (Number.isFinite(requested)) {
    // Insert-at: bump everything at/after the requested slot.
    await db
      .update(CourseItem)
      .set({ position: sql`${CourseItem.position} + 1` })
      .where(and(eq(CourseItem.section_id, section.section_id), sql`${CourseItem.position} >= ${position}`, sql`${CourseItem.item_id} <> ${itemId}`));
  }
  if (itemType === "LESSON_NOTE") await ensureClassGroupShare(body.ref_id!, course.class_group_id, req.user.userId);
  if (Array.isArray(req.body.criteria_ids) && itemType !== "LESSON_NOTE") {
    await setItemCriteria(itemId, course.subject_id, req.body.criteria_ids);
  }
  successResponse(res, "Item added", { item_id: itemId, ...(await builderPayload(course)) }, 201);
});

export const updateItem = asyncHandler(async (req: any, res: any) => {
  const { item, course } = await loadBuildableItem(parseId(req.params.id, "item id"), req.user.userId);
  // Type is fixed at creation; the body is re-validated for that type with the stored
  // values as defaults so a partial PATCH (e.g. only due_at) never fails validation.
  const merged = {
    ...item,
    ...req.body,
    ref_id: req.body.ref_id ?? item.ref_id,
    title: req.body.title ?? item.title,
    url: req.body.url ?? (item.content_json as any)?.url ?? item.external_url,
    external_url: req.body.external_url ?? item.external_url,
    content_json: req.body.content_json ?? item.content_json,
  };
  const body = await buildItemBody(course, req.user.userId, item.item_type, merged);
  // Only persist fields the client actually sent (plus derived ones).
  const patch: any = {};
  const sent = new Set(Object.keys(req.body));
  for (const [k, v] of Object.entries(body)) {
    const derived = ["external_url", "content_json", "content_html", "ref_id"].includes(k);
    if (sent.has(k) || derived || (k === "title" && sent.has("title"))) patch[k] = v;
  }
  if (Object.keys(patch).length === 0 && !Array.isArray(req.body.criteria_ids)) throw new ValidationError("Nothing to update");
  if (Object.keys(patch).length > 0) await db.update(CourseItem).set(patch).where(eq(CourseItem.item_id, item.item_id));
  if (item.item_type === "LESSON_NOTE" && patch.ref_id) {
    await ensureClassGroupShare(patch.ref_id, course.class_group_id, req.user.userId);
  }
  if (Array.isArray(req.body.criteria_ids) && item.item_type !== "LESSON_NOTE") {
    await setItemCriteria(item.item_id, course.subject_id, req.body.criteria_ids);
  }
  successResponse(res, "Item updated", await builderPayload(course));
});

export const deleteItem = asyncHandler(async (req: any, res: any) => {
  const { item, course } = await loadBuildableItem(parseId(req.params.id, "item id"), req.user.userId);
  await db.delete(CourseItem).where(eq(CourseItem.item_id, item.item_id));
  successResponse(res, "Item removed", await builderPayload(course));
});

/** Reorders items within a section, or moves items between sections of the same course. */
export const reorderItems = asyncHandler(async (req: any, res: any) => {
  const { section, course } = await loadBuildableSection(parseId(req.params.id, "section id"), req.user.userId);
  const order: number[] = Array.isArray(req.body.item_ids) ? req.body.item_ids.map(Number) : [];
  if (order.some((n) => !Number.isFinite(n))) throw new ValidationError("item_ids must be numbers");
  const courseSections = await db
    .select({ section_id: CourseSection.section_id })
    .from(CourseSection)
    .where(eq(CourseSection.course_id, course.course_id));
  const sectionIds = courseSections.map((s) => s.section_id);
  const items = order.length
    ? await db.select({ item_id: CourseItem.item_id, section_id: CourseItem.section_id }).from(CourseItem).where(inArray(CourseItem.item_id, order))
    : [];
  if (items.length !== new Set(order).size || items.some((i) => !sectionIds.includes(i.section_id))) {
    throw new ValidationError("Every item must belong to this course");
  }
  for (let i = 0; i < order.length; i += 1) {
    await db.update(CourseItem).set({ position: i, section_id: section.section_id }).where(eq(CourseItem.item_id, order[i]));
  }
  // Items left in the section but missing from the list go after the listed ones, in their old order.
  const leftovers = await db
    .select({ item_id: CourseItem.item_id })
    .from(CourseItem)
    .where(and(eq(CourseItem.section_id, section.section_id), order.length ? sql`${CourseItem.item_id} NOT IN (${sql.join(order.map((o) => sql`${o}`), sql`, `)})` : undefined))
    .orderBy(asc(CourseItem.position), asc(CourseItem.item_id));
  for (let i = 0; i < leftovers.length; i += 1) {
    await db.update(CourseItem).set({ position: order.length + i }).where(eq(CourseItem.item_id, leftovers[i].item_id));
  }
  successResponse(res, "Items reordered", await builderPayload(course));
});

// ======================
// CRITERIA
// ======================

async function setItemCriteria(itemId: number, subjectId: number, rawIds: unknown[]) {
  const ids = [...new Set(rawIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length > 0) {
    const valid = await db
      .select({ criteria_id: CompetencyPerformanceCriteria.criteria_id })
      .from(CompetencyPerformanceCriteria)
      .innerJoin(SubjectCompetency, eq(SubjectCompetency.competency_id, CompetencyPerformanceCriteria.competency_id))
      .where(and(eq(SubjectCompetency.subject_id, subjectId), inArray(CompetencyPerformanceCriteria.criteria_id, ids)));
    if (valid.length !== ids.length) throw new ValidationError("Every criterion must belong to this subject's curriculum");
  }
  await db.delete(CourseItemCriteria).where(eq(CourseItemCriteria.item_id, itemId));
  if (ids.length) await db.insert(CourseItemCriteria).values(ids.map((criteria_id) => ({ item_id: itemId, criteria_id })));
}

export const setItemCriteriaHandler = asyncHandler(async (req: any, res: any) => {
  const { item, course } = await loadBuildableItem(parseId(req.params.id, "item id"), req.user.userId);
  if (item.item_type === "LESSON_NOTE") {
    throw new ValidationError("A lesson note's criteria are set on the note itself");
  }
  await setItemCriteria(item.item_id, course.subject_id, Array.isArray(req.body.criteria_ids) ? req.body.criteria_ids : []);
  successResponse(res, "Criteria updated", await builderPayload(course));
});

/**
 * Places a lesson note onto its subject's course in one call, so a teacher working in Lesson
 * Notes never has to go hunting for the right section in the course builder. The target section
 * is the one seeded from the note's Scheme of Work week when the note has one, otherwise the
 * last section of the course. Idempotent: a note already on the course returns its existing
 * placement rather than being added twice.
 */
export const placeLessonNoteOnCourse = asyncHandler(async (req: any, res: any) => {
  const noteId = parseId(req.params.noteId, "note id");
  const [note] = await db
    .select({
      note_id: LessonNote.note_id,
      title: LessonNote.title,
      subject_id: LessonNote.subject_id,
      class_group_id: LessonNote.class_group_id,
      scheme_entry_id: LessonNote.scheme_entry_id,
      user_id: LessonNote.user_id,
    })
    .from(LessonNote)
    .where(eq(LessonNote.note_id, noteId))
    .limit(1);
  if (!note) throw new NotFoundError("Lesson note not found");
  if (!note.class_group_id) {
    throw new ValidationError(
      "This note isn't tied to a class group, so there's no course to place it on. Open it in the course builder to choose one.",
    );
  }

  const [courseRow] = await db
    .select({ course_id: Course.course_id })
    .from(Course)
    .where(and(eq(Course.subject_id, note.subject_id), eq(Course.class_group_id, note.class_group_id)))
    .limit(1);
  if (!courseRow) {
    throw new NotFoundError(
      "No e-learning course exists for this subject and class group yet — create one from E-Learning first.",
    );
  }
  const course = await loadBuildableCourse(courseRow.course_id, req.user.userId);

  const sections = await db
    .select({
      section_id: CourseSection.section_id,
      title: CourseSection.title,
      position: CourseSection.position,
      scheme_entry_id: CourseSection.scheme_entry_id,
    })
    .from(CourseSection)
    .where(eq(CourseSection.course_id, course.course_id))
    .orderBy(asc(CourseSection.position));
  if (sections.length === 0) {
    throw new ValidationError("This course has no sections yet — add one in the course builder first.");
  }

  // Already there? Say where, and change nothing.
  const [existing] = await db
    .select({ item_id: CourseItem.item_id, section_id: CourseItem.section_id })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .where(
      and(
        eq(CourseSection.course_id, course.course_id),
        eq(CourseItem.item_type, "LESSON_NOTE"),
        eq(CourseItem.ref_id, noteId),
      ),
    )
    .limit(1);
  if (existing) {
    const section = sections.find((s) => s.section_id === existing.section_id);
    successResponse(res, "This note is already on the course", {
      item_id: existing.item_id,
      section_id: existing.section_id,
      section_title: section?.title || "",
      course_id: course.course_id,
      already_placed: true,
    });
    return;
  }

  const requestedSectionId = req.body?.section_id ? parseId(req.body.section_id, "section id") : null;
  const target =
    (requestedSectionId && sections.find((s) => s.section_id === requestedSectionId)) ||
    (note.scheme_entry_id && sections.find((s) => s.scheme_entry_id === note.scheme_entry_id)) ||
    sections[sections.length - 1];
  if (requestedSectionId && target.section_id !== requestedSectionId) {
    throw new ValidationError("That section belongs to a different course");
  }

  const body = await buildItemBody(course, req.user.userId, "LESSON_NOTE", { ref_id: noteId });
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseItem.position}), -1)` })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, target.section_id));

  const [ins] = (await db.insert(CourseItem).values({
    section_id: target.section_id,
    item_type: "LESSON_NOTE",
    title: body.title!,
    ...body,
    position: Number(max) + 1,
    created_by: req.user.userId,
  })) as any;

  // Placing a note on a course is what makes students able to open it — mirror createItem
  // so it doesn't land on the course as an unreadable link.
  await ensureClassGroupShare(noteId, course.class_group_id, req.user.userId);

  successResponse(
    res,
    `Added to "${target.title}"`,
    {
      item_id: ins.insertId as number,
      section_id: target.section_id,
      section_title: target.title,
      course_id: course.course_id,
      already_placed: false,
    },
    201,
  );
});

// ======================
// PICKERS
// ======================

/** Notes the teacher can place: their own for this subject, plus any written for the class group. */
export const pickLessonNotes = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const placed = await db
    .select({ ref_id: CourseItem.ref_id, section_id: CourseItem.section_id })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .where(and(eq(CourseSection.course_id, course.course_id), eq(CourseItem.item_type, "LESSON_NOTE")));
  const placedBy = new Map(placed.map((p) => [p.ref_id, p.section_id]));
  const notes = await db
    .select({
      note_id: LessonNote.note_id,
      title: LessonNote.title,
      status: LessonNote.status,
      source: LessonNote.source,
      page_count: LessonNote.page_count,
      user_id: LessonNote.user_id,
      class_group_id: LessonNote.class_group_id,
      scheme_entry_id: LessonNote.scheme_entry_id,
      updated_at: LessonNote.updated_at,
    })
    .from(LessonNote)
    .where(eq(LessonNote.subject_id, course.subject_id))
    .orderBy(desc(LessonNote.updated_at));
  successResponse(
    res,
    "Lesson notes",
    notes
      .filter((n) => n.user_id === req.user.userId || n.class_group_id === course.class_group_id)
      .map((n) => ({ ...n, is_mine: n.user_id === req.user.userId, placed_in_section_id: placedBy.get(n.note_id) ?? null })),
  );
});

export const pickSubjectDocuments = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const placed = await db
    .select({ ref_id: CourseItem.ref_id, section_id: CourseItem.section_id })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .where(and(eq(CourseSection.course_id, course.course_id), eq(CourseItem.item_type, "SUBJECT_DOCUMENT")));
  const placedBy = new Map(placed.map((p) => [p.ref_id, p.section_id]));
  const docs = await db
    .select({
      document_id: SubjectDocument.document_id,
      original_name: SubjectDocument.original_name,
      mime_type: SubjectDocument.mime_type,
      file_size: SubjectDocument.file_size,
      file_extension: SubjectDocument.file_extension,
      description: SubjectDocument.description,
      competency_id: SubjectDocument.competency_id,
      category_name: SubjectDocumentCategory.name,
      updated_at: SubjectDocument.updated_at,
    })
    .from(SubjectDocument)
    .leftJoin(SubjectDocumentCategory, eq(SubjectDocumentCategory.category_id, SubjectDocument.category_id))
    .where(eq(SubjectDocument.subject_id, course.subject_id))
    .orderBy(desc(SubjectDocument.updated_at));
  successResponse(
    res,
    "Materials",
    docs.map((d) => ({ ...d, placed_in_section_id: placedBy.get(d.document_id) ?? null })),
  );
});

/** The subject's curriculum tree, for the criteria picker in the item drawer. */
export const pickCriteria = asyncHandler(async (req: any, res: any) => {
  const course = await loadBuildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const outcomes = await db
    .select()
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.subject_id, course.subject_id))
    .orderBy(asc(SubjectCompetency.sort_order), asc(SubjectCompetency.element_number));
  const ids = outcomes.map((o) => o.competency_id);
  const criteria = ids.length
    ? await db
        .select()
        .from(CompetencyPerformanceCriteria)
        .where(inArray(CompetencyPerformanceCriteria.competency_id, ids))
        .orderBy(asc(CompetencyPerformanceCriteria.sort_order), asc(CompetencyPerformanceCriteria.criteria_id))
    : [];
  successResponse(
    res,
    "Curriculum",
    outcomes.map((o) => ({
      competency_id: o.competency_id,
      element_number: o.element_number,
      title: o.title,
      criteria: criteria
        .filter((c) => c.competency_id === o.competency_id)
        .map((c) => ({ criteria_id: c.criteria_id, criteria_number: c.criteria_number, description: c.description })),
    })),
  );
});
