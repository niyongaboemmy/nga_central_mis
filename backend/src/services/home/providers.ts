import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicCalendar,
  CalendarSlot,
  ClassGroup,
  Course,
  GradeSubject,
  IntegrationToken,
  LessonNote,
  LessonReport,
  LO_Lesson,
  MenteeCheckIn,
  MentorAssignment,
  MentorshipSession,
  SchemeOfWork,
  SchemeOfWorkEntry,
  StudentClassGroup,
  StudentSubjectEnrollment,
  Subject,
  TeacherSubjectAssignment,
  User,
  UserGrade,
  UserProfile,
} from "../../db/schema";
import { AccessGrant, AccessShadowDiff } from "../../db/accessSchema";
import {
  loadAssignedActivities,
  loadStudentLessons,
  loadTeacherLessons,
} from "../../controllers/calendarController";
import { loadSchemeStatus, loadTeacherAssignments, TeacherSchemeRow } from "../teacherSchemes";
import { listMemberCourseIds } from "../elearning/courseMembership";
import { loadCourseTree } from "../elearning/courseTree";
import {
  deriveLearnerSections,
  loadPrerequisites,
  loadProgressMap,
  summariseCourse,
} from "../elearning/courseProgress";
import { computeMisInsight, MIS_INSIGHTS } from "../access/insights";
import { localIsoDate, toIsoDate } from "../academicPeriod";
import { HomeAccessContext, heldAt, lensesOfType, ResolvedLens, uniq } from "./access";
import {
  AttentionItem,
  GlanceTile,
  QuickAction,
  Tier,
  TodayActivity,
  TodayLesson,
} from "./contract";

// ============================================================================
// Home providers. Each one owns one family of signals from the catalog in
// HOME_OVERVIEW_IMPLEMENTATION_PLAN.md §6 and runs ONE batched query set for
// every lens it serves -- never a query per entity (single-connection pool).
// Providers only read: nothing here writes or triggers a lazy writer.
// ============================================================================

export interface HomePeriod {
  yearId: number | null;
  termId: number | null;
  termStart: string | null;
  termEnd: string | null;
  week: number | null;
}

export interface ProviderContext {
  access: HomeAccessContext;
  period: HomePeriod;
  now: Date;
  todayIso: string;
  dow: number;
  nowMinutes: number;
}

export interface ProviderResult {
  items: AttentionItem[];
  tiles: GlanceTile[];
  actions: QuickAction[];
  lessons?: TodayLesson[];
  activities?: TodayActivity[];
  nextTeachingDay?: { date: string; day_of_week: number; lessons: number } | null;
}

export const EMPTY: ProviderResult = { items: [], tiles: [], actions: [] };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const minutes = (t: string | null | undefined) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
const hoursSince = (iso: string | null | undefined, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : 0;
const toIsoDateTime = (d: unknown): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
};
const dowOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};
const fullName = (first?: string | null, last?: string | null, fallback?: string | null) =>
  `${first ?? ""} ${last ?? ""}`.trim() || fallback || "Someone without a name on file";

function item(
  lens: ResolvedLens,
  kind: string,
  fields: Omit<AttentionItem, "id" | "source" | "kind" | "lens" | "via"> & { via?: number[]; scope?: string },
): AttentionItem {
  const { scope, via, ...rest } = fields;
  return {
    id: `mis:${kind}:${lens.key}${scope ? `:${scope}` : ""}`,
    source: "mis",
    kind,
    lens: lens.key,
    via: via ?? lens.via,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// TEACHING -- the teacher's own timetable and paperwork
// ---------------------------------------------------------------------------

export async function teachingProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const [lens] = lensesOfType(ctx.access, "TEACHING");
  const { userId } = ctx.access;
  const { termId, yearId, termStart, week } = ctx.period;
  if (!lens || !termId) return EMPTY;

  // Lessons only exist inside the term: clamp every window to its dates.
  const termFrom = toIsoDate(termStart) ?? "0000-00-00";
  const termTo = ctx.period.termEnd ?? "9999-12-31";
  const windowStart = [addDays(ctx.todayIso, -14), termFrom].sort().reverse()[0];
  const windowEnd = [addDays(ctx.todayIso, 7), termTo].sort()[0];
  const lastTaughtDay = [ctx.todayIso, termTo].sort()[0];

  const [assignments, weekLessons, activities, courseRows, noteRows, rejectedReports, plans, reports] =
    await Promise.all([
      loadTeacherAssignments(userId, yearId),
      loadTeacherLessons({ userId, termId, yearId }),
      loadAssignedActivities({ userId, termId, classGroupId: null }).catch(() => [] as any[]),
      db
        .select({ title: Course.title, status: Course.status })
        .from(Course)
        .where(and(eq(Course.owner_user_id, userId), eq(Course.academic_term_id, termId))),
      db
        .select({ title: LessonNote.title, status: LessonNote.status })
        .from(LessonNote)
        .where(and(eq(LessonNote.user_id, userId), eq(LessonNote.academic_term_id, termId)))
        .orderBy(desc(LessonNote.updated_at)),
      db
        .select({
          id: LessonReport.lesson_report_id,
          delivery_date: LessonReport.delivery_date,
          comment: LessonReport.validation_comment,
          subject_name: Subject.name,
        })
        .from(LessonReport)
        .leftJoin(Subject, eq(Subject.subject_id, LessonReport.subject_id))
        .where(
          and(
            eq(LessonReport.reported_by, userId),
            eq(LessonReport.academic_term_id, termId),
            eq(LessonReport.validation_status, "REJECTED"),
          ),
        ),
      db
        .select({
          id: LO_Lesson.id,
          date: sql<string>`DATE_FORMAT(${LO_Lesson.lesson_date}, '%Y-%m-%d')`,
          start_time: LO_Lesson.start_time,
          subject_id: SchemeOfWork.subject_id,
        })
        .from(LO_Lesson)
        .leftJoin(SchemeOfWorkEntry, eq(SchemeOfWorkEntry.entry_id, LO_Lesson.entry_id))
        .leftJoin(SchemeOfWork, eq(SchemeOfWork.scheme_id, SchemeOfWorkEntry.scheme_id))
        .where(
          and(
            eq(LO_Lesson.user_id, userId),
            sql`DATE_FORMAT(${LO_Lesson.lesson_date}, '%Y-%m-%d') BETWEEN ${windowStart} AND ${windowEnd}`,
          ),
        ),
      db
        .select({
          lesson_id: LessonReport.lesson_id,
          date: sql<string>`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d')`,
          subject_id: LessonReport.subject_id,
        })
        .from(LessonReport)
        .where(
          and(
            eq(LessonReport.reported_by, userId),
            sql`DATE_FORMAT(${LessonReport.delivery_date}, '%Y-%m-%d') BETWEEN ${windowStart} AND ${ctx.todayIso}`,
          ),
        ),
    ]);

  const schemes: TeacherSchemeRow[] = await loadSchemeStatus({ teacherId: userId, termId, assignments });

  // Plan/report matching mirrors getReportableLessons: a plan is matched on
  // (date, subject, start time), falling back to (date, subject); a report is
  // matched to the plan's lesson, else to (date, subject).
  const planExact = new Map<string, number>();
  const planCoarse = new Map<string, number>();
  for (const p of plans) {
    planExact.set(`${p.date}|${p.subject_id}|${hhmm(p.start_time)}`, p.id);
    if (!planCoarse.has(`${p.date}|${p.subject_id}`)) planCoarse.set(`${p.date}|${p.subject_id}`, p.id);
  }
  const reportByLesson = new Set(reports.filter((r) => r.lesson_id).map((r) => r.lesson_id!));
  const reportCoarse = new Set(reports.map((r) => `${r.date}|${r.subject_id}`));
  const markFor = (date: string, slot: any) => {
    const planId =
      planExact.get(`${date}|${slot.subject_id}|${hhmm(slot.start_time)}`) ??
      planCoarse.get(`${date}|${slot.subject_id}`) ??
      null;
    const reported = planId ? reportByLesson.has(planId) || reportCoarse.has(`${date}|${slot.subject_id}`) : reportCoarse.has(`${date}|${slot.subject_id}`);
    return { planned: planId !== null, reported };
  };

  const lessonsOn = (iso: string) =>
    weekLessons
      .filter((s: any) => s.day_of_week === dowOf(iso))
      .sort((a: any, b: any) => minutes(a.start_time) - minutes(b.start_time));

  // Today
  const inTerm = ctx.todayIso >= termFrom && ctx.todayIso <= termTo;
  const today: TodayLesson[] = (inTerm ? lessonsOn(ctx.todayIso) : []).map((s: any) => {
    const m = markFor(ctx.todayIso, s);
    const started = minutes(s.start_time) <= ctx.nowMinutes;
    return {
      lesson_key: `${s.class_group_id}:${s.subject_id}:${ctx.todayIso}:${hhmm(s.start_time)}`,
      kind: "teaching",
      slot_id: s.slot_id,
      subject_id: s.subject_id,
      subject_name: s.subject_name ?? null,
      class_group_id: s.class_group_id ?? null,
      class_group_name: s.class_group_name ?? null,
      start_time: hhmm(s.start_time),
      end_time: hhmm(s.end_time),
      location: s.location ?? null,
      color: s.color ?? null,
      plan: m.planned ? "done" : "missing",
      report: m.reported ? "done" : started ? "pending" : "upcoming",
      href: "/reporting",
    };
  });

  // Past occurrences in the window that have been taught but not reported.
  const unreported: Array<{ date: string; label: string }> = [];
  for (let iso = windowStart; iso <= lastTaughtDay; iso = addDays(iso, 1)) {
    for (const s of lessonsOn(iso)) {
      const over = iso < ctx.todayIso || minutes(s.end_time) <= ctx.nowMinutes;
      if (!over) continue;
      if (!markFor(iso, s).reported) {
        unreported.push({ date: iso, label: `${s.subject_name ?? "Lesson"} · ${s.class_group_name ?? ""} (${iso.slice(5)})` });
      }
    }
  }

  // Next teaching day (after today) and its lessons without a plan.
  let nextDay: { date: string; day_of_week: number; lessons: number } | null = null;
  const unplanned: string[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const iso = addDays(ctx.todayIso, offset);
    if (iso > termTo) break;
    const ls = lessonsOn(iso);
    if (ls.length === 0) continue;
    nextDay = { date: iso, day_of_week: dowOf(iso), lessons: ls.length };
    for (const s of ls) {
      if (!markFor(iso, s).planned) unplanned.push(`${s.subject_name ?? "Lesson"} · ${s.class_group_name ?? ""} ${hhmm(s.start_time)}`);
    }
    break;
  }

  const items: AttentionItem[] = [];
  const named = (rows: TeacherSchemeRow[]) => rows.map((r) => `${r.subject_name} · ${r.class_group_name}`);

  // Same triage as the Teacher Dashboard (components/teacher/urgency.ts).
  const rejected = schemes.filter((s) => s.status === "submitted" && s.validation_status === "REJECTED");
  if (rejected.length) {
    items.push(
      item(lens, "T-03", {
        tier: "blocking",
        depth: "write",
        count: rejected.length,
        title: `${rejected.length} ${plural(rejected.length, "scheme", "schemes")} of work sent back for revision`,
        entities: named(rejected),
        why: rejected[0].validation_comment?.trim() || "Your validator is waiting on the revision before it can be approved.",
        cta: { label: "Revise", href: "/scheme-of-work" },
      }),
    );
  }
  const missing = schemes.filter((s) => s.status === "pending");
  if (missing.length) {
    const started = week !== null && week >= 2;
    items.push(
      item(lens, "T-04", {
        tier: started ? "blocking" : "slipping",
        depth: "write",
        count: missing.length,
        title: `${missing.length} ${plural(missing.length, "scheme", "schemes")} of work not submitted`,
        entities: named(missing),
        why: started
          ? `Teaching is in week ${week} — lesson notes, plans and courses all hang off the scheme.`
          : "Submit before teaching starts so lesson notes and courses can be built on it.",
        cta: { label: "Submit", href: "/scheme-of-work" },
      }),
    );
  }
  if (rejectedReports.length) {
    items.push(
      item(lens, "T-05", {
        tier: "blocking",
        depth: "write",
        count: rejectedReports.length,
        title: `${rejectedReports.length} lesson ${plural(rejectedReports.length, "report was", "reports were")} sent back`,
        entities: rejectedReports.slice(0, 6).map((r) => `${r.subject_name ?? "Lesson"} (${toIsoDate(r.delivery_date)?.slice(5) ?? ""})`),
        why: rejectedReports[0].comment?.trim() || "Your reviewer asked for changes before it can be approved.",
        cta: { label: "Fix report", href: "/reporting" },
      }),
    );
  }
  if (unreported.length) {
    const oldest = unreported[0].date;
    const ageDays = Math.round((new Date(ctx.todayIso).getTime() - new Date(oldest).getTime()) / 86_400_000);
    items.push(
      item(lens, "T-08", {
        tier: ageDays > 7 ? "blocking" : "slipping",
        depth: "write",
        count: unreported.length,
        title: `${unreported.length} taught ${plural(unreported.length, "lesson", "lessons")} not reported yet`,
        entities: unreported.slice(-6).reverse().map((u) => u.label),
        why:
          ageDays > 7
            ? `The oldest was ${ageDays} days ago — coverage and compliance figures are missing it.`
            : "Report while the lesson is fresh; it feeds coverage and your compliance figures.",
        cta: { label: "Report", href: "/reporting" },
        due_at: `${oldest}T00:00:00`,
      }),
    );
  }
  if (unplanned.length && nextDay) {
    items.push(
      item(lens, "T-09", {
        tier: "slipping",
        depth: "write",
        count: unplanned.length,
        title: `${unplanned.length} ${plural(unplanned.length, "lesson has", "lessons have")} no plan for ${nextDay.date === addDays(ctx.todayIso, 1) ? "tomorrow" : "your next teaching day"}`,
        entities: unplanned,
        why: "A plan links the lesson to its scheme week, so reporting takes seconds afterwards.",
        cta: { label: "Plan", href: "/dashboard" },
        due_at: `${nextDay.date}T00:00:00`,
      }),
    );
  }
  const empty = schemes.filter((s) => s.status === "submitted" && s.entries_count === 0);
  if (empty.length) {
    items.push(
      item(lens, "T-10", {
        tier: "slipping",
        depth: "write",
        count: empty.length,
        title: `${empty.length} ${plural(empty.length, "scheme has", "schemes have")} no weeks planned`,
        entities: named(empty),
        why: "An empty scheme cannot be validated and seeds no course content.",
        cta: { label: "Add weeks", href: "/scheme-of-work" },
        scope: "empty",
      }),
    );
  }
  const behind =
    week === null ? [] : schemes.filter((s) => s.status === "submitted" && s.entries_count > 0 && s.entries_count < week);
  if (behind.length) {
    items.push(
      item(lens, "T-10", {
        tier: "slipping",
        depth: "write",
        count: behind.length,
        title: `${behind.length} ${plural(behind.length, "scheme is", "schemes are")} behind the calendar`,
        entities: behind.map((s) => `${s.subject_name} · ${s.class_group_name} (${s.entries_count}/${week} weeks)`),
        why: `The term is in week ${week}; plan the weeks you have already taught.`,
        cta: { label: "Plan", href: "/scheme-of-work" },
        scope: "behind",
      }),
    );
  }
  const draftCourses = courseRows.filter((c) => c.status === "DRAFT");
  if (draftCourses.length) {
    items.push(
      item(lens, "T-11", {
        tier: "slipping",
        depth: "write",
        count: draftCourses.length,
        title: `${draftCourses.length} e-learning ${plural(draftCourses.length, "course is", "courses are")} unpublished`,
        entities: draftCourses.slice(0, 6).map((c) => c.title),
        why: "Students cannot open the material until the course is published.",
        cta: { label: "Publish", href: "/elearning/courses" },
      }),
    );
  }
  const draftNotes = noteRows.filter((n) => n.status === "DRAFT");
  if (draftNotes.length) {
    items.push(
      item(lens, "T-16", {
        tier: "tidy",
        depth: "write",
        count: draftNotes.length,
        title: `${draftNotes.length} lesson ${plural(draftNotes.length, "note is", "notes are")} still in draft`,
        entities: draftNotes.slice(0, 5).map((n) => n.title),
        why: "Drafts are private — publish to share them with your class.",
        cta: { label: "Finish", href: "/lesson-notes" },
      }),
    );
  }

  // Tiles
  const monday = [addDays(ctx.todayIso, -((ctx.dow + 6) % 7)), termFrom].sort().reverse()[0];
  let weekTaught = 0;
  let weekReported = 0;
  for (let iso = monday; iso <= lastTaughtDay; iso = addDays(iso, 1)) {
    for (const s of lessonsOn(iso)) {
      if (iso === ctx.todayIso && minutes(s.end_time) > ctx.nowMinutes) continue;
      weekTaught++;
      if (markFor(iso, s).reported) weekReported++;
    }
  }
  const submitted = schemes.filter((s) => s.status === "submitted").length;
  const tiles: GlanceTile[] = [
    {
      id: "mis:tile:lessons-today",
      source: "mis",
      lens: lens.key,
      label: "Lessons today",
      value: String(today.length),
      hint: today.length ? `${today.filter((l) => l.report === "done").length} reported` : "No lessons today",
      href: "/dashboard",
    },
    {
      id: "mis:tile:reports-week",
      source: "mis",
      lens: lens.key,
      label: "Reported this week",
      value: `${weekReported}/${weekTaught}`,
      status: weekTaught === 0 || weekReported === weekTaught ? "good" : weekReported / weekTaught >= 0.6 ? "warning" : "critical",
      href: "/reporting",
    },
    {
      id: "mis:tile:schemes",
      source: "mis",
      lens: lens.key,
      label: "Schemes submitted",
      value: `${submitted}/${schemes.length}`,
      status: schemes.length === 0 || submitted === schemes.length ? "good" : missing.length && week !== null && week >= 2 ? "critical" : "warning",
      href: "/scheme-of-work",
    },
    {
      id: "mis:tile:periods-week",
      source: "mis",
      lens: lens.key,
      label: "Periods this week",
      value: String(weekLessons.length),
      hint: `${uniq(assignments.map((a) => a.class_group_id)).length} ${plural(uniq(assignments.map((a) => a.class_group_id)).length, "class", "classes")}`,
      href: "/teacher-dashboard",
    },
  ];

  const actions: QuickAction[] = [
    { id: "report-lesson", label: "Report a lesson", href: "/reporting", icon: "clipboard", lens: lens.key },
    { id: "lesson-note", label: "Write a lesson note", href: "/lesson-notes", icon: "note", lens: lens.key },
    { id: "scheme", label: "Scheme of work", href: "/scheme-of-work", icon: "calendar", lens: lens.key },
    { id: "teaching-board", label: "Teaching board", href: "/teacher-dashboard", icon: "chart", lens: lens.key },
  ];

  const todayActivities: TodayActivity[] = activities
    .filter((a: any) => a.day_of_week === null || a.day_of_week === ctx.dow)
    .map((a: any) => ({
      id: a.activity_id ?? a.id,
      title: a.title,
      start_time: hhmm(a.start_time) || null,
      end_time: hhmm(a.end_time) || null,
      color: a.color ?? null,
    }));

  return { items, tiles, actions, lessons: today, activities: todayActivities, nextTeachingDay: nextDay };
}

// ---------------------------------------------------------------------------
// SELF (learner) -- timetable, e-learning, mentor replies
// ---------------------------------------------------------------------------

export async function learnerProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const [lens] = lensesOfType(ctx.access, "SELF");
  const { userId, persona } = ctx.access;
  const { termId, yearId } = ctx.period;
  // Learner signals follow who someone IS, not which permissions they hold:
  // a super admin holds every permission, student ones included, and must not
  // get "Continue learning" on their Home.
  if (!lens || persona !== "STUDENT") return EMPTY;

  const [timetable, courseIds, replies, mentorRows] = await Promise.all([
    termId && yearId
      ? loadStudentLessons({ userId, termId, yearId })
      : Promise.resolve({ slots: [] as any[], activities: [] as any[], reason: null }),
    listMemberCourseIds(userId),
    db
      .select({
        checkin_id: MenteeCheckIn.checkin_id,
        title: MenteeCheckIn.title,
        responded_at: MenteeCheckIn.responded_at,
      })
      .from(MenteeCheckIn)
      .where(
        and(
          eq(MenteeCheckIn.student_id, userId),
          gte(MenteeCheckIn.responded_at, sql`DATE_SUB(NOW(), INTERVAL 7 DAY)`),
        ),
      ),
    // Who mentors me this year — shown as a glance tile so a student always
    // knows who their mentor is without opening the mentor page.
    yearId
      ? db
          .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
          .from(MentorAssignment)
          .leftJoin(UserProfile, eq(UserProfile.user_id, MentorAssignment.mentor_id))
          .where(
            and(
              eq(MentorAssignment.student_id, userId),
              eq(MentorAssignment.academic_year_id, yearId),
              eq(MentorAssignment.status, "ACTIVE"),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { first_name: string | null; last_name: string | null }[]),
  ]);
  const myMentor = mentorRows[0] ? fullName(mentorRows[0].first_name, mentorRows[0].last_name, "Assigned") : null;

  const today: TodayLesson[] = timetable.slots
    .filter((s: any) => s.day_of_week === ctx.dow)
    .sort((a: any, b: any) => minutes(a.start_time) - minutes(b.start_time))
    .map((s: any) => ({
      lesson_key: `${s.class_group_id}:${s.subject_id}:${ctx.todayIso}:${hhmm(s.start_time)}`,
      kind: "learning",
      slot_id: s.slot_id,
      subject_id: s.subject_id,
      subject_name: s.subject_name ?? null,
      class_group_id: s.class_group_id ?? null,
      class_group_name: s.class_group_name ?? null,
      start_time: hhmm(s.start_time),
      end_time: hhmm(s.end_time),
      location: s.location ?? null,
      color: s.color ?? null,
      teacher_name: fullName(s.instructor_name, s.instructor_lastname),
      href: "/my-enrolled-subjects",
    }));

  // E-learning: read-only summaries (no publishDueSections here -- the
  // interval sweep in index.ts publishes due sections).
  const courses =
    courseIds.length > 0
      ? await db
          .select({ course: Course, subject_name: Subject.name })
          .from(Course)
          .innerJoin(Subject, eq(Subject.subject_id, Course.subject_id))
          .where(inArray(Course.course_id, courseIds))
      : [];
  const summaries = await Promise.all(
    courses.map(async (r) => {
      const tree = await loadCourseTree(r.course);
      const itemIds = tree.flatMap((s) => s.items.map((i) => i.item_id));
      const [progress, prerequisites] = await Promise.all([
        loadProgressMap(itemIds, userId),
        loadPrerequisites(tree.map((s) => s.section_id)),
      ]);
      const sections = deriveLearnerSections(tree, progress, {
        sequential: !!r.course.require_sequential_progress,
        prerequisites,
      });
      return { course: r.course, subject: r.subject_name, summary: summariseCourse(sections) };
    }),
  );

  const items: AttentionItem[] = [];
  const overdue = summaries.filter((s) => s.summary.overdue_count > 0);
  if (overdue.length) {
    const n = overdue.reduce((t, s) => t + s.summary.overdue_count, 0);
    items.push(
      item(lens, "S-04", {
        tier: "blocking",
        depth: "detail",
        count: n,
        title: `${n} learning ${plural(n, "activity is", "activities are")} overdue`,
        entities: overdue.map((s) => `${s.subject} (${s.summary.overdue_count})`),
        why: "Your teacher set a date for these. Catch up before the next week opens.",
        cta: { label: "Catch up", href: `/my-learning/courses/${overdue[0].course.course_id}` },
      }),
    );
  }
  const dueSoon = summaries.flatMap((s) =>
    s.summary.due_soon.map((d) => ({ ...d, subject: s.subject, course_id: s.course.course_id })),
  );
  if (dueSoon.length) {
    dueSoon.sort((a, b) => new Date(a.due_at as any).getTime() - new Date(b.due_at as any).getTime());
    const first = dueSoon[0];
    const hours = (new Date(first.due_at as any).getTime() - ctx.now.getTime()) / 3_600_000;
    items.push(
      item(lens, "S-05", {
        tier: hours <= 48 ? "slipping" : "tidy",
        depth: "detail",
        count: dueSoon.length,
        title: `${dueSoon.length} learning ${plural(dueSoon.length, "activity", "activities")} due this week`,
        entities: dueSoon.slice(0, 6).map((d) => `${d.title} · ${d.subject}`),
        why: "Finishing before the date keeps your progress on track.",
        cta: { label: "Open", href: `/my-learning/courses/${first.course_id}/items/${first.item_id}` },
        due_at: toIsoDateTime(first.due_at),
      }),
    );
  }
  if (replies.length) {
    items.push(
      item(lens, "S-09", {
        tier: "tidy",
        depth: "detail",
        count: replies.length,
        title: `Your mentor replied to ${replies.length} ${plural(replies.length, "check-in", "check-ins")}`,
        entities: replies.slice(0, 4).map((r) => r.title ?? "Check-in"),
        why: "Read the reply — your mentor may have suggested a next step.",
        cta: { label: "Read", href: "/my-mentor" },
      }),
    );
  }

  const pct =
    summaries.length > 0 ? Math.round(summaries.reduce((t, s) => t + s.summary.percent, 0) / summaries.length) : null;
  const tiles: GlanceTile[] = [
    {
      id: "mis:tile:lessons-today",
      source: "mis",
      lens: lens.key,
      label: "Lessons today",
      value: String(today.length),
      hint: today.length ? `First at ${today[0].start_time}` : "No lessons today",
      href: "/my-enrolled-subjects",
    },
    {
      id: "mis:tile:learning-progress",
      source: "mis",
      lens: lens.key,
      label: "Learning progress",
      value: pct === null ? "—" : `${pct}%`,
      status: pct === null ? undefined : pct >= 70 ? "good" : pct >= 40 ? "warning" : "critical",
      hint: `${summaries.length} ${plural(summaries.length, "course", "courses")}`,
      href: "/my-learning",
    },
    {
      id: "mis:tile:my-mentor",
      source: "mis",
      lens: lens.key,
      label: "My mentor",
      value: myMentor ?? "Not assigned",
      status: myMentor ? undefined : "warning",
      hint: myMentor ? "Send a message or request a meeting" : "Ask your school administrator",
      href: "/my-mentor",
    },
  ];

  // "Continue" is the single most useful action for a learner.
  const next = summaries.find((s) => s.summary.resume_item || s.summary.next_item);
  const target = next?.summary.resume_item ?? next?.summary.next_item;
  const actions: QuickAction[] = [
    ...(next && target
      ? [{
          id: "continue",
          label: `Continue: ${target.title}`,
          href: `/my-learning/courses/${next.course.course_id}/items/${target.item_id}`,
          icon: "play",
          lens: lens.key,
        }]
      : []),
    { id: "my-learning", label: "My learning", href: "/my-learning", icon: "book", lens: lens.key },
    { id: "my-subjects", label: "My subjects", href: "/my-enrolled-subjects", icon: "layers", lens: lens.key },
    { id: "my-mentor", label: "Talk to my mentor", href: "/my-mentor", icon: "message", lens: lens.key },
  ];

  return {
    items,
    tiles,
    actions,
    lessons: today,
    activities: (timetable.activities ?? [])
      .filter((a: any) => a.day_of_week === null || a.day_of_week === ctx.dow)
      .map((a: any) => ({
        id: a.activity_id ?? a.id,
        title: a.title,
        start_time: hhmm(a.start_time) || null,
        end_time: hhmm(a.end_time) || null,
        color: a.color ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------
// MENTEES -- the mentor's own students
// ---------------------------------------------------------------------------

export async function mentorProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const [lens] = lensesOfType(ctx.access, "MENTEES");
  const { userId } = ctx.access;
  const mentees = ctx.access.placements.mentees;
  if (!lens) return EMPTY;
  // v2 MENTEES grants carry the ids in their scope; legacy ones in placements.
  const ids = mentees.length
    ? mentees
    : uniq((ctx.access.snapshot.caps.VIEW_RESULTS ?? []).flatMap((e) => (e.via.some((g) => lens.via.includes(g)) ? e.scope.students ?? [] : [])));

  const [inbox, lastSessions, followUps, names] = await Promise.all([
    db
      .select({
        checkin_id: MenteeCheckIn.checkin_id,
        submitted_at: MenteeCheckIn.submitted_at,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
      })
      .from(MenteeCheckIn)
      .leftJoin(UserProfile, eq(UserProfile.user_id, MenteeCheckIn.student_id))
      .where(and(eq(MenteeCheckIn.mentor_id, userId), eq(MenteeCheckIn.status, "NEW")))
      .orderBy(MenteeCheckIn.submitted_at),
    ids.length
      ? db
          .select({
            student_id: MentorshipSession.student_id,
            last: sql<string>`MAX(DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d'))`,
          })
          .from(MentorshipSession)
          .where(inArray(MentorshipSession.student_id, ids))
          .groupBy(MentorshipSession.student_id)
      : Promise.resolve([] as Array<{ student_id: number; last: string }>),
    db
      .select({ id: MentorshipSession.mentorship_id, student_name: MentorshipSession.student_name })
      .from(MentorshipSession)
      .where(
        and(
          eq(MentorshipSession.user_id, userId),
          eq(MentorshipSession.follow_up_required, 1),
          ne(MentorshipSession.session_status, "RESOLVED"),
        ),
      ),
    ids.length
      ? db
          .select({ user_id: UserProfile.user_id, first_name: UserProfile.first_name, last_name: UserProfile.last_name })
          .from(UserProfile)
          .where(inArray(UserProfile.user_id, ids))
      : Promise.resolve([] as Array<{ user_id: number; first_name: string | null; last_name: string | null }>),
  ]);

  const items: AttentionItem[] = [];
  if (inbox.length) {
    const oldest = toIsoDateTime(inbox[0].submitted_at);
    const waited = hoursSince(oldest, ctx.now);
    items.push(
      item(lens, "E-01", {
        tier: waited > 48 ? "blocking" : "slipping",
        depth: "detail",
        count: inbox.length,
        title: `${inbox.length} mentee ${plural(inbox.length, "check-in is", "check-ins are")} waiting for you`,
        entities: uniq(inbox.map((c) => fullName(c.first_name, c.last_name))),
        why: waited > 48 ? `The oldest has waited ${Math.round(waited / 24)} days — a reply shows them someone is listening.` : "A quick acknowledgement shows them someone is listening.",
        cta: { label: "Reply", href: "/my-mentees" },
        waiting_since: oldest,
      }),
    );
  }
  const lastBy = new Map(lastSessions.map((s) => [s.student_id, s.last]));
  const overdue = ids.filter((id) => {
    const last = lastBy.get(id);
    if (!last) return true;
    return (new Date(ctx.todayIso).getTime() - new Date(last).getTime()) / 86_400_000 > 21;
  });
  if (overdue.length) {
    const nameOf = new Map(names.map((n) => [n.user_id, fullName(n.first_name, n.last_name)]));
    items.push(
      item(lens, "E-02", {
        tier: "slipping",
        depth: "detail",
        count: overdue.length,
        title: `${overdue.length} ${plural(overdue.length, "mentee hasn't", "mentees haven't")} had a session in 3 weeks`,
        entities: overdue.slice(0, 8).map((id) => nameOf.get(id) ?? `Student #${id}`),
        why: "Regular contact is how problems are caught early.",
        cta: { label: "Log a session", href: "/my-mentees" },
      }),
    );
  }
  if (followUps.length) {
    items.push(
      item(lens, "E-03", {
        tier: "slipping",
        depth: "detail",
        count: followUps.length,
        title: `${followUps.length} mentoring follow-${plural(followUps.length, "up", "ups")} still open`,
        entities: uniq(followUps.map((f) => f.student_name ?? "Mentee")).slice(0, 8),
        why: "You flagged these for follow-up — close them once they're resolved.",
        cta: { label: "Follow up", href: "/my-mentees" },
      }),
    );
  }
  const tiles: GlanceTile[] = [
    {
      id: "mis:tile:mentees",
      source: "mis",
      lens: lens.key,
      label: "Mentees",
      value: String(ids.length),
      hint: overdue.length ? `${overdue.length} due a session` : "All seen recently",
      status: overdue.length ? "warning" : "good",
      href: "/my-mentees",
    },
  ];
  return { items, tiles, actions: [{ id: "mentoring", label: "Mentoring hub", href: "/my-mentees", icon: "users", lens: lens.key }] };
}

// ---------------------------------------------------------------------------
// CLASS_GROUP -- the class teacher's own class
// ---------------------------------------------------------------------------

const CLASS_VIEW_CAPS = [
  "VIEW_USERS_BY_CLASS_TEACHER_GRADE",
  "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE",
  "VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE",
  "VIEW_ACADEMICS",
  "MANAGE_ACADEMICS",
  "VIEW_ATTENDANCE",
  "VIEW_RESULTS",
];

export async function classProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { yearId } = ctx.period;
  const lenses = lensesOfType(ctx.access, "CLASS_GROUP").filter(
    (l) => heldAt(ctx.access.snapshot, CLASS_VIEW_CAPS, l).allowed,
  );
  if (!lenses.length || !yearId) return EMPTY;
  const classIds = lenses.map((l) => l.scopeId!).filter(Boolean);
  const gradeIds = uniq(classIds.map((c) => ctx.access.structure.classGroups.get(c)?.grade_id).filter((g): g is number => !!g));

  const [students, curriculum, taught, enrollments, mentored] = await Promise.all([
    db
      .select({ user_id: StudentClassGroup.user_id, class_group_id: StudentClassGroup.class_group_id })
      .from(StudentClassGroup)
      .where(
        and(
          inArray(StudentClassGroup.class_group_id, classIds),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      ),
    gradeIds.length
      ? db
          .select({ grade_id: GradeSubject.grade_id, subject_id: GradeSubject.subject_id, name: Subject.name })
          .from(GradeSubject)
          .innerJoin(Subject, eq(Subject.subject_id, GradeSubject.subject_id))
          .where(and(inArray(GradeSubject.grade_id, gradeIds), eq(Subject.status, "ACTIVE")))
      : Promise.resolve([] as Array<{ grade_id: number; subject_id: number; name: string }>),
    db
      .select({ class_group_id: TeacherSubjectAssignment.class_group_id, subject_id: TeacherSubjectAssignment.subject_id })
      .from(TeacherSubjectAssignment)
      .where(and(inArray(TeacherSubjectAssignment.class_group_id, classIds), eq(TeacherSubjectAssignment.academic_year_id, yearId))),
    db
      .select({ user_id: StudentSubjectEnrollment.user_id, subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .innerJoin(
        StudentClassGroup,
        and(
          eq(StudentClassGroup.user_id, StudentSubjectEnrollment.user_id),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .where(
        and(
          inArray(StudentClassGroup.class_group_id, classIds),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      ),
    db
      .select({ student_id: MentorAssignment.student_id })
      .from(MentorAssignment)
      .where(and(eq(MentorAssignment.academic_year_id, yearId), eq(MentorAssignment.status, "ACTIVE"))),
  ]);

  const mentoredSet = new Set(mentored.map((m) => m.student_id));
  const items: AttentionItem[] = [];
  const tiles: GlanceTile[] = [];
  for (const lens of lenses) {
    const cg = lens.scopeId!;
    const gradeId = ctx.access.structure.classGroups.get(cg)?.grade_id;
    const roster = uniq(students.filter((s) => s.class_group_id === cg).map((s) => s.user_id));
    const subjects = curriculum.filter((c) => c.grade_id === gradeId);
    const taughtSet = new Set(taught.filter((t) => t.class_group_id === cg).map((t) => t.subject_id));
    const untaught = subjects.filter((s) => !taughtSet.has(s.subject_id));
    const enrolledBy = new Map<number, Set<number>>();
    for (const e of enrollments) {
      if (!roster.includes(e.user_id)) continue;
      if (!enrolledBy.has(e.user_id)) enrolledBy.set(e.user_id, new Set());
      enrolledBy.get(e.user_id)!.add(e.subject_id);
    }
    const partial = roster.filter((u) => subjects.some((s) => !enrolledBy.get(u)?.has(s.subject_id)));
    const noMentor = roster.filter((u) => !mentoredSet.has(u));

    if (untaught.length) {
      items.push(
        item(lens, "C-08", {
          tier: "slipping",
          depth: "write",
          count: untaught.length,
          title: `${untaught.length} ${plural(untaught.length, "subject has", "subjects have")} no teacher in ${lens.label}`,
          entities: untaught.map((s) => s.name),
          why: "Nobody can plan, teach or report these subjects until a teacher is assigned.",
          cta: { label: "Review subjects", href: "/class-subjects" },
        }),
      );
    }
    if (partial.length && subjects.length) {
      items.push(
        item(lens, "C-07", {
          tier: "slipping",
          depth: "summary",
          count: partial.length,
          title: `${partial.length} ${plural(partial.length, "student is", "students are")} not enrolled in every subject`,
          entities: [],
          why: "Missing enrolments hide lessons, courses and marks from these students.",
          cta: { label: "Check students", href: "/class-users" },
        }),
      );
    }
    if (noMentor.length && roster.length) {
      items.push(
        item(lens, "C-09", {
          tier: "tidy",
          depth: "summary",
          count: noMentor.length,
          title: `${noMentor.length} ${plural(noMentor.length, "student has", "students have")} no mentor`,
          entities: [],
          why: "Every learner should have someone checking in on them.",
          cta: { label: "View class", href: "/class-users" },
        }),
      );
    }
    tiles.push(
      {
        id: `mis:tile:class-students:${cg}`,
        source: "mis",
        lens: lens.key,
        label: "Students",
        value: String(roster.length),
        href: "/class-users",
      },
      {
        id: `mis:tile:class-subjects:${cg}`,
        source: "mis",
        lens: lens.key,
        label: "Subjects with a teacher",
        value: `${subjects.length - untaught.length}/${subjects.length}`,
        status: untaught.length ? "warning" : "good",
        href: "/class-subjects",
      },
      {
        id: `mis:tile:class-enrolled:${cg}`,
        source: "mis",
        lens: lens.key,
        label: "Fully enrolled",
        value: `${roster.length - partial.length}/${roster.length}`,
        status: partial.length ? "warning" : "good",
        href: "/class-users",
      },
    );
  }
  const actions: QuickAction[] = lenses.length
    ? [
        { id: "class-users", label: "My class", href: "/class-users", icon: "users", lens: lenses[0].key },
        { id: "class-calendar", label: "Class timetable", href: "/class-calendar", icon: "calendar", lens: lenses[0].key },
      ]
    : [];
  return { items, tiles, actions };
}

// ---------------------------------------------------------------------------
// Oversight -- GRADE / DEPARTMENT / PROGRAM / SCHOOL
// ---------------------------------------------------------------------------

const APPROVE_REPORT_CAPS = ["MANAGE_REPORTS", "ALL_SUBMITTED_REPORTS"];
const SCHEME_LIST_CAPS = ["VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST", "VALIDATE_SCHEME_OF_WORK"];
const STRUCTURE_CAPS = ["VIEW_ACADEMICS", "MANAGE_ACADEMICS"];

/** Does this lens cover a class group (and, for departments, a subject)? */
const inLens = (lens: ResolvedLens, classGroupId: number | null, subjectId?: number | null) => {
  if (lens.subjectIds) return subjectId != null && lens.subjectIds.includes(subjectId);
  if (lens.classGroupIds === null) return true;
  return classGroupId != null && lens.classGroupIds.includes(classGroupId);
};

const insightCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof computeMisInsight>> }>();
const INSIGHT_TTL_MS = 5 * 60 * 1000;

export async function oversightProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { snapshot } = ctx.access;
  const { termId, yearId, week } = ctx.period;
  const lenses = lensesOfType(ctx.access, "SCHOOL", "PROGRAM", "DEPARTMENT", "GRADE");
  if (!lenses.length || !termId || !yearId) return EMPTY;

  const want = (caps: string[], minDepth: any = null) =>
    lenses.some((l) => heldAt(snapshot, caps, l, minDepth).allowed);

  const [pendingSchemes, pendingReports, pendingSessions, pairs, schemesThisTerm, classTeachers, curriculum] =
    await Promise.all([
      want(["VALIDATE_SCHEME_OF_WORK"])
        ? db.execute(sql`
            SELECT sw.scheme_id, sw.class_group_id, sw.subject_id, e.created_at,
                   s.name AS subject_name, cg.name AS class_group_name,
                   up.first_name, up.last_name, u.username
            FROM SchemeOfWork sw
            JOIN SchemeOfWorkEntry e
              ON e.entry_id = (SELECT MIN(e2.entry_id) FROM SchemeOfWorkEntry e2 WHERE e2.scheme_id = sw.scheme_id)
            LEFT JOIN Subject s ON s.subject_id = sw.subject_id
            LEFT JOIN ClassGroup cg ON cg.class_group_id = sw.class_group_id
            LEFT JOIN UserProfile up ON up.user_id = sw.user_id
            LEFT JOIN User u ON u.user_id = sw.user_id
            WHERE sw.academic_term_id = ${termId} AND e.validation_status = 'PENDING'
            ORDER BY e.created_at`).then((r: any) => r[0] as any[])
        : Promise.resolve([] as any[]),
      want(APPROVE_REPORT_CAPS)
        ? db
            .select({
              class_group_id: LessonReport.class_group_id,
              subject_id: LessonReport.subject_id,
              created_at: LessonReport.created_at,
            })
            .from(LessonReport)
            .where(and(eq(LessonReport.academic_term_id, termId), eq(LessonReport.validation_status, "PENDING")))
        : Promise.resolve([] as any[]),
      want(APPROVE_REPORT_CAPS)
        ? db
            .select({
              class_group_id: StudentClassGroup.class_group_id,
              created_at: MentorshipSession.created_at,
            })
            .from(MentorshipSession)
            .leftJoin(
              StudentClassGroup,
              and(
                eq(StudentClassGroup.user_id, MentorshipSession.student_id),
                eq(StudentClassGroup.academic_year_id, yearId),
                eq(StudentClassGroup.status, "ACTIVE"),
              ),
            )
            .where(and(eq(MentorshipSession.academic_year_id, yearId), eq(MentorshipSession.validation_status, "PENDING")))
        : Promise.resolve([] as any[]),
      want(SCHEME_LIST_CAPS) || want(STRUCTURE_CAPS)
        ? db
            .select({
              user_id: TeacherSubjectAssignment.user_id,
              subject_id: TeacherSubjectAssignment.subject_id,
              class_group_id: TeacherSubjectAssignment.class_group_id,
              first_name: UserProfile.first_name,
              last_name: UserProfile.last_name,
              username: User.username,
            })
            .from(TeacherSubjectAssignment)
            .leftJoin(UserProfile, eq(UserProfile.user_id, TeacherSubjectAssignment.user_id))
            .leftJoin(User, eq(User.user_id, TeacherSubjectAssignment.user_id))
            .where(eq(TeacherSubjectAssignment.academic_year_id, yearId))
        : Promise.resolve([] as any[]),
      want(SCHEME_LIST_CAPS)
        ? db
            .select({ user_id: SchemeOfWork.user_id, subject_id: SchemeOfWork.subject_id, class_group_id: SchemeOfWork.class_group_id })
            .from(SchemeOfWork)
            .where(eq(SchemeOfWork.academic_term_id, termId))
        : Promise.resolve([] as any[]),
      want(STRUCTURE_CAPS)
        ? db
            .select({ class_group_id: UserGrade.class_group_id })
            .from(UserGrade)
            .where(eq(UserGrade.academic_year_id, yearId))
        : Promise.resolve([] as any[]),
      want(STRUCTURE_CAPS)
        ? db
            .select({ grade_id: GradeSubject.grade_id, subject_id: GradeSubject.subject_id })
            .from(GradeSubject)
            .innerJoin(Subject, eq(Subject.subject_id, GradeSubject.subject_id))
            .where(eq(Subject.status, "ACTIVE"))
        : Promise.resolve([] as any[]),
    ]);

  const items: AttentionItem[] = [];
  const tiles: GlanceTile[] = [];
  const actions: QuickAction[] = [];

  for (const lens of lenses) {
    const scheme = heldAt(snapshot, "VALIDATE_SCHEME_OF_WORK", lens);
    if (scheme.allowed) {
      const rows = pendingSchemes.filter((r: any) => inLens(lens, r.class_group_id, r.subject_id));
      if (rows.length) {
        const oldest = toIsoDateTime(rows[0].created_at);
        const waited = hoursSince(oldest, ctx.now);
        items.push(
          item(lens, "P-01", {
            tier: waited > 7 * 24 ? "blocking" : "slipping",
            depth: "write",
            via: scheme.via,
            count: rows.length,
            title: `${rows.length} ${plural(rows.length, "scheme", "schemes")} of work waiting for your validation`,
            entities: rows.slice(0, 6).map((r: any) => `${r.subject_name ?? "Subject"} · ${r.class_group_name ?? ""} — ${fullName(r.first_name, r.last_name, r.username)}`),
            why:
              waited > 7 * 24
                ? `The oldest has waited ${Math.round(waited / 24)} days — its teacher can't build on it until you decide.`
                : "Teachers build lesson notes and courses on validated schemes.",
            cta: { label: "Validate", href: "/all-teachers-sow" },
            waiting_since: oldest,
          }),
        );
      }
    }

    const approve = heldAt(snapshot, APPROVE_REPORT_CAPS, lens);
    if (approve.allowed) {
      const reports = pendingReports.filter((r: any) => inLens(lens, r.class_group_id, r.subject_id));
      if (reports.length) {
        const oldest = toIsoDateTime(
          reports.reduce((m: any, r: any) => (!m || new Date(r.created_at) < new Date(m) ? r.created_at : m), null),
        );
        const waited = hoursSince(oldest, ctx.now);
        items.push(
          item(lens, "P-02", {
            tier: waited > 7 * 24 ? "blocking" : "slipping",
            depth: "write",
            via: approve.via,
            count: reports.length,
            title: `${reports.length} lesson ${plural(reports.length, "report", "reports")} awaiting approval`,
            entities: [],
            why: "Approved reports feed coverage and compliance; teachers see your verdict.",
            cta: { label: "Review", href: "/admin/reports" },
            waiting_since: oldest,
          }),
        );
      }
      const sessions = pendingSessions.filter((r: any) => lens.classGroupIds === null || inLens(lens, r.class_group_id));
      if (sessions.length) {
        items.push(
          item(lens, "P-03", {
            tier: "slipping",
            depth: "write",
            via: approve.via,
            count: sessions.length,
            title: `${sessions.length} mentoring ${plural(sessions.length, "session", "sessions")} awaiting approval`,
            entities: [],
            why: "Mentors are waiting on your sign-off for their logs.",
            cta: { label: "Review", href: "/admin/reports?tab=mentorship" },
          }),
        );
      }
    }

    const list = heldAt(snapshot, SCHEME_LIST_CAPS, lens);
    if (list.allowed && week !== null && week >= 2) {
      const have = new Set(schemesThisTerm.map((s: any) => `${s.user_id}|${s.subject_id}|${s.class_group_id}`));
      const missing = pairs.filter(
        (p: any) => inLens(lens, p.class_group_id, p.subject_id) && !have.has(`${p.user_id}|${p.subject_id}|${p.class_group_id}`),
      );
      if (missing.length) {
        const byTeacher = new Map<string, number>();
        for (const m of missing) {
          const n = fullName(m.first_name, m.last_name, m.username);
          byTeacher.set(n, (byTeacher.get(n) ?? 0) + 1);
        }
        const summaryOnly = list.depth === "summary";
        items.push(
          item(lens, "P-04", {
            tier: "slipping",
            depth: summaryOnly ? "summary" : "detail",
            via: list.via,
            count: missing.length,
            title: `${missing.length} ${plural(missing.length, "class-subject has", "class-subjects have")} no scheme of work in week ${week}`,
            entities: summaryOnly ? [] : [...byTeacher.entries()].slice(0, 8).map(([n, c]) => `${n} (${c})`),
            why: "Lesson notes, plans and e-learning courses all hang off the scheme.",
            cta: { label: "See who", href: "/all-teachers-sow" },
          }),
        );
      }
    }

    const structure = heldAt(snapshot, STRUCTURE_CAPS, lens);
    if (structure.allowed && lens.classGroupIds !== undefined && !lens.subjectIds) {
      const inScope = [...ctx.access.structure.classGroups.keys()].filter((cg) => inLens(lens, cg));
      const led = new Set(classTeachers.map((c: any) => c.class_group_id));
      const withoutLead = inScope.filter((cg) => !led.has(cg));
      const taughtSet = new Set(pairs.map((p: any) => `${p.subject_id}|${p.class_group_id}`));
      let untaught = 0;
      for (const cg of inScope) {
        const gradeId = ctx.access.structure.classGroups.get(cg)?.grade_id;
        for (const c of curriculum) if (c.grade_id === gradeId && !taughtSet.has(`${c.subject_id}|${cg}`)) untaught++;
      }
      if (withoutLead.length || untaught) {
        items.push(
          item(lens, "P-08", {
            tier: "slipping",
            depth: "write",
            via: structure.via,
            count: withoutLead.length + untaught,
            title: [
              withoutLead.length ? `${withoutLead.length} ${plural(withoutLead.length, "class has", "classes have")} no class teacher` : null,
              untaught ? `${untaught} class-${plural(untaught, "subject has", "subjects have")} no teacher` : null,
            ]
              .filter(Boolean)
              .join(" · "),
            entities: withoutLead.slice(0, 6).map((cg) => ctx.access.structure.classGroups.get(cg)?.name ?? `#${cg}`),
            why: "Unassigned classes and subjects can't be planned, taught or reported.",
            cta: { label: "Assign", href: "/academics" },
          }),
        );
      }
    }

    // Tiles: the Insights metrics this lens may read, at this node.
    for (const [metric, def] of Object.entries(MIS_INSIGHTS)) {
      if (!def.levels.includes(lens.type as any)) continue;
      if (!heldAt(snapshot, def.capability, lens, def.minDepth).allowed) continue;
      const node = lens.type === "SCHOOL" ? "SCHOOL" : lens.key;
      const cacheKey = `${ctx.access.userId}|${ctx.access.snapshot.v}|${metric}|${node}`;
      try {
        let hit = insightCache.get(cacheKey);
        if (!hit || Date.now() - hit.at > INSIGHT_TTL_MS) {
          hit = { at: Date.now(), value: await computeMisInsight(snapshot, metric, node) };
          insightCache.set(cacheKey, hit);
          if (insightCache.size > 1000) insightCache.clear();
        }
        const t = hit.value.total;
        tiles.push({
          id: `mis:tile:insight:${metric}:${lens.key}`,
          source: "mis",
          lens: lens.key,
          label: def.label,
          metric,
          value: t.suppressed || t.value === null ? null : `${Math.round(t.value)}${def.unit}`,
          suppressed: t.suppressed,
          hint: t.suppressed ? "Too few to show" : `${t.n} in scope`,
          status: t.value === null ? undefined : t.value >= 80 ? "good" : t.value >= 50 ? "warning" : "critical",
          href: `/insights?node=${encodeURIComponent(node)}&metric=${encodeURIComponent(metric)}`,
        });
      } catch {
        // A metric this viewer may not open at this node simply isn't shown.
      }
    }

    if (scheme.allowed) actions.push({ id: `validate:${lens.key}`, label: "Validate schemes", href: "/all-teachers-sow", icon: "check", lens: lens.key });
    if (approve.allowed || heldAt(snapshot, "VIEW_REPORTS", lens).allowed) {
      actions.push({ id: `admin-reports:${lens.key}`, label: "Teaching reports", href: "/admin/reports", icon: "clipboard", lens: lens.key });
    }
  }
  return { items, tiles, actions };
}

// ---------------------------------------------------------------------------
// SCHOOL operations and platform / access governance
// ---------------------------------------------------------------------------

export async function operationsProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { snapshot, v2Ready } = ctx.access;
  const { termId, yearId } = ctx.period;
  const lens = lensesOfType(ctx.access, "SCHOOL", "PLATFORM")[0];
  const self = lensesOfType(ctx.access, "SELF")[0];
  const items: AttentionItem[] = [];
  const actions: QuickAction[] = [];

  // M-03: my own positions ending soon (v2 grants carry valid_until).
  if (self) {
    const soon = Object.values(snapshot.grants).filter((g) => {
      if (!g.valid_until) return false;
      const days = (new Date(g.valid_until).getTime() - ctx.now.getTime()) / 86_400_000;
      return days >= 0 && days <= 14;
    });
    if (soon.length) {
      items.push(
        item(self, "M-03", {
          tier: "slipping",
          depth: "write",
          count: soon.length,
          title: `${soon.length} of your ${plural(soon.length, "position ends", "positions end")} within two weeks`,
          entities: soon.map((g) => `${g.title ?? g.role} (until ${String(g.valid_until).slice(0, 10)})`),
          why: "Ask whoever manages your access to renew it, or hand over the work.",
          cta: { label: "View my access", href: "/access-studio" },
        }),
      );
    }
  }
  if (!lens) return { items, tiles: [], actions };

  const can = (caps: string[]) => heldAt(snapshot, caps, lens);
  const enrol = can(["ASSIGN_STUDENT_CLASS_GROUPS", "MANAGE_USERS"]);
  const assign = can(["ASSIGN_TEACHER_SUBJECTS", "MANAGE_ACADEMICS"]);
  const calendar = can(["MANAGE_ACADEMIC_CALENDAR"]);
  const grantsManage = can(["ACCESS_GRANTS_MANAGE"]);
  const audit = can(["ACCESS_AUDIT_VIEW", "ACCESS_STUDIO_VIEW"]);
  const systems = can(["MANAGE_SYSTEMS"]);

  const [unplaced, idleTeachers, timetabled, placedClasses, expiringGrants, diffs, tokens] = await Promise.all([
    enrol.allowed && yearId
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(User)
          .innerJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
          .where(
            and(
              eq(User.status, "ACTIVE"),
              eq(UserProfile.user_type, "STUDENT"),
              sql`NOT EXISTS (SELECT 1 FROM StudentClassGroup scg WHERE scg.user_id = ${User.user_id} AND scg.academic_year_id = ${yearId} AND scg.status = 'ACTIVE')`,
            ),
          )
      : Promise.resolve([{ n: 0 }]),
    assign.allowed && yearId
      ? db
          .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name, username: User.username })
          .from(User)
          .innerJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
          .where(
            and(
              eq(User.status, "ACTIVE"),
              eq(UserProfile.user_type, "TEACHER"),
              sql`NOT EXISTS (SELECT 1 FROM TeacherSubjectAssignment t WHERE t.user_id = ${User.user_id} AND t.academic_year_id = ${yearId})`,
            ),
          )
      : Promise.resolve([] as Array<{ first_name: string | null; last_name: string | null; username: string }>),
    calendar.allowed && termId
      ? db
          .selectDistinct({ class_group_id: sql<number>`COALESCE(${AcademicCalendar.class_group_id}, ${CalendarSlot.class_group_id})` })
          .from(CalendarSlot)
          .leftJoin(AcademicCalendar, eq(AcademicCalendar.calendar_id, CalendarSlot.calendar_id))
          .where(
            and(
              eq(CalendarSlot.is_active, 1),
              sql`COALESCE(${AcademicCalendar.academic_term_id}, ${CalendarSlot.academic_term_id}) = ${termId}`,
            ),
          )
      : Promise.resolve([] as Array<{ class_group_id: number }>),
    calendar.allowed && yearId
      ? db
          .selectDistinct({ class_group_id: StudentClassGroup.class_group_id, name: ClassGroup.name })
          .from(StudentClassGroup)
          .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
          .where(and(eq(StudentClassGroup.academic_year_id, yearId), eq(StudentClassGroup.status, "ACTIVE")))
      : Promise.resolve([] as Array<{ class_group_id: number; name: string }>),
    grantsManage.allowed && v2Ready
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(AccessGrant)
          .where(
            and(
              eq(AccessGrant.status, "ACTIVE"),
              sql`${AccessGrant.valid_until} IS NOT NULL`,
              sql`${AccessGrant.valid_until} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)`,
            ),
          )
          .catch(() => [{ n: 0 }])
      : Promise.resolve([{ n: 0 }]),
    audit.allowed && v2Ready
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(AccessShadowDiff)
          .where(sql`${AccessShadowDiff.last_seen} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`)
          .catch(() => [{ n: 0 }])
      : Promise.resolve([{ n: 0 }]),
    systems.allowed
      ? db
          .select({ name: IntegrationToken.name, expires_at: IntegrationToken.expires_at })
          .from(IntegrationToken)
          .where(
            and(
              isNull(IntegrationToken.revoked_at),
              sql`${IntegrationToken.expires_at} IS NOT NULL`,
              lte(IntegrationToken.expires_at, sql`DATE_ADD(NOW(), INTERVAL 14 DAY)`),
              gte(IntegrationToken.expires_at, sql`NOW()`),
            ),
          )
      : Promise.resolve([] as Array<{ name: string; expires_at: unknown }>),
  ]);

  const n0 = (rows: Array<{ n: number }>) => Number(rows[0]?.n ?? 0);
  if (enrol.allowed && n0(unplaced)) {
    const n = n0(unplaced);
    items.push(
      item(lens, "O-01", {
        tier: "slipping",
        depth: "summary",
        via: enrol.via,
        count: n,
        title: `${n} active ${plural(n, "student has", "students have")} no class this year`,
        entities: [],
        why: "Without a class they see no timetable, courses or teachers.",
        cta: { label: "Place students", href: "/enrollment" },
      }),
    );
  }
  if (assign.allowed && idleTeachers.length) {
    items.push(
      item(lens, "O-02", {
        tier: "slipping",
        depth: "detail",
        via: assign.via,
        count: idleTeachers.length,
        title: `${idleTeachers.length} ${plural(idleTeachers.length, "teacher has", "teachers have")} no subject this year`,
        entities: idleTeachers.slice(0, 8).map((t) => fullName(t.first_name, t.last_name, t.username)),
        why: "They can't plan, teach or report until they're assigned.",
        cta: { label: "Assign subjects", href: "/academics" },
      }),
    );
  }
  if (calendar.allowed) {
    const has = new Set(timetabled.map((t) => Number(t.class_group_id)));
    const without = placedClasses.filter((c) => !has.has(c.class_group_id));
    if (without.length) {
      items.push(
        item(lens, "O-03", {
          tier: "slipping",
          depth: "write",
          via: calendar.via,
          count: without.length,
          title: `${without.length} ${plural(without.length, "class has", "classes have")} no timetable this term`,
          entities: without.slice(0, 8).map((c) => c.name),
          why: "Teachers and students in these classes see an empty week.",
          cta: { label: "Build timetable", href: "/calendar" },
        }),
      );
    }
  }
  if (grantsManage.allowed && n0(expiringGrants)) {
    const n = n0(expiringGrants);
    items.push(
      item(lens, "G-02", {
        tier: "slipping",
        depth: "write",
        via: grantsManage.via,
        count: n,
        title: `${n} ${plural(n, "position ends", "positions end")} within two weeks`,
        entities: [],
        why: "Renew or hand over before access lapses mid-term.",
        cta: { label: "Review positions", href: "/access-studio" },
      }),
    );
  }
  if (audit.allowed && n0(diffs)) {
    const n = n0(diffs);
    items.push(
      item(lens, "X-04", {
        tier: "tidy",
        depth: "write",
        via: audit.via,
        count: n,
        title: `${n} access ${plural(n, "difference", "differences")} seen in the last day`,
        entities: [],
        why: "Shadow mode found places where the new access rules would decide differently. Review before enforcing.",
        cta: { label: "Review", href: "/access-studio" },
      }),
    );
  }
  if (systems.allowed && tokens.length) {
    items.push(
      item(lens, "X-02", {
        tier: "slipping",
        depth: "write",
        via: systems.via,
        count: tokens.length,
        title: `${tokens.length} integration ${plural(tokens.length, "token expires", "tokens expire")} within two weeks`,
        entities: tokens.map((t) => t.name),
        why: "Connected apps stop syncing when their token expires.",
        cta: { label: "Rotate", href: "/systems" },
      }),
    );
  }

  if (enrol.allowed) actions.push({ id: "enrollment", label: "Enrolment", href: "/enrollment", icon: "user-plus", lens: lens.key });
  if (can(["MANAGE_USERS"]).allowed) actions.push({ id: "users", label: "Users", href: "/users", icon: "users", lens: lens.key });
  if (grantsManage.allowed || audit.allowed) actions.push({ id: "access", label: "Leadership & Access", href: "/access-studio", icon: "shield", lens: lens.key });
  return { items, tiles: [], actions };
}

/** Ranking used for the server's own ordering (the client re-ranks with the same rule). */
export const TIER_WEIGHT: Record<Tier, number> = { blocking: 3000, slipping: 2000, tidy: 1000 };
export function rankItems(items: AttentionItem[], now: Date): AttentionItem[] {
  const score = (i: AttentionItem) => {
    let s = TIER_WEIGHT[i.tier];
    if (i.waiting_since) s += Math.min(300, hoursSince(i.waiting_since, now));
    if (i.due_at) {
      const h = (new Date(i.due_at).getTime() - now.getTime()) / 3_600_000;
      s += h < 0 ? Math.min(500, -h * 2) : -Math.min(200, h);
    }
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title));
}
