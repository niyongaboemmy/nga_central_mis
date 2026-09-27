import { db } from "../db";
import { eq, and, sql, inArray, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  MentorAssignment,
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
      student_id: MentorAssignment.student_id,
      student_first_name: StudentProfile.first_name,
      student_last_name: StudentProfile.last_name,
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
// POST /mentorship/assignments
// ─────────────────────────────────────────────────────────────────────────────
export const createAssignment = asyncHandler(async (req: any, res: any) => {
  const adminId = req.user.userId as number;
  const { mentor_id, student_id, academic_year_id, notes, reassign } = req.body;

  if (!mentor_id || !student_id) {
    throw new ValidationError("mentor_id and student_id are required");
  }

  const mentorIdNum = parseInt(String(mentor_id), 10);
  const studentIdNum = parseInt(String(student_id), 10);
  const yearId = academic_year_id
    ? parseInt(String(academic_year_id), 10)
    : await getCurrentAcademicYearId();

  if (!yearId) {
    throw new ValidationError("academic_year_id is required (no current academic year set)");
  }

  const existing = await db
    .select({ assignment_id: MentorAssignment.assignment_id, mentor_id: MentorAssignment.mentor_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.student_id, studentIdNum),
        eq(MentorAssignment.academic_year_id, yearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );

  // Mentors whose mentee list this changes (their access snapshots list mentees).
  const touchedMentors: number[] = [mentorIdNum];
  if (existing.length > 0) {
    if (!reassign) {
      throw new ConflictError(
        "Student already has an active mentor for this academic year. Pass reassign:true to replace it.",
      );
    }
    await db
      .update(MentorAssignment)
      .set({ status: "ENDED", ended_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(MentorAssignment.student_id, studentIdNum),
          eq(MentorAssignment.academic_year_id, yearId),
          eq(MentorAssignment.status, "ACTIVE"),
        ),
      );
  }

  const [result] = await db.insert(MentorAssignment).values({
    mentor_id: mentorIdNum,
    student_id: studentIdNum,
    academic_year_id: yearId,
    status: "ACTIVE",
    assigned_by: adminId,
    notes: notes ?? null,
  });
  await applyPlacementChange(
    [...touchedMentors, ...existing.map((e) => e.mentor_id)],
    adminId,
  );

  return successResponse(
    res,
    "Mentor assigned",
    { assignment_id: (result as any).insertId },
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

  const mentorIdNum = parseInt(String(mentor_id), 10);
  const yearId = academic_year_id
    ? parseInt(String(academic_year_id), 10)
    : await getCurrentAcademicYearId();

  if (!yearId) {
    throw new ValidationError("academic_year_id is required (no current academic year set)");
  }

  const studentIds = student_ids.map((id: any) => parseInt(String(id), 10));

  const existingActive = await db
    .select({ student_id: MentorAssignment.student_id })
    .from(MentorAssignment)
    .where(
      and(
        inArray(MentorAssignment.student_id, studentIds),
        eq(MentorAssignment.academic_year_id, yearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );

  const alreadyAssigned = new Set(existingActive.map((r) => r.student_id));

  if (alreadyAssigned.size > 0 && !reassign) {
    throw new ConflictError(
      `${alreadyAssigned.size} student(s) already have an active mentor this year. Pass reassign:true to replace.`,
    );
  }

  if (alreadyAssigned.size > 0) {
    await db
      .update(MentorAssignment)
      .set({ status: "ENDED", ended_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          inArray(MentorAssignment.student_id, [...alreadyAssigned]),
          eq(MentorAssignment.academic_year_id, yearId),
          eq(MentorAssignment.status, "ACTIVE"),
        ),
      );
  }

  const previousMentors = alreadyAssigned.size
    ? await db
        .selectDistinct({ mentor_id: MentorAssignment.mentor_id })
        .from(MentorAssignment)
        .where(
          and(
            inArray(MentorAssignment.student_id, [...alreadyAssigned]),
            eq(MentorAssignment.academic_year_id, yearId),
          ),
        )
    : [];
  await db.insert(MentorAssignment).values(
    studentIds.map((sid: number) => ({
      mentor_id: mentorIdNum,
      student_id: sid,
      academic_year_id: yearId,
      status: "ACTIVE" as const,
      assigned_by: adminId,
      notes: notes ?? null,
    })),
  );

  await applyPlacementChange([mentorIdNum, ...previousMentors.map((m) => m.mentor_id)], adminId);

  return successResponse(res, "Bulk assignment complete", { assigned: studentIds.length }, 201);
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
