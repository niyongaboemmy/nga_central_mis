import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  COURSE_ITEM_TYPES,
  CourseGenerationRun,
  CourseGenerationTask,
  CourseItem,
  CourseItemCriteria,
  CourseSection,
  LessonNote,
  LessonNoteCriteria,
  LessonNoteShare,
} from "../../../db/schema";
import { generateStructuredContent, orderedProviders, quotaSnapshot, roleOrder } from "../../aiProviders";
import { loadCourse, CourseRow } from "../courseMembership";
import { loadCourseTree } from "../courseTree";
import { coverageOfSection } from "../courseCoverage";
import { Blueprint, needsCoreLesson } from "./blueprint";
import { buildWeekContextPack, WeekContextPack } from "./contextPack";
import { htmlToPlainText, sha256 } from "./text";
import { assembleLesson, coreLessonMaxTokens, coreLessonPrompt, coreLessonSchema, CoreLessonOutput, CORE_LESSON_PROMPT_VERSION } from "./artifacts/coreLesson";
import {
  applyVerification,
  AssessmentOutput,
  assessmentPrompt,
  assessmentSchema,
  ASSESSMENT_PROMPT_VERSION,
  cleanQuestions,
  CleanQuestion,
  verifyPrompt,
  verifySchema,
  VerifyIssue,
} from "./artifacts/assessmentPack";

export type ArtifactKind = "REUSE_PLACEMENT" | "CORE_LESSON" | "ASSESSMENT_PACK";
export const ARTIFACT_ORDER: ArtifactKind[] = ["REUSE_PLACEMENT", "CORE_LESSON", "ASSESSMENT_PACK"];

export type TaskRow = typeof CourseGenerationTask.$inferSelect;
export type RunRow = typeof CourseGenerationRun.$inferSelect;

export interface TaskOutcome {
  status: "SUCCEEDED" | "SKIPPED";
  skip_reason?: string;
  provider_used?: string | null;
  model?: string | null;
  input_hash?: string | null;
  output_ref?: { note_id?: number; item_ids: number[] } | null;
  output_digest?: Record<string, unknown> | null;
}

/** Thrown for output that is unusable (empty lesson, too few valid questions) — retried. */
export class GenerationOutputError extends Error {}

const itemTypeAvailable = (t: string) => (COURSE_ITEM_TYPES as readonly string[]).includes(t);

interface ExecContext {
  task: TaskRow;
  run: RunRow;
  course: CourseRow;
  blueprint: Blueprint;
  /** A person is waiting (preview / single week / regenerate) → interactive quota. */
  bulk: boolean;
  /** The week was already done: draft afresh (never "covered" / "unchanged"). */
  updating?: boolean;
}

const UPDATE_INSTRUCTION =
  "This week already has approved content (it is among the sources). Write a refreshed, improved version: keep what works, fix anything weak or missing, and use new examples.";

/** Was this week chosen to be updated (it was already done when the run was planned)? */
const isUpdateWeek = (run: RunRow, sectionId: number) =>
  (((run.estimate as any)?.update_section_ids as number[] | undefined) ?? []).includes(sectionId);

export async function executeTask(task: TaskRow, run: RunRow): Promise<TaskOutcome> {
  const course = await loadCourse(run.course_id);
  const updating = isUpdateWeek(run, task.section_id);
  const bp = run.blueprint as Blueprint;
  const ctx: ExecContext = {
    task,
    run,
    course,
    blueprint: updating ? { ...bp, instructions: [bp.instructions, UPDATE_INSTRUCTION].filter(Boolean).join("\n") } : bp,
    bulk: run.mode === "FULL",
    updating,
  };
  switch (task.kind as ArtifactKind) {
    case "REUSE_PLACEMENT":
      return reusePlacement(ctx);
    case "CORE_LESSON":
      return withReplaces(ctx, "CORE_LESSON", await coreLesson(ctx));
    case "ASSESSMENT_PACK":
      return withReplaces(ctx, "ASSESSMENT_PACK", await assessmentPack(ctx));
    default:
      throw new Error(`Unknown artifact kind ${task.kind}`);
  }
}

/**
 * An update's new drafts say which current items they replace (same week, same artifact,
 * same item type, already approved). Approving a draft retires those (review.ts) — they
 * are unpublished, never deleted, so students' progress and submissions on them are kept.
 */
async function withReplaces(ctx: ExecContext, kind: ArtifactKind, outcome: TaskOutcome): Promise<TaskOutcome> {
  const newIds = ((outcome.output_ref as any)?.item_ids as number[] | undefined) ?? [];
  if (!ctx.updating || outcome.status !== "SUCCEEDED" || newIds.length === 0) return outcome;
  const current = (await pendingDraftsOfKind(ctx.task.section_id, kind)).filter(
    (d) => !newIds.includes(d.item_id) && (d.review_state === "ACCEPTED" || d.review_state === "EDITED"),
  );
  if (current.length === 0) return outcome;
  const fresh = await db
    .select({ item_id: CourseItem.item_id, item_type: CourseItem.item_type, source_refs: CourseItem.source_refs, review_flags: CourseItem.review_flags })
    .from(CourseItem)
    .where(inArray(CourseItem.item_id, newIds));
  for (const item of fresh) {
    const replaces = current.filter((c) => c.item_type === item.item_type).map((c) => c.item_id);
    if (replaces.length === 0) continue;
    const flags = Array.isArray(item.review_flags) ? (item.review_flags as any[]) : [];
    await db
      .update(CourseItem)
      .set({
        source_refs: { ...((item.source_refs as object) || {}), replaces },
        review_flags: [...flags, { kind: "UPDATE", note: "An updated version: approving it takes the current one off the course. Students' past work on it is kept." }],
      })
      .where(eq(CourseItem.item_id, item.item_id));
  }
  return outcome;
}

async function sectionState(course: CourseRow, sectionId: number) {
  const tree = await loadCourseTree(course);
  const section = tree.find((s) => s.section_id === sectionId);
  if (!section) throw new GenerationOutputError("This week no longer exists in the course");
  return { section, coverage: coverageOfSection(section) };
}

const nextPosition = async (sectionId: number) => {
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseItem.position}), -1)` })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, sectionId));
  return Number(max) + 1;
};

/** Placing a note shares it with the class group (same rule as the builder), never revoked. */
async function ensureClassGroupShare(noteId: number, classGroupId: number, sharedBy: number) {
  const shares = await db
    .select({ filter_type: LessonNoteShare.filter_type, filter_ids: LessonNoteShare.filter_ids })
    .from(LessonNoteShare)
    .where(eq(LessonNoteShare.note_id, noteId));
  if (shares.some((s) => s.filter_type === "class_group" && ((s.filter_ids as number[]) || []).includes(classGroupId))) return;
  await db.insert(LessonNoteShare).values({ note_id: noteId, shared_by: sharedBy, filter_type: "class_group", filter_ids: [classGroupId], permission: "VIEW" });
}

/** Drafts this engine made earlier for the same week and artifact that nobody has touched. */
async function pendingDraftsOfKind(sectionId: number, kind: ArtifactKind) {
  return db
    .select({ item_id: CourseItem.item_id, item_type: CourseItem.item_type, ref_id: CourseItem.ref_id, input_hash: CourseItem.input_hash, review_state: CourseItem.review_state })
    .from(CourseItem)
    .innerJoin(CourseGenerationTask, eq(CourseGenerationTask.task_id, CourseItem.generation_task_id))
    .where(and(eq(CourseItem.section_id, sectionId), eq(CourseGenerationTask.kind, kind), ne(CourseItem.review_state, "DISMISSED")));
}

/**
 * Removes earlier untouched drafts of the same artifact before a new one lands (§8.6:
 * regenerate replaces a draft only while it is still PENDING_REVIEW). AI notes go with
 * their item unless they were placed somewhere else.
 */
async function removePendingDrafts(sectionId: number, kind: ArtifactKind) {
  const drafts = (await pendingDraftsOfKind(sectionId, kind)).filter((d) => d.review_state === "PENDING_REVIEW");
  if (drafts.length === 0) return;
  await db.delete(CourseItem).where(inArray(CourseItem.item_id, drafts.map((d) => d.item_id)));
  const noteIds = drafts.filter((d) => d.item_type === "LESSON_NOTE" && d.ref_id).map((d) => d.ref_id as number);
  await deleteOrphanAINotes(noteIds);
}

export async function deleteOrphanAINotes(noteIds: number[]) {
  if (noteIds.length === 0) return;
  const stillPlaced = await db
    .select({ ref_id: CourseItem.ref_id })
    .from(CourseItem)
    .where(and(eq(CourseItem.item_type, "LESSON_NOTE"), inArray(CourseItem.ref_id, noteIds)));
  const keep = new Set(stillPlaced.map((r) => r.ref_id));
  const removable = noteIds.filter((id) => !keep.has(id));
  if (removable.length === 0) return;
  await db
    .delete(LessonNote)
    .where(and(inArray(LessonNote.note_id, removable), eq(LessonNote.source, "AI_GENERATED"), eq(LessonNote.status, "DRAFT")));
}

async function packFor(ctx: ExecContext): Promise<WeekContextPack> {
  const pack = await buildWeekContextPack(ctx.task.section_id, {
    sources: ctx.blueprint.sources,
    extraAssetIds: ctx.blueprint.extra_asset_ids,
    teacherUserId: ctx.run.created_by,
    subjectId: ctx.course.subject_id,
    classGroupId: ctx.course.class_group_id,
  });
  if (!pack) throw new GenerationOutputError("This week no longer exists in the course");
  return pack;
}

const hasCurriculum = (pack: WeekContextPack) => !!(pack.week.topic && pack.week.topic.trim()) || pack.week.criteria.length > 0;

const aiOptions = (ctx: ExecContext, feature: string) => ({
  bulk: ctx.bulk,
  feature,
  actorUserId: ctx.run.created_by,
  courseId: ctx.course.course_id,
  runId: ctx.run.run_id,
});

// ------------------------------------------------------------------ REUSE_PLACEMENT

/**
 * Reuse before generate (principle 1): places the teacher's own notes that cover this week's
 * gap criteria — greedy, most gaps first, same rule as "Build it for me" — as drafts for review.
 */
// Placement reads "which notes are already in the course" and then writes; two weeks doing
// that at once would both place the same note. One placement per course at a time (there is
// one backend process, so an in-memory chain is enough).
const placementLocks = new Map<number, Promise<unknown>>();
function withCourseLock<T>(courseId: number, fn: () => Promise<T>): Promise<T> {
  const previous = placementLocks.get(courseId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  placementLocks.set(courseId, next);
  return next.finally(() => {
    if (placementLocks.get(courseId) === next) placementLocks.delete(courseId);
  });
}

async function reusePlacement(ctx: ExecContext): Promise<TaskOutcome> {
  if (!ctx.blueprint.reuse_existing_notes) return { status: "SKIPPED", skip_reason: "REUSE_OFF" };
  return withCourseLock(ctx.course.course_id, () => placeExistingNotes(ctx));
}

async function placeExistingNotes(ctx: ExecContext): Promise<TaskOutcome> {
  const { section, coverage } = await sectionState(ctx.course, ctx.task.section_id);
  if (coverage.gaps.length === 0) return { status: "SKIPPED", skip_reason: "NO_GAPS" };
  const gapIds = coverage.gaps.map((g) => g.criteria_id);
  const candidates = await db
    .select({ note_id: LessonNote.note_id, title: LessonNote.title, user_id: LessonNote.user_id, class_group_id: LessonNote.class_group_id, criteria_id: LessonNoteCriteria.criteria_id })
    .from(LessonNoteCriteria)
    .innerJoin(LessonNote, eq(LessonNote.note_id, LessonNoteCriteria.note_id))
    .where(
      and(
        inArray(LessonNoteCriteria.criteria_id, gapIds),
        eq(LessonNote.subject_id, ctx.course.subject_id),
        // An AI draft nobody approved is not "the teacher's existing note".
        or(ne(LessonNote.source, "AI_GENERATED"), eq(LessonNote.status, "PUBLISHED")),
      ),
    );
  // A note already used anywhere in the course is not placed again (same rule as seeding).
  const placed = new Set(
    (await db
      .select({ ref_id: CourseItem.ref_id })
      .from(CourseItem)
      .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
      .where(and(eq(CourseSection.course_id, ctx.course.course_id), eq(CourseItem.item_type, "LESSON_NOTE")))).map((r) => r.ref_id),
  );
  void section;
  const byNote = new Map<number, { title: string; criteria: Set<number> }>();
  for (const c of candidates) {
    if (c.user_id !== ctx.run.created_by && c.class_group_id !== ctx.course.class_group_id) continue;
    if (placed.has(c.note_id)) continue;
    if (!byNote.has(c.note_id)) byNote.set(c.note_id, { title: c.title, criteria: new Set() });
    byNote.get(c.note_id)!.criteria.add(c.criteria_id);
  }
  const open = new Set(gapIds);
  let position = await nextPosition(ctx.task.section_id);
  const itemIds: number[] = [];
  const titles: string[] = [];
  while (open.size > 0) {
    let best: [number, { title: string; criteria: Set<number> }] | null = null;
    let bestGain = 0;
    for (const entry of byNote) {
      const gain = [...entry[1].criteria].filter((c) => open.has(c)).length;
      if (gain > bestGain) {
        bestGain = gain;
        best = entry;
      }
    }
    if (!best) break;
    const [ins] = (await db.insert(CourseItem).values({
      section_id: ctx.task.section_id,
      item_type: "LESSON_NOTE",
      ref_id: best[0],
      title: best[1].title.slice(0, 255),
      position: position++,
      completion_rule: "VIEW",
      is_published: 0,
      review_state: "PENDING_REVIEW",
      ai_origin: "NONE",
      generation_task_id: ctx.task.task_id,
      created_by: ctx.run.created_by,
    })) as any;
    itemIds.push(ins.insertId);
    titles.push(best[1].title);
    await ensureClassGroupShare(best[0], ctx.course.class_group_id, ctx.run.created_by);
    [...best[1].criteria].forEach((c) => open.delete(c));
    byNote.delete(best[0]);
  }
  if (itemIds.length === 0) return { status: "SKIPPED", skip_reason: "NOTHING_TO_PLACE" };
  return { status: "SUCCEEDED", output_ref: { item_ids: itemIds }, output_digest: { placed: itemIds.length, titles, still_missing: open.size } };
}

// ------------------------------------------------------------------ CORE_LESSON

async function coreLesson(ctx: ExecContext): Promise<TaskOutcome> {
  const bp = ctx.blueprint;
  if (!needsCoreLesson(bp)) return { status: "SKIPPED", skip_reason: "NOT_IN_RECIPE" };
  const pack = await packFor(ctx);
  if (!hasCurriculum(pack)) return { status: "SKIPPED", skip_reason: "NO_CURRICULUM" };

  if (!ctx.updating && bp.reuse_existing_notes && !bp.practical_task.enabled) {
    const { section, coverage } = await sectionState(ctx.course, ctx.task.section_id);
    const teacherLesson = section.items.some((i) => i.item_type === "LESSON_NOTE" && i.ai_origin === "NONE");
    if (coverage.targets.length > 0 && coverage.gaps.length === 0 && teacherLesson) {
      return { status: "SKIPPED", skip_reason: "COVERED_BY_EXISTING" };
    }
  }

  const inputHash = sha256([CORE_LESSON_PROMPT_VERSION, pack.hash, bp.lesson, bp.practical_task, bp.style, bp.instructions]);
  const existing = await pendingDraftsOfKind(ctx.task.section_id, "CORE_LESSON");
  // An update never counts the approved version as "unchanged" — only a pending redo does.
  const same = existing.filter((d) => d.input_hash === inputHash && (!ctx.updating || d.review_state === "PENDING_REVIEW"));
  if (same.length > 0) {
    return { status: "SKIPPED", skip_reason: "UNCHANGED", input_hash: inputHash, output_ref: { item_ids: same.map((d) => d.item_id), note_id: same.find((d) => d.item_type === "LESSON_NOTE")?.ref_id ?? undefined } };
  }

  const { data, providerUsed, model } = await generateStructuredContent<CoreLessonOutput>(
    {
      schemaName: "elearning_core_lesson",
      schema: coreLessonSchema(bp),
      prompt: coreLessonPrompt(pack, bp),
      maxOutputTokens: coreLessonMaxTokens(bp),
      disableThinking: true,
    },
    { role: "draft", ...aiOptions(ctx, "elearning.core_lesson") },
  );
  const lesson = assembleLesson(data, pack, bp);
  if (bp.lesson.enabled && htmlToPlainText(lesson.html).length < 200) throw new GenerationOutputError("The AI returned an empty lesson");
  if (!bp.lesson.enabled && !lesson.practical) throw new GenerationOutputError("The AI returned no practical task");

  await removePendingDrafts(ctx.task.section_id, "CORE_LESSON");
  const weekCriteria = pack.week.criteria;
  const coveredIds = weekCriteria.filter((c) => lesson.covered_criteria.includes(c.criteria_number)).map((c) => c.criteria_id);
  const sourceList = pack.sources.map((s) => ({ ref: s.ref, kind: s.kind, id: s.id, title: s.title }));
  const flags = lesson.flags;
  let position = await nextPosition(ctx.task.section_id);
  const itemIds: number[] = [];
  let noteId: number | undefined;

  if (bp.lesson.enabled) {
    const [noteIns] = (await db.insert(LessonNote).values({
      user_id: ctx.run.created_by,
      subject_id: ctx.course.subject_id,
      class_group_id: ctx.course.class_group_id,
      scheme_entry_id: pack.week.entry_id,
      academic_term_id: ctx.course.academic_term_id,
      title: lesson.title,
      content_html: lesson.html,
      content_json: null,
      status: "DRAFT",
      source: "AI_GENERATED",
    })) as any;
    noteId = noteIns.insertId as number;
    const criteriaIds = coveredIds.length ? coveredIds : weekCriteria.map((c) => c.criteria_id);
    if (criteriaIds.length) await db.insert(LessonNoteCriteria).values(criteriaIds.map((criteria_id) => ({ note_id: noteId!, criteria_id })));
    const [itemIns] = (await db.insert(CourseItem).values({
      section_id: ctx.task.section_id,
      item_type: "LESSON_NOTE",
      ref_id: noteId,
      title: lesson.title,
      position: position++,
      completion_rule: "VIEW",
      is_published: 0,
      ai_origin: "AI_GENERATED",
      review_state: "PENDING_REVIEW",
      generation_task_id: ctx.task.task_id,
      input_hash: inputHash,
      source_refs: { sources: sourceList, sections: lesson.citations, key_terms: lesson.key_terms },
      review_flags: flags,
      created_by: ctx.run.created_by,
    })) as any;
    itemIds.push(itemIns.insertId);
    await ensureClassGroupShare(noteId, ctx.course.class_group_id, ctx.run.created_by);
  }

  if (lesson.practical) {
    // A real PRACTICAL_TASK (photo evidence + teacher sign-off) once migration 098 is in;
    // a plain page otherwise.
    const asTask = itemTypeAvailable("PRACTICAL_TASK") && lesson.practical.checklist.length > 0;
    const [pIns] = (await db.insert(CourseItem).values({
      section_id: ctx.task.section_id,
      item_type: (asTask ? "PRACTICAL_TASK" : "PAGE") as any,
      title: `Practical: ${lesson.practical.title}`.slice(0, 255),
      content_html: asTask ? lesson.practical.brief_html : lesson.practical.html,
      content_json: asTask ? { checklist: lesson.practical.checklist, max_photos: 3 } : null,
      position: position++,
      completion_rule: asTask ? "SUBMIT" : "MARK_DONE",
      is_published: 0,
      ai_origin: "AI_GENERATED",
      review_state: "PENDING_REVIEW",
      generation_task_id: ctx.task.task_id,
      input_hash: inputHash,
      source_refs: { sources: sourceList, sections: [{ heading: lesson.practical.title, refs: lesson.practical.refs }] },
      review_flags: [],
      created_by: ctx.run.created_by,
    })) as any;
    itemIds.push(pIns.insertId);
    const pCriteria = weekCriteria.filter((c) => lesson.practical!.criteria.includes(c.criteria_number)).map((c) => c.criteria_id);
    const ids = pCriteria.length ? pCriteria : weekCriteria.map((c) => c.criteria_id);
    if (ids.length) await db.insert(CourseItemCriteria).values(ids.map((criteria_id) => ({ item_id: pIns.insertId, criteria_id })));
  }

  const words = htmlToPlainText(lesson.html).split(/\s+/).filter(Boolean).length;
  return {
    status: "SUCCEEDED",
    provider_used: providerUsed,
    model: model ?? null,
    input_hash: inputHash,
    output_ref: { note_id: noteId, item_ids: itemIds },
    output_digest: {
      title: lesson.title,
      words,
      sections: lesson.citations.length,
      interactions: (lesson.html.match(/data-type="(reveal|inline-check|activity)"/g) || []).length,
      practical: !!lesson.practical,
      covered: lesson.covered_criteria,
      flags: flags.length,
    },
  };
}

// ------------------------------------------------------------------ ASSESSMENT_PACK

/** The week's lesson text (the draft just written, or the teacher's note) to ground questions on. */
async function lessonTextFor(sectionId: number): Promise<{ text: string | null; hash: string | null }> {
  const notes = await db
    .select({ note_id: LessonNote.note_id, content_html: LessonNote.content_html, ai_origin: CourseItem.ai_origin, review_state: CourseItem.review_state })
    .from(CourseItem)
    .innerJoin(LessonNote, eq(LessonNote.note_id, CourseItem.ref_id))
    .where(and(eq(CourseItem.section_id, sectionId), eq(CourseItem.item_type, "LESSON_NOTE"), ne(CourseItem.review_state, "DISMISSED"), isNotNull(LessonNote.content_html)));
  if (notes.length === 0) return { text: null, hash: null };
  // Prefer the Studio's lesson (AI draft or accepted), then the teacher's.
  notes.sort((a, b) => Number(b.ai_origin !== "NONE") - Number(a.ai_origin !== "NONE"));
  const text = htmlToPlainText(notes[0].content_html || "");
  return { text: text.length > 100 ? text : null, hash: sha256(text) };
}

/** Low quota → skip the AI cross-check (§7.5) unless the recipe asks for strict accuracy. */
async function verifierQuotaLow(exclude: string): Promise<boolean> {
  const configured = orderedProviders(roleOrder("verify")).filter((p) => p.isConfigured() && p.name !== exclude).map((p) => p.name);
  if (configured.length === 0) return true;
  const snap = await quotaSnapshot(configured);
  if (snap.some((s) => s.daily_limit === null)) return false;
  return snap.every((s) => (s.bulk_remaining ?? 0) < Math.ceil((s.daily_limit ?? 0) * 0.2));
}

const KC_TITLE = (pack: WeekContextPack) => `${pack.week.week_number || "Week"} check: ${pack.week.topic || pack.week.section_title}`.slice(0, 255);

async function assessmentPack(ctx: ExecContext): Promise<TaskOutcome> {
  const bp = ctx.blueprint;
  const pack = await packFor(ctx);
  if (!hasCurriculum(pack)) return { status: "SKIPPED", skip_reason: "NO_CURRICULUM" };
  const lesson = await lessonTextFor(ctx.task.section_id);
  const inputHash = sha256([ASSESSMENT_PROMPT_VERSION, pack.hash, lesson.hash, bp.knowledge_check, bp.flashcards, bp.exit_ticket, bp.video_slot, bp.style, bp.instructions]);
  const existing = await pendingDraftsOfKind(ctx.task.section_id, "ASSESSMENT_PACK");
  const same = existing.filter((d) => d.input_hash === inputHash && (!ctx.updating || d.review_state === "PENDING_REVIEW"));
  if (same.length > 0) return { status: "SKIPPED", skip_reason: "UNCHANGED", input_hash: inputHash, output_ref: { item_ids: same.map((d) => d.item_id) } };

  const { data, providerUsed, model } = await generateStructuredContent<AssessmentOutput>(
    { schemaName: "elearning_assessment_pack", schema: assessmentSchema(bp), prompt: assessmentPrompt(pack, bp, lesson.text), maxOutputTokens: 6000, disableThinking: true },
    { role: "assess", ...aiOptions(ctx, "elearning.assessment_pack") },
  );

  const flags: { kind: string; target_id?: string; note: string }[] = [];
  let kc: CleanQuestion[] = [];
  if (bp.knowledge_check.enabled) {
    const cleaned = cleanQuestions(data.knowledge_check, pack, "q", bp.knowledge_check.questions);
    kc = cleaned.questions;
    if (kc.length < Math.min(3, bp.knowledge_check.questions)) throw new GenerationOutputError("The AI returned too few valid questions");
    if (cleaned.dropped) flags.push({ kind: "DROPPED_INVALID", note: `${cleaned.dropped} malformed question(s) were removed.` });
  }
  const exit = bp.exit_ticket.enabled ? cleanQuestions(data.exit_ticket, pack, "e", bp.exit_ticket.questions).questions : [];

  // Second opinion from a different provider on the answer keys (§7.5).
  let verifiedBy: string | null = null;
  const toVerify = [...kc, ...exit];
  if (toVerify.length) {
    const low = !bp.style.strict_accuracy && (await verifierQuotaLow(providerUsed));
    if (low) flags.push({ kind: "NOT_CROSS_CHECKED", note: "Answers were not double-checked by a second AI (free quota is low today). Please check the answers." });
    else {
      try {
        const v = await generateStructuredContent<{ issues: VerifyIssue[] }>(
          { schemaName: "elearning_verify_questions", schema: verifySchema, prompt: verifyPrompt(pack, toVerify, lesson.text), maxOutputTokens: 2500, disableThinking: true },
          { role: "verify", excludeProviders: [providerUsed], ...aiOptions(ctx, "elearning.verify") },
        );
        verifiedBy = v.providerUsed;
        const kcResult = applyVerification(kc, v.data.issues, Math.min(3, bp.knowledge_check.questions));
        const exitResult = applyVerification(exit, v.data.issues, 1);
        kc = kcResult.questions;
        flags.push(...kcResult.flags, ...exitResult.flags);
      } catch {
        // A failed or quota-blocked check never blocks the week; the teacher is told instead.
        flags.push({ kind: "NOT_CROSS_CHECKED", note: "Answers could not be double-checked by a second AI. Please check the answers." });
      }
    }
  }

  await removePendingDrafts(ctx.task.section_id, "ASSESSMENT_PACK");
  const weekCriteria = pack.week.criteria;
  const sourceList = pack.sources.map((s) => ({ ref: s.ref, kind: s.kind, id: s.id, title: s.title }));
  let position = await nextPosition(ctx.task.section_id);
  const itemIds: number[] = [];
  const common = {
    section_id: ctx.task.section_id,
    is_published: 0,
    ai_origin: "AI_GENERATED" as const,
    review_state: "PENDING_REVIEW" as const,
    generation_task_id: ctx.task.task_id,
    input_hash: inputHash,
    created_by: ctx.run.created_by,
  };
  const criteriaIdsFor = (qs: CleanQuestion[]) => {
    const nums = new Set(qs.map((q) => q.criteria).filter(Boolean) as string[]);
    const ids = weekCriteria.filter((c) => nums.has(c.criteria_number)).map((c) => c.criteria_id);
    return ids.length ? ids : weekCriteria.map((c) => c.criteria_id);
  };
  const stripQuestion = ({ criteria: _c, source_refs: _r, ...q }: CleanQuestion) => q;

  if (bp.video_slot.enabled && (data.video_watch_for?.length || data.video_search_terms)) {
    // The card already says "As you watch, look for:" — drop the model's own lead-in.
    const watchFor = (data.video_watch_for ?? [])
      .map((w) => String(w).trim().replace(/^as you watch,?\s*(look for|identify|notice|observe|see)?\s*/i, ""))
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .filter(Boolean)
      .slice(0, 5);
    const [ins] = (await db.insert(CourseItem).values({
      ...common,
      item_type: "VIDEO",
      title: `Video: ${pack.week.topic || pack.week.section_title}`.slice(0, 255),
      description: watchFor.length ? `As you watch, look for:\n${watchFor.map((w) => `• ${w}`).join("\n")}` : null,
      content_json: { placeholder: true, watch_for: watchFor, search_terms: String(data.video_search_terms || pack.week.topic || "").slice(0, 200) },
      position: position++,
      completion_rule: "VIEW",
      review_flags: [{ kind: "NEEDS_LINK", note: "Paste a YouTube or Vimeo link before approving this video." }],
      source_refs: { sources: sourceList },
    })) as any;
    itemIds.push(ins.insertId);
  }

  if (kc.length) {
    const [ins] = (await db.insert(CourseItem).values({
      ...common,
      item_type: "KNOWLEDGE_CHECK",
      title: KC_TITLE(pack),
      content_json: { questions: kc.map(stripQuestion) },
      position: position++,
      completion_rule: "MIN_SCORE",
      min_score_pct: 60,
      review_flags: flags,
      source_refs: { sources: sourceList, questions: Object.fromEntries(kc.map((q) => [q.id, { refs: q.source_refs, criteria: q.criteria }])), verified_by: verifiedBy },
    })) as any;
    itemIds.push(ins.insertId);
    const ids = criteriaIdsFor(kc);
    if (ids.length) await db.insert(CourseItemCriteria).values(ids.map((criteria_id) => ({ item_id: ins.insertId, criteria_id })));
  }

  if (exit.length && itemTypeAvailable("EXIT_TICKET")) {
    const [ins] = (await db.insert(CourseItem).values({
      ...common,
      item_type: "EXIT_TICKET" as any,
      title: `${pack.week.week_number || "Week"} exit ticket`.slice(0, 255),
      content_json: { questions: exit.map(stripQuestion), ask_confidence: true },
      position: position++,
      // Answering completes it; formative, so mastery ignores it (courseMastery.ts).
      completion_rule: "SUBMIT",
      review_flags: [],
      source_refs: { sources: sourceList },
    })) as any;
    itemIds.push(ins.insertId);
    const ids = criteriaIdsFor(exit);
    if (ids.length) await db.insert(CourseItemCriteria).values(ids.map((criteria_id) => ({ item_id: ins.insertId, criteria_id })));
  }

  const cards = (data.flashcards ?? [])
    .filter((c) => c?.front && c?.back)
    .slice(0, bp.flashcards.cards)
    .map((c, i) => ({ id: `c${i + 1}`, front: String(c.front).slice(0, 200), back: String(c.back).slice(0, 600), ...(c.gloss_rw ? { gloss_rw: String(c.gloss_rw).slice(0, 120) } : {}) }));
  if (bp.flashcards.enabled && cards.length >= 3 && itemTypeAvailable("FLASHCARDS")) {
    const [ins] = (await db.insert(CourseItem).values({
      ...common,
      item_type: "FLASHCARDS" as any,
      title: `${pack.week.week_number || "Week"} key terms`.slice(0, 255),
      content_json: { cards },
      position: position++,
      completion_rule: "SUBMIT",
      review_flags: [],
      source_refs: { sources: sourceList },
    })) as any;
    itemIds.push(ins.insertId);
  }

  if (itemIds.length === 0) throw new GenerationOutputError("The AI returned nothing usable for this week");
  return {
    status: "SUCCEEDED",
    provider_used: providerUsed,
    model: model ?? null,
    input_hash: inputHash,
    output_ref: { item_ids: itemIds },
    output_digest: { questions: kc.length, exit_ticket: exit.length, flashcards: cards.length, video: bp.video_slot.enabled, verified_by: verifiedBy, flags: flags.length },
  };
}
