import { db } from "../db";
import { eq, and, or, ne, isNull, sql, inArray, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  MentorAssignment,
  User,
  UserProfile,
  AcademicYear,
  StudentClassGroup,
  ClassGroup,
} from "../db/schema";
import { applyPlacementChange } from "../services/access/ruleEngine";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, ConflictError, NotFoundError } from "../errors/CustomError";

async function getCurrentAcademicYearId(): Promise<number | null> {
  const [row] = await db
    .select({ academic_year_id: AcademicYear.academic_year_id })
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .limit(1);
  return row?.academic_year_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/admin/assignments
// ─────────────────────────────────────────────────────────────────────────────
export const listAssignments = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id, mentor_id, student_id, status } = req.query;

  const conditions: any[] = [];
  if (academic_year_id && !isNaN(Number(academic_year_id))) {
    conditions.push(eq(MentorAssignment.academic_year_id, parseInt(String(academic_year_id), 10)));
  }
  if (mentor_id && !isNaN(Number(mentor_id))) {
    conditions.push(eq(MentorAssignment.mentor_id, parseInt(String(mentor_id), 10)));
  }
  if (student_id && !isNaN(Number(student_id))) {
    conditions.push(eq(MentorAssignment.student_id, parseInt(String(student_id), 10)));
  }
  if (status && ["ACTIVE", "ENDED"].includes(String(status))) {
    conditions.push(eq(MentorAssignment.status, status as "ACTIVE" | "ENDED"));
  }

  // Two joins on UserProfile need distinct aliases
  const MentorProfile = alias(UserProfile, "mentor_profile");
  const StudentProfile = alias(UserProfile, "student_profile");

  const rows = await db
    .select({
      assignment_id: MentorAssignment.assignment_id,
      mentor_id: MentorAssignment.mentor_id,
      mentor_first_name: MentorProfile.first_name,
      mentor_last_name: MentorProfile.last_name,
      mentor_user_type: MentorProfile.user_type,
      student_id: MentorAssignment.student_id,
      student_first_name: StudentProfile.first_name,
      student_last_name: StudentProfile.last_name,
      student_registration_number: StudentProfile.registration_number,
      academic_year_id: MentorAssignment.academic_year_id,
      academic_year_name: AcademicYear.name,
      status: MentorAssignment.status,
      assigned_at: MentorAssignment.assigned_at,
      ended_at: MentorAssignment.ended_at,
      notes: MentorAssignment.notes,
    })
    .from(MentorAssignment)
    .leftJoin(MentorProfile, eq(MentorAssignment.mentor_id, MentorProfile.user_id))
    .leftJoin(StudentProfile, eq(MentorAssignment.student_id, StudentProfile.user_id))
    .leftJoin(AcademicYear, eq(MentorAssignment.academic_year_id, AcademicYear.academic_year_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${MentorAssignment.assigned_at} DESC`);

  const formatted = rows.map((r) => ({
    ...r,
    mentor_name: `${r.mentor_first_name ?? ""} ${r.mentor_last_name ?? ""}`.trim() || null,
    student_name: `${r.student_first_name ?? ""} ${r.student_last_name ?? ""}`.trim() || null,
  }));

  return successResponse(res, "Mentor assignments fetched", formatted);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/admin/unassigned-students
// Enrolled, active students with no ACTIVE MentorAssignment this academic
// year — the roster-gap flag called out in the plan (a student with no
// mentor is exactly the kind of silent gap the reviewed reference report's
// non-engagement table shows real consequences of).
// ─────────────────────────────────────────────────────────────────────────────
export const getUnassignedStudents = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id } = req.query;
  const yearId = academic_year_id
    ? parseInt(String(academic_year_id), 10)
    : await getCurrentAcademicYearId();

  if (!yearId) {
    throw new ValidationError("academic_year_id is required (no current academic year set)");
  }

  const assignedStudentIds = await db
    .selectDistinct({ student_id: MentorAssignment.student_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.academic_year_id, yearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );
  const assignedIds = assignedStudentIds.map((r) => r.student_id);

  const rows = await db
    .selectDistinct({
      student_id: StudentClassGroup.user_id,
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
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
        assignedIds.length > 0 ? notInArray(StudentClassGroup.user_id, assignedIds) : sql`1=1`,
      ),
    );

  const formatted = rows.map((r) => ({
    ...r,
    student_name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
  }));

  return successResponse(res, "Unassigned students fetched", formatted);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mentorship/admin/candidates?role=mentor|student&q=&academic_year_id=
// Purpose-built picker search for the Assign Mentor modal. The generic
// /users/search used before capped at 20 rows *before* the client filtered by
// user_type, so students crowded staff out of the mentor list, and only
// TEACHER profiles were ever offered. A mentor may be anyone who is not a
// student (teacher, staff, admin, a profile with no type yet...).
// ─────────────────────────────────────────────────────────────────────────────
const CANDIDATE_LIMIT = 50;

function nameSearch(q: string) {
  const term = `%${q.toLowerCase()}%`;
  return or(
    sql`LOWER(${UserProfile.first_name}) LIKE ${term}`,
    sql`LOWER(${UserProfile.last_name}) LIKE ${term}`,
    sql`LOWER(CONCAT(IFNULL(${UserProfile.first_name}, ''), ' ', IFNULL(${UserProfile.last_name}, ''))) LIKE ${term}`,
    sql`LOWER(CONCAT(IFNULL(${UserProfile.last_name}, ''), ' ', IFNULL(${UserProfile.first_name}, ''))) LIKE ${term}`,
    sql`LOWER(${User.username}) LIKE ${term}`,
    sql`LOWER(${User.email}) LIKE ${term}`,
    sql`LOWER(${UserProfile.registration_number}) LIKE ${term}`,
  );
}

const fullName = (first: string | null, last: string | null) =>
  `${first ?? ""} ${last ?? ""}`.trim() || null;

export const searchCandidates = asyncHandler(async (req: any, res: any) => {
  const role = String(req.query.role ?? "");
  if (role !== "mentor" && role !== "student") {
    throw new ValidationError("role must be 'mentor' or 'student'");
  }
  const q = String(req.query.q ?? "").trim();
  const unassignedOnly = ["1", "true"].includes(String(req.query.unassigned_only ?? ""));
  const yearId = req.query.academic_year_id && !isNaN(Number(req.query.academic_year_id))
    ? parseInt(String(req.query.academic_year_id), 10)
    : await getCurrentAcademicYearId();

  if (role === "mentor") {
    const rows = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        user_type: UserProfile.user_type,
      })
      // Driven from UserProfile and joined to User on its primary key:
      // UserProfile.user_id has no index, so a User⟕UserProfile join is a full
      // nested loop on MySQL 5.7 (seconds on a few thousand users).
      .from(UserProfile)
      .innerJoin(User, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          eq(User.status, "ACTIVE"),
          or(isNull(UserProfile.user_type), ne(UserProfile.user_type, "STUDENT")),
          q ? nameSearch(q) : undefined,
        ),
      )
      // Teaching staff first, then other staff, then the rest; alphabetical within.
      .orderBy(
        sql`FIELD(IFNULL(${UserProfile.user_type}, 'ZZ'), 'TEACHER', 'STAFF', 'ADMIN', 'ZZ', 'PARENT')`,
        UserProfile.first_name,
        UserProfile.last_name,
      )
      .limit(CANDIDATE_LIMIT);

    const ids = rows.map((r) => r.user_id);
    const counts = ids.length && yearId
      ? await db
          .select({
            mentor_id: MentorAssignment.mentor_id,
            n: sql<number>`COUNT(DISTINCT ${MentorAssignment.student_id})`,
          })
          .from(MentorAssignment)
          .where(
            and(
              inArray(MentorAssignment.mentor_id, ids),
              eq(MentorAssignment.academic_year_id, yearId),
              eq(MentorAssignment.status, "ACTIVE"),
            ),
          )
          .groupBy(MentorAssignment.mentor_id)
      : [];
    const countOf = new Map(counts.map((c) => [c.mentor_id, Number(c.n)]));

    return successResponse(
      res,
      "Mentor candidates fetched",
      rows.map((r) => ({
        ...r,
        name: fullName(r.first_name, r.last_name) ?? r.username,
        mentee_count: countOf.get(r.user_id) ?? 0,
      })),
    );
  }

  const rows = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      registration_number: UserProfile.registration_number,
    })
    .from(UserProfile)
    .innerJoin(User, eq(User.user_id, UserProfile.user_id))
    .where(
      and(
        eq(User.status, "ACTIVE"),
        eq(UserProfile.user_type, "STUDENT"),
        q ? nameSearch(q) : undefined,
        unassignedOnly && yearId
          ? sql`NOT EXISTS (SELECT 1 FROM MentorAssignment ma WHERE ma.student_id = ${UserProfile.user_id} AND ma.academic_year_id = ${yearId} AND ma.status = 'ACTIVE')`
          : undefined,
      ),
    )
    .orderBy(UserProfile.first_name, UserProfile.last_name)
    .limit(CANDIDATE_LIMIT);

  const ids = rows.map((r) => r.user_id);
  const MentorProfile = alias(UserProfile, "mentor_profile");
  const [classes, mentors] = ids.length && yearId
    ? await Promise.all([
        db
          .select({ user_id: StudentClassGroup.user_id, class_group_name: ClassGroup.name })
          .from(StudentClassGroup)
          .innerJoin(ClassGroup, eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id))
          .where(
            and(
              inArray(StudentClassGroup.user_id, ids),
              eq(StudentClassGroup.academic_year_id, yearId),
              eq(StudentClassGroup.status, "ACTIVE"),
            ),
          ),
        db
          .select({
            student_id: MentorAssignment.student_id,
            mentor_id: MentorAssignment.mentor_id,
            mentor_first: MentorProfile.first_name,
            mentor_last: MentorProfile.last_name,
          })
          .from(MentorAssignment)
          .leftJoin(MentorProfile, eq(MentorAssignment.mentor_id, MentorProfile.user_id))
          .where(
            and(
              inArray(MentorAssignment.student_id, ids),
              eq(MentorAssignment.academic_year_id, yearId),
              eq(MentorAssignment.status, "ACTIVE"),
            ),
          ),
      ])
    : [[], []];
  const classOf = new Map(classes.map((c) => [c.user_id, c.class_group_name]));
  const mentorOf = new Map(mentors.map((m) => [m.student_id, m]));

  return successResponse(
    res,
    "Student candidates fetched",
    rows.map((r) => {
      const m = mentorOf.get(r.user_id);
      return {
        ...r,
        name: fullName(r.first_name, r.last_name) ?? r.username,
        class_group_name: classOf.get(r.user_id) ?? null,
        current_mentor_id: m?.mentor_id ?? null,
        current_mentor_name: m ? fullName(m.mentor_first, m.mentor_last) : null,
      };
    }),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared write path for single and bulk assignment.
// ─────────────────────────────────────────────────────────────────────────────
interface AssignOutcome {
  assigned: number; // newly mentored (had no mentor this year)
  moved: number; // taken over from another mentor
  unchanged: number; // already this mentor's mentee — left untouched
  assignment_ids: number[];
}

async function assignStudentsToMentor(params: {
  adminId: number;
  mentorId: number;
  studentIds: number[];
  yearId: number;
  reassign: boolean;
  notes: string | null;
}): Promise<AssignOutcome> {
  const { adminId, mentorId, yearId, reassign, notes } = params;
  const studentIds = [...new Set(params.studentIds)];

  if (studentIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new ValidationError("student ids must be positive integers");
  }
  if (!Number.isInteger(mentorId) || mentorId <= 0) {
    throw new ValidationError("mentor_id must be a positive integer");
  }
  if (studentIds.includes(mentorId)) {
    throw new ValidationError("A person cannot be their own mentor");
  }

  const people = await db
    .select({ user_id: User.user_id, status: User.status, user_type: UserProfile.user_type })
    .from(User)
    .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(inArray(User.user_id, [mentorId, ...studentIds]));
  const byId = new Map(people.map((p) => [p.user_id, p]));

  const mentor = byId.get(mentorId);
  if (!mentor) throw new NotFoundError("Mentor not found");
  if (mentor.status !== "ACTIVE") throw new ValidationError("The selected mentor's account is not active");
  if (mentor.user_type === "STUDENT") throw new ValidationError("A student cannot be assigned as a mentor");

  const notStudents = studentIds.filter((id) => byId.get(id)?.user_type !== "STUDENT");
  if (notStudents.length > 0) {
    throw new ValidationError(
      `Only students can be mentees (${notStudents.length} selected ${notStudents.length === 1 ? "person is" : "people are"} not a student)`,
    );
  }

  const [year] = await db
    .select({ academic_year_id: AcademicYear.academic_year_id })
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, yearId))
    .limit(1);
  if (!year) throw new NotFoundError("Academic year not found");

  const existing = await db
    .select({ student_id: MentorAssignment.student_id, mentor_id: MentorAssignment.mentor_id })
    .from(MentorAssignment)
    .where(
      and(
        inArray(MentorAssignment.student_id, studentIds),
        eq(MentorAssignment.academic_year_id, yearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );

  const alreadyMine = new Set(existing.filter((e) => e.mentor_id === mentorId).map((e) => e.student_id));
  const elsewhere = existing.filter((e) => e.mentor_id !== mentorId && !alreadyMine.has(e.student_id));
  const movingIds = [...new Set(elsewhere.map((e) => e.student_id))];

  if (movingIds.length > 0 && !reassign) {
    throw new ConflictError(
      movingIds.length === 1 && studentIds.length === 1
        ? "Student already has an active mentor for this academic year. Pass reassign:true to replace it."
        : `${movingIds.length} student(s) already have an active mentor this year. Pass reassign:true to replace.`,
    );
  }

  const toInsert = studentIds.filter((id) => !alreadyMine.has(id));
  const assignmentIds: number[] = [];

  await db.transaction(async (tx) => {
    if (movingIds.length > 0) {
      await tx
        .update(MentorAssignment)
        .set({ status: "ENDED", ended_at: sql`CURRENT_TIMESTAMP` })
        .where(
          and(
            inArray(MentorAssignment.student_id, movingIds),
            eq(MentorAssignment.academic_year_id, yearId),
            eq(MentorAssignment.status, "ACTIVE"),
          ),
        );
    }
    for (const sid of toInsert) {
      const [result] = await tx.insert(MentorAssignment).values({
        mentor_id: mentorId,
        student_id: sid,
        academic_year_id: yearId,
        status: "ACTIVE",
        assigned_by: adminId,
        notes,
      });
      assignmentIds.push((result as any).insertId);
    }
  });

  if (toInsert.length > 0) {
    // Mentors whose mentee list changed (their access snapshots list mentees).
    await applyPlacementChange([mentorId, ...elsewhere.map((e) => e.mentor_id)], adminId);
  }

  return {
    assigned: toInsert.length - movingIds.length,
    moved: movingIds.length,
    unchanged: alreadyMine.size,
    assignment_ids: assignmentIds,
  };
}

async function resolveYearId(raw: unknown): Promise<number> {
  const yearId = raw ? parseInt(String(raw), 10) : await getCurrentAcademicYearId();
  if (!yearId || isNaN(yearId)) {
    throw new ValidationError("academic_year_id is required (no current academic year set)");
  }
  return yearId;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /mentorship/assignments
// ─────────────────────────────────────────────────────────────────────────────
export const createAssignment = asyncHandler(async (req: any, res: any) => {
  const adminId = req.user.userId as number;
  const { mentor_id, student_id, academic_year_id, notes, reassign } = req.body;

  if (!mentor_id || !student_id) {
    throw new ValidationError("mentor_id and student_id are required");
  }

  const outcome = await assignStudentsToMentor({
    adminId,
    mentorId: parseInt(String(mentor_id), 10),
    studentIds: [parseInt(String(student_id), 10)],
    yearId: await resolveYearId(academic_year_id),
    reassign: Boolean(reassign),
    notes: notes ?? null,
  });

  if (outcome.unchanged === 1) {
    return successResponse(res, "Student is already assigned to this mentor", { ...outcome, assignment_id: null });
  }
  return successResponse(
    res,
    "Mentor assigned",
    { ...outcome, assignment_id: outcome.assignment_ids[0] },
    201,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /mentorship/assignments/bulk
// ─────────────────────────────────────────────────────────────────────────────
export const bulkAssign = asyncHandler(async (req: any, res: any) => {
  const adminId = req.user.userId as number;
  const { mentor_id, student_ids, academic_year_id, reassign, notes } = req.body;

  if (!mentor_id || !Array.isArray(student_ids) || student_ids.length === 0) {
    throw new ValidationError("mentor_id and a non-empty student_ids[] are required");
  }

  const outcome = await assignStudentsToMentor({
    adminId,
    mentorId: parseInt(String(mentor_id), 10),
    studentIds: student_ids.map((id: any) => parseInt(String(id), 10)),
    yearId: await resolveYearId(academic_year_id),
    reassign: Boolean(reassign),
    notes: notes ?? null,
  });

  return successResponse(res, "Bulk assignment complete", outcome, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /mentorship/assignments/:id  (soft-close, never a hard delete)
// ─────────────────────────────────────────────────────────────────────────────
export const endAssignment = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) throw new ValidationError("Invalid assignment ID");

  const existing = await db
    .select({ assignment_id: MentorAssignment.assignment_id, mentor_id: MentorAssignment.mentor_id })
    .from(MentorAssignment)
    .where(eq(MentorAssignment.assignment_id, id))
    .limit(1);

  if (existing.length === 0) throw new NotFoundError("Assignment not found");

  await db
    .update(MentorAssignment)
    .set({ status: "ENDED", ended_at: sql`CURRENT_TIMESTAMP` })
    .where(eq(MentorAssignment.assignment_id, id));
  await applyPlacementChange([existing[0].mentor_id], req.user?.userId);

  return successResponse(res, "Assignment ended", { assignment_id: id });
});
