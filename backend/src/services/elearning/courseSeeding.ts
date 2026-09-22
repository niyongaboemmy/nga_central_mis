import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicTerm,
  ClassGroup,
  Course,
  CourseItem,
  CourseSection,
  LessonNote,
  LessonNoteCriteria,
  SchemeEntryCriteria,
  SchemeOfWork,
  SchemeOfWorkEntry,
  Subject,
  SubjectDocument,
} from "../../db/schema";
import { NotFoundError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { CourseRow } from "./courseMembership";
import { dateOnlyToLocalMidnight } from "./dates";

type EntryRow = typeof SchemeOfWorkEntry.$inferSelect;

/** Only PLANNED/COMPLETED weeks are navigable; a SKIPPED week (holiday) stays hidden. */
const sectionStatusForEntry = (entry: EntryRow): "HIDDEN" | "SCHEDULED" =>
  entry.entry_status === "SKIPPED" ? "HIDDEN" : "SCHEDULED";

const sectionTitleForEntry = (entry: EntryRow): string => {
  const week = (entry.week_number || "").trim();
  const topic = (entry.topic || "").trim();
  if (week && topic) return `${week} — ${topic}`.slice(0, 255);
  return (week || topic || "Untitled week").slice(0, 255);
};

const unlockAtForEntry = (entry: EntryRow): Date | null => dateOnlyToLocalMidnight(entry.start_date);

export async function listSchemeEntriesInOrder(schemeId: number): Promise<EntryRow[]> {
  return db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId))
    .orderBy(asc(SchemeOfWorkEntry.start_date), asc(SchemeOfWorkEntry.entry_id));
}

/**
 * Creates the course for a scheme (idempotent — returns the existing one) and seeds one
 * section per weekly entry, pre-filled with the notes and materials the teacher already
 * produced for that week (plan §3.2 "Course creation").
 */
export async function ensureCourseForScheme(schemeId: number, ownerUserId: number): Promise<CourseRow> {
  const [existing] = await db.select().from(Course).where(eq(Course.scheme_id, schemeId)).limit(1);
  if (existing) {
    await syncSectionsFromScheme(existing);
    return existing;
  }

  const [scheme] = await db
    .select({
      scheme_id: SchemeOfWork.scheme_id,
      subject_id: SchemeOfWork.subject_id,
      class_group_id: SchemeOfWork.class_group_id,
      academic_term_id: SchemeOfWork.academic_term_id,
      subject_name: Subject.name,
      subject_color: Subject.color,
      class_group_name: ClassGroup.name,
      term_name: AcademicTerm.name,
    })
    .from(SchemeOfWork)
    .innerJoin(Subject, eq(Subject.subject_id, SchemeOfWork.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, SchemeOfWork.class_group_id))
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, SchemeOfWork.academic_term_id))
    .where(eq(SchemeOfWork.scheme_id, schemeId))
    .limit(1);
  if (!scheme) throw new NotFoundError("Scheme of work not found");

  const title = `${scheme.subject_name} — ${scheme.class_group_name}${scheme.term_name ? ` — ${scheme.term_name}` : ""}`.slice(0, 255);
  const [inserted] = (await db.insert(Course).values({
    scheme_id: schemeId,
    subject_id: scheme.subject_id,
    class_group_id: scheme.class_group_id,
    academic_term_id: scheme.academic_term_id,
    owner_user_id: ownerUserId,
    title,
    cover_color: scheme.subject_color || null,
    status: "DRAFT",
  })) as any;
  const courseId = inserted.insertId as number;

  const course = (await db.select().from(Course).where(eq(Course.course_id, courseId)).limit(1))[0];
  await syncSectionsFromScheme(course);
  await seedItemsForCourse(course, ownerUserId);
  return course;
}

/**
 * Makes the course's scheme-backed sections match the scheme's entries: one section per
 * entry, positions in scheme order, SKIPPED entries hidden. Manual sections (no entry) keep
 * their relative position after the last scheme week they were placed behind. Safe to call
 * on every read — it only writes when something differs.
 */
export async function syncSectionsFromScheme(course: CourseRow): Promise<void> {
  const entries = await listSchemeEntriesInOrder(course.scheme_id);
  const sections = await db
    .select()
    .from(CourseSection)
    .where(eq(CourseSection.course_id, course.course_id))
    .orderBy(asc(CourseSection.position), asc(CourseSection.section_id));

  const byEntry = new Map(sections.filter((s) => s.scheme_entry_id).map((s) => [s.scheme_entry_id!, s]));

  // 1. Create sections for entries that have none.
  for (const entry of entries) {
    if (byEntry.has(entry.entry_id)) continue;
    const [ins] = (await db.insert(CourseSection).values({
      course_id: course.course_id,
      scheme_entry_id: entry.entry_id,
      competency_id: entry.competency_id ?? null,
      title: sectionTitleForEntry(entry),
      summary: entry.objective || entry.sub_topic || null,
      position: 0,
      status: sectionStatusForEntry(entry),
      unlock_at: unlockAtForEntry(entry),
    })) as any;
    const [row] = await db.select().from(CourseSection).where(eq(CourseSection.section_id, ins.insertId));
    byEntry.set(entry.entry_id, row);
    sections.push(row);
  }

  // 2. Keep status/unlock in step with the entry for sections the teacher hasn't published
  //    yet; a SKIPPED entry always hides its section, a PUBLISHED section stays published
  //    unless the week was skipped.
  for (const entry of entries) {
    const section = byEntry.get(entry.entry_id)!;
    const patch: Partial<typeof CourseSection.$inferInsert> = {};
    if (entry.entry_status === "SKIPPED" && section.status !== "HIDDEN") patch.status = "HIDDEN";
    if (section.status !== "PUBLISHED" && entry.entry_status === "COMPLETED" && course.auto_publish_from_scheme) {
      patch.status = "PUBLISHED";
    }
    const unlock = unlockAtForEntry(entry);
    if ((unlock?.getTime() ?? null) !== (section.unlock_at ? new Date(section.unlock_at).getTime() : null)) {
      patch.unlock_at = unlock;
    }
    if ((entry.competency_id ?? null) !== (section.competency_id ?? null)) {
      patch.competency_id = entry.competency_id ?? null;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(CourseSection).set(patch).where(eq(CourseSection.section_id, section.section_id));
      Object.assign(section, patch);
    }
  }

  // 3. Positions: scheme weeks in scheme order; manual sections keep their slot relative to
  //    the scheme week that precedes them.
  const manual = sections.filter((s) => !s.scheme_entry_id);
  const ordered: typeof sections = [];
  const schemeSections = entries.map((e) => byEntry.get(e.entry_id)!);
  // Manual sections whose stored position is before the first scheme section stay first.
  const placeAfter = new Map<number, typeof sections>(); // key: index in schemeSections, -1 = before all
  for (const m of manual) {
    let idx = -1;
    for (let i = 0; i < schemeSections.length; i += 1) {
      if (schemeSections[i].position < m.position) idx = i;
    }
    if (!placeAfter.has(idx)) placeAfter.set(idx, []);
    placeAfter.get(idx)!.push(m);
  }
  ordered.push(...(placeAfter.get(-1) || []));
  schemeSections.forEach((s, i) => {
    ordered.push(s);
    ordered.push(...(placeAfter.get(i) || []));
  });

  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i].position !== i) {
      await db.update(CourseSection).set({ position: i }).where(eq(CourseSection.section_id, ordered[i].section_id));
    }
  }
}

/**
 * Pre-fills every scheme-backed section with the teacher's own content for that week:
 *  - LESSON_NOTE: notes anchored to the entry (scheme_entry_id) or whose criteria intersect
 *    the entry's SchemeEntryCriteria — written for this subject, by this teacher or for this
 *    class group.
 *  - SUBJECT_DOCUMENT: materials tagged with the entry's competency.
 * Idempotent: a (section, type, ref) already present is skipped.
 */
export async function seedItemsForCourse(course: CourseRow, createdBy: number): Promise<number> {
  const sections = await db
    .select()
    .from(CourseSection)
    .where(and(eq(CourseSection.course_id, course.course_id), sql`${CourseSection.scheme_entry_id} IS NOT NULL`));
  if (sections.length === 0) return 0;
  const entryIds = sections.map((s) => s.scheme_entry_id!);

  const [entryCriteria, notes, noteCriteria, documents, existingItems] = await Promise.all([
    db
      .select({ entry_id: SchemeEntryCriteria.entry_id, criteria_id: SchemeEntryCriteria.criteria_id })
      .from(SchemeEntryCriteria)
      .where(inArray(SchemeEntryCriteria.entry_id, entryIds)),
    db
      .select({
        note_id: LessonNote.note_id,
        title: LessonNote.title,
        scheme_entry_id: LessonNote.scheme_entry_id,
        class_group_id: LessonNote.class_group_id,
        user_id: LessonNote.user_id,
      })
      .from(LessonNote)
      .where(eq(LessonNote.subject_id, course.subject_id)),
    db.select().from(LessonNoteCriteria),
    db
      .select({
        document_id: SubjectDocument.document_id,
        original_name: SubjectDocument.original_name,
        competency_id: SubjectDocument.competency_id,
      })
      .from(SubjectDocument)
      .where(eq(SubjectDocument.subject_id, course.subject_id)),
    db
      .select({ section_id: CourseItem.section_id, item_type: CourseItem.item_type, ref_id: CourseItem.ref_id })
      .from(CourseItem)
      .where(
        inArray(
          CourseItem.section_id,
          sections.map((s) => s.section_id),
        ),
      ),
  ]);

  const relevantNotes = notes.filter(
    (n) => n.user_id === createdBy || n.user_id === course.owner_user_id || n.class_group_id === course.class_group_id,
  );
  const criteriaByNote = new Map<number, Set<number>>();
  for (const nc of noteCriteria) {
    if (!criteriaByNote.has(nc.note_id)) criteriaByNote.set(nc.note_id, new Set());
    criteriaByNote.get(nc.note_id)!.add(nc.criteria_id);
  }
  const criteriaByEntry = new Map<number, Set<number>>();
  for (const ec of entryCriteria) {
    if (!criteriaByEntry.has(ec.entry_id)) criteriaByEntry.set(ec.entry_id, new Set());
    criteriaByEntry.get(ec.entry_id)!.add(ec.criteria_id);
  }
  const present = new Set(existingItems.map((i) => `${i.section_id}:${i.item_type}:${i.ref_id}`));
  const placedNotes = new Set<number>();

  let created = 0;
  for (const section of sections) {
    const entryId = section.scheme_entry_id!;
    const entryCrit = criteriaByEntry.get(entryId) || new Set<number>();
    let position = 0;

    for (const note of relevantNotes) {
      if (placedNotes.has(note.note_id)) continue;
      const anchored = note.scheme_entry_id === entryId;
      const noteCrit = criteriaByNote.get(note.note_id);
      const overlaps = !!noteCrit && [...noteCrit].some((c) => entryCrit.has(c));
      if (!anchored && !overlaps) continue;
      const key = `${section.section_id}:LESSON_NOTE:${note.note_id}`;
      placedNotes.add(note.note_id);
      if (present.has(key)) continue;
      await db.insert(CourseItem).values({
        section_id: section.section_id,
        item_type: "LESSON_NOTE",
        ref_id: note.note_id,
        title: note.title,
        position: position++,
        completion_rule: "VIEW",
        created_by: createdBy,
      });
      present.add(key);
      created += 1;
    }

    if (section.competency_id) {
      for (const doc of documents) {
        if (doc.competency_id !== section.competency_id) continue;
        const key = `${section.section_id}:SUBJECT_DOCUMENT:${doc.document_id}`;
        if (present.has(key)) continue;
        await db.insert(CourseItem).values({
          section_id: section.section_id,
          item_type: "SUBJECT_DOCUMENT",
          ref_id: doc.document_id,
          title: doc.original_name,
          position: position++,
          completion_rule: "VIEW",
          created_by: createdBy,
        });
        present.add(key);
        created += 1;
      }
    }
  }
  return created;
}

/**
 * SCHEDULED → PUBLISHED when the week has started and the course is live. Called lazily on
 * every course read (so nothing depends on a cron being alive) and by the periodic sweep in
 * index.ts. Returns the ids of sections it published so callers can notify.
 */
export async function publishDueSections(courseId?: number): Promise<number[]> {
  const now = new Date();
  const due = await db
    .select({ section_id: CourseSection.section_id })
    .from(CourseSection)
    .innerJoin(Course, eq(Course.course_id, CourseSection.course_id))
    .where(
      and(
        eq(CourseSection.status, "SCHEDULED"),
        eq(Course.status, "PUBLISHED"),
        lte(CourseSection.unlock_at, now),
        courseId ? eq(Course.course_id, courseId) : undefined,
      ),
    );
  if (due.length === 0) return [];
  const ids = due.map((d) => d.section_id);
  await db.update(CourseSection).set({ status: "PUBLISHED" }).where(inArray(CourseSection.section_id, ids));
  logger.info(`[elearning] auto-published ${ids.length} section(s)`);
  return ids;
}

/** Hook for the scheme controller: an entry was created/updated/deleted → resync its course. */
export async function syncCourseForScheme(schemeId: number): Promise<void> {
  const [course] = await db.select().from(Course).where(eq(Course.scheme_id, schemeId)).limit(1);
  if (!course) return;
  await syncSectionsFromScheme(course);
}

/**
 * Hook for the scheme controller, called *before* an entry row is deleted: an empty section
 * goes with its week; one the teacher already filled is kept as a hidden manual section so
 * nothing they authored disappears silently.
 */
export async function onSchemeEntryDeleted(entryId: number): Promise<void> {
  const [section] = await db
    .select({ section_id: CourseSection.section_id })
    .from(CourseSection)
    .where(eq(CourseSection.scheme_entry_id, entryId))
    .limit(1);
  if (!section) return;
  const [item] = await db
    .select({ item_id: CourseItem.item_id })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, section.section_id))
    .limit(1);
  if (!item) {
    await db.delete(CourseSection).where(eq(CourseSection.section_id, section.section_id));
  } else {
    await db
      .update(CourseSection)
      .set({ status: "HIDDEN", scheme_entry_id: null })
      .where(eq(CourseSection.section_id, section.section_id));
  }
}
