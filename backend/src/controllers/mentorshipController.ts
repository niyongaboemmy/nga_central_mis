import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  MentorshipSession,
  UserProfile,
  TeacherSubjectAssignment,
  StudentClassGroup,
  ClassGroup,
  Subject,
  AssessmentScore,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";

const formatDbDate = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.split("T")[0];
  const dateObj = d as Date;
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function getInstructorClassGroupIds(userId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ class_group_id: TeacherSubjectAssignment.class_group_id })
    .from(TeacherSubjectAssignment)
    .where(eq(TeacherSubjectAssignment.user_id, userId));
  return rows.map((r) => r.class_group_id);
}

async function verifyStudentAccess(userId: number, studentId: number): Promise<void> {
  const classGroupIds = await getInstructorClassGroupIds(userId);
  if (classGroupIds.length === 0) return;
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
    throw new NotFoundError("Student not found in your assigned classes");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/students
// ─────────────────────────────────────────────────────────────────────────────
export const getAssignedStudents = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId as number;

  const classGroupIds = await getInstructorClassGroupIds(userId);

  if (classGroupIds.length === 0) {
    return successResponse(res, "No class groups assigned", []);
  }

  const students = await db
    .selectDistinct({
      user_id: StudentClassGroup.user_id,
      class_group_id: StudentClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(StudentClassGroup)
    .innerJoin(ClassGroup, eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id))
    .innerJoin(UserProfile, eq(StudentClassGroup.user_id, UserProfile.user_id))
    .where(
      and(
        inArray(StudentClassGroup.class_group_id, classGroupIds),
        eq(StudentClassGroup.status, "ACTIVE"),
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

  const classGroupIds = await getInstructorClassGroupIds(userId);
  if (classGroupIds.length > 0) {
    const enrollment = await db
      .select({ user_id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.user_id, studentIdNum),
          inArray(StudentClassGroup.class_group_id, classGroupIds),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (enrollment.length === 0) {
      throw new ValidationError("Student is not in your assigned classes");
    }
  }

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
  const { student_id, limit = "100" } = req.query;

  const conditions: any[] = [];
  if (student_id) {
    const sid = parseInt(String(student_id), 10);
    if (!isNaN(sid)) conditions.push(eq(MentorshipSession.student_id, sid));
  }

  const rows = await db
    .select({
      mentorship_id:         MentorshipSession.mentorship_id,
      student_id:            MentorshipSession.student_id,
      student_first:         UserProfile.first_name,
      student_last:          UserProfile.last_name,
      mentor_id:             MentorshipSession.user_id,
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
    .leftJoin(Subject, eq(MentorshipSession.subject_id, Subject.subject_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${MentorshipSession.session_date} DESC`)
    .limit(parseInt(String(limit), 10));

  const formatted = rows.map((r) => ({
    ...r,
    student_name: `${r.student_first ?? ""} ${r.student_last ?? ""}`.trim() || null,
    session_date: formatDbDate(r.session_date),
    follow_up_required: Boolean(r.follow_up_required),
    is_completed: Boolean(r.is_completed),
    dishonesty_flagged: Boolean(r.dishonesty_flagged),
    stress_flag: Boolean(r.stress_flag),
  }));

  return successResponse(res, "Admin mentoring log fetched", formatted);
});
