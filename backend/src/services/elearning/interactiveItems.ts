import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { CourseItemCriteria, CompetencyPerformanceCriteria, ExitTicketResponse, FileAsset, FlashcardReview, PracticalSubmission } from "../../db/schema";
import { ValidationError } from "../../errors/CustomError";
import { sanitizeNoteHtml } from "../../utils/sanitizeNoteHtml";
import { normaliseKnowledgeCheck } from "../../controllers/courseController";

/**
 * Exit tickets, flashcards and practical tasks (LESSON_STUDIO plan §11): validation of their
 * bodies, and what a student is sent (never the answer keys).
 */

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  gloss_rw?: string;
}

export function normaliseFlashcards(raw: any): { cards: Flashcard[] } {
  const cards = (Array.isArray(raw?.cards) ? raw.cards : [])
    .map((c: any, i: number) => ({
      id: typeof c?.id === "string" && c.id ? c.id.slice(0, 40) : `c${i + 1}`,
      front: String(c?.front ?? "").trim().slice(0, 200),
      back: String(c?.back ?? "").trim().slice(0, 600),
      ...(c?.gloss_rw ? { gloss_rw: String(c.gloss_rw).trim().slice(0, 120) } : {}),
    }))
    .filter((c: Flashcard) => c.front && c.back);
  if (cards.length < 2) throw new ValidationError("A flashcard set needs at least 2 cards, each with a front and a back");
  if (cards.length > 40) throw new ValidationError("A flashcard set can have at most 40 cards");
  const ids = new Set(cards.map((c: Flashcard) => c.id));
  if (ids.size !== cards.length) throw new ValidationError("Every card needs its own id");
  return { cards };
}

export function normaliseExitTicket(raw: any) {
  const kc = normaliseKnowledgeCheck({ questions: raw?.questions });
  if (kc.questions.length > 3) throw new ValidationError("An exit ticket has at most 3 questions");
  return { questions: kc.questions, ask_confidence: raw?.ask_confidence !== false };
}

export interface ChecklistLine {
  id: string;
  text: string;
  criteria_number?: string | null;
}

export function normalisePractical(raw: any): { brief_html?: string; checklist: ChecklistLine[]; max_photos: number } {
  const checklist = (Array.isArray(raw?.checklist) ? raw.checklist : [])
    .map((c: any, i: number) => ({
      id: typeof c?.id === "string" && c.id ? c.id.slice(0, 40) : `k${i + 1}`,
      text: String(c?.text ?? "").trim().slice(0, 300),
      criteria_number: c?.criteria_number ? String(c.criteria_number).slice(0, 20) : null,
    }))
    .filter((c: ChecklistLine) => c.text);
  if (checklist.length === 0) throw new ValidationError("A practical task needs at least one checklist line the teacher can tick");
  return { checklist: checklist.slice(0, 15), max_photos: Math.max(1, Math.min(5, Number(raw?.max_photos) || 3)) };
}

/** The student-facing body of an interactive item. */
export async function learnerContent(item: { item_id: number; item_type: string; content_json: unknown; content_html: string | null }, userId: number) {
  const c: any = item.content_json || {};
  if (item.item_type === "EXIT_TICKET") {
    const [mine] = await db.select().from(ExitTicketResponse).where(and(eq(ExitTicketResponse.item_id, item.item_id), eq(ExitTicketResponse.user_id, userId))).limit(1);
    return {
      questions: (c.questions || []).map((q: any) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options })),
      ask_confidence: c.ask_confidence !== false,
      // After answering, the student sees what was right and why.
      submitted: mine
        ? {
            correct: mine.correct,
            total: mine.total,
            confidence: mine.confidence,
            answers: mine.answers,
            keys: (c.questions || []).map((q: any) => ({ id: q.id, correct_index: q.correct_index, explanation: q.explanation })),
          }
        : null,
    };
  }
  if (item.item_type === "FLASHCARDS") {
    const reviews = await db.select().from(FlashcardReview).where(and(eq(FlashcardReview.item_id, item.item_id), eq(FlashcardReview.user_id, userId)));
    return { cards: c.cards || [], reviews: reviews.map((r) => ({ card_id: r.card_id, fsrs_state: r.fsrs_state, due_at: r.due_at, reps: r.reps })) };
  }
  if (item.item_type === "PRACTICAL_TASK") {
    const [mine] = await db.select().from(PracticalSubmission).where(and(eq(PracticalSubmission.item_id, item.item_id), eq(PracticalSubmission.user_id, userId))).limit(1);
    const assetIds = ((mine?.asset_ids as number[]) || []).filter(Number.isInteger);
    const photos = assetIds.length ? await db.select({ asset_id: FileAsset.asset_id, original_name: FileAsset.original_name }).from(FileAsset).where(inArray(FileAsset.asset_id, assetIds)) : [];
    return {
      brief_html: item.content_html ? sanitizeNoteHtml(item.content_html) : "",
      checklist: c.checklist || [],
      max_photos: c.max_photos || 3,
      submission: mine
        ? { status: mine.status, student_note: mine.student_note, teacher_comment: mine.teacher_comment, checklist_result: mine.checklist_result, submitted_at: mine.submitted_at, photos }
        : null,
    };
  }
  return null;
}

/** Criteria ids of an item (for practical sign-off and pulse views). */
export async function itemCriteria(itemId: number) {
  return db
    .select({ criteria_id: CompetencyPerformanceCriteria.criteria_id, criteria_number: CompetencyPerformanceCriteria.criteria_number, description: CompetencyPerformanceCriteria.description })
    .from(CourseItemCriteria)
    .innerJoin(CompetencyPerformanceCriteria, eq(CompetencyPerformanceCriteria.criteria_id, CourseItemCriteria.criteria_id))
    .where(eq(CourseItemCriteria.item_id, itemId));
}
