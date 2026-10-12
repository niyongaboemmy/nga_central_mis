import { db } from "../db";
import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  MentorshipSession,
  MentorAssignment,
  MenteeCheckIn,
  User,
  UserProfile,
  TeacherSubjectAssignment,
  StudentClassGroup,
  StudentSubjectEnrollment,
  ClassGroup,
  Subject,
  AssessmentScore,
  AcademicYear,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError, AuthorizationError } from "../errors/CustomError";
import { Permissions } from "../utils/permissions";
import { profileMedia } from "../services/avatar/urls";
import { mentorshipRelationshipsFor } from "../services/mentorship/relationships";
import {
  notifyCheckInSubmitted,
  notifyCheckInAnswered,
  CheckInAnswer,
} from "../services/mentorship/notify";

const formatDbDate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function getCurrentAcademicYearId(): Promise<number | null> {
  const [row] = await db
    .select({ academic_year_id: AcademicYear.academic_year_id })
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);
  return row?.academic_year_id ?? null;
}

// Access to a student's mentoring record comes only from an explicit, ACTIVE
// MentorAssignment in an academic year that has not finished (the current
// year, or one whose end date is still ahead — an admin may assign next
// year's mentors early, and the mentor's roster follows the year they pick).
// Assignments left ACTIVE in a past year — notably the rows migration 047
// backfilled for every teacher/student pair — no longer grant write or grade
// access. There used to be a "who do I teach" fallback (any student
// in a class group the mentor teaches), which put every student of a subject
// teacher on their mentor roster and let them log sessions for students who
// had a different, real mentor. `allowOwnHistory` lets a former mentor keep
// reading the sessions they themselves wrote (the history query is already
// filtered to their own rows), without regaining write or grade access.
async function verifyStudentAccess(
  userId: number,
  studentId: number,
  opts: { allowOwnHistory?: boolean } = {},
): Promise<void> {
  const [live] = await db
    .select({ id: MentorAssignment.assignment_id })
    .from(MentorAssignment)
    .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
    .where(
      and(
        eq(MentorAssignment.mentor_id, userId),
        eq(MentorAssignment.student_id, studentId),
        eq(MentorAssignment.status, "ACTIVE"),
        or(
          eq(AcademicYear.is_current, 1),
          sql`${AcademicYear.end_date} >= CURDATE()`,
          isNull(AcademicYear.end_date),
        ),
      ),
    )
    .limit(1);
  if (live) return;

  if (opts.allowOwnHistory) {
    const [own] = await db
      .select({ id: MentorshipSession.mentorship_id })
      .from(MentorshipSession)
      .where(and(eq(MentorshipSession.user_id, userId), eq(MentorshipSession.student_id, studentId)))
      .limit(1);
    if (own) return;
  }
  throw new NotFoundError("Student not found in your assigned mentees");
}

// GET /mentorship/me — who am I in mentoring? Open to every signed-in user so
// the sidebar (and the top-bar mentees button) can offer "My Mentees" to anyone
// holding an assignment, whatever their user type (staff and admins can mentor
// too, not only teachers).
//
// The counts follow the year picked in the top-bar period selector, but the
// flags also hold when that year has no assignment and a live one exists: the
// selector often sits on another year than the assignment (an admin assigns
// next year's mentors early; several years can be flagged current), and the
// entry point must not vanish while the person still mentors someone today.
export const getMyMentorshipRole = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const academicYearId =
    req.query.academic_year_id && !isNaN(Number(req.query.academic_year_id))
      ? parseInt(String(req.query.academic_year_id), 10)
      : await getCurrentAcademicYearId();
  const count = (who: "mentor" | "student", year: "selected" | "live") =>
    db
      .select({ n: sql<number>`COUNT(DISTINCT ${who === "mentor" ? MentorAssignment.student_id : MentorAssignment.mentor_id})` })
      .from(MentorAssignment)
      .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
      .where(
        and(
          eq(who === "mentor" ? MentorAssignment.mentor_id : MentorAssignment.student_id, userId),
          eq(MentorAssignment.status, "ACTIVE"),
          year === "live" ? liveYear : academicYearId ? eq(MentorAssignment.academic_year_id, academicYearId) : sql`1=1`,
        ),
      )
      .then((r) => Number(r[0]?.n ?? 0));
  const [mentoring, mentoringLive, mentored, mentoredLive] = await Promise.all([
    count("mentor", "selected"),
    count("mentor", "live"),
    count("student", "selected"),
    count("student", "live"),
  ]);
  const isMentor = mentoring > 0 || mentoringLive > 0;
  // Unread check-ins waiting for this mentor — the badge on every entry point.
  const newCheckins = isMentor
    ? await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(MenteeCheckIn)
        .where(and(eq(MenteeCheckIn.mentor_id, userId), eq(MenteeCheckIn.status, "NEW")))
        .then((r) => Number(r[0]?.n ?? 0))
    : 0;
  return successResponse(res, "Mentorship role fetched", {
    is_mentor: isMentor,
    mentee_count: mentoring > 0 ? mentoring : mentoringLive,
    has_mentor: mentored > 0 || mentoredLive > 0,
    new_checkins: newCheckins,
  });
});

// An academic year that has not finished: the current one, or one whose end
// date is still ahead (or open). Same rule as verifyStudentAccess.
const liveYear = or(
  eq(AcademicYear.is_current, 1),
  sql`${AcademicYear.end_date} >= CURDATE()`,
  isNull(AcademicYear.end_date),
);

const OVERDUE_DAYS = 21;

/**
 * One mentor's roster rows: who, where they sit, how the mentoring is going
 * (this mentor's own sessions only) and what they are waiting on (unread
 * check-ins). Built from the assignment itself, not from class enrolment, so a
 * mentee who is not placed in a class group yet still shows up.
 *
 * `can_log` is false for a mentee from a finished year: the mentor may still
 * read their own notes, but not log new sessions (verifyStudentAccess).
 */
async function loadRoster(
  mentorId: number,
  scope: { yearId?: number | null; live?: boolean; studentIds?: number[] },
) {
  const isLive = sql<number>`(${AcademicYear.is_current} = 1 OR ${AcademicYear.end_date} >= CURDATE() OR ${AcademicYear.end_date} IS NULL)`;
  const assignments = await db
    .select({
      user_id: MentorAssignment.student_id,
      assigned_at: MentorAssignment.assigned_at,
      academic_year_id: MentorAssignment.academic_year_id,
      academic_year_name: AcademicYear.name,
      is_live: isLive,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      registration_number: UserProfile.registration_number,
    })
    .from(MentorAssignment)
    .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
    .leftJoin(UserProfile, eq(MentorAssignment.student_id, UserProfile.user_id))
    .where(
      and(
        eq(MentorAssignment.mentor_id, mentorId),
        eq(MentorAssignment.status, "ACTIVE"),
        scope.yearId ? eq(MentorAssignment.academic_year_id, scope.yearId) : sql`1=1`,
        scope.live ? liveYear : sql`1=1`,
        scope.studentIds ? inArray(MentorAssignment.student_id, scope.studentIds.length ? scope.studentIds : [0]) : sql`1=1`,
      ),
    )
    // A live assignment wins over a stale one for the same student.
    .orderBy(sql`${isLive} DESC`, sql`${MentorAssignment.assigned_at} DESC`);

  if (assignments.length === 0) return [];

  const studentIds = [...new Set(assignments.map((s) => s.user_id))];

  const [classRows, lastSessions, checkins] = await Promise.all([
    db
      .select({
        user_id: StudentClassGroup.user_id,
        academic_year_id: StudentClassGroup.academic_year_id,
        class_group_id: StudentClassGroup.class_group_id,
        class_group_name: ClassGroup.name,
      })
      .from(StudentClassGroup)
      .innerJoin(ClassGroup, eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id))
      .where(and(inArray(StudentClassGroup.user_id, studentIds), eq(StudentClassGroup.status, "ACTIVE"))),
    db
      .select({
        student_id: MentorshipSession.student_id,
        session_count: sql<number>`COUNT(*)`,
        last_session_date: sql<string>`MAX(DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d'))`,
        wellbeing_status: sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${MentorshipSession.wellbeing_status} ORDER BY ${MentorshipSession.session_date} DESC), ',', 1)`,
        follow_up_required: sql<number>`MAX(CASE WHEN ${MentorshipSession.follow_up_required} = 1 AND ${MentorshipSession.session_status} != 'RESOLVED' THEN 1 ELSE 0 END)`,
        dishonesty_flagged: sql<number>`MAX(${MentorshipSession.dishonesty_flagged})`,
        stress_flag: sql<number>`MAX(${MentorshipSession.stress_flag})`,
      })
      .from(MentorshipSession)
      .where(and(eq(MentorshipSession.user_id, mentorId), inArray(MentorshipSession.student_id, studentIds)))
      .groupBy(MentorshipSession.student_id),
    db
      .select({
        student_id: MenteeCheckIn.student_id,
        new_checkins: sql<number>`SUM(CASE WHEN ${MenteeCheckIn.status} = 'NEW' THEN 1 ELSE 0 END)`,
        last_checkin_at: sql<string>`MAX(${MenteeCheckIn.submitted_at})`,
      })
      .from(MenteeCheckIn)
      .where(and(eq(MenteeCheckIn.mentor_id, mentorId), inArray(MenteeCheckIn.student_id, studentIds)))
      .groupBy(MenteeCheckIn.student_id),
  ]);

  const classOf = new Map<number, { class_group_id: number; class_group_name: string | null }>();
  for (const c of classRows) {
    const a = assignments.find((x) => x.user_id === c.user_id);
    // Prefer the class of the assignment's own year; any active class otherwise.
    if (!classOf.has(c.user_id) || c.academic_year_id === a?.academic_year_id) {
      classOf.set(c.user_id, { class_group_id: c.class_group_id, class_group_name: c.class_group_name });
    }
  }
  const sessionMap = new Map(lastSessions.filter((s) => s.student_id !== null).map((s) => [s.student_id as number, s]));
  const checkinMap = new Map(checkins.map((c) => [c.student_id, c]));

  const today = new Date();
  const seen = new Set<number>();
  const result = [];
  for (const s of assignments) {
    if (seen.has(s.user_id)) continue;
    seen.add(s.user_id);

    const session = sessionMap.get(s.user_id);
    const inbox = checkinMap.get(s.user_id);
    let days_since_last_session: number | null = null;
    if (session?.last_session_date) {
      days_since_last_session = Math.floor(
        (today.getTime() - new Date(session.last_session_date).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    const cls = classOf.get(s.user_id);
    const canLog = Number(s.is_live) === 1;

    result.push({
      user_id: s.user_id,
      first_name: s.first_name,
      last_name: s.last_name,
      registration_number: s.registration_number,
      class_group_id: cls?.class_group_id ?? null,
      class_group_name: cls?.class_group_name ?? null,
      academic_year_id: s.academic_year_id,
      academic_year_name: s.academic_year_name ?? null,
      assigned_at: formatDbDate(s.assigned_at),
      can_log: canLog,
      session_count: Number(session?.session_count ?? 0),
      last_session_date: session?.last_session_date ?? null,
      days_since_last_session,
      wellbeing_status: session?.wellbeing_status ?? null,
      follow_up_required: Boolean(Number(session?.follow_up_required ?? 0)),
      dishonesty_flagged: Boolean(Number(session?.dishonesty_flagged ?? 0)),
      stress_flag: Boolean(Number(session?.stress_flag ?? 0)),
      new_checkins: Number(inbox?.new_checkins ?? 0),
      last_checkin_at: inbox?.last_checkin_at ? new Date(inbox.last_checkin_at).toISOString() : null,
      // Only someone the mentor can still meet is "overdue"; a finished year is history.
      overdue: canLog && (days_since_last_session === null || days_since_last_session > OVERDUE_DAYS),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students — the signed-in mentor's own mentees, nobody else.
// Follows the selected year; when that year holds none, falls back to the
// mentees the mentor has right now (rows then carry from_other_year), the same
// rule the student's "My Mentor" page uses. ?fallback=0 switches that off.
// ─────────────────────────────────────────────────────────────────────────────
export const getAssignedStudents = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const { academic_year_id, fallback } = req.query;
  const academicYearId =
    academic_year_id && !isNaN(Number(academic_year_id))
      ? parseInt(academic_year_id as string)
      : await getCurrentAcademicYearId();

  let rows = (await loadRoster(userId, { yearId: academicYearId })).map((r) => ({ ...r, from_other_year: false }));
  if (rows.length === 0 && String(fallback ?? "1") !== "0") {
    rows = (await loadRoster(userId, { live: true })).map((r) => ({ ...r, from_other_year: true }));
  }
  if (rows.length === 0) {
    return successResponse(res, "No mentees assigned", []);
  }

  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  return successResponse(res, "Assigned students fetched", rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students/:studentId — one mentee's roster row, so a mentee's
// page can be opened straight from a link (a notification, Home, the top-bar
// list) instead of only by clicking through the hub. Any year the mentor holds
// an ACTIVE assignment in; the live one wins.
// ─────────────────────────────────────────────────────────────────────────────
export const getMenteeSummary = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const studentId = parseInt(req.params.studentId, 10);
  if (!studentId || isNaN(studentId)) throw new ValidationError("Invalid student ID");

  const [row] = await loadRoster(userId, { studentIds: [studentId] });
  if (!row) throw new NotFoundError("Student not found in your assigned mentees");
  return successResponse(res, "Mentee fetched", { ...row, from_other_year: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students/:studentId/checkins — the conversation between this
// mentor and one mentee: every check-in the student sent them and the replies.
// The mentee page used to show sessions only, so a mentor reading a student's
// record never saw what the student had told them.
// ─────────────────────────────────────────────────────────────────────────────
export const getMenteeCheckIns = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const studentId = parseInt(req.params.studentId, 10);
  if (!studentId || isNaN(studentId)) throw new ValidationError("Invalid student ID");

  const rows = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      student_first: UserProfile.first_name,
      student_last: UserProfile.last_name,
      mentor_id: MenteeCheckIn.mentor_id,
      academic_year_id: MenteeCheckIn.academic_year_id,
      submitted_at: MenteeCheckIn.submitted_at,
      category: MenteeCheckIn.category,
      title: MenteeCheckIn.title,
      subject_id: MenteeCheckIn.subject_id,
      subject_name: Subject.name,
      message: MenteeCheckIn.message,
      linked_session_id: MenteeCheckIn.linked_session_id,
      status: MenteeCheckIn.status,
      validation_status: MenteeCheckIn.validation_status,
      mentor_response: MenteeCheckIn.mentor_response,
      responded_at: MenteeCheckIn.responded_at,
    })
    .from(MenteeCheckIn)
    .leftJoin(UserProfile, eq(MenteeCheckIn.student_id, UserProfile.user_id))
    .leftJoin(Subject, eq(MenteeCheckIn.subject_id, Subject.subject_id))
    // Scoped to the caller as the recipient: another mentor's thread with the
    // same student never shows here.
    .where(and(eq(MenteeCheckIn.mentor_id, userId), eq(MenteeCheckIn.student_id, studentId)))
    .orderBy(sql`${MenteeCheckIn.submitted_at} DESC`);

  if (rows.length === 0) {
    // Nothing to show is fine for a mentee; a stranger's id is a 404.
    await verifyStudentAccess(userId, studentId, { allowOwnHistory: true }).catch(async (err) => {
      const [any] = await loadRoster(userId, { studentIds: [studentId] });
      if (!any) throw err;
    });
  }

  return successResponse(
    res,
    "Mentee check-ins fetched",
    rows.map((r) => ({
      ...r,
      student_name: `${r.student_first ?? ""} ${r.student_last ?? ""}`.trim() || null,
      submitted_at: formatDbDate(r.submitted_at),
      submitted_at_iso: r.submitted_at ? new Date(r.submitted_at as any).toISOString() : null,
      responded_at: formatDbDate(r.responded_at),
    })),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students/:studentId/history
// ─────────────────────────────────────────────────────────────────────────────
export const getStudentMentorshipHistory = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const studentId = parseInt(req.params.studentId, 10);

  if (!studentId || isNaN(studentId)) {
    throw new ValidationError("Invalid student ID");
  }

  await verifyStudentAccess(userId, studentId, { allowOwnHistory: true });

  const sessions = await db
    .select({
      mentorship_id: MentorshipSession.mentorship_id,
      session_date: MentorshipSession.session_date,
      topic: MentorshipSession.topic,
      subject_id: MentorshipSession.subject_id,
      previous_session_id: MentorshipSession.previous_session_id,
      duration_minutes: MentorshipSession.duration_minutes,
      assignment_completion: MentorshipSession.assignment_completion,
      assignment_notes: MentorshipSession.assignment_notes,
      punctuality_attendance: MentorshipSession.punctuality_attendance,
      discipline_notes: MentorshipSession.discipline_notes,
      discipline_progress: MentorshipSession.discipline_progress,
      academic_planning: MentorshipSession.academic_planning,
      academic_personal_notes: MentorshipSession.academic_personal_notes,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag: MentorshipSession.stress_flag,
      next_steps: MentorshipSession.next_steps,
      action_items: MentorshipSession.action_items,
      challenges_identified: MentorshipSession.challenges_identified,
      guidance_notes: MentorshipSession.guidance_notes,
      wellbeing_status: MentorshipSession.wellbeing_status,
      wellbeing_score: MentorshipSession.wellbeing_score,
      wellbeing_notes: MentorshipSession.wellbeing_notes,
      follow_up_required: MentorshipSession.follow_up_required,
      is_completed: MentorshipSession.is_completed,
      session_status: MentorshipSession.session_status,
      notes: MentorshipSession.notes,
      created_at: MentorshipSession.created_at,
    })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        eq(MentorshipSession.student_id, studentId),
      ),
    )
    .orderBy(sql`${MentorshipSession.session_date} DESC`);

  const formatted = sessions.map((s) => ({
    ...s,
    session_date: formatDbDate(s.session_date),
    follow_up_required: Boolean(s.follow_up_required),
    is_completed: Boolean(s.is_completed),
    dishonesty_flagged: Boolean(s.dishonesty_flagged),
    stress_flag: Boolean(s.stress_flag),
  }));

  return successResponse(res, "Student mentorship history fetched", formatted);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students/:studentId/intelligence
// Returns the Pre-Session Brief: recent grades + open challenges from last 3
// sessions + subjects the instructor teaches (for subject selector in the form).
// ─────────────────────────────────────────────────────────────────────────────
export const getMenteeIntelligence = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const studentId = parseInt(req.params.studentId, 10);

  if (!studentId || isNaN(studentId)) {
    throw new ValidationError("Invalid student ID");
  }

  await verifyStudentAccess(userId, studentId);

  // Subjects the instructor teaches (for the session subject selector)
  const instructorSubjects = await db
    .selectDistinct({
      subject_id: Subject.subject_id,
      name: Subject.name,
      code: Subject.code,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(Subject, eq(TeacherSubjectAssignment.subject_id, Subject.subject_id))
    .where(eq(TeacherSubjectAssignment.user_id, userId));

  // Recent assessment scores for this student (last 6)
  const recentScores = await db
    .select({
      score_id: AssessmentScore.score_id,
      subject_name: Subject.name,
      subject_id: AssessmentScore.subject_id,
      assessment_type: AssessmentScore.assessment_type,
      title: AssessmentScore.title,
      score: AssessmentScore.score,
      max_score: AssessmentScore.max_score,
      assessed_at: AssessmentScore.assessed_at,
      term: AssessmentScore.term,
    })
    .from(AssessmentScore)
    .leftJoin(Subject, eq(AssessmentScore.subject_id, Subject.subject_id))
    .where(eq(AssessmentScore.student_id, studentId))
    .orderBy(sql`${AssessmentScore.assessed_at} DESC`)
    .limit(6);

  // Open challenges and unresolved action items from the last 3 sessions
  const lastThreeSessions = await db
    .select({
      mentorship_id: MentorshipSession.mentorship_id,
      session_date: MentorshipSession.session_date,
      topic: MentorshipSession.topic,
      challenges_identified: MentorshipSession.challenges_identified,
      action_items: MentorshipSession.action_items,
      session_status: MentorshipSession.session_status,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag: MentorshipSession.stress_flag,
    })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        eq(MentorshipSession.student_id, studentId),
      ),
    )
    .orderBy(sql`${MentorshipSession.session_date} DESC`)
    .limit(3);

  const openChallenges = lastThreeSessions
    .filter((s) => s.challenges_identified || s.action_items)
    .map((s) => ({
      mentorship_id: s.mentorship_id,
      session_date: formatDbDate(s.session_date),
      topic: s.topic,
      challenges_identified: s.challenges_identified,
      action_items: s.action_items,
      session_status: s.session_status,
    }));

  const flagHistory = {
    dishonesty_count: lastThreeSessions.filter((s) => s.dishonesty_flagged).length,
    stress_count: lastThreeSessions.filter((s) => s.stress_flag).length,
  };

  return successResponse(res, "Mentee intelligence fetched", {
    recent_scores: recentScores.map((s) => ({
      ...s,
      assessed_at: formatDbDate(s.assessed_at),
      score: Number(s.score),
      max_score: Number(s.max_score),
      percentage:
        Number(s.max_score) > 0
          ? Math.round((Number(s.score) / Number(s.max_score)) * 100)
          : null,
    })),
    open_challenges: openChallenges,
    flag_history: flagHistory,
    instructor_subjects: instructorSubjects,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /mentorship/sessions
// ─────────────────────────────────────────────────────────────────────────────
export const submitMentorshipSession = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const WELLBEING_SCORE_MAP: Record<string, number> = {
    STRUGGLING: 1,
    CONCERNED: 2,
    NEUTRAL: 3,
    GOOD: 4,
    EXCELLENT: 5,
  };

  const {
    student_id,
    session_date,
    topic,
    academic_year_id,
    academic_term_id,
    subject_id,
    previous_session_id,
    duration_minutes,
    assignment_completion,
    assignment_notes,
    punctuality_attendance,
    discipline_notes,
    discipline_progress,
    academic_planning,
    academic_personal_notes,
    dishonesty_flagged,
    stress_flag,
    next_steps,
    action_items,
    challenges_identified,
    guidance_notes,
    wellbeing_status,
    wellbeing_notes,
    wellbeing_score,
    follow_up_required,
    is_completed,
    session_status,
    notes,
  } = req.body;

  if (!student_id || !session_date) {
    throw new ValidationError("student_id and session_date are required");
  }

  const studentIdNum = parseInt(String(student_id), 10);

  // Ownership guard (migration 047): only the student's actual assigned
  // mentor — or a legacy teaching relationship, as a fallback — may log a
  // session for them. Previously this endpoint had its own inline
  // class-group check that never consulted MentorAssignment at all, so a
  // teacher sharing a class group with a student who had an explicit,
  // different assigned mentor could still log sessions for them.
  await verifyStudentAccess(userId, studentIdNum);

  const derivedWellbeingScore: number | null =
    wellbeing_score != null
      ? parseInt(String(wellbeing_score), 10)
      : wellbeing_status
        ? (WELLBEING_SCORE_MAP[wellbeing_status] ?? null)
        : null;

  const [result] = await db.insert(MentorshipSession).values({
    report_id: null,
    user_id: userId,
    student_id: studentIdNum,
    student_name: null,
    topic: topic ?? null,
    academic_year_id: academic_year_id
      ? parseInt(String(academic_year_id), 10)
      : null,
    academic_term_id: academic_term_id
      ? parseInt(String(academic_term_id), 10)
      : null,
    subject_id: subject_id ? parseInt(String(subject_id), 10) : null,
    previous_session_id: previous_session_id
      ? parseInt(String(previous_session_id), 10)
      : null,
    session_date,
    duration_minutes: duration_minutes ? parseInt(String(duration_minutes), 10) : null,
    assignment_completion: assignment_completion ?? null,
    assignment_notes: assignment_notes ?? null,
    punctuality_attendance: punctuality_attendance ?? null,
    discipline_notes: discipline_notes ?? null,
    discipline_progress: discipline_progress ?? null,
    academic_planning: academic_planning ?? null,
    academic_personal_notes: academic_personal_notes ?? null,
    dishonesty_flagged: dishonesty_flagged ? 1 : 0,
    stress_flag: stress_flag ? 1 : 0,
    next_steps: next_steps ?? null,
    action_items: action_items ?? null,
    challenges_identified: challenges_identified ?? null,
    guidance_notes: guidance_notes ?? null,
    wellbeing_status: wellbeing_status ?? null,
    wellbeing_score: derivedWellbeingScore,
    wellbeing_notes: wellbeing_notes ?? null,
    follow_up_required: follow_up_required ? 1 : 0,
    is_completed: is_completed ? 1 : 0,
    session_status: session_status ?? "OPEN",
    notes: notes ?? null,
  });

  return successResponse(res, "Session submitted", { mentorship_id: (result as any).insertId }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/sessions/:sessionId  (mentor, ownership-checked — edit prefill)
// ─────────────────────────────────────────────────────────────────────────────
export const getMentorshipSessionById = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const sessionId = parseInt(req.params.sessionId, 10);
  if (!sessionId || isNaN(sessionId)) throw new ValidationError("Invalid session ID");

  const [session] = await db
    .select()
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.mentorship_id, sessionId),
        eq(MentorshipSession.user_id, userId),
      ),
    )
    .limit(1);

  if (!session) throw new NotFoundError("Session not found or not owned by you");

  return successResponse(res, "Session fetched", {
    ...session,
    session_date: formatDbDate(session.session_date),
    follow_up_required: Boolean(session.follow_up_required),
    is_completed: Boolean(session.is_completed),
    dishonesty_flagged: Boolean(session.dishonesty_flagged),
    stress_flag: Boolean(session.stress_flag),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /mentorship/sessions/:sessionId  (mentor, ownership-checked — full edit)
// ─────────────────────────────────────────────────────────────────────────────
export const updateMentorshipSession = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const sessionId = parseInt(req.params.sessionId, 10);
  if (!sessionId || isNaN(sessionId)) throw new ValidationError("Invalid session ID");

  const WELLBEING_SCORE_MAP: Record<string, number> = {
    STRUGGLING: 1,
    CONCERNED: 2,
    NEUTRAL: 3,
    GOOD: 4,
    EXCELLENT: 5,
  };

  const {
    session_date,
    topic,
    subject_id,
    duration_minutes,
    assignment_completion,
    assignment_notes,
    punctuality_attendance,
    discipline_notes,
    discipline_progress,
    academic_planning,
    academic_personal_notes,
    dishonesty_flagged,
    stress_flag,
    next_steps,
    action_items,
    challenges_identified,
    guidance_notes,
    wellbeing_status,
    wellbeing_notes,
    wellbeing_score,
    follow_up_required,
    is_completed,
    session_status,
    notes,
  } = req.body;

  if (!session_date) {
    throw new ValidationError("session_date is required");
  }

  const [existing] = await db
    .select({ mentorship_id: MentorshipSession.mentorship_id })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.mentorship_id, sessionId),
        eq(MentorshipSession.user_id, userId),
      ),
    )
    .limit(1);

  if (!existing) throw new NotFoundError("Session not found or not owned by you");

  const derivedWellbeingScore: number | null =
    wellbeing_score != null
      ? parseInt(String(wellbeing_score), 10)
      : wellbeing_status
        ? (WELLBEING_SCORE_MAP[wellbeing_status] ?? null)
        : null;

  await db
    .update(MentorshipSession)
    .set({
      topic: topic ?? null,
      subject_id: subject_id ? parseInt(String(subject_id), 10) : null,
      session_date,
      duration_minutes: duration_minutes ? parseInt(String(duration_minutes), 10) : null,
      assignment_completion: assignment_completion ?? null,
      assignment_notes: assignment_notes ?? null,
      punctuality_attendance: punctuality_attendance ?? null,
      discipline_notes: discipline_notes ?? null,
      discipline_progress: discipline_progress ?? null,
      academic_planning: academic_planning ?? null,
      academic_personal_notes: academic_personal_notes ?? null,
      dishonesty_flagged: dishonesty_flagged ? 1 : 0,
      stress_flag: stress_flag ? 1 : 0,
      next_steps: next_steps ?? null,
      action_items: action_items ?? null,
      challenges_identified: challenges_identified ?? null,
      guidance_notes: guidance_notes ?? null,
      wellbeing_status: wellbeing_status ?? null,
      wellbeing_score: derivedWellbeingScore,
      wellbeing_notes: wellbeing_notes ?? null,
      follow_up_required: follow_up_required ? 1 : 0,
      is_completed: is_completed ? 1 : 0,
      session_status: session_status ?? "OPEN",
      notes: notes ?? null,
    })
    .where(eq(MentorshipSession.mentorship_id, sessionId));

  return successResponse(res, "Session updated", { mentorship_id: sessionId });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/follow-ups
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingFollowUps = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;

  const rows = await db
    .select({
      mentorship_id:    MentorshipSession.mentorship_id,
      student_id:       MentorshipSession.student_id,
      first_name:       UserProfile.first_name,
      last_name:        UserProfile.last_name,
      session_date:     MentorshipSession.session_date,
      topic:            MentorshipSession.topic,
      action_items:     MentorshipSession.action_items,
      session_status:   MentorshipSession.session_status,
      wellbeing_status: MentorshipSession.wellbeing_status,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag:      MentorshipSession.stress_flag,
      notes:            MentorshipSession.notes,
    })
    .from(MentorshipSession)
    .leftJoin(UserProfile, eq(MentorshipSession.student_id, UserProfile.user_id))
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        eq(MentorshipSession.follow_up_required, 1),
        sql`${MentorshipSession.session_status} != 'RESOLVED'`,
      ),
    )
    .orderBy(sql`${MentorshipSession.session_date} ASC`);

  const formatted = rows.map((r) => ({
    ...r,
    session_date: formatDbDate(r.session_date),
    student_name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
    dishonesty_flagged: Boolean(r.dishonesty_flagged),
    stress_flag: Boolean(r.stress_flag),
  }));

  return successResponse(res, "Pending follow-ups fetched", formatted);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /mentorship/sessions/:sessionId/status
// ─────────────────────────────────────────────────────────────────────────────
export const updateSessionStatus = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const sessionId = parseInt(req.params.sessionId, 10);
  const { status } = req.body;

  if (!sessionId || isNaN(sessionId)) {
    throw new ValidationError("Invalid session ID");
  }
  if (!["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status)) {
    throw new ValidationError("status must be OPEN, IN_PROGRESS, or RESOLVED");
  }

  const existing = await db
    .select({ mentorship_id: MentorshipSession.mentorship_id })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.mentorship_id, sessionId),
        eq(MentorshipSession.user_id, userId),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Session not found or not owned by you");
  }

  await db
    .update(MentorshipSession)
    .set({ session_status: status })
    .where(eq(MentorshipSession.mentorship_id, sessionId));

  return successResponse(res, "Status updated", { mentorship_id: sessionId, status });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/admin/log
// Admin-facing NGA Log view: filterable by student_id, returns all sessions
// with full detail for the printable NGA Mentorship Log document format.
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminMentoringLog = asyncHandler(async (req: any, res: any) => {
  const { student_id, mentor_id, academic_year_id, limit = "100" } = req.query;

  const conditions: any[] = [];
  if (student_id) {
    const sid = parseInt(String(student_id), 10);
    if (!isNaN(sid)) conditions.push(eq(MentorshipSession.student_id, sid));
  }
  if (mentor_id) {
    const mid = parseInt(String(mentor_id), 10);
    if (!isNaN(mid)) conditions.push(eq(MentorshipSession.user_id, mid));
  }
  if (academic_year_id) {
    const yid = parseInt(String(academic_year_id), 10);
    if (!isNaN(yid)) conditions.push(eq(MentorshipSession.academic_year_id, yid));
  }

  const MentorProfileAlias = alias(UserProfile, "admin_log_mentor_profile");

  const rows = await db
    .select({
      mentorship_id:         MentorshipSession.mentorship_id,
      student_id:            MentorshipSession.student_id,
      student_first:         UserProfile.first_name,
      student_last:          UserProfile.last_name,
      mentor_id:             MentorshipSession.user_id,
      mentor_first:          MentorProfileAlias.first_name,
      mentor_last:           MentorProfileAlias.last_name,
      session_date:          MentorshipSession.session_date,
      topic:                 MentorshipSession.topic,
      subject_name:          Subject.name,
      duration_minutes:      MentorshipSession.duration_minutes,
      assignment_completion: MentorshipSession.assignment_completion,
      assignment_notes:      MentorshipSession.assignment_notes,
      punctuality_attendance:MentorshipSession.punctuality_attendance,
      discipline_notes:      MentorshipSession.discipline_notes,
      discipline_progress:   MentorshipSession.discipline_progress,
      academic_planning:     MentorshipSession.academic_planning,
      academic_personal_notes: MentorshipSession.academic_personal_notes,
      dishonesty_flagged:    MentorshipSession.dishonesty_flagged,
      stress_flag:           MentorshipSession.stress_flag,
      challenges_identified: MentorshipSession.challenges_identified,
      guidance_notes:        MentorshipSession.guidance_notes,
      wellbeing_status:      MentorshipSession.wellbeing_status,
      wellbeing_score:       MentorshipSession.wellbeing_score,
      wellbeing_notes:       MentorshipSession.wellbeing_notes,
      action_items:          MentorshipSession.action_items,
      next_steps:            MentorshipSession.next_steps,
      follow_up_required:    MentorshipSession.follow_up_required,
      is_completed:          MentorshipSession.is_completed,
      session_status:        MentorshipSession.session_status,
      notes:                 MentorshipSession.notes,
      created_at:            MentorshipSession.created_at,
    })
    .from(MentorshipSession)
    .leftJoin(UserProfile, eq(MentorshipSession.student_id, UserProfile.user_id))
    .leftJoin(MentorProfileAlias, eq(MentorshipSession.user_id, MentorProfileAlias.user_id))
    .leftJoin(Subject, eq(MentorshipSession.subject_id, Subject.subject_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${MentorshipSession.session_date} DESC`)
    .limit(parseInt(String(limit), 10));

  const formatted = rows.map((r) => ({
    ...r,
    student_name: `${r.student_first ?? ""} ${r.student_last ?? ""}`.trim() || null,
    mentor_name: `${r.mentor_first ?? ""} ${r.mentor_last ?? ""}`.trim() || null,
    session_date: formatDbDate(r.session_date),
    follow_up_required: Boolean(r.follow_up_required),
    is_completed: Boolean(r.is_completed),
    dishonesty_flagged: Boolean(r.dishonesty_flagged),
    stress_flag: Boolean(r.stress_flag),
  }));

  return successResponse(res, "Admin mentoring log fetched", formatted);
});

// ─────────────────────────────────────────────────────────────────────────────
// Mentee check-ins (migration 047) — the student-facing reporting surface.
// ─────────────────────────────────────────────────────────────────────────────

const CHECKIN_CATEGORIES = [
  "GENERAL",
  "APPRECIATION",
  "ACADEMIC",
  "BEHAVIORAL",
  "ATTENDANCE",
  "WELLBEING",
  "CONCERN",
  "REQUEST_MEETING",
  "OTHER",
];

// POST /mentorship/checkins  (student)
export const submitCheckIn = asyncHandler(async (req: any, res: any) => {
  const studentId = req.user.userId as number;
  const { category, title, message, subject_id, academic_year_id } = req.body;

  if (!message || !String(message).trim()) {
    throw new ValidationError("message is required");
  }
  const cat = CHECKIN_CATEGORIES.includes(category) ? category : "GENERAL";

  // Mentor assignment is scoped per academic year (migration 047), and the
  // student may be browsing a different year than the DB's `is_current` flag
  // via the top-nav academic period selector — honor that explicit selection
  // when provided (same override pattern as getAssignedStudents), so the
  // report is always filed against the mentor actually shown on screen.
  const academicYearId =
    academic_year_id && !isNaN(Number(academic_year_id))
      ? parseInt(academic_year_id, 10)
      : await getCurrentAcademicYearId();
  if (!academicYearId) {
    throw new ValidationError("No current academic year is configured");
  }

  const [assignment] = await db
    .select({ mentor_id: MentorAssignment.mentor_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.student_id, studentId),
        eq(MentorAssignment.academic_year_id, academicYearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new ValidationError(
      "You don't have an assigned mentor yet for this academic year. Contact your school administrator.",
    );
  }

  let subjectId: number | null = null;
  if (subject_id !== undefined && subject_id !== null && subject_id !== "") {
    const subjIdNum = parseInt(subject_id, 10);
    if (isNaN(subjIdNum)) {
      throw new ValidationError("Invalid subject");
    }
    const [enrollment] = await db
      .select({ subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.subject_id, subjIdNum),
          eq(StudentSubjectEnrollment.academic_year_id, academicYearId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!enrollment) {
      throw new ValidationError("Invalid subject");
    }
    subjectId = subjIdNum;
  }

  const [result] = await db.insert(MenteeCheckIn).values({
    student_id: studentId,
    mentor_id: assignment.mentor_id,
    academic_year_id: academicYearId,
    category: cat,
    title: title ? String(title).trim().slice(0, 150) : null,
    subject_id: subjectId,
    message: String(message).trim(),
    status: "NEW",
    validation_status: "PENDING",
  });
  const checkinId = (result as any).insertId as number;

  await notifyCheckInSubmitted({
    checkinId,
    studentId,
    mentorId: assignment.mentor_id,
    category: cat,
    title: title ? String(title).trim().slice(0, 150) : null,
  });

  return successResponse(res, "Check-in submitted", { checkin_id: checkinId }, 201);
});

// GET /mentorship/checkins/mine  (student)
export const getMyCheckIns = asyncHandler(async (req: any, res: any) => {
  const studentId = req.user.userId as number;

  const rows = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      mentor_id: MenteeCheckIn.mentor_id,
      academic_year_id: MenteeCheckIn.academic_year_id,
      submitted_at: MenteeCheckIn.submitted_at,
      category: MenteeCheckIn.category,
      title: MenteeCheckIn.title,
      subject_id: MenteeCheckIn.subject_id,
      subject_name: Subject.name,
      message: MenteeCheckIn.message,
      linked_session_id: MenteeCheckIn.linked_session_id,
      status: MenteeCheckIn.status,
      validation_status: MenteeCheckIn.validation_status,
      mentor_response: MenteeCheckIn.mentor_response,
      responded_at: MenteeCheckIn.responded_at,
    })
    .from(MenteeCheckIn)
    .leftJoin(Subject, eq(MenteeCheckIn.subject_id, Subject.subject_id))
    .where(eq(MenteeCheckIn.student_id, studentId))
    .orderBy(sql`${MenteeCheckIn.submitted_at} DESC`);

  const formatted = rows.map((r) => ({
    ...r,
    submitted_at: formatDbDate(r.submitted_at),
    responded_at: formatDbDate(r.responded_at),
  }));

  return successResponse(res, "Your check-ins fetched", formatted);
});

// GET /mentorship/my-mentor  (student)
export const getMyMentor = asyncHandler(async (req: any, res: any) => {
  const studentId = req.user.userId as number;
  const { academic_year_id } = req.query;

  // Same year-selection override as submitCheckIn — the mentor shown here
  // must be for the academic year the student has selected in the top-nav
  // period selector, not silently the DB's `is_current` year, since the two
  // can differ (e.g. an admin viewing/browsing a past or upcoming year).
  const academicYearId =
    academic_year_id && !isNaN(Number(academic_year_id))
      ? parseInt(academic_year_id as string, 10)
      : await getCurrentAcademicYearId();
  const findMentor = (yearCondition: any) =>
    db
      .select({
        mentor_id: MentorAssignment.mentor_id,
        mentor_email: User.email,
        mentor_phone: User.phone_number,
        mentor_first: UserProfile.first_name,
        mentor_last: UserProfile.last_name,
        mentor_user_type: UserProfile.user_type,
        mentor_gender: UserProfile.gender,
        avatar_version: User.avatar_version,
        cover_version: User.cover_version,
        assigned_at: MentorAssignment.assigned_at,
        assignment_year_id: MentorAssignment.academic_year_id,
        academic_year_name: AcademicYear.name,
      })
      .from(MentorAssignment)
      .innerJoin(User, eq(MentorAssignment.mentor_id, User.user_id))
      .leftJoin(UserProfile, eq(MentorAssignment.mentor_id, UserProfile.user_id))
      .innerJoin(AcademicYear, eq(AcademicYear.academic_year_id, MentorAssignment.academic_year_id))
      .where(and(eq(MentorAssignment.student_id, studentId), eq(MentorAssignment.status, "ACTIVE"), yearCondition))
      .orderBy(sql`${AcademicYear.is_current} DESC`, sql`${MentorAssignment.assigned_at} DESC`)
      .limit(1);

  let [row] = academicYearId ? await findMentor(eq(MentorAssignment.academic_year_id, academicYearId)) : [];
  // Nothing in the selected year: show the mentor the student has right now
  // (the unfinished-year rule the mentor side uses), rather than "no mentor".
  // The period selector can sit on a different year than the assignment, and
  // the student still needs to reach the person mentoring them today.
  const fromOtherYear = !row;
  if (!row) {
    [row] = await findMentor(
      or(eq(AcademicYear.is_current, 1), sql`${AcademicYear.end_date} >= CURDATE()`, isNull(AcademicYear.end_date)),
    );
  }
  if (!row) {
    return successResponse(res, "No mentor assigned", null);
  }
  const mentorYearId = row.assignment_year_id;

  // What the student may see about their time with this mentor: how often
  // they have met and when. Session notes stay with the mentor.
  const [[sessions], subjects] = await Promise.all([
    db
      .select({
        session_count: sql<number>`COUNT(*)`,
        last_session_date: sql<string | null>`MAX(DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d'))`,
      })
      .from(MentorshipSession)
      .where(
        and(
          eq(MentorshipSession.user_id, row.mentor_id),
          eq(MentorshipSession.student_id, studentId),
        ),
      ),
    // Subjects this mentor teaches the student this year, if any — helps the
    // student place who their mentor is.
    db
      .selectDistinct({ name: Subject.name })
      .from(TeacherSubjectAssignment)
      .innerJoin(Subject, eq(TeacherSubjectAssignment.subject_id, Subject.subject_id))
      .innerJoin(
        StudentClassGroup,
        and(
          eq(StudentClassGroup.class_group_id, TeacherSubjectAssignment.class_group_id),
          eq(StudentClassGroup.user_id, studentId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, row.mentor_id),
          eq(TeacherSubjectAssignment.academic_year_id, mentorYearId),
        ),
      ),
  ]);

  // Everything a student needs to recognise and reach their mentor: photo and
  // cover (the same signed links every NGA app shows), contact details, and
  // how they are connected. Nothing private (date of birth, address) is sent.
  const media = profileMedia({ user_id: row.mentor_id, avatar_version: row.avatar_version, cover_version: row.cover_version });
  return successResponse(res, "Your mentor fetched", {
    mentor_id: row.mentor_id,
    mentor_name: `${row.mentor_first ?? ""} ${row.mentor_last ?? ""}`.trim() || null,
    mentor_first_name: row.mentor_first ?? null,
    mentor_last_name: row.mentor_last ?? null,
    mentor_email: row.mentor_email,
    mentor_phone: row.mentor_phone ?? null,
    mentor_role: row.mentor_user_type ?? null,
    mentor_gender: row.mentor_gender ?? null,
    avatar: media.avatar,
    cover: media.cover,
    academic_year_id: mentorYearId,
    academic_year_name: row.academic_year_name ?? null,
    // True when the selected year has no assignment and this is the live mentor.
    from_other_year: fromOtherYear,
    teaches_you: subjects.map((s) => s.name).filter(Boolean),
    assigned_at: formatDbDate(row.assigned_at),
    session_count: Number(sessions?.session_count ?? 0),
    last_session_date: sessions?.last_session_date ?? null,
  });
});

// GET /mentorship/checkins/inbox  (mentor)
export const getCheckInInbox = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const { status } = req.query;

  const conditions: any[] = [eq(MenteeCheckIn.mentor_id, mentorId)];
  if (status && ["NEW", "ACKNOWLEDGED", "ADDRESSED"].includes(String(status))) {
    conditions.push(eq(MenteeCheckIn.status, status as any));
  }

  const rows = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      student_first: UserProfile.first_name,
      student_last: UserProfile.last_name,
      academic_year_id: MenteeCheckIn.academic_year_id,
      submitted_at: MenteeCheckIn.submitted_at,
      category: MenteeCheckIn.category,
      title: MenteeCheckIn.title,
      message: MenteeCheckIn.message,
      linked_session_id: MenteeCheckIn.linked_session_id,
      status: MenteeCheckIn.status,
      validation_status: MenteeCheckIn.validation_status,
      mentor_response: MenteeCheckIn.mentor_response,
      responded_at: MenteeCheckIn.responded_at,
    })
    .from(MenteeCheckIn)
    .leftJoin(UserProfile, eq(MenteeCheckIn.student_id, UserProfile.user_id))
    .where(and(...conditions))
    .orderBy(sql`FIELD(${MenteeCheckIn.status}, 'NEW', 'ACKNOWLEDGED', 'ADDRESSED')`, sql`${MenteeCheckIn.submitted_at} DESC`);

  const formatted = rows.map((r) => ({
    ...r,
    student_name: `${r.student_first ?? ""} ${r.student_last ?? ""}`.trim() || null,
    submitted_at: formatDbDate(r.submitted_at),
    responded_at: formatDbDate(r.responded_at),
  }));

  return successResponse(res, "Check-in inbox fetched", formatted);
});

// GET /mentorship/admin/checkins  (admin — every mentee check-in, across mentors)
export const getAdminCheckIns = asyncHandler(async (req: any, res: any) => {
  const { mentor_id, student_id, academic_year_id, status, limit = "200" } = req.query;

  const conditions: any[] = [];
  if (mentor_id) {
    const mid = parseInt(String(mentor_id), 10);
    if (!isNaN(mid)) conditions.push(eq(MenteeCheckIn.mentor_id, mid));
  }
  if (student_id) {
    const sid = parseInt(String(student_id), 10);
    if (!isNaN(sid)) conditions.push(eq(MenteeCheckIn.student_id, sid));
  }
  if (academic_year_id) {
    const yid = parseInt(String(academic_year_id), 10);
    if (!isNaN(yid)) conditions.push(eq(MenteeCheckIn.academic_year_id, yid));
  }
  if (status && ["NEW", "ACKNOWLEDGED", "ADDRESSED"].includes(String(status))) {
    conditions.push(eq(MenteeCheckIn.status, status as any));
  }

  const MentorProfileAlias = alias(UserProfile, "admin_checkin_mentor_profile");

  const rows = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      student_first: UserProfile.first_name,
      student_last: UserProfile.last_name,
      mentor_id: MenteeCheckIn.mentor_id,
      mentor_first: MentorProfileAlias.first_name,
      mentor_last: MentorProfileAlias.last_name,
      academic_year_id: MenteeCheckIn.academic_year_id,
      submitted_at: MenteeCheckIn.submitted_at,
      category: MenteeCheckIn.category,
      title: MenteeCheckIn.title,
      message: MenteeCheckIn.message,
      linked_session_id: MenteeCheckIn.linked_session_id,
      status: MenteeCheckIn.status,
      validation_status: MenteeCheckIn.validation_status,
      mentor_response: MenteeCheckIn.mentor_response,
      responded_at: MenteeCheckIn.responded_at,
    })
    .from(MenteeCheckIn)
    .leftJoin(UserProfile, eq(MenteeCheckIn.student_id, UserProfile.user_id))
    .leftJoin(MentorProfileAlias, eq(MenteeCheckIn.mentor_id, MentorProfileAlias.user_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${MenteeCheckIn.submitted_at} DESC`)
    .limit(parseInt(String(limit), 10));

  const formatted = rows.map((r) => ({
    ...r,
    student_name: `${r.student_first ?? ""} ${r.student_last ?? ""}`.trim() || null,
    mentor_name: `${r.mentor_first ?? ""} ${r.mentor_last ?? ""}`.trim() || null,
    submitted_at: formatDbDate(r.submitted_at),
    responded_at: formatDbDate(r.responded_at),
  }));

  return successResponse(res, "Admin check-in log fetched", formatted);
});

// GET /mentorship/checkins/:id  (mentor, ownership-checked)
export const getCheckInDetail = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid check-in ID");

  const [found] = await db
    .select({ checkin: MenteeCheckIn, first: UserProfile.first_name, last: UserProfile.last_name, subject_name: Subject.name })
    .from(MenteeCheckIn)
    .leftJoin(UserProfile, eq(MenteeCheckIn.student_id, UserProfile.user_id))
    .leftJoin(Subject, eq(MenteeCheckIn.subject_id, Subject.subject_id))
    .where(and(eq(MenteeCheckIn.checkin_id, id), eq(MenteeCheckIn.mentor_id, mentorId)))
    .limit(1);

  if (!found) throw new NotFoundError("Check-in not found");
  const row = found.checkin;

  return successResponse(res, "Check-in fetched", {
    ...row,
    // Opened from a link (a notification), the dialog needs to say who wrote it.
    student_name: `${found.first ?? ""} ${found.last ?? ""}`.trim() || null,
    subject_name: found.subject_name ?? null,
    submitted_at: formatDbDate(row.submitted_at),
    responded_at: formatDbDate(row.responded_at),
  });
});

// PATCH /mentorship/checkins/:id  (mentor, ownership-checked)
export const updateCheckIn = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid check-in ID");
  await applyCheckInUpdate(id, req.body, { actorId: mentorId, mentorId });
  return successResponse(res, "Check-in updated", { checkin_id: id });
});

/**
 * One write path for a mentor answering a check-in and for an admin acting on
 * a mentor's behalf. `mentorId` restricts the row to that mentor's own inbox.
 *
 * Opening a check-in marks it ACKNOWLEDGED ("seen"); that alone neither stamps
 * responded_at nor notifies the student — only a reply, an approval/rejection
 * or marking it dealt with does, so Home's "your mentor replied" stays true.
 */
async function applyCheckInUpdate(
  id: number,
  body: any,
  opts: { actorId: number; mentorId?: number },
) {
  const { status, validation_status, mentor_response, linked_session_id } = body ?? {};
  if (status && !["NEW", "ACKNOWLEDGED", "ADDRESSED"].includes(status)) {
    throw new ValidationError("status must be NEW, ACKNOWLEDGED, or ADDRESSED");
  }
  if (validation_status && !["PENDING", "APPROVED", "REJECTED"].includes(validation_status)) {
    throw new ValidationError("validation_status must be PENDING, APPROVED, or REJECTED");
  }
  if (validation_status === "REJECTED" && !mentor_response?.trim()) {
    throw new ValidationError("A comment is required when rejecting a report");
  }

  const [existing] = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      mentor_id: MenteeCheckIn.mentor_id,
      title: MenteeCheckIn.title,
      status: MenteeCheckIn.status,
      mentor_response: MenteeCheckIn.mentor_response,
    })
    .from(MenteeCheckIn)
    .where(
      and(
        eq(MenteeCheckIn.checkin_id, id),
        opts.mentorId ? eq(MenteeCheckIn.mentor_id, opts.mentorId) : sql`1=1`,
      ),
    )
    .limit(1);

  if (!existing) throw new NotFoundError("Check-in not found");

  const response = typeof mentor_response === "string" ? mentor_response.trim() : mentor_response;
  const newReply = typeof response === "string" && response !== "" && response !== (existing.mentor_response ?? "");
  const answer: CheckInAnswer | null =
    validation_status === "APPROVED"
      ? "approved"
      : validation_status === "REJECTED"
        ? "rejected"
        : newReply
          ? "reply"
          : status === "ADDRESSED" && existing.status !== "ADDRESSED"
            ? "addressed"
            : null;

  await db
    .update(MenteeCheckIn)
    .set({
      // Approving/rejecting a report concludes the mentor's workflow on it,
      // so the read/action status moves to ADDRESSED unless the caller
      // explicitly set a different one in the same request. A reply on an
      // unread check-in at least marks it seen.
      ...(status
        ? { status }
        : validation_status
          ? { status: "ADDRESSED" }
          : newReply && existing.status === "NEW"
            ? { status: "ACKNOWLEDGED" }
            : {}),
      ...(validation_status ? { validation_status } : {}),
      ...(mentor_response !== undefined ? { mentor_response: response || null } : {}),
      ...(linked_session_id !== undefined
        ? { linked_session_id: linked_session_id ? parseInt(String(linked_session_id), 10) : null }
        : {}),
      ...(answer ? { responded_at: sql`CURRENT_TIMESTAMP` } : {}),
    })
    .where(eq(MenteeCheckIn.checkin_id, id));

  if (answer) {
    await notifyCheckInAnswered({
      checkinId: id,
      studentId: existing.student_id,
      mentorId: existing.mentor_id,
      actorId: opts.actorId,
      answer,
      title: existing.title ?? null,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/reports/consolidated  (mentor's own; admin passes mentor_id)
// Assembles the data behind the periodic consolidated PDF — mirrors the
// Rwanda Coding Academy reference report's shape (roster -> per-mentee
// basics/marks -> meeting log -> student comments -> follow-up summary).
// ─────────────────────────────────────────────────────────────────────────────
export const getConsolidatedReport = asyncHandler(async (req: any, res: any) => {
  const requesterId = req.user.userId as number;
  const { mentor_id, academic_year_id, start_date, end_date } = req.query;

  // The route accepts both the mentor viewing their own report (gated by
  // TEACHER_DASHBOARD, which every mentor holds) and an admin viewing any
  // mentor's report (gated by MANAGE_REPORTS/ALL_SUBMITTED_REPORTS/VIEW_REPORTS).
  // authorize() is OR-logic, so a plain mentor also satisfies the route guard —
  // an explicit ?mentor_id different from the caller must therefore be
  // re-checked here against the admin-level permissions specifically, or any
  // mentor could read any other mentor's full mentee report via this param.
  const requestedMentorId = mentor_id ? parseInt(String(mentor_id), 10) : requesterId;
  if (requestedMentorId !== requesterId) {
    const callerPerms: string[] = req.user.permissions ?? [];
    const isAdminLevel = [
      Permissions.MANAGE_REPORTS,
      Permissions.ALL_SUBMITTED_REPORTS,
      Permissions.VIEW_REPORTS,
    ].some((p) => callerPerms.includes(p));
    if (!isAdminLevel) {
      throw new AuthorizationError("You are not permitted to view another mentor's report");
    }
  }
  const mentorId = requestedMentorId;
  const academicYearId = academic_year_id
    ? parseInt(String(academic_year_id), 10)
    : await getCurrentAcademicYearId();

  if (!academicYearId) {
    throw new ValidationError("academic_year_id is required (no current academic year set)");
  }

  const [mentorProfile] = await db
    .select({ first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, mentorId))
    .limit(1);

  const assignments = await db
    .select({
      student_id: MentorAssignment.student_id,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      date_of_birth: UserProfile.date_of_birth,
      registration_number: UserProfile.registration_number,
    })
    .from(MentorAssignment)
    .innerJoin(UserProfile, eq(MentorAssignment.student_id, UserProfile.user_id))
    .where(
      and(
        eq(MentorAssignment.mentor_id, mentorId),
        eq(MentorAssignment.academic_year_id, academicYearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );

  const studentIds = assignments.map((a) => a.student_id);
  if (studentIds.length === 0) {
    return successResponse(res, "Consolidated report assembled", {
      mentor_name: `${mentorProfile?.first_name ?? ""} ${mentorProfile?.last_name ?? ""}`.trim(),
      academic_year_id: academicYearId,
      mentees: [],
    });
  }

  const dateConditions: any[] = [
    eq(MentorshipSession.user_id, mentorId),
    inArray(MentorshipSession.student_id, studentIds),
  ];
  if (start_date) dateConditions.push(sql`${MentorshipSession.session_date} >= ${start_date}`);
  if (end_date) dateConditions.push(sql`${MentorshipSession.session_date} <= ${end_date}`);

  const sessions = await db
    .select({
      mentorship_id: MentorshipSession.mentorship_id,
      student_id: MentorshipSession.student_id,
      session_date: MentorshipSession.session_date,
      topic: MentorshipSession.topic,
      next_steps: MentorshipSession.next_steps,
      guidance_notes: MentorshipSession.guidance_notes,
      notes: MentorshipSession.notes,
      follow_up_required: MentorshipSession.follow_up_required,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag: MentorshipSession.stress_flag,
    })
    .from(MentorshipSession)
    .where(and(...dateConditions))
    .orderBy(sql`${MentorshipSession.session_date} ASC`);

  const checkins = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      category: MenteeCheckIn.category,
      message: MenteeCheckIn.message,
      submitted_at: MenteeCheckIn.submitted_at,
    })
    .from(MenteeCheckIn)
    .where(
      and(
        eq(MenteeCheckIn.mentor_id, mentorId),
        inArray(MenteeCheckIn.student_id, studentIds),
        eq(MenteeCheckIn.validation_status, "APPROVED"),
      ),
    );

  const scores = await db
    .select({
      student_id: AssessmentScore.student_id,
      subject_name: Subject.name,
      score: AssessmentScore.score,
      max_score: AssessmentScore.max_score,
      assessment_type: AssessmentScore.assessment_type,
    })
    .from(AssessmentScore)
    .leftJoin(Subject, eq(AssessmentScore.subject_id, Subject.subject_id))
    .where(inArray(AssessmentScore.student_id, studentIds));

  const mentees = assignments.map((a) => {
    const menteeSessions = sessions
      .filter((s) => s.student_id === a.student_id)
      .map((s) => ({
        ...s,
        session_date: formatDbDate(s.session_date),
        follow_up_required: Boolean(s.follow_up_required),
        dishonesty_flagged: Boolean(s.dishonesty_flagged),
        stress_flag: Boolean(s.stress_flag),
      }));
    const menteeComments = checkins
      .filter((c) => c.student_id === a.student_id)
      .map((c) => ({ ...c, submitted_at: formatDbDate(c.submitted_at) }));
    const menteeScores = scores.filter((s) => s.student_id === a.student_id);

    return {
      student_id: a.student_id,
      name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
      date_of_birth: formatDbDate(a.date_of_birth),
      scores: menteeScores,
      sessions: menteeSessions,
      comments: menteeComments,
      recommend_follow_up: menteeSessions.some(
        (s) => s.follow_up_required || s.dishonesty_flagged || s.stress_flag,
      ),
    };
  });

  return successResponse(res, "Consolidated report assembled", {
    mentor_name: `${mentorProfile?.first_name ?? ""} ${mentorProfile?.last_name ?? ""}`.trim(),
    academic_year_id: academicYearId,
    mentees,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/reports/my-sessions?start_date&end_date
// Mentor-wide (across all of their mentees), period-scoped view of their own
// logged sessions AND the mentee check-ins they've received — the "view all
// reports by selected period range" requirement. Unlike the consolidated
// PDF (per-mentee sections), this is a flat, sortable timeline for quick
// browsing of a date range.
// ─────────────────────────────────────────────────────────────────────────────
export const getMySessionsReport = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const { start_date, end_date } = req.query;

  const sessionConditions: any[] = [eq(MentorshipSession.user_id, mentorId)];
  if (start_date) sessionConditions.push(sql`${MentorshipSession.session_date} >= ${start_date}`);
  if (end_date) sessionConditions.push(sql`${MentorshipSession.session_date} <= ${end_date}`);

  const sessions = await db
    .select({
      mentorship_id: MentorshipSession.mentorship_id,
      student_id: MentorshipSession.student_id,
      student_first: UserProfile.first_name,
      student_last: UserProfile.last_name,
      session_date: MentorshipSession.session_date,
      topic: MentorshipSession.topic,
      subject_name: Subject.name,
      duration_minutes: MentorshipSession.duration_minutes,
      wellbeing_status: MentorshipSession.wellbeing_status,
      follow_up_required: MentorshipSession.follow_up_required,
      dishonesty_flagged: MentorshipSession.dishonesty_flagged,
      stress_flag: MentorshipSession.stress_flag,
      session_status: MentorshipSession.session_status,
      notes: MentorshipSession.notes,
    })
    .from(MentorshipSession)
    .leftJoin(UserProfile, eq(MentorshipSession.student_id, UserProfile.user_id))
    .leftJoin(Subject, eq(MentorshipSession.subject_id, Subject.subject_id))
    .where(and(...sessionConditions))
    .orderBy(sql`${MentorshipSession.session_date} DESC`);

  const checkinConditions: any[] = [eq(MenteeCheckIn.mentor_id, mentorId)];
  if (start_date) checkinConditions.push(sql`${MenteeCheckIn.submitted_at} >= ${start_date}`);
  if (end_date) checkinConditions.push(sql`${MenteeCheckIn.submitted_at} <= DATE_ADD(${end_date}, INTERVAL 1 DAY)`);

  const checkins = await db
    .select({
      checkin_id: MenteeCheckIn.checkin_id,
      student_id: MenteeCheckIn.student_id,
      student_first: UserProfile.first_name,
      student_last: UserProfile.last_name,
      submitted_at: MenteeCheckIn.submitted_at,
      category: MenteeCheckIn.category,
      title: MenteeCheckIn.title,
      message: MenteeCheckIn.message,
      status: MenteeCheckIn.status,
      validation_status: MenteeCheckIn.validation_status,
    })
    .from(MenteeCheckIn)
    .leftJoin(UserProfile, eq(MenteeCheckIn.student_id, UserProfile.user_id))
    .where(and(...checkinConditions))
    .orderBy(sql`${MenteeCheckIn.submitted_at} DESC`);

  const formattedSessions = sessions.map((s) => ({
    ...s,
    student_name: `${s.student_first ?? ""} ${s.student_last ?? ""}`.trim() || null,
    session_date: formatDbDate(s.session_date),
    follow_up_required: Boolean(s.follow_up_required),
    dishonesty_flagged: Boolean(s.dishonesty_flagged),
    stress_flag: Boolean(s.stress_flag),
  }));

  const formattedCheckins = checkins.map((c) => ({
    ...c,
    student_name: `${c.student_first ?? ""} ${c.student_last ?? ""}`.trim() || null,
    submitted_at: formatDbDate(c.submitted_at),
  }));

  return successResponse(res, "My sessions report fetched", {
    period: { start_date: start_date ?? null, end_date: end_date ?? null },
    sessions: formattedSessions,
    checkins: formattedCheckins,
    summary: {
      total_sessions: formattedSessions.length,
      total_checkins: formattedCheckins.length,
      pending_checkins: formattedCheckins.filter((c) => c.validation_status === "PENDING").length,
      flagged_sessions: formattedSessions.filter((s) => s.dishonesty_flagged || s.stress_flag).length,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /mentorship/admin/checkins/:id  (admin — approve/reject on any mentor's behalf)
// Mirrors updateCheckIn's validation rules, but is gated on a management
// permission rather than mentor ownership, since admins need to be able to
// action check-ins across mentors (Analysis: "Admins ... approvals").
// ─────────────────────────────────────────────────────────────────────────────
export const adminUpdateCheckIn = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid check-in ID");
  await applyCheckInUpdate(id, req.body, { actorId: req.user.userId as number });
  return successResponse(res, "Check-in updated", { checkin_id: id });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/admin/dashboard  (school-wide mentorship stats)
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminMentorshipDashboard = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id, start_date, end_date } = req.query;
  const academicYearId = academic_year_id
    ? parseInt(String(academic_year_id), 10)
    : await getCurrentAcademicYearId();

  const assignmentConditions: any[] = [eq(MentorAssignment.status, "ACTIVE")];
  if (academicYearId) assignmentConditions.push(eq(MentorAssignment.academic_year_id, academicYearId));

  const [assignmentTotals] = await db
    .select({
      total_mentees: sql<number>`COUNT(DISTINCT ${MentorAssignment.student_id})`,
      total_mentors: sql<number>`COUNT(DISTINCT ${MentorAssignment.mentor_id})`,
    })
    .from(MentorAssignment)
    .where(and(...assignmentConditions));

  const sessionConditions: any[] = [];
  if (start_date) sessionConditions.push(sql`${MentorshipSession.session_date} >= ${start_date}`);
  if (end_date) sessionConditions.push(sql`${MentorshipSession.session_date} <= ${end_date}`);
  if (academicYearId) sessionConditions.push(eq(MentorshipSession.academic_year_id, academicYearId));

  const [sessionTotals] = await db
    .select({
      total_sessions: sql<number>`COUNT(*)`,
      flagged_sessions: sql<number>`SUM(CASE WHEN ${MentorshipSession.dishonesty_flagged} = 1 OR ${MentorshipSession.stress_flag} = 1 THEN 1 ELSE 0 END)`,
      follow_ups_open: sql<number>`SUM(CASE WHEN ${MentorshipSession.follow_up_required} = 1 AND ${MentorshipSession.session_status} != 'RESOLVED' THEN 1 ELSE 0 END)`,
    })
    .from(MentorshipSession)
    .where(sessionConditions.length > 0 ? and(...sessionConditions) : undefined);

  const wellbeingRows = await db
    .select({
      wellbeing_status: MentorshipSession.wellbeing_status,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(MentorshipSession)
    .where(
      and(
        sql`${MentorshipSession.wellbeing_status} IS NOT NULL`,
        ...(sessionConditions.length > 0 ? sessionConditions : []),
      ),
    )
    .groupBy(MentorshipSession.wellbeing_status);

  const checkinConditions: any[] = [];
  if (start_date) checkinConditions.push(sql`${MenteeCheckIn.submitted_at} >= ${start_date}`);
  if (end_date) checkinConditions.push(sql`${MenteeCheckIn.submitted_at} <= DATE_ADD(${end_date}, INTERVAL 1 DAY)`);
  if (academicYearId) checkinConditions.push(eq(MenteeCheckIn.academic_year_id, academicYearId));

  const [checkinTotals] = await db
    .select({
      total_checkins: sql<number>`COUNT(*)`,
      pending_checkins: sql<number>`SUM(CASE WHEN ${MenteeCheckIn.validation_status} = 'PENDING' THEN 1 ELSE 0 END)`,
      approved_checkins: sql<number>`SUM(CASE WHEN ${MenteeCheckIn.validation_status} = 'APPROVED' THEN 1 ELSE 0 END)`,
      rejected_checkins: sql<number>`SUM(CASE WHEN ${MenteeCheckIn.validation_status} = 'REJECTED' THEN 1 ELSE 0 END)`,
    })
    .from(MenteeCheckIn)
    .where(checkinConditions.length > 0 ? and(...checkinConditions) : undefined);

  const topMentors = await db
    .select({
      mentor_id: MentorshipSession.user_id,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      session_count: sql<number>`COUNT(*)`,
    })
    .from(MentorshipSession)
    .leftJoin(UserProfile, eq(MentorshipSession.user_id, UserProfile.user_id))
    .where(sessionConditions.length > 0 ? and(...sessionConditions) : undefined)
    .groupBy(MentorshipSession.user_id, UserProfile.first_name, UserProfile.last_name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  // "Overdue" mirrors the per-mentor definition used in getAssignedStudents
  // (no session in 21+ days, or never mentored) but computed school-wide.
  const lastSessionByStudent = await db
    .select({
      student_id: MentorshipSession.student_id,
      last_session_date: sql<string>`MAX(DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d'))`,
    })
    .from(MentorshipSession)
    .groupBy(MentorshipSession.student_id);
  const lastSessionMap = new Map(lastSessionByStudent.map((r) => [r.student_id, r.last_session_date]));

  const activeMentees = await db
    .selectDistinct({ student_id: MentorAssignment.student_id })
    .from(MentorAssignment)
    .where(and(...assignmentConditions));

  const today = new Date();
  const overdueCount = activeMentees.filter((m) => {
    const last = lastSessionMap.get(m.student_id);
    if (!last) return true;
    const daysSince = Math.floor((today.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 21;
  }).length;

  return successResponse(res, "Admin mentorship dashboard fetched", {
    period: { start_date: start_date ?? null, end_date: end_date ?? null },
    totals: {
      total_mentees: Number(assignmentTotals?.total_mentees ?? 0),
      total_mentors: Number(assignmentTotals?.total_mentors ?? 0),
      total_sessions: Number(sessionTotals?.total_sessions ?? 0),
      flagged_sessions: Number(sessionTotals?.flagged_sessions ?? 0),
      follow_ups_open: Number(sessionTotals?.follow_ups_open ?? 0),
      overdue_mentees: overdueCount,
      total_checkins: Number(checkinTotals?.total_checkins ?? 0),
      pending_checkins: Number(checkinTotals?.pending_checkins ?? 0),
      approved_checkins: Number(checkinTotals?.approved_checkins ?? 0),
      rejected_checkins: Number(checkinTotals?.rejected_checkins ?? 0),
    },
    wellbeing_distribution: wellbeingRows.map((r) => ({
      status: r.wellbeing_status,
      count: Number(r.cnt),
    })),
    top_mentors: topMentors.map((m) => ({
      mentor_id: m.mentor_id,
      mentor_name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || null,
      session_count: Number(m.session_count),
    })),
  });
});

// GET /mentorship/service/relationships/:userId  (client credentials, scope mentorship:read)
// A sibling app (Tupo) asks who mentors this person and whom they mentor right
// now, so it can show the mentor's profile and let a student message their own
// mentor even though students cannot start direct messages in general.
export const getRelationshipsForService = asyncHandler(async (req: any, res: any) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new ValidationError("A valid user id is required");
  return successResponse(res, "Mentorship relationships fetched", await mentorshipRelationshipsFor(userId));
});
