import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../../db";
import { CourseGenerationRun, CourseGenerationTask, CourseItem, CourseSection, LessonNote } from "../../../db/schema";
import { NotFoundError, ValidationError } from "../../../errors/CustomError";
import { recordActivity } from "../../../utils/activityLogger";
import { isPublishable } from "../../../controllers/lessonNoteController";
import { CourseRow } from "../courseMembership";
import { notifySectionPublished } from "../courseNotifications";
import { deleteOrphanAINotes, ArtifactKind } from "./execute";
import { Blueprint, normaliseBlueprint } from "./blueprint";
import { createRun } from "./planner";

/**
 * Teacher review of Studio drafts (LESSON_STUDIO plan §8.6). Nothing the engine makes is
 * visible to students until it passes through approveSectionDrafts.
 */

const DRAFT_STATES = ["PENDING_REVIEW", "EDITED"] as const;

const isVideoPlaceholder = (item: { item_type: string; external_url: string | null; content_json: unknown }) =>
  item.item_type === "VIDEO" && !item.external_url;

export async function approveSectionDrafts(
  course: CourseRow,
  sectionId: number,
  userId: number,
  opts: { itemIds?: number[]; publishSection?: boolean } = {},
) {
  const [section] = await db.select().from(CourseSection).where(and(eq(CourseSection.section_id, sectionId), eq(CourseSection.course_id, course.course_id))).limit(1);
  if (!section) throw new NotFoundError("Week not found");
  let drafts = await db
    .select()
    .from(CourseItem)
    .where(and(eq(CourseItem.section_id, sectionId), inArray(CourseItem.review_state, [...DRAFT_STATES])));
  if (opts.itemIds?.length) drafts = drafts.filter((d) => opts.itemIds!.includes(d.item_id));

  const approved: number[] = [];
  const retired: number[] = [];
  const needsAttention: { item_id: number; title: string; reason: string }[] = [];
  for (const item of drafts) {
    if (isVideoPlaceholder(item)) {
      needsAttention.push({ item_id: item.item_id, title: item.title, reason: "Add a YouTube or Vimeo link first." });
      continue;
    }
    if (item.item_type === "LESSON_NOTE" && item.ref_id) {
      const [note] = await db
        .select({ note_id: LessonNote.note_id, status: LessonNote.status, source: LessonNote.source, file_path: LessonNote.file_path, content_html: LessonNote.content_html })
        .from(LessonNote)
        .where(eq(LessonNote.note_id, item.ref_id))
        .limit(1);
      if (!note) {
        needsAttention.push({ item_id: item.item_id, title: item.title, reason: "The lesson note no longer exists." });
        continue;
      }
      if (note.status !== "PUBLISHED") {
        if (!isPublishable(note)) {
          needsAttention.push({ item_id: item.item_id, title: item.title, reason: "The lesson note is empty." });
          continue;
        }
        await db.update(LessonNote).set({ status: "PUBLISHED" }).where(eq(LessonNote.note_id, note.note_id));
      }
    }
    await db.update(CourseItem).set({ is_published: 1, review_state: "ACCEPTED" }).where(eq(CourseItem.item_id, item.item_id));
    approved.push(item.item_id);
    // An update replaces the current version: it takes the old item's place, and the old one
    // is retired (unpublished + DISMISSED, hidden from the builder) — never deleted, because
    // a delete would cascade away students' progress, attempts and submissions.
    const replaces = ((item.source_refs as any)?.replaces as number[] | undefined) ?? [];
    if (replaces.length) {
      const olds = await db
        .select({ item_id: CourseItem.item_id, position: CourseItem.position })
        .from(CourseItem)
        .where(and(inArray(CourseItem.item_id, replaces), eq(CourseItem.section_id, sectionId), ne(CourseItem.review_state, "DISMISSED")));
      if (olds.length) {
        await db.update(CourseItem).set({ position: Math.min(...olds.map((o) => o.position)) }).where(eq(CourseItem.item_id, item.item_id));
        await db.update(CourseItem).set({ is_published: 0, review_state: "DISMISSED" }).where(inArray(CourseItem.item_id, olds.map((o) => o.item_id)));
        retired.push(...olds.map((o) => o.item_id));
      }
    }
  }

  let sectionStatus = section.status;
  if (opts.publishSection && section.status !== "PUBLISHED") {
    // "Turn this week on": it opens on its date (SCHEDULED), or now if that date has passed.
    const unlock = section.unlock_at ? new Date(section.unlock_at as any) : null;
    sectionStatus = unlock && unlock.getTime() > Date.now() ? "SCHEDULED" : "PUBLISHED";
    if (sectionStatus !== section.status) await db.update(CourseSection).set({ status: sectionStatus }).where(eq(CourseSection.section_id, sectionId));
    if (sectionStatus === "PUBLISHED" && course.status === "PUBLISHED") await notifySectionPublished(course, sectionId, userId);
  }
  if (approved.length) {
    await recordActivity(userId, "ELEARNING_STUDIO_APPROVE", `Approved ${approved.length} Lesson Studio item(s) for "${section.title}"`, "CourseSection", sectionId, {
      item_ids: approved,
      course_id: course.course_id,
    });
  }
  return { approved, retired, needs_attention: needsAttention, section_status: sectionStatus };
}

/** Removes one Studio draft (and its AI note, if nothing else uses it). */
export async function dismissDraft(course: CourseRow, itemId: number, userId: number) {
  const [item] = await db.select().from(CourseItem).where(eq(CourseItem.item_id, itemId)).limit(1);
  if (!item) throw new NotFoundError("Item not found");
  if (!DRAFT_STATES.includes(item.review_state as any)) throw new ValidationError("Only drafts waiting for review can be dismissed — remove a published item from the course instead.");
  await db.delete(CourseItem).where(eq(CourseItem.item_id, itemId));
  if (item.item_type === "LESSON_NOTE" && item.ref_id && item.ai_origin === "AI_GENERATED") await deleteOrphanAINotes([item.ref_id]);
  await recordActivity(userId, "ELEARNING_STUDIO_DISMISS", `Dismissed Lesson Studio draft "${item.title}"`, "CourseItem", itemId, { course_id: course.course_id });
}

/**
 * "Regenerate with a note": a one-task child run for the artifact that produced this item,
 * with the original recipe plus the teacher's instruction. The new draft replaces the old one
 * only while the old one is untouched (PENDING_REVIEW); an edited draft is kept beside it.
 */
export async function regenerateItem(course: CourseRow, itemId: number, userId: number, instruction: string) {
  const [row] = await db
    .select({ item: CourseItem, task: CourseGenerationTask, run: CourseGenerationRun })
    .from(CourseItem)
    .innerJoin(CourseGenerationTask, eq(CourseGenerationTask.task_id, CourseItem.generation_task_id))
    .innerJoin(CourseGenerationRun, eq(CourseGenerationRun.run_id, CourseGenerationTask.run_id))
    .where(eq(CourseItem.item_id, itemId))
    .limit(1);
  if (!row) throw new ValidationError("Only items made by the Lesson Studio can be regenerated.");
  const kind = row.task.kind as ArtifactKind;
  if (kind === "REUSE_PLACEMENT") throw new ValidationError("This is one of your own notes — there is nothing to regenerate.");
  const original = row.run.blueprint as Blueprint;
  const extra = String(instruction || "").trim().slice(0, 600);
  const blueprint = normaliseBlueprint({
    ...original,
    // Placement already ran; a redo only rewrites the one artifact.
    reuse_existing_notes: false,
    instructions: [original.instructions, extra && `For this new version: ${extra}`].filter(Boolean).join("\n").slice(0, 2000),
  });
  return createRun({
    course,
    userId,
    blueprint,
    sectionIds: [row.item.section_id],
    mode: "REGENERATE_ITEM",
    parentRunId: row.run.run_id,
    onlyKinds: [kind],
  });
}
