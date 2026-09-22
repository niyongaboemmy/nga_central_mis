import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicTerm,
  ClassGroup,
  CompetencyPerformanceCriteria,
  Course,
  CourseItem,
  CourseItemCriteria,
  CourseSection,
  LessonNote,
  LessonNoteCriteria,
  SchemeEntryCriteria,
  SchemeOfWorkEntry,
  Subject,
  SubjectCompetency,
  SubjectDocument,
  UserProfile,
} from "../../db/schema";
import { CourseRow } from "./courseMembership";
import { toDateOnly } from "./dates";

export type SectionRow = typeof CourseSection.$inferSelect;
export type ItemRow = typeof CourseItem.$inferSelect;

export interface CriterionChip {
  criteria_id: number;
  criteria_number: string;
  description: string;
  competency_id: number;
}

export interface TreeItem extends Omit<ItemRow, "content_json" | "content_html"> {
  criteria: CriterionChip[];
  /** Referenced object's live state — a note must be PUBLISHED before students can open it. */
  ref: {
    status?: string | null;
    file_name?: string | null;
    page_count?: number | null;
    mime_type?: string | null;
    file_size?: number | null;
    owner_user_id?: number | null;
    missing?: boolean;
  } | null;
  /** Builder only — the stored body for PAGE/VIDEO/LINK/KNOWLEDGE_CHECK items. */
  content_json?: any;
}

export interface TreeSection extends SectionRow {
  week_number: string | null;
  start_date: string | null;
  end_date: string | null;
  entry_status: string | null;
  /** The Learning Outcome (element) this week belongs to, from the scheme entry. */
  competency_title: string | null;
  element_number: number | null;
  /** Target criteria for the week — what the scheme says will be taught (SchemeEntryCriteria). */
  criteria: CriterionChip[];
  items: TreeItem[];
}

export interface CourseHeader {
  course: CourseRow;
  subject: { subject_id: number; name: string; code: string | null; color: string | null };
  class_group: { class_group_id: number; name: string };
  term: { academic_term_id: number; name: string | null; start_date: string | null; end_date: string | null };
  teacher: { user_id: number; name: string };
}

export async function loadCourseHeader(course: CourseRow): Promise<CourseHeader> {
  const [row] = await db
    .select({
      subject_id: Subject.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      term_id: AcademicTerm.academic_term_id,
      term_name: AcademicTerm.name,
      term_start: AcademicTerm.start_date,
      term_end: AcademicTerm.end_date,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(Course)
    .innerJoin(Subject, eq(Subject.subject_id, Course.subject_id))
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, Course.class_group_id))
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, Course.academic_term_id))
    .leftJoin(UserProfile, eq(UserProfile.user_id, Course.owner_user_id))
    .where(eq(Course.course_id, course.course_id))
    .limit(1);
  return {
    course,
    subject: { subject_id: row.subject_id, name: row.subject_name, code: row.subject_code, color: row.subject_color },
    class_group: { class_group_id: row.class_group_id, name: row.class_group_name },
    term: {
      academic_term_id: row.term_id,
      name: row.term_name,
      start_date: toDateOnly(row.term_start),
      end_date: toDateOnly(row.term_end),
    },
    teacher: {
      user_id: course.owner_user_id,
      name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    },
  };
}

/**
 * Sections → items for one course, with each item's criteria chips and the referenced
 * object's live state. Every read path (builder, learner, analytics) goes through here so
 * "what is in this course" has exactly one definition.
 */
export async function loadCourseTree(course: CourseRow, opts: { includeContent?: boolean } = {}): Promise<TreeSection[]> {
  const sections = await db
    .select({
      section: CourseSection,
      week_number: SchemeOfWorkEntry.week_number,
      start_date: SchemeOfWorkEntry.start_date,
      end_date: SchemeOfWorkEntry.end_date,
      entry_status: SchemeOfWorkEntry.entry_status,
      competency_title: SubjectCompetency.title,
      element_number: SubjectCompetency.element_number,
    })
    .from(CourseSection)
    .leftJoin(SchemeOfWorkEntry, eq(SchemeOfWorkEntry.entry_id, CourseSection.scheme_entry_id))
    .leftJoin(SubjectCompetency, eq(SubjectCompetency.competency_id, CourseSection.competency_id))
    .where(eq(CourseSection.course_id, course.course_id))
    .orderBy(asc(CourseSection.position), asc(CourseSection.section_id));
  if (sections.length === 0) return [];

  const sectionIds = sections.map((s) => s.section.section_id);
  const entryIds = sections.map((s) => s.section.scheme_entry_id).filter((n): n is number => !!n);
  const targetRows = entryIds.length
    ? await db
        .select({
          entry_id: SchemeEntryCriteria.entry_id,
          criteria_id: CompetencyPerformanceCriteria.criteria_id,
          criteria_number: CompetencyPerformanceCriteria.criteria_number,
          description: CompetencyPerformanceCriteria.description,
          competency_id: CompetencyPerformanceCriteria.competency_id,
        })
        .from(SchemeEntryCriteria)
        .innerJoin(CompetencyPerformanceCriteria, eq(CompetencyPerformanceCriteria.criteria_id, SchemeEntryCriteria.criteria_id))
        .where(inArray(SchemeEntryCriteria.entry_id, entryIds))
    : [];
  const targetsByEntry = new Map<number, CriterionChip[]>();
  for (const t of targetRows) {
    if (!targetsByEntry.has(t.entry_id)) targetsByEntry.set(t.entry_id, []);
    targetsByEntry.get(t.entry_id)!.push({ criteria_id: t.criteria_id, criteria_number: t.criteria_number, description: t.description, competency_id: t.competency_id });
  }
  const items = await db
    .select()
    .from(CourseItem)
    .where(inArray(CourseItem.section_id, sectionIds))
    .orderBy(asc(CourseItem.position), asc(CourseItem.item_id));

  const noteIds = items.filter((i) => i.item_type === "LESSON_NOTE" && i.ref_id).map((i) => i.ref_id!);
  const docIds = items.filter((i) => i.item_type === "SUBJECT_DOCUMENT" && i.ref_id).map((i) => i.ref_id!);
  const otherIds = items.filter((i) => i.item_type !== "LESSON_NOTE").map((i) => i.item_id);

  const [notes, docs, noteCriteria, itemCriteria] = await Promise.all([
    noteIds.length
      ? db
          .select({
            note_id: LessonNote.note_id,
            status: LessonNote.status,
            file_name: LessonNote.file_name,
            page_count: LessonNote.page_count,
            user_id: LessonNote.user_id,
          })
          .from(LessonNote)
          .where(inArray(LessonNote.note_id, noteIds))
      : Promise.resolve([] as any[]),
    docIds.length
      ? db
          .select({
            document_id: SubjectDocument.document_id,
            mime_type: SubjectDocument.mime_type,
            file_size: SubjectDocument.file_size,
            user_id: SubjectDocument.user_id,
          })
          .from(SubjectDocument)
          .where(inArray(SubjectDocument.document_id, docIds))
      : Promise.resolve([] as any[]),
    noteIds.length
      ? db
          .select({
            note_id: LessonNoteCriteria.note_id,
            criteria_id: CompetencyPerformanceCriteria.criteria_id,
            criteria_number: CompetencyPerformanceCriteria.criteria_number,
            description: CompetencyPerformanceCriteria.description,
            competency_id: CompetencyPerformanceCriteria.competency_id,
          })
          .from(LessonNoteCriteria)
          .innerJoin(
            CompetencyPerformanceCriteria,
            eq(CompetencyPerformanceCriteria.criteria_id, LessonNoteCriteria.criteria_id),
          )
          .where(inArray(LessonNoteCriteria.note_id, noteIds))
      : Promise.resolve([] as any[]),
    otherIds.length
      ? db
          .select({
            item_id: CourseItemCriteria.item_id,
            criteria_id: CompetencyPerformanceCriteria.criteria_id,
            criteria_number: CompetencyPerformanceCriteria.criteria_number,
            description: CompetencyPerformanceCriteria.description,
            competency_id: CompetencyPerformanceCriteria.competency_id,
          })
          .from(CourseItemCriteria)
          .innerJoin(
            CompetencyPerformanceCriteria,
            eq(CompetencyPerformanceCriteria.criteria_id, CourseItemCriteria.criteria_id),
          )
          .where(inArray(CourseItemCriteria.item_id, otherIds))
      : Promise.resolve([] as any[]),
  ]);

  const noteById = new Map(notes.map((n: any) => [n.note_id, n]));
  const docById = new Map(docs.map((d: any) => [d.document_id, d]));
  const critByNote = new Map<number, CriterionChip[]>();
  for (const c of noteCriteria as any[]) {
    if (!critByNote.has(c.note_id)) critByNote.set(c.note_id, []);
    critByNote.get(c.note_id)!.push({
      criteria_id: c.criteria_id,
      criteria_number: c.criteria_number,
      description: c.description,
      competency_id: c.competency_id,
    });
  }
  const critByItem = new Map<number, CriterionChip[]>();
  for (const c of itemCriteria as any[]) {
    if (!critByItem.has(c.item_id)) critByItem.set(c.item_id, []);
    critByItem.get(c.item_id)!.push({
      criteria_id: c.criteria_id,
      criteria_number: c.criteria_number,
      description: c.description,
      competency_id: c.competency_id,
    });
  }

  const toTreeItem = (i: ItemRow): TreeItem => {
    const { content_json, content_html, ...rest } = i;
    let ref: TreeItem["ref"] = null;
    if (i.item_type === "LESSON_NOTE") {
      const n = i.ref_id ? noteById.get(i.ref_id) : null;
      ref = n
        ? { status: n.status, file_name: n.file_name, page_count: n.page_count, owner_user_id: n.user_id }
        : { missing: true };
    } else if (i.item_type === "SUBJECT_DOCUMENT") {
      const d = i.ref_id ? docById.get(i.ref_id) : null;
      ref = d ? { mime_type: d.mime_type, file_size: d.file_size, owner_user_id: d.user_id } : { missing: true };
    }
    const item: TreeItem = {
      ...rest,
      criteria: i.item_type === "LESSON_NOTE" ? critByNote.get(i.ref_id || -1) || [] : critByItem.get(i.item_id) || [],
      ref,
    };
    if (opts.includeContent) item.content_json = content_json;
    void content_html;
    return item;
  };

  const itemsBySection = new Map<number, TreeItem[]>();
  for (const i of items) {
    if (!itemsBySection.has(i.section_id)) itemsBySection.set(i.section_id, []);
    itemsBySection.get(i.section_id)!.push(toTreeItem(i));
  }

  return sections.map((s) => ({
    ...s.section,
    week_number: s.week_number,
    start_date: toDateOnly(s.start_date),
    end_date: toDateOnly(s.end_date),
    entry_status: s.entry_status,
    competency_title: s.competency_title,
    element_number: s.element_number,
    criteria: (s.section.scheme_entry_id ? targetsByEntry.get(s.section.scheme_entry_id) : undefined) || [],
    items: itemsBySection.get(s.section.section_id) || [],
  }));
}

/** A single item with its section + course, for item-level endpoints. */
export async function loadItemWithCourse(itemId: number) {
  const [row] = await db
    .select({ item: CourseItem, section: CourseSection, course: Course })
    .from(CourseItem)
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseItem.section_id))
    .innerJoin(Course, eq(Course.course_id, CourseSection.course_id))
    .where(eq(CourseItem.item_id, itemId))
    .limit(1);
  return row || null;
}

export async function loadSectionWithCourse(sectionId: number) {
  const [row] = await db
    .select({ section: CourseSection, course: Course })
    .from(CourseSection)
    .innerJoin(Course, eq(Course.course_id, CourseSection.course_id))
    .where(eq(CourseSection.section_id, sectionId))
    .limit(1);
  return row || null;
}

export const isItemVisibleToStudents = (item: TreeItem): boolean => {
  if (!item.is_published) return false;
  if (item.ref?.missing) return false;
  if (item.item_type === "LESSON_NOTE" && item.ref?.status !== "PUBLISHED") return false;
  return true;
};

export const isSectionVisibleToStudents = (section: SectionRow): boolean => section.status === "PUBLISHED";
