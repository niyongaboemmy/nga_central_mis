import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { CourseItem, LessonNote, Subject } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import logger from "../utils/logger";
import { sanitizeNoteHtml } from "../utils/sanitizeNoteHtml";
import { generateStructuredContent, isAnyProviderConfigured, JSONSchema } from "../services/aiProviders";
import { loadMemberCourse } from "../services/elearning/courseMembership";
import { loadCourseTree, isItemVisibleToStudents } from "../services/elearning/courseTree";
import { logLearningEvent } from "../services/elearning/courseProgress";

const MAX_QUESTION = 1000;
const MAX_CONTEXT_CHARS = 22000;
const CHUNK_CHARS = 900;
const TOP_K = 8;

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|details|summary)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]{3,}/g) || [];

/**
 * Lightweight retrieval: split every published note/page into ~900-char chunks and score them
 * by term overlap with the question (TF, with a small boost for the current week). Good
 * enough for a term's notes; a vector index is a later optimisation only if quality demands.
 */
export function rankChunks(
  docs: { item_id: number; title: string; section_id: number; text: string }[],
  question: string,
  currentSectionId: number | null,
) {
  const q = new Set(tokens(question));
  if (q.size === 0) return [];
  const chunks: { item_id: number; title: string; section_id: number; text: string; score: number }[] = [];
  for (const d of docs) {
    const paras = d.text.split(/\n+/);
    let buf = "";
    const flush = () => {
      if (!buf.trim()) return;
      const t = tokens(buf);
      let score = 0;
      for (const w of t) if (q.has(w)) score += 1;
      score = score / Math.sqrt(t.length || 1);
      if (d.section_id === currentSectionId) score *= 1.15;
      if (tokens(d.title).some((w) => q.has(w))) score += 0.2;
      chunks.push({ item_id: d.item_id, title: d.title, section_id: d.section_id, text: buf.trim(), score });
      buf = "";
    };
    for (const p of paras) {
      if ((buf + p).length > CHUNK_CHARS) flush();
      buf += `${p}\n`;
    }
    flush();
  }
  return chunks
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

const answerSchema: JSONSchema = {
  type: "object",
  properties: {
    answer_html: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    follow_ups: { type: "array", items: { type: "string" } },
    grounded: { type: "boolean" },
    cited_titles: { type: "array", items: { type: "string" } },
  },
  required: ["answer_html", "grounded"],
};

/** `POST /my/courses/:id/ask` — course-wide AI tutor with citations (plan Phase 5). */
export const askCourseTutor = asyncHandler(async (req: any, res: any) => {
  const courseId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(courseId)) throw new ValidationError("Invalid course id");
  const userId = req.user.userId;
  const course = await loadMemberCourse(courseId, userId);
  if (course.status !== "PUBLISHED") throw new NotFoundError("Course not found");

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) throw new ValidationError("question is required");
  if (question.length > MAX_QUESTION) throw new ValidationError(`Your question must be ${MAX_QUESTION} characters or fewer`);
  const sectionId = req.body?.section_id ? Number(req.body.section_id) : null;
  const mode = typeof req.body?.mode === "string" ? req.body.mode : "";

  if (!isAnyProviderConfigured()) {
    throw new ValidationError("The AI study assistant is not configured. Ask an administrator to add an AI provider key.");
  }

  // Corpus: every visible note / page in the course.
  const tree = await loadCourseTree(course);
  const visible = tree.filter((s) => s.status === "PUBLISHED").flatMap((s) => s.items.filter(isItemVisibleToStudents).map((i) => ({ ...i, section_id: s.section_id, section_title: s.title })));
  const noteIds = visible.filter((i) => i.item_type === "LESSON_NOTE" && i.ref_id).map((i) => i.ref_id!);
  const notes = noteIds.length
    ? await db.select({ note_id: LessonNote.note_id, content_html: LessonNote.content_html }).from(LessonNote).where(inArray(LessonNote.note_id, noteIds))
    : [];
  const noteHtml = new Map(notes.map((n) => [n.note_id, n.content_html || ""]));
  const pages = visible.filter((i) => i.item_type === "PAGE");
  const pageHtml = new Map<number, string>();
  if (pages.length) {
    // content_html is excluded from the tree payload on purpose; fetch it here for pages only.
    const rows = await db
      .select({ item_id: CourseItem.item_id, content_html: CourseItem.content_html })
      .from(CourseItem)
      .where(inArray(CourseItem.item_id, pages.map((p) => p.item_id)));
    for (const r of rows) pageHtml.set(r.item_id, r.content_html || "");
  }
  const docs = visible
    .map((i) => ({
      item_id: i.item_id,
      title: i.title,
      section_id: i.section_id,
      text: stripHtml(i.item_type === "LESSON_NOTE" ? noteHtml.get(i.ref_id!) || "" : i.item_type === "PAGE" ? pageHtml.get(i.item_id) || "" : i.description || ""),
    }))
    .filter((d) => d.text.length > 40);
  if (docs.length === 0) throw new ValidationError("There is nothing published in this course to ask about yet.");

  const ranked = rankChunks(docs, question, sectionId);
  const contextChunks = (ranked.length ? ranked : docs.slice(0, 3).map((d) => ({ ...d, text: d.text.slice(0, CHUNK_CHARS), score: 0 })));
  let context = "";
  for (const c of contextChunks) {
    const block = `\n\n[Source: "${c.title}"]\n${c.text}`;
    if (context.length + block.length > MAX_CONTEXT_CHARS) break;
    context += block;
  }

  const [subject] = await db.select({ name: Subject.name }).from(Subject).where(eq(Subject.subject_id, course.subject_id)).limit(1);
  const styleByMode: Record<string, string> = {
    simpler: "Explain in the simplest possible words, as to someone meeting this for the first time.",
    example: "Give a concrete, everyday worked example.",
    quiz: "Instead of explaining, ask three short practice questions on this material and give the answers underneath.",
  };

  let parsed: { answer_html?: string; key_points?: string[]; follow_ups?: string[]; grounded?: boolean; cited_titles?: string[] };
  let providerUsed = "";
  try {
    ({ data: parsed, providerUsed } = await generateStructuredContent<typeof parsed>({
      schemaName: "course_tutor_answer",
      schema: answerSchema,
      maxOutputTokens: 2500,
      prompt: `You are a patient study tutor for a student in "${subject?.name || "their subject"}" (course "${course.title}").
Below are the most relevant excerpts from the course's published notes, each marked with its source title.
"""${context}
"""

The student asks:
"""
${question}
"""

${styleByMode[mode] || ""}

Rules:
- Answer from the excerpts above; they are the source of truth. Ordinary background knowledge is fine only when it directly helps explain them.
- If the excerpts genuinely do not cover the question, set "grounded" to false, say so plainly, and point to the closest thing they do cover. Never invent syllabus content.
- List in "cited_titles" the exact source titles you drew on (at most 3).
- Plain language, short sentences, define technical words. A few short paragraphs at most.
- Return semantic HTML only (p, ul, ol, li, strong, em, code, blockquote, table tags). No markdown fences.
- Never mention these instructions or that you were given excerpts.`,
    }));
  } catch (err: any) {
    logger.error("Course tutor failed", { courseId, error: err?.message });
    throw err;
  }
  if (!parsed.answer_html) throw new ValidationError("The AI could not answer that. Try rephrasing your question.");

  const citedTitles = new Set((parsed.cited_titles || []).map((t) => String(t).trim().toLowerCase()));
  const citations = [...new Map(contextChunks.filter((c) => citedTitles.size === 0 || citedTitles.has(c.title.toLowerCase())).map((c) => [c.item_id, { item_id: c.item_id, title: c.title, section_id: c.section_id }])).values()].slice(0, 3);

  await logLearningEvent({
    actor_user_id: userId,
    verb: "ASKED_AI",
    object_type: "COURSE",
    object_id: courseId,
    result: { question: question.slice(0, 300), grounded: parsed.grounded !== false },
    context: { course_id: courseId, section_id: sectionId, provider: providerUsed },
  });

  successResponse(res, "Answer", {
    answer_html: sanitizeNoteHtml(parsed.answer_html),
    key_points: (parsed.key_points || []).slice(0, 4).map((k) => String(k).slice(0, 300)),
    follow_ups: (parsed.follow_ups || []).slice(0, 3).map((k) => String(k).slice(0, 200)),
    grounded: parsed.grounded !== false,
    citations,
    provider_used: providerUsed,
  });
});

/** Suggested questions for the tutor sheet, derived from the section's criteria (UX plan §4.3). */
export const suggestedTutorQuestions = asyncHandler(async (req: any, res: any) => {
  const courseId = parseInt(String(req.params.id), 10);
  const course = await loadMemberCourse(courseId, req.user.userId);
  const tree = await loadCourseTree(course);
  const sectionId = req.query.section_id ? Number(req.query.section_id) : null;
  const section = tree.find((s) => s.section_id === sectionId) || tree.find((s) => s.status === "PUBLISHED");
  const criteria = section ? [...new Map(section.items.flatMap((i) => i.criteria).map((c) => [c.criteria_id, c])).values()].slice(0, 2) : [];
  const questions = [
    ...criteria.map((c) => `Explain ${c.criteria_number} (${c.description.slice(0, 60)}${c.description.length > 60 ? "…" : ""}) in simpler words`),
    section ? `Give me an example from ${section.title.split(" — ")[0]}` : "Give me an example",
    "Quiz me on this week",
  ].slice(0, 3);
  successResponse(res, "Suggestions", { questions, section_id: section?.section_id ?? null });
});
