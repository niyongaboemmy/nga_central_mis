import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  LessonReport,
  UserProfile,
  SchemeOfWorkEntry,
  LO_Lesson,
  Subject,
  ClassGroup,
  AcademicTerm,
} from "../db/schema";
import { ValidationError } from "../errors/CustomError";

const formatDbDate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  const year  = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export interface LessonReportRollupParams {
  start_date: string;
  end_date: string;
  academic_term_id: number;
  subject_id?: number;
  class_group_id?: number;
  // Restricts the rollup to a single instructor's own reports — used by the
  // self-scoped instructor route. Omitted (undefined) for the admin route,
  // which sees every instructor's reports.
  reported_by?: number;
}

// Extracted from adminReportController.getAdminLessonReportsRollup (Reporting
// Module Restructure Plan Phase 3) so the same Subject -> Class Group -> Week
// grouping can be reused by a self-scoped instructor endpoint without
// duplicating the query/grouping logic.
export const buildLessonReportRollup = async (params: LessonReportRollupParams) => {
  const { start_date, end_date, academic_term_id, subject_id, class_group_id, reported_by } = params;

  if (!start_date || !end_date || !academic_term_id) {
    throw new ValidationError("start_date, end_date, and academic_term_id are required");
  }

  const termRows = await db
    .select({ start_date: AcademicTerm.start_date })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academic_term_id))
    .limit(1);
  if (termRows.length === 0) throw new ValidationError("Academic term not found");

  const termStartMs = new Date(formatDbDate(termRows[0].start_date)! + "T00:00:00Z").getTime();
  const weekNumberFor = (deliveryDate: string) => {
    const deliveryMs = new Date(deliveryDate + "T00:00:00Z").getTime();
    return Math.floor((deliveryMs - termStartMs) / (7 * 86400000)) + 1;
  };

  const rows = await db
    .select({
      lesson_report_id: LessonReport.lesson_report_id,
      delivery_date:    LessonReport.delivery_date,
      status:           LessonReport.status,
      schedule_flag:    LessonReport.schedule_flag,
      attendance_count: LessonReport.attendance_count,
      completion_rate:  LessonReport.completion_rate,
      reflection_notes: LessonReport.reflection_notes,
      instructor_name:  sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
      topic:            SchemeOfWorkEntry.topic,
      module_name:      LO_Lesson.module_name,
      subject_id:       LessonReport.subject_id,
      subject_name:     Subject.name,
      subject_code:     Subject.code,
      class_group_id:   LessonReport.class_group_id,
      class_group_name: ClassGroup.name,
    })
    .from(LessonReport)
    .innerJoin(UserProfile, eq(LessonReport.reported_by, UserProfile.user_id))
    .innerJoin(Subject, eq(LessonReport.subject_id, Subject.subject_id))
    .innerJoin(ClassGroup, eq(LessonReport.class_group_id, ClassGroup.class_group_id))
    .leftJoin(LO_Lesson, eq(LessonReport.lesson_id, LO_Lesson.id))
    .leftJoin(SchemeOfWorkEntry, eq(LessonReport.entry_id, SchemeOfWorkEntry.entry_id))
    .where(
      and(
        eq(LessonReport.academic_term_id, academic_term_id),
        reported_by    ? eq(LessonReport.reported_by,     reported_by)                          : sql`1=1`,
        subject_id     ? eq(LessonReport.subject_id,      subject_id)                            : sql`1=1`,
        class_group_id ? eq(LessonReport.class_group_id,  class_group_id)                        : sql`1=1`,
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') >= ${start_date}`,
        sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') <= ${end_date}`,
      ),
    )
    .orderBy(asc(LessonReport.delivery_date));

  // Group: subject -> class group -> week
  interface WeekBucket {
    week_number: number;
    entries: any[];
  }
  interface ClassGroupBucket {
    class_group_id: number;
    class_group_name: string;
    weeks: Map<number, WeekBucket>;
  }
  interface SubjectBucket {
    subject_id: number;
    subject_name: string;
    subject_code: string | null;
    classGroups: Map<number, ClassGroupBucket>;
  }

  const subjects = new Map<number, SubjectBucket>();

  for (const r of rows) {
    const deliveryDate = formatDbDate(r.delivery_date)!;

    if (!subjects.has(r.subject_id!)) {
      subjects.set(r.subject_id!, {
        subject_id: r.subject_id!,
        subject_name: r.subject_name!,
        subject_code: r.subject_code,
        classGroups: new Map(),
      });
    }
    const subjectBucket = subjects.get(r.subject_id!)!;

    if (!subjectBucket.classGroups.has(r.class_group_id!)) {
      subjectBucket.classGroups.set(r.class_group_id!, {
        class_group_id: r.class_group_id!,
        class_group_name: r.class_group_name!,
        weeks: new Map(),
      });
    }
    const classGroupBucket = subjectBucket.classGroups.get(r.class_group_id!)!;

    const weekNumber = weekNumberFor(deliveryDate);
    if (!classGroupBucket.weeks.has(weekNumber)) {
      classGroupBucket.weeks.set(weekNumber, { week_number: weekNumber, entries: [] });
    }
    classGroupBucket.weeks.get(weekNumber)!.entries.push({
      lesson_report_id: r.lesson_report_id,
      delivery_date: deliveryDate,
      status: r.status,
      schedule_flag: r.schedule_flag,
      attendance_count: r.attendance_count,
      completion_rate: r.completion_rate,
      reflection_notes: r.reflection_notes,
      instructor_name: r.instructor_name,
      topic: r.topic ?? r.module_name ?? null,
    });
  }

  const result = Array.from(subjects.values())
    .map((s) => ({
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      subject_code: s.subject_code,
      class_groups: Array.from(s.classGroups.values())
        .map((cg) => ({
          class_group_id: cg.class_group_id,
          class_group_name: cg.class_group_name,
          weeks: Array.from(cg.weeks.values()).sort((a, b) => a.week_number - b.week_number),
        }))
        .sort((a, b) => a.class_group_name.localeCompare(b.class_group_name)),
    }))
    .sort((a, b) => a.subject_name.localeCompare(b.subject_name));

  return {
    period: { start_date, end_date, academic_term_id },
    subjects: result,
  };
};
