import multer from "multer";
import os from "os";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { CourseItem, CourseSection, ExitTicketResponse, FileAsset, FlashcardReview, PracticalSubmission, UserProfile } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ConflictError, NotFoundError, ValidationError } from "../errors/CustomError";
import { notifyUsers } from "../utils/notifications";
import { assertCanBuildCourse, isCourseMember, listCourseMembers, listMemberCourseIds, loadCourse } from "../services/elearning/courseMembership";
import { loadItemWithCourse } from "../services/elearning/courseTree";
import { applyAction, logLearningEvent } from "../services/elearning/courseProgress";
import { storeAsset } from "../services/files/assets";
import { streamStoredFile } from "../services/files/stream";

/**
 * Exit tickets, flashcards and practical tasks (LESSON_STUDIO plan §11, Phase B3).
 *   learner:  /my/items/:id/exit-ticket · /my/items/:id/flashcards/review · /my/flashcards/due
 *             /my/items/:id/practical · /my/practical-photos/:assetId
 *   teacher:  /items/:id/exit-ticket/pulse · /courses/:id/practicals · /practicals/:id/review
 *             /practicals/:id/photos/:assetId
 */

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

/** A visible item of the given type in a course the student belongs to (404 otherwise). */
async function memberItem(itemId: number, userId: number, type: string) {
  const row = await loadItemWithCourse(itemId);
  if (!row || row.item.item_type !== type) throw new NotFoundError("Item not found");
  if (row.course.status !== "PUBLISHED" || row.section.status !== "PUBLISHED" || !row.item.is_published) throw new NotFoundError("Item not found");
  if (!(await isCourseMember(row.course, userId))) throw new NotFoundError("Item not found");
  return row;
}

async function builderItem(itemId: number, userId: number, type: string) {
  const row = await loadItemWithCourse(itemId);
  if (!row || row.item.item_type !== type) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, userId);
  return row;
}

const studentNames = async (ids: number[]) => {
  if (!ids.length) return new Map<number, string>();
  const rows = await db.select({ user_id: UserProfile.user_id, first_name: UserProfile.first_name, last_name: UserProfile.last_name }).from(UserProfile).where(inArray(UserProfile.user_id, ids));
  return new Map(rows.map((r) => [r.user_id, `${r.first_name || ""} ${r.last_name || ""}`.trim() || `Student #${r.user_id}`]));
};

// ------------------------------------------------------------------ exit tickets

/** `POST /my/items/:id/exit-ticket` {answers: {qid: index}, confidence: 1|2|3} — once per student. */
export const submitExitTicket = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const row = await memberItem(parseId(req.params.id, "item id"), userId, "EXIT_TICKET");
  const questions: any[] = (row.item.content_json as any)?.questions || [];
  const answers: Record<string, number> = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const askConfidence = (row.item.content_json as any)?.ask_confidence !== false;
  const confidence = askConfidence ? Number(req.body?.confidence) : 2;
  if (![1, 2, 3].includes(confidence)) throw new ValidationError("Say how sure you are");
  if (questions.some((q) => !Number.isInteger(Number(answers[q.id])))) throw new ValidationError("Answer every question");
  const correct = questions.filter((q) => Number(answers[q.id]) === q.correct_index).length;
  try {
    await db.insert(ExitTicketResponse).values({ item_id: row.item.item_id, user_id: userId, answers, correct, total: questions.length, confidence });
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY") throw new ConflictError("You've already answered this exit ticket");
    throw e;
  }
  const { justCompleted } = await applyAction(row.item, userId, { kind: "SUBMIT" });
  await logLearningEvent({
    actor_user_id: userId,
    verb: "SUBMITTED",
    object_type: "COURSE_ITEM",
    object_id: row.item.item_id,
    course_item_id: row.item.item_id,
    result: { correct, total: questions.length, confidence },
    context: { course_id: row.course.course_id, section_id: row.section.section_id, via: "EXIT_TICKET" },
  });
  successResponse(res, "Thanks — your teacher will see this before the next lesson", {
    correct,
    total: questions.length,
    confidence,
    just_completed: justCompleted,
    keys: questions.map((q) => ({ id: q.id, correct_index: q.correct_index, explanation: q.explanation })),
  });
});

/**
 * `GET /items/:id/exit-ticket/pulse` — the class pulse: per question how many got it right,
 * how sure the class felt, and who is confident but wrong (misconceptions to address first).
 */
export const exitTicketPulse = asyncHandler(async (req: any, res: any) => {
  const row = await builderItem(parseId(req.params.id, "item id"), req.user.userId, "EXIT_TICKET");
  const questions: any[] = (row.item.content_json as any)?.questions || [];
  const responses = await db.select().from(ExitTicketResponse).where(eq(ExitTicketResponse.item_id, row.item.item_id));
  const members = await listCourseMembers(row.course);
  const names = await studentNames(responses.map((r) => r.user_id));
  const perQuestion = questions.map((q) => {
    const answered = responses.filter((r) => (r.answers as any)?.[q.id] !== undefined);
    const right = answered.filter((r) => Number((r.answers as any)[q.id]) === q.correct_index).length;
    const choices = (q.options as string[]).map((_, i) => answered.filter((r) => Number((r.answers as any)[q.id]) === i).length);
    return { id: q.id, prompt: q.prompt, options: q.options, correct_index: q.correct_index, right, answered: answered.length, choices };
  });
  const students = responses.map((r) => ({
    user_id: r.user_id,
    name: names.get(r.user_id) || `Student #${r.user_id}`,
    correct: r.correct,
    total: r.total,
    confidence: r.confidence,
    confident_but_wrong: r.confidence === 3 && r.correct < r.total,
    per_question: questions.map((q) => Number((r.answers as any)?.[q.id]) === q.correct_index),
  }));
  successResponse(res, "Class pulse", {
    item_id: row.item.item_id,
    title: row.item.title,
    responded: responses.length,
    class_size: members.length,
    confidence: { unsure: responses.filter((r) => r.confidence === 1).length, okay: responses.filter((r) => r.confidence === 2).length, sure: responses.filter((r) => r.confidence === 3).length },
    questions: perQuestion,
    students: students.sort((a, b) => Number(b.confident_but_wrong) - Number(a.confident_but_wrong) || a.correct / a.total - b.correct / b.total),
  });
});

// ------------------------------------------------------------------ flashcards

/**
 * `POST /my/items/:id/flashcards/review` {card_id, fsrs_state, due_at, rating} — the FSRS
 * schedule is computed on the device (ts-fsrs, works offline); the server stores it so the
 * daily review follows the student across devices.
 */
export const reviewFlashcard = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const row = await memberItem(parseId(req.params.id, "item id"), userId, "FLASHCARDS");
  const cards: any[] = (row.item.content_json as any)?.cards || [];
  const cardId = String(req.body?.card_id || "");
  if (!cards.some((c) => c.id === cardId)) throw new ValidationError("Unknown card");
  const due = new Date(req.body?.due_at);
  if (Number.isNaN(due.getTime())) throw new ValidationError("Invalid next review date");
  const state = req.body?.fsrs_state;
  if (!state || typeof state !== "object" || JSON.stringify(state).length > 2000) throw new ValidationError("Invalid card state");
  const rating = Number(req.body?.rating);
  const lapse = rating === 1 ? 1 : 0;
  await db
    .insert(FlashcardReview)
    .values({ item_id: row.item.item_id, user_id: userId, card_id: cardId, fsrs_state: state, due_at: due, last_review_at: new Date(), reps: 1, lapses: lapse })
    .onDuplicateKeyUpdate({ set: { fsrs_state: state, due_at: due, last_review_at: new Date(), reps: sql`${FlashcardReview.reps} + 1`, lapses: sql`${FlashcardReview.lapses} + ${lapse}` } });
  await logLearningEvent({ actor_user_id: userId, verb: "REVIEWED_CARD", object_type: "COURSE_ITEM", object_id: row.item.item_id, course_item_id: row.item.item_id, result: { card_id: cardId, rating } });
  const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(FlashcardReview).where(and(eq(FlashcardReview.item_id, row.item.item_id), eq(FlashcardReview.user_id, userId)));
  let justCompleted = false;
  if (Number(n) >= cards.length) ({ justCompleted } = await applyAction(row.item, userId, { kind: "SUBMIT" }));
  successResponse(res, "Saved", { reviewed: Number(n), total: cards.length, just_completed: justCompleted });
});

/** `GET /my/flashcards/due` — today's review across the student's courses (the "5-minute review"). */
export const dueFlashcards = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const courseIds = await listMemberCourseIds(userId);
  if (!courseIds.length) return successResponse(res, "Due", { due: [], total_due: 0 });
  const items = await db
    .select({ item_id: CourseItem.item_id, title: CourseItem.title, content_json: CourseItem.content_json, course_id: CourseSection.course_id })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .where(and(inArray(CourseSection.course_id, courseIds), eq(CourseItem.item_type, "FLASHCARDS"), eq(CourseItem.is_published, 1), eq(CourseSection.status, "PUBLISHED")));
  if (!items.length) return successResponse(res, "Due", { due: [], total_due: 0 });
  const reviews = await db
    .select()
    .from(FlashcardReview)
    .where(and(eq(FlashcardReview.user_id, userId), inArray(FlashcardReview.item_id, items.map((i) => i.item_id)), lte(FlashcardReview.due_at, new Date())));
  const byItem = new Map(items.map((i) => [i.item_id, i]));
  const due = reviews
    .map((r) => {
      const it = byItem.get(r.item_id)!;
      const card = ((it.content_json as any)?.cards || []).find((c: any) => c.id === r.card_id);
      return card ? { item_id: r.item_id, course_id: it.course_id, deck: it.title, card, fsrs_state: r.fsrs_state, due_at: r.due_at } : null;
    })
    .filter(Boolean)
    .slice(0, 50);
  successResponse(res, "Due", { due, total_due: due.length });
});

// ------------------------------------------------------------------ practical tasks

export const practicalUpload = multer({ storage: multer.diskStorage({ destination: os.tmpdir() }), limits: { fileSize: 15 * 1024 * 1024, files: 5 } });

/** `POST /my/items/:id/practical` (multipart photos[], note) — evidence of a practical task. */
export const submitPractical = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const row = await memberItem(parseId(req.params.id, "item id"), userId, "PRACTICAL_TASK");
  const max = Math.max(1, Math.min(5, Number((row.item.content_json as any)?.max_photos) || 3));
  const files: Express.Multer.File[] = req.files || [];
  if (files.length === 0) throw new ValidationError("Add at least one photo of your work");
  if (files.length > max) throw new ValidationError(`Add at most ${max} photos`);
  const [existing] = await db.select().from(PracticalSubmission).where(and(eq(PracticalSubmission.item_id, row.item.item_id), eq(PracticalSubmission.user_id, userId))).limit(1);
  if (existing?.status === "SIGNED_OFF") throw new ConflictError("Your teacher has already signed this off");
  const assetIds: number[] = [];
  for (const f of files) {
    if (!/\.(jpe?g|png|webp)$/i.test(f.originalname)) throw new ValidationError("Photos must be JPG, PNG or WebP");
    const a = await storeAsset({ tmpPath: f.path, originalName: f.originalname, size: f.size, ownerUserId: userId, scope: "SUBMISSION", courseId: row.course.course_id, subjectId: row.course.subject_id });
    assetIds.push(a.asset_id);
  }
  const note = req.body?.note ? String(req.body.note).slice(0, 1000) : null;
  if (existing) {
    await db
      .update(PracticalSubmission)
      .set({ asset_ids: assetIds, student_note: note, status: "SUBMITTED", submitted_at: new Date(), reviewed_at: null, reviewed_by: null })
      .where(eq(PracticalSubmission.submission_id, existing.submission_id));
  } else {
    await db.insert(PracticalSubmission).values({ item_id: row.item.item_id, user_id: userId, asset_ids: assetIds, student_note: note });
  }
  await logLearningEvent({ actor_user_id: userId, verb: "SUBMITTED_EVIDENCE", object_type: "COURSE_ITEM", object_id: row.item.item_id, course_item_id: row.item.item_id, result: { photos: assetIds.length } });
  // The teacher hears about it; completion waits for their sign-off.
  await notifyUsers([row.course.owner_user_id], {
    kind: "course_result_received",
    title: `New practical evidence: ${row.item.title}`,
    body: "A student uploaded photos of their work. Review it against the checklist.",
    link: `/elearning/courses/${row.course.course_id}/build?tab=insights`,
    subjectType: "course_item",
    subjectId: row.item.item_id,
  }).catch(() => undefined);
  successResponse(res, "Sent to your teacher", { status: "SUBMITTED", photos: assetIds.length }, 201);
});

/** `GET /my/practical-photos/:assetId` — a student's own evidence photo. */
export const streamMyPracticalPhoto = asyncHandler(async (req: any, res: any) => {
  const [a] = await db.select().from(FileAsset).where(eq(FileAsset.asset_id, parseId(req.params.assetId, "photo id"))).limit(1);
  if (!a || a.scope !== "SUBMISSION" || a.owner_user_id !== req.user.userId) throw new NotFoundError("Photo not found");
  await streamStoredFile(res, { name: a.original_name, storage_path: a.storage_path, sha256: a.sha256 }, "original");
});

/** `GET /courses/:id/practicals?status=` — submissions waiting for (or past) review. */
export const listPracticals = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  const status = ["SUBMITTED", "RETURNED", "SIGNED_OFF"].includes(req.query.status) ? req.query.status : null;
  const rows = await db
    .select({ s: PracticalSubmission, item_title: CourseItem.title, content_json: CourseItem.content_json, section_title: CourseSection.title })
    .from(PracticalSubmission)
    .innerJoin(CourseItem, eq(CourseItem.item_id, PracticalSubmission.item_id))
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .where(and(eq(CourseSection.course_id, course.course_id), status ? eq(PracticalSubmission.status, status) : undefined))
    .orderBy(PracticalSubmission.submitted_at);
  const names = await studentNames(rows.map((r) => r.s.user_id));
  successResponse(
    res,
    "Practical submissions",
    rows.map((r) => ({
      submission_id: r.s.submission_id,
      item_id: r.s.item_id,
      item_title: r.item_title,
      section_title: r.section_title,
      student: { user_id: r.s.user_id, name: names.get(r.s.user_id) },
      status: r.s.status,
      photos: r.s.asset_ids,
      student_note: r.s.student_note,
      checklist: (r.content_json as any)?.checklist || [],
      checklist_result: r.s.checklist_result,
      teacher_comment: r.s.teacher_comment,
      submitted_at: r.s.submitted_at,
    })),
  );
});

async function loadReviewableSubmission(submissionId: number, userId: number) {
  const [s] = await db.select().from(PracticalSubmission).where(eq(PracticalSubmission.submission_id, submissionId)).limit(1);
  if (!s) throw new NotFoundError("Submission not found");
  const row = await builderItem(s.item_id, userId, "PRACTICAL_TASK");
  return { s, row };
}

/** `GET /practicals/:id/photos/:assetId` — the teacher's view of an evidence photo. */
export const streamPracticalPhoto = asyncHandler(async (req: any, res: any) => {
  const { s } = await loadReviewableSubmission(parseId(req.params.id, "submission id"), req.user.userId);
  const assetId = parseId(req.params.assetId, "photo id");
  if (!((s.asset_ids as number[]) || []).includes(assetId)) throw new NotFoundError("Photo not found");
  const [a] = await db.select().from(FileAsset).where(eq(FileAsset.asset_id, assetId)).limit(1);
  if (!a) throw new NotFoundError("Photo not found");
  await streamStoredFile(res, { name: a.original_name, storage_path: a.storage_path, sha256: a.sha256 }, "original");
});

/**
 * `POST /practicals/:id/review` {decision: "SIGN_OFF"|"RETURN", checklist_result: {lineId: bool}, comment}
 * Sign-off completes the item (TEACHER) — which mastery reads as DEMONSTRATED for its criteria.
 */
export const reviewPractical = asyncHandler(async (req: any, res: any) => {
  const { s, row } = await loadReviewableSubmission(parseId(req.params.id, "submission id"), req.user.userId);
  const decision = req.body?.decision;
  if (decision !== "SIGN_OFF" && decision !== "RETURN") throw new ValidationError("Choose sign off or return");
  const checklist: any[] = (row.item.content_json as any)?.checklist || [];
  const result = Object.fromEntries(checklist.map((c) => [c.id, !!req.body?.checklist_result?.[c.id]]));
  if (decision === "SIGN_OFF" && checklist.some((c) => !result[c.id])) throw new ValidationError("Tick every checklist line to sign off — or return it with a comment");
  const comment = req.body?.comment ? String(req.body.comment).slice(0, 1000) : null;
  if (decision === "RETURN" && !comment) throw new ValidationError("Tell the student what to improve");
  await db
    .update(PracticalSubmission)
    .set({ status: decision === "SIGN_OFF" ? "SIGNED_OFF" : "RETURNED", checklist_result: result, teacher_comment: comment, reviewed_by: req.user.userId, reviewed_at: new Date() })
    .where(eq(PracticalSubmission.submission_id, s.submission_id));
  if (decision === "SIGN_OFF") {
    await applyAction(row.item, s.user_id, { kind: "TEACHER_OVERRIDE" });
    await logLearningEvent({ actor_user_id: s.user_id, verb: "PASSED", object_type: "COURSE_ITEM", object_id: row.item.item_id, course_item_id: row.item.item_id, result: { signed_off_by: req.user.userId } });
  }
  await notifyUsers([s.user_id], {
    kind: "course_result_received",
    title: decision === "SIGN_OFF" ? `${row.item.title} — signed off ✓` : `${row.item.title} — your teacher asks for changes`,
    body: comment || "Well done — your practical work meets the checklist.",
    link: `/my-learning/courses/${row.course.course_id}/items/${row.item.item_id}`,
    subjectType: "course_item",
    subjectId: row.item.item_id,
  }).catch(() => undefined);
  successResponse(res, decision === "SIGN_OFF" ? "Signed off" : "Returned to the student", { status: decision === "SIGN_OFF" ? "SIGNED_OFF" : "RETURNED" });
});
