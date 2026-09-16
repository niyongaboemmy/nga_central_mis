import { db } from "../db";
import { eq, and, or, sql, inArray } from "drizzle-orm";
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

// Explicit roster, per migration 047 — "who mentors whom, this academic year."
async function getExplicitMenteeIds(
  mentorId: number,
  academicYearId?: number | null,
): Promise<number[]> {
  const rows = await db
    .selectDistinct({ student_id: MentorAssignment.student_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.mentor_id, mentorId),
        eq(MentorAssignment.status, "ACTIVE"),
        academicYearId
          ? eq(MentorAssignment.academic_year_id, academicYearId)
          : sql`1=1`,
      ),
    );
  return rows.map((r) => r.student_id);
}

// Legacy/implicit roster (pre-migration-047 behavior): "who do I teach."
// Kept only as a fallback for classes not yet covered by an explicit
// MentorAssignment row (migration 047's backfill seeds most of these, but a
// class group added after the backfill would otherwise silently vanish from
// a mentor's roster).
async function getInstructorClassGroupIds(
  userId: number,
  academicYearId?: number | null,
): Promise<number[]> {
  const rows = await db
    .selectDistinct({ class_group_id: TeacherSubjectAssignment.class_group_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        academicYearId
          ? eq(TeacherSubjectAssignment.academic_year_id, academicYearId)
          : sql`1=1`,
      ),
    );
  return rows.map((r) => r.class_group_id);
}

async function verifyStudentAccess(userId: number, studentId: number): Promise<void> {
  const explicitMentees = await getExplicitMenteeIds(userId);
  if (explicitMentees.includes(studentId)) return;

  // Fallback: legacy class-group inference, only reached when this mentor
  // has zero explicit MentorAssignment rows for this student — keeps a
  // mentor from losing access to a student teaching relationship that
  // hasn't been formally assigned yet.
  const classGroupIds = await getInstructorClassGroupIds(userId);
  if (classGroupIds.length === 0) {
    throw new NotFoundError("Student not found in your assigned mentees");
  }
  const enrollment = await db
    .select({ user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .where(
      and(
        eq(StudentClassGroup.user_id, studentId),
        inArray(StudentClassGroup.class_group_id, classGroupIds),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (enrollment.length === 0) {
    throw new NotFoundError("Student not found in your assigned mentees");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students
// ─────────────────────────────────────────────────────────────────────────────
export const getAssignedStudents = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;
  const { academic_year_id } = req.query;
  const academicYearId =
    academic_year_id && !isNaN(Number(academic_year_id))
      ? parseInt(academic_year_id as string)
      : await getCurrentAcademicYearId();

  // Primary source of truth (migration 047): explicit MentorAssignment roster.
  const explicitMenteeIds = await getExplicitMenteeIds(userId, academicYearId);

  // Legacy fallback: class groups this mentor teaches but has no explicit
  // MentorAssignment row for yet (pre-cutover classes, or a class added
  // after the one-time backfill migration ran).
  const classGroupIds = await getInstructorClassGroupIds(userId, academicYearId);

  if (explicitMenteeIds.length === 0 && classGroupIds.length === 0) {
    return successResponse(res, "No mentees assigned", []);
  }

  const students = await db
    .selectDistinct({
      user_id: StudentClassGroup.user_id,
      class_group_id: StudentClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      registration_number: UserProfile.registration_number,
    })
    .from(StudentClassGroup)
    .innerJoin(ClassGroup, eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id))
    .innerJoin(UserProfile, eq(StudentClassGroup.user_id, UserProfile.user_id))
    .where(
      and(
        eq(StudentClassGroup.status, "ACTIVE"),
        or(
          inArray(StudentClassGroup.class_group_id, classGroupIds.length > 0 ? classGroupIds : [-1]),
          inArray(StudentClassGroup.user_id, explicitMenteeIds.length > 0 ? explicitMenteeIds : [-1]),
        ),
      ),
    );

  if (students.length === 0) {
    return successResponse(res, "No students found", []);
  }

  const studentIds = [...new Set(students.map((s) => s.user_id))];

  const lastSessions = await db
    .select({
      student_id: MentorshipSession.student_id,
      last_session_date: sql<string>`MAX(DATE_FORMAT(${MentorshipSession.session_date}, '%Y-%m-%d'))`,
      wellbeing_status: sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${MentorshipSession.wellbeing_status} ORDER BY ${MentorshipSession.session_date} DESC), ',', 1)`,
      follow_up_required: sql<number>`MAX(${MentorshipSession.follow_up_required})`,
      dishonesty_flagged: sql<number>`MAX(${MentorshipSession.dishonesty_flagged})`,
      stress_flag: sql<number>`MAX(${MentorshipSession.stress_flag})`,
    })
    .from(MentorshipSession)
    .where(
      and(
        eq(MentorshipSession.user_id, userId),
        inArray(MentorshipSession.student_id, studentIds),
      ),
    )
    .groupBy(MentorshipSession.student_id);

  const sessionMap = new Map<number, (typeof lastSessions)[0]>();
  for (const s of lastSessions) {
    if (s.student_id !== null) sessionMap.set(s.student_id, s);
  }

  const today = new Date();

  const seen = new Set<number>();
  const result = [];

  for (const s of students) {
    if (seen.has(s.user_id)) continue;
    seen.add(s.user_id);

    const session = sessionMap.get(s.user_id);
    let days_since_last_session: number | null = null;
    if (session?.last_session_date) {
      const last = new Date(session.last_session_date);
      days_since_last_session = Math.floor(
        (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    result.push({
      user_id: s.user_id,
      first_name: s.first_name,
      last_name: s.last_name,
      class_group_name: s.class_group_name,
      last_session_date: session?.last_session_date ?? null,
      days_since_last_session,
      wellbeing_status: session?.wellbeing_status ?? null,
      follow_up_required: Boolean(session?.follow_up_required),
      dishonesty_flagged: Boolean(session?.dishonesty_flagged),
      stress_flag: Boolean(session?.stress_flag),
      overdue: days_since_last_session === null || days_since_last_session > 21,
    });
  }

  result.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  return successResponse(res, "Assigned students fetched", result);
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

  await verifyStudentAccess(userId, studentId);

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

  return successResponse(res, "Check-in submitted", { checkin_id: (result as any).insertId }, 201);
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
  if (!academicYearId) {
    return successResponse(res, "No mentor assigned", null);
  }

  const [row] = await db
    .select({
      mentor_id: MentorAssignment.mentor_id,
      mentor_email: User.email,
      mentor_first: UserProfile.first_name,
      mentor_last: UserProfile.last_name,
      assigned_at: MentorAssignment.assigned_at,
    })
    .from(MentorAssignment)
    .innerJoin(User, eq(MentorAssignment.mentor_id, User.user_id))
    .leftJoin(UserProfile, eq(MentorAssignment.mentor_id, UserProfile.user_id))
    .where(
      and(
        eq(MentorAssignment.student_id, studentId),
        eq(MentorAssignment.academic_year_id, academicYearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!row) {
    return successResponse(res, "No mentor assigned", null);
  }

  return successResponse(res, "Your mentor fetched", {
    mentor_id: row.mentor_id,
    mentor_name: `${row.mentor_first ?? ""} ${row.mentor_last ?? ""}`.trim() || null,
    mentor_email: row.mentor_email,
    assigned_at: formatDbDate(row.assigned_at),
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

  const [row] = await db
    .select()
    .from(MenteeCheckIn)
    .where(and(eq(MenteeCheckIn.checkin_id, id), eq(MenteeCheckIn.mentor_id, mentorId)))
    .limit(1);

  if (!row) throw new NotFoundError("Check-in not found");

  return successResponse(res, "Check-in fetched", {
    ...row,
    submitted_at: formatDbDate(row.submitted_at),
    responded_at: formatDbDate(row.responded_at),
  });
});

// PATCH /mentorship/checkins/:id  (mentor, ownership-checked)
export const updateCheckIn = asyncHandler(async (req: any, res: any) => {
  const mentorId = req.user.userId as number;
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid check-in ID");

  const { status, validation_status, mentor_response, linked_session_id } = req.body;
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
    .select({ checkin_id: MenteeCheckIn.checkin_id })
    .from(MenteeCheckIn)
    .where(and(eq(MenteeCheckIn.checkin_id, id), eq(MenteeCheckIn.mentor_id, mentorId)))
    .limit(1);

  if (!existing) throw new NotFoundError("Check-in not found");

  await db
    .update(MenteeCheckIn)
    .set({
      // Approving/rejecting a report concludes the mentor's workflow on it,
      // so the read/action status moves to ADDRESSED unless the caller
      // explicitly set a different one in the same request.
      ...(status ? { status } : validation_status ? { status: "ADDRESSED" } : {}),
      ...(validation_status ? { validation_status } : {}),
      ...(mentor_response !== undefined ? { mentor_response } : {}),
      ...(linked_session_id !== undefined
        ? { linked_session_id: linked_session_id ? parseInt(String(linked_session_id), 10) : null }
        : {}),
      ...(mentor_response !== undefined || status || validation_status
        ? { responded_at: sql`CURRENT_TIMESTAMP` }
        : {}),
    })
    .where(eq(MenteeCheckIn.checkin_id, id));

  return successResponse(res, "Check-in updated", { checkin_id: id });
});

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

  const { status, validation_status, mentor_response, linked_session_id } = req.body;
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
    .select({ checkin_id: MenteeCheckIn.checkin_id })
    .from(MenteeCheckIn)
    .where(eq(MenteeCheckIn.checkin_id, id))
    .limit(1);

  if (!existing) throw new NotFoundError("Check-in not found");

  await db
    .update(MenteeCheckIn)
    .set({
      ...(status ? { status } : validation_status ? { status: "ADDRESSED" } : {}),
      ...(validation_status ? { validation_status } : {}),
      ...(mentor_response !== undefined ? { mentor_response } : {}),
      ...(linked_session_id !== undefined
        ? { linked_session_id: linked_session_id ? parseInt(String(linked_session_id), 10) : null }
        : {}),
      ...(mentor_response !== undefined || status || validation_status
        ? { responded_at: sql`CURRENT_TIMESTAMP` }
        : {}),
    })
    .where(eq(MenteeCheckIn.checkin_id, id));

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
