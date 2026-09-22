import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { CourseItem, KnowledgeCheckAttempt, LessonNote, UserLearningPrefs } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import logger from "../utils/logger";
import { generateStructuredContent, isAnyProviderConfigured, JSONSchema } from "../services/aiProviders";
import { getSubjectCriteria } from "./schemeEntryCriteriaController";
import { assertCanBuildCourse, isCourseMember } from "../services/elearning/courseMembership";
import { loadItemWithCourse } from "../services/elearning/courseTree";
import { applyAction, logLearningEvent } from "../services/elearning/courseProgress";
import { notifyResultReceived } from "../services/elearning/courseNotifications";
import { normaliseKnowledgeCheck } from "./courseController";

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

interface KcQuestion {
  id: string;
  type: "MCQ" | "TRUE_FALSE";
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

/** Loads a visible KNOWLEDGE_CHECK item for a member (404 otherwise) with its questions. */
async function loadMemberCheck(itemId: number, userId: number) {
  const row = await loadItemWithCourse(itemId);
  if (!row || row.item.item_type !== "KNOWLEDGE_CHECK") throw new NotFoundError("Knowledge check not found");
  if (row.course.status !== "PUBLISHED" || row.section.status !== "PUBLISHED" || !row.item.is_published) {
    throw new NotFoundError("Knowledge check not found");
  }
  if (!(await isCourseMember(row.course, userId))) throw new NotFoundError("Knowledge check not found");
  const questions: KcQuestion[] = ((row.item.content_json as any)?.questions || []) as KcQuestion[];
  return { row, questions };
}

/** Instant per-question feedback — answers never leave the server in the item payload. */
export const checkKnowledgeAnswer = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const { questions } = await loadMemberCheck(itemId, req.user.userId);
  const q = questions.find((x) => x.id === String(req.body?.question_id));
  if (!q) throw new ValidationError("Unknown question");
  const answer = Number(req.body?.answer_index);
  if (!Number.isInteger(answer) || answer < 0 || answer >= q.options.length) throw new ValidationError("Pick an answer");
  const correct = answer === q.correct_index;
  await logLearningEvent({
    actor_user_id: req.user.userId,
    verb: "ATTEMPTED",
    object_type: "COURSE_ITEM",
    object_id: itemId,
    course_item_id: itemId,
    result: { question_id: q.id, answer_index: answer, correct },
  });
  successResponse(res, correct ? "Correct" : "Not yet", {
    correct,
    // The right answer is only revealed once the student has it — kind, not a giveaway.
    correct_index: correct ? q.correct_index : null,
    explanation: q.explanation || "",
  });
});

/** Scores a full attempt {answers: {question_id: index}}; best score projects to progress (SUBMIT/MIN_SCORE). */
export const submitKnowledgeCheck = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const userId = req.user.userId;
  const { row, questions } = await loadMemberCheck(itemId, userId);
  const answers: Record<string, number> = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const total = questions.length;
  const correct = questions.filter((q) => Number(answers[q.id]) === q.correct_index).length;
  const scorePct = total ? Math.round((correct / total) * 100) : 0;

  await db.insert(KnowledgeCheckAttempt).values({
    item_id: itemId,
    user_id: userId,
    answers_json: answers,
    correct,
    total,
    score_pct: String(scorePct) as any,
  });
  const { progress, justCompleted } = await applyAction(row.item, userId, { kind: "SCORE", score_pct: scorePct });
  await logLearningEvent({
    actor_user_id: userId,
    verb: "SCORED",
    object_type: "COURSE_ITEM",
    object_id: itemId,
    course_item_id: itemId,
    result: { score_pct: scorePct, correct, total, success: scorePct >= (row.item.min_score_pct ?? 0) },
    context: { course_id: row.course.course_id, section_id: row.section.section_id },
  });
  if (justCompleted) {
    await logLearningEvent({ actor_user_id: userId, verb: "COMPLETED", object_type: "COURSE_ITEM", object_id: itemId, course_item_id: itemId, context: { via: "KNOWLEDGE_CHECK" } });
    await notifyResultReceived(row.course.course_id, itemId, userId, row.item.title, scorePct);
  }
  const passed = row.item.completion_rule === "MIN_SCORE" ? scorePct >= (row.item.min_score_pct ?? 100) : true;
  successResponse(res, "Scored", {
    correct,
    total,
    score_pct: scorePct,
    passed,
    best_score_pct: progress.best_score_pct ? Number(progress.best_score_pct) : scorePct,
    state: progress.state,
    just_completed: justCompleted,
  });
});

/** Teacher: attempts summary for one check — average, most-missed question (Insights). */
export const knowledgeCheckStats = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const row = await loadItemWithCourse(itemId);
  if (!row || row.item.item_type !== "KNOWLEDGE_CHECK") throw new NotFoundError("Knowledge check not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const questions: KcQuestion[] = ((row.item.content_json as any)?.questions || []) as KcQuestion[];
  const attempts = await db.select().from(KnowledgeCheckAttempt).where(eq(KnowledgeCheckAttempt.item_id, itemId)).orderBy(desc(KnowledgeCheckAttempt.attempted_at));
  const missed = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    missed: attempts.filter((a) => Number((a.answers_json as any)?.[q.id]) !== q.correct_index).length,
  }));
  const students = new Set(attempts.map((a) => a.user_id)).size;
  successResponse(res, "Stats", {
    attempts: attempts.length,
    students,
    average_pct: attempts.length ? Math.round(attempts.reduce((n, a) => n + Number(a.score_pct), 0) / attempts.length) : null,
    most_missed: missed.sort((a, b) => b.missed - a.missed)[0] || null,
    per_question: missed,
  });
});

// ----------------------------------------------------------------------------
// AI helpers (teacher). Every output is a proposal the teacher confirms in the drawer.
// ----------------------------------------------------------------------------

const questionsSchema: JSONSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "number" },
          explanation: { type: "string" },
        },
        required: ["type", "prompt", "options", "correct_index", "explanation"],
      },
    },
  },
  required: ["questions"],
};

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Source text for an item's AI helpers: its own page/description, or the nearest note in the same week. */
async function sourceTextForItem(item: typeof CourseItem.$inferSelect, extra?: { title?: string; description?: string; content_html?: string }) {
  const parts: string[] = [];
  if (extra?.title || item.title) parts.push(`Title: ${extra?.title || item.title}`);
  if (extra?.description || item.description) parts.push(`Description: ${extra?.description || item.description}`);
  if (extra?.content_html || item.content_html) parts.push(htmlToText(extra?.content_html || item.content_html || "").slice(0, 6000));
  if (parts.length < 3) {
    const [note] = await db
      .select({ title: LessonNote.title, content_html: LessonNote.content_html })
      .from(CourseItem)
      .innerJoin(LessonNote, eq(LessonNote.note_id, CourseItem.ref_id))
      .where(and(eq(CourseItem.section_id, item.section_id), eq(CourseItem.item_type, "LESSON_NOTE"), sql`${CourseItem.item_id} <> ${item.item_id}`))
      .limit(1);
    if (note?.content_html) parts.push(`Lesson note "${note.title}": ${htmlToText(note.content_html).slice(0, 6000)}`);
  }
  return parts.join("\n\n");
}

/** `POST /items/:id/generate-check` — "write 5 questions from this note". */
export const generateKnowledgeCheck = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const row = await loadItemWithCourse(itemId);
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  if (!isAnyProviderConfigured()) throw new ValidationError("AI generation is not configured on this server.");
  const count = Math.max(1, Math.min(10, Number(req.body?.count) || 5));
  const source = await sourceTextForItem(row.item, req.body);
  if (source.length < 40) throw new ValidationError("Add a description, or a lesson note in the same week, so the AI has something to write from.");

  const { data, providerUsed } = await generateStructuredContent<{ questions: any[] }>({
    schemaName: "knowledge_check",
    schema: questionsSchema,
    prompt: `You are writing a short formative self-check for TVET students (Rwanda, competence-based curriculum). Write ${count} questions strictly grounded in the material below. Mix "MCQ" (3-4 options, one correct) and "TRUE_FALSE" (options exactly ["True","False"]). Each question needs a one-sentence, kind explanation of the right answer a student sees after answering. Plain English, no trick questions.

Material:
"""
${source}
"""`,
  });
  let questions: any[] = [];
  try {
    questions = normaliseKnowledgeCheck({ questions: (data.questions || []).slice(0, count) }).questions;
  } catch (err) {
    logger.warn("AI knowledge check failed validation", { error: (err as Error).message });
  }
  successResponse(res, "Questions", { questions, provider_used: providerUsed });
});

const criteriaSchema: JSONSchema = {
  type: "object",
  properties: { criteria_numbers: { type: "array", items: { type: "string" } } },
  required: ["criteria_numbers"],
};

/** `POST /items/:id/suggest-criteria` — same provider chain as the scheme entry suggestion. */
export const suggestItemCriteria = asyncHandler(async (req: any, res: any) => {
  const itemId = parseId(req.params.id, "item id");
  const row = await loadItemWithCourse(itemId);
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const criteria = await getSubjectCriteria(row.course.subject_id);
  if (criteria.length === 0) return successResponse(res, "No curriculum to match", { criteria_ids: [], criteria: [] });
  if (!isAnyProviderConfigured()) throw new ValidationError("AI matching is not configured on this server.");
  const source = await sourceTextForItem(row.item, req.body);
  const { data } = await generateStructuredContent<{ criteria_numbers?: any[] }>({
    schemaName: "item_criteria_suggestion",
    schema: criteriaSchema,
    prompt: `A teacher placed this learning item in an e-learning course:

${source || "(no description)"}

Here is the subject's official list of Curriculum Performance Criteria (number: description):
"""
${criteria.map((c) => `${c.criteria_number}: ${c.description}`).join("\n")}
"""

Judge by meaning which criteria this item genuinely addresses (wording will not match). An empty list is fine. Return only criteria_number values.`,
  });
  const numbers = Array.isArray(data.criteria_numbers) ? data.criteria_numbers.map((n) => String(n).trim()) : [];
  const matched = criteria.filter((c) => numbers.includes(c.criteria_number));
  successResponse(res, "Criteria suggested", { criteria_ids: matched.map((c) => c.criteria_id), criteria: matched });
});

// ----------------------------------------------------------------------------
// Learning prefs (UX plan §6.3)
// ----------------------------------------------------------------------------

export const getMyLearningPrefs = asyncHandler(async (req: any, res: any) => {
  const [row] = await db.select().from(UserLearningPrefs).where(eq(UserLearningPrefs.user_id, req.user.userId)).limit(1);
  successResponse(res, "Prefs", {
    streak_enabled: !!row?.streak_enabled,
    celebrations_enabled: row ? !!row.celebrations_enabled : true,
    reduced_motion: row?.reduced_motion === null || row?.reduced_motion === undefined ? null : !!row.reduced_motion,
  });
});

export const updateMyLearningPrefs = asyncHandler(async (req: any, res: any) => {
  const patch: Partial<typeof UserLearningPrefs.$inferInsert> = {};
  if (req.body?.streak_enabled !== undefined) patch.streak_enabled = req.body.streak_enabled ? 1 : 0;
  if (req.body?.celebrations_enabled !== undefined) patch.celebrations_enabled = req.body.celebrations_enabled ? 1 : 0;
  if (req.body?.reduced_motion !== undefined) patch.reduced_motion = req.body.reduced_motion === null ? null : req.body.reduced_motion ? 1 : 0;
  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to update");
  await db
    .insert(UserLearningPrefs)
    .values({ user_id: req.user.userId, ...patch })
    .onDuplicateKeyUpdate({ set: patch });
  const [row] = await db.select().from(UserLearningPrefs).where(eq(UserLearningPrefs.user_id, req.user.userId)).limit(1);
  successResponse(res, "Saved", {
    streak_enabled: !!row.streak_enabled,
    celebrations_enabled: !!row.celebrations_enabled,
    reduced_motion: row.reduced_motion === null ? null : !!row.reduced_motion,
  });
});
