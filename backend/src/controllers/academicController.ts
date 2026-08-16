import { db } from "../db";
import { eq, and, or, sql, SQL, desc, not, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  AcademicYear,
  AcademicTerm,
  Program,
  Grade,
  Subject,
  CourseCategory,
  ClassGroup,
  GradeSubject,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  StudentClassGroup,
  User,
  UserProfile,
  UserProgramLead,
  UserRole,
  Role,
  SchemeOfWork,
} from "../db/schema";
import { sanitizeString } from "../utils/sanitization";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";
import { getCurrentAcademicYearId } from "../utils/academicYear";

// Helper function to format date for MySQL
const formatDateForMySQL = (dateStr: string | undefined) => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0];
  } catch {
    return null;
  }
};

// Academic Years Management
export const getAcademicYears = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all academic years");

  const academicYears = await db
    .select()
    .from(AcademicYear)
    .orderBy(AcademicYear.start_date);

  successResponse(res, "Academic years retrieved successfully", academicYears);
});

export const getAcademicYear = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicYearId = parseInt(id);

  if (isNaN(academicYearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  const academicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, academicYearId))
    .limit(1);

  if (academicYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  successResponse(res, "Academic year retrieved successfully", academicYear[0]);
});

export const createAcademicYear = asyncHandler(async (req: any, res: any) => {
  const { name, start_date, end_date, is_current } = req.body;

  if (!name || !start_date || !end_date) {
    throw new ValidationError("Name, start date, and end date are required");
  }

  const sanitizedName = sanitizeString(name);
  const formattedStartDate = formatDateForMySQL(start_date);
  const formattedEndDate = formatDateForMySQL(end_date);

  if (!formattedStartDate || !formattedEndDate) {
    throw new ValidationError("Invalid date format");
  }

  // Check if name already exists
  const existingYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.name, sanitizedName))
    .limit(1);

  if (existingYear.length > 0) {
    throw new ConflictError("Academic year with this name already exists");
  }

  // If setting as current, unset other current years
  if (is_current) {
    await db
      .update(AcademicYear)
      .set({ is_current: 0 })
      .where(eq(AcademicYear.is_current, 1));
  }

  const result = await db.insert(AcademicYear).values({
    name: sanitizedName,
    start_date: sql`${formattedStartDate}`,
    end_date: sql`${formattedEndDate}`,
    is_current: is_current ? 1 : 0,
  });

  logger.info("Academic year created", { name: sanitizedName });
  const resultHeader = Array.isArray(result) ? result[0] : result;
  const academicYearId = (resultHeader as any).insertId;

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_YEAR_CREATE",
      `Created academic year: ${sanitizedName}`,
      "AcademicYear",
      academicYearId,
      { name: sanitizedName, start_date, end_date, is_current },
      req.user.userId,
    );
  }

  successResponse(res, "Academic year created successfully", null, 201);
});

export const updateAcademicYear = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicYearId = parseInt(id);
  const { name, start_date, end_date, is_current } = req.body;

  if (isNaN(academicYearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  const existingYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, academicYearId))
    .limit(1);

  if (existingYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  const updateData: any = {};

  if (name !== undefined) {
    const sanitizedName = sanitizeString(name);
    // Check for name conflicts
    const nameConflict = await db
      .select()
      .from(AcademicYear)
      .where(
        and(
          eq(AcademicYear.name, sanitizedName),
          sql`${AcademicYear.academic_year_id} != ${academicYearId}`,
        ),
      )
      .limit(1);

    if (nameConflict.length > 0) {
      throw new ConflictError("Academic year with this name already exists");
    }
    updateData.name = sanitizedName;
  }

  if (start_date !== undefined) {
    const formattedStartDate = formatDateForMySQL(start_date);
    if (!formattedStartDate) {
      throw new ValidationError("Invalid start date format");
    }
    updateData.start_date = sql`${formattedStartDate}`;
  }

  if (end_date !== undefined) {
    const formattedEndDate = formatDateForMySQL(end_date);
    if (!formattedEndDate) {
      throw new ValidationError("Invalid end date format");
    }
    updateData.end_date = sql`${formattedEndDate}`;
  }

  if (is_current !== undefined) {
    // If setting as current, unset other current years
    if (is_current) {
      await db
        .update(AcademicYear)
        .set({ is_current: 0 })
        .where(eq(AcademicYear.is_current, 1));
    }
    updateData.is_current = is_current ? 1 : 0;
  }

  await db
    .update(AcademicYear)
    .set(updateData)
    .where(eq(AcademicYear.academic_year_id, academicYearId));

  logger.info("Academic year updated", { academicYearId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_YEAR_UPDATE",
      `Updated academic year: ${updateData.name || "ID " + academicYearId}`,
      "AcademicYear",
      academicYearId,
      updateData,
      req.user.userId,
    );
  }

  successResponse(res, "Academic year updated successfully");
});

export const deleteAcademicYear = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicYearId = parseInt(id);

  if (isNaN(academicYearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  const existingYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, academicYearId))
    .limit(1);

  if (existingYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  // Check if academic year has terms
  const termsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_year_id, academicYearId));

  if (termsCount[0].count > 0) {
    throw new ValidationError(
      "Cannot delete academic year with existing terms",
    );
  }

  await db
    .delete(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, academicYearId));

  logger.info("Academic year deleted", { academicYearId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_YEAR_DELETE",
      `Deleted academic year ID: ${academicYearId}`,
      "AcademicYear",
      academicYearId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Academic year deleted successfully");
});

// Academic Terms Management
export const getAcademicTerms = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id } = req.query;

  let whereCondition = undefined;

  if (academic_year_id) {
    const yearId = parseInt(academic_year_id as string);
    if (!isNaN(yearId)) {
      whereCondition = eq(AcademicTerm.academic_year_id, yearId);
    }
  }

  const academicTerms = await db
    .select()
    .from(AcademicTerm)
    .where(whereCondition)
    .orderBy(AcademicTerm.start_date);

  successResponse(res, "Academic terms retrieved successfully", academicTerms);
});

export const getAcademicTerm = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicTermId = parseInt(id);

  if (isNaN(academicTermId)) {
    throw new ValidationError("Invalid academic term ID");
  }

  const academicTerm = await db
    .select()
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);

  if (academicTerm.length === 0) {
    throw new NotFoundError("Academic term not found");
  }

  successResponse(res, "Academic term retrieved successfully", academicTerm[0]);
});

export const createAcademicTerm = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id, name, start_date, end_date, is_current } = req.body;

  if (!academic_year_id || !name || !start_date || !end_date) {
    throw new ValidationError(
      "Academic year ID, name, start date, and end date are required",
    );
  }

  const yearId = parseInt(academic_year_id);
  if (isNaN(yearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  // Verify academic year exists
  const academicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, yearId))
    .limit(1);

  if (academicYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  const sanitizedName = sanitizeString(name);
  const formattedStartDate = formatDateForMySQL(start_date);
  const formattedEndDate = formatDateForMySQL(end_date);

  if (!formattedStartDate || !formattedEndDate) {
    throw new ValidationError("Invalid date format");
  }

  // If setting as current, unset other current terms
  if (is_current) {
    await db
      .update(AcademicTerm)
      .set({ is_current: 0 })
      .where(eq(AcademicTerm.is_current, 1));
  }

  const result = await db.insert(AcademicTerm).values({
    academic_year_id: yearId,
    name: sanitizedName,
    start_date: sql`${formattedStartDate}`,
    end_date: sql`${formattedEndDate}`,
    is_current: is_current ? 1 : 0,
  });

  logger.info("Academic term created", {
    name: sanitizedName,
    academicYearId: yearId,
  });

  const resultHeader = Array.isArray(result) ? result[0] : result;
  const academicTermId = (resultHeader as any).insertId;

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_TERM_CREATE",
      `Created academic term: ${sanitizedName}`,
      "AcademicTerm",
      academicTermId,
      {
        name: sanitizedName,
        academic_year_id: yearId,
        start_date,
        end_date,
        is_current,
      },
      req.user.userId,
    );
  }

  successResponse(res, "Academic term created successfully", null, 201);
});

export const updateAcademicTerm = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicTermId = parseInt(id);
  const { academic_year_id, name, start_date, end_date, is_current } = req.body;

  if (isNaN(academicTermId)) {
    throw new ValidationError("Invalid academic term ID");
  }

  const existingTerm = await db
    .select()
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);

  if (existingTerm.length === 0) {
    throw new NotFoundError("Academic term not found");
  }

  const updateData: any = {};

  if (academic_year_id !== undefined) {
    const yearId = parseInt(academic_year_id);
    if (isNaN(yearId)) {
      throw new ValidationError("Invalid academic year ID");
    }

    // Verify academic year exists
    const academicYear = await db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, yearId))
      .limit(1);

    if (academicYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    updateData.academic_year_id = yearId;
  }

  if (name !== undefined) {
    updateData.name = sanitizeString(name);
  }

  if (start_date !== undefined) {
    const formattedStartDate = formatDateForMySQL(start_date);
    if (!formattedStartDate) {
      throw new ValidationError("Invalid start date format");
    }
    updateData.start_date = sql`${formattedStartDate}`;
  }

  if (end_date !== undefined) {
    const formattedEndDate = formatDateForMySQL(end_date);
    if (!formattedEndDate) {
      throw new ValidationError("Invalid end date format");
    }
    updateData.end_date = sql`${formattedEndDate}`;
  }

  if (is_current !== undefined) {
    // If setting as current, unset other current terms
    if (is_current) {
      await db
        .update(AcademicTerm)
        .set({ is_current: 0 })
        .where(eq(AcademicTerm.is_current, 1));
    }
    updateData.is_current = is_current ? 1 : 0;
  }

  await db
    .update(AcademicTerm)
    .set(updateData)
    .where(eq(AcademicTerm.academic_term_id, academicTermId));

  logger.info("Academic term updated", { academicTermId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_TERM_UPDATE",
      `Updated academic term ID: ${academicTermId}`,
      "AcademicTerm",
      academicTermId,
      { ...req.body },
      req.user.userId,
    );
  }

  successResponse(res, "Academic term updated successfully");
});

export const deleteAcademicTerm = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const academicTermId = parseInt(id);

  if (isNaN(academicTermId)) {
    throw new ValidationError("Invalid academic term ID");
  }

  const existingTerm = await db
    .select()
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);

  if (existingTerm.length === 0) {
    throw new NotFoundError("Academic term not found");
  }

  await db
    .delete(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId));

  logger.info("Academic term deleted", { academicTermId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "ACADEMIC_TERM_DELETE",
      `Deleted academic term ID: ${academicTermId}`,
      "AcademicTerm",
      academicTermId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Academic term deleted successfully");
});

// Programs Management
export const getPrograms = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all programs");

  const programs = await db.select().from(Program).orderBy(Program.name);

  successResponse(res, "Programs retrieved successfully", programs);
});

export const getProgram = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const programId = parseInt(id);

  if (isNaN(programId)) {
    throw new ValidationError("Invalid program ID");
  }

  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programId))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  successResponse(res, "Program retrieved successfully", program[0]);
});

export const createProgram = asyncHandler(async (req: any, res: any) => {
  const { name, description } = req.body;

  if (!name) {
    throw new ValidationError("Program name is required");
  }

  const sanitizedName = sanitizeString(name);
  const sanitizedDescription = description
    ? sanitizeString(description)
    : undefined;

  // Check if name already exists
  const existingProgram = await db
    .select()
    .from(Program)
    .where(eq(Program.name, sanitizedName))
    .limit(1);

  if (existingProgram.length > 0) {
    throw new ConflictError("Program with this name already exists");
  }

  const result = await db.insert(Program).values({
    name: sanitizedName,
    description: sanitizedDescription || null,
  });

  const resultHeader = Array.isArray(result) ? result[0] : result;
  const programId = (resultHeader as any).insertId;

  logger.info("Program created", { name: sanitizedName });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "PROGRAM_CREATE",
      `Created program: ${sanitizedName}`,
      "Program",
      programId,
      { name: sanitizedName, description },
      req.user.userId,
    );
  }

  successResponse(res, "Program created successfully", null, 201);
});

export const updateProgram = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const programId = parseInt(id);
  const { name, description } = req.body;

  if (isNaN(programId)) {
    throw new ValidationError("Invalid program ID");
  }

  const existingProgram = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programId))
    .limit(1);

  if (existingProgram.length === 0) {
    throw new NotFoundError("Program not found");
  }

  const updateData: any = {};

  if (name !== undefined) {
    const sanitizedName = sanitizeString(name);
    // Check for name conflicts
    const nameConflict = await db
      .select()
      .from(Program)
      .where(
        and(
          eq(Program.name, sanitizedName),
          sql`${Program.program_id} != ${programId}`,
        ),
      )
      .limit(1);

    if (nameConflict.length > 0) {
      throw new ConflictError("Program with this name already exists");
    }
    updateData.name = sanitizedName;
  }

  if (description !== undefined) {
    updateData.description = description ? sanitizeString(description) : null;
  }

  await db
    .update(Program)
    .set(updateData)
    .where(eq(Program.program_id, programId));

  logger.info("Program updated", { programId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "PROGRAM_UPDATE",
      `Updated program: ${updateData.name || "ID " + programId}`,
      "Program",
      programId,
      updateData,
      req.user.userId,
    );
  }

  successResponse(res, "Program updated successfully");
});

export const deleteProgram = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const programId = parseInt(id);

  if (isNaN(programId)) {
    throw new ValidationError("Invalid program ID");
  }

  const existingProgram = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programId))
    .limit(1);

  if (existingProgram.length === 0) {
    throw new NotFoundError("Program not found");
  }

  // Check if program has grades
  const gradesCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(Grade)
    .where(eq(Grade.program_id, programId));

  if (gradesCount[0].count > 0) {
    throw new ValidationError("Cannot delete program with existing grades");
  }

  await db.delete(Program).where(eq(Program.program_id, programId));

  logger.info("Program deleted", { programId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "PROGRAM_DELETE",
      `Deleted program ID: ${programId}`,
      "Program",
      programId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Program deleted successfully");
});

// Grades Management
export const getGrades = asyncHandler(async (req: any, res: any) => {
  const { program_id } = req.query;
  const userPermissions = req.user.permissions;

  let whereCondition = undefined;

  // If user has VIEW_PROGRAM_ACADEMICS but not MANAGE_ACADEMICS,
  // they can only view grades from their assigned programs
  if (
    userPermissions.includes("VIEW_PROGRAM_ACADEMICS") &&
    !userPermissions.includes("MANAGE_ACADEMICS")
  ) {
    // Get user's assigned programs
    const currentYearIdForScope = await getCurrentAcademicYearId();
    const userPrograms = currentYearIdForScope
      ? await db
          .select({ program_id: UserProgramLead.program_id })
          .from(UserProgramLead)
          .where(
            and(
              eq(UserProgramLead.user_id, req.user.userId),
              eq(UserProgramLead.academic_year_id, currentYearIdForScope),
            ),
          )
      : [];

    const assignedProgramIds = userPrograms.map((up) => up.program_id);

    if (assignedProgramIds.length === 0) {
      return successResponse(res, "Grades retrieved successfully", []);
    }

    whereCondition = and(
      whereCondition || undefined,
      sql`${Grade.program_id} IN (${assignedProgramIds.join(",")})`,
    );
  }

  if (program_id) {
    const progId = parseInt(program_id as string);
    if (!isNaN(progId)) {
      whereCondition = and(
        whereCondition || undefined,
        eq(Grade.program_id, progId),
      );
    }
  }

  const grades = await db
    .select({
      grade_id: Grade.grade_id,
      program_id: Grade.program_id,
      name: Grade.name,
      level_order: Grade.level_order,
      program_name: Program.name,
    })
    .from(Grade)
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(whereCondition)
    .orderBy(Grade.level_order);

  successResponse(res, "Grades retrieved successfully", grades);
});

export const getGrade = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const gradeId = parseInt(id);

  if (isNaN(gradeId)) {
    throw new ValidationError("Invalid grade ID");
  }

  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  successResponse(res, "Grade retrieved successfully", grade[0]);
});

export const createGrade = asyncHandler(async (req: any, res: any) => {
  const { program_id, name, level_order } = req.body;

  if (!program_id || !name || level_order === undefined) {
    throw new ValidationError("Program ID, name, and level order are required");
  }

  const progId = parseInt(program_id);
  if (isNaN(progId)) {
    throw new ValidationError("Invalid program ID");
  }

  // Verify program exists
  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, progId))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  const sanitizedName = sanitizeString(name);
  const levelOrderNum = parseInt(level_order);
  if (isNaN(levelOrderNum)) {
    throw new ValidationError("Invalid level order");
  }

  const result = await db.insert(Grade).values({
    program_id: progId,
    name: sanitizedName,
    level_order: levelOrderNum,
  });

  const gradeId = (result as any).insertId;

  logger.info("Grade created", { name: sanitizedName, programId: progId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "GRADE_CREATE",
      `Created grade: ${sanitizedName} in program ID ${progId}`,
      "Grade",
      gradeId,
      { name: sanitizedName, program_id: progId, level_order: levelOrderNum },
      req.user.userId,
    );
  }

  successResponse(res, "Grade created successfully", null, 201);
});

export const updateGrade = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const gradeId = parseInt(id);
  const { program_id, name, level_order } = req.body;

  if (isNaN(gradeId)) {
    throw new ValidationError("Invalid grade ID");
  }

  const existingGrade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (existingGrade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  const updateData: any = {};

  if (program_id !== undefined) {
    const progId = parseInt(program_id);
    if (isNaN(progId)) {
      throw new ValidationError("Invalid program ID");
    }

    // Verify program exists
    const program = await db
      .select()
      .from(Program)
      .where(eq(Program.program_id, progId))
      .limit(1);

    if (program.length === 0) {
      throw new NotFoundError("Program not found");
    }

    updateData.program_id = progId;
  }

  if (name !== undefined) {
    updateData.name = sanitizeString(name);
  }

  if (level_order !== undefined) {
    const levelOrderNum = parseInt(level_order);
    if (isNaN(levelOrderNum)) {
      throw new ValidationError("Invalid level order");
    }
    updateData.level_order = levelOrderNum;
  }

  await db.update(Grade).set(updateData).where(eq(Grade.grade_id, gradeId));

  logger.info("Grade updated", { gradeId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "GRADE_UPDATE",
      `Updated grade ID: ${gradeId}`,
      "Grade",
      gradeId,
      { ...req.body },
      req.user.userId,
    );
  }

  successResponse(res, "Grade updated successfully");
});

export const deleteGrade = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const gradeId = parseInt(id);

  if (isNaN(gradeId)) {
    throw new ValidationError("Invalid grade ID");
  }

  const existingGrade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (existingGrade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // Check if grade has class groups
  const classGroupsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(ClassGroup)
    .where(eq(ClassGroup.grade_id, gradeId));

  if (classGroupsCount[0].count > 0) {
    throw new ValidationError("Cannot delete grade with existing class groups");
  }

  await db.delete(Grade).where(eq(Grade.grade_id, gradeId));

  logger.info("Grade deleted", { gradeId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "GRADE_DELETE",
      `Deleted grade ID: ${gradeId}`,
      "Grade",
      gradeId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Grade deleted successfully");
});

// CourseCategory Management
export const getCourseCategories = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all course categories");

  const categories = await db
    .select()
    .from(CourseCategory)
    .where(eq(CourseCategory.status, "ACTIVE"))
    .orderBy(CourseCategory.name);

  successResponse(res, "Course categories retrieved successfully", categories);
});

export const getCourseCategoryById = asyncHandler(
  async (req: any, res: any) => {
    const { id } = req.params;
    const categoryId = parseInt(id);

    if (isNaN(categoryId)) {
      throw new ValidationError("Invalid course category ID");
    }

    const category = await db
      .select()
      .from(CourseCategory)
      .where(eq(CourseCategory.category_id, categoryId))
      .limit(1);

    if (category.length === 0) {
      throw new NotFoundError("Course category not found");
    }

    successResponse(res, "Course category retrieved successfully", category[0]);
  },
);

export const createCourseCategory = asyncHandler(async (req: any, res: any) => {
  const { name, description } = req.body;

  if (!name) {
    throw new ValidationError("Category name is required");
  }

  const sanitizedName = sanitizeString(name);
  const sanitizedDescription = description
    ? sanitizeString(description)
    : undefined;

  // Check if name already exists
  const existingCategory = await db
    .select()
    .from(CourseCategory)
    .where(eq(CourseCategory.name, sanitizedName))
    .limit(1);

  if (existingCategory.length > 0) {
    throw new ConflictError("Course category with this name already exists");
  }

  const result = await db.insert(CourseCategory).values({
    name: sanitizedName,
    description: sanitizedDescription || null,
  });

  const categoryId = (result as any).insertId;
  logger.info("Course category created", { name: sanitizedName });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "COURSE_CATEGORY_CREATE",
      `Created course category: ${sanitizedName}`,
      "CourseCategory",
      categoryId,
      { name: sanitizedName, description },
      req.user.userId,
    );
  }

  successResponse(res, "Course category created successfully", null, 201);
});

export const updateCourseCategory = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const categoryId = parseInt(id);
  const { name, description } = req.body;

  if (isNaN(categoryId)) {
    throw new ValidationError("Invalid course category ID");
  }

  const existingCategory = await db
    .select()
    .from(CourseCategory)
    .where(eq(CourseCategory.category_id, categoryId))
    .limit(1);

  if (existingCategory.length === 0) {
    throw new NotFoundError("Course category not found");
  }

  const updateData: any = {};

  if (name !== undefined) {
    const sanitizedName = sanitizeString(name);
    // Check for name conflicts
    const nameConflict = await db
      .select()
      .from(CourseCategory)
      .where(
        and(
          eq(CourseCategory.name, sanitizedName),
          sql`${CourseCategory.category_id} != ${categoryId}`,
        ),
      )
      .limit(1);

    if (nameConflict.length > 0) {
      throw new ConflictError("Course category with this name already exists");
    }
    updateData.name = sanitizedName;
  }

  if (description !== undefined) {
    updateData.description = description ? sanitizeString(description) : null;
  }

  await db
    .update(CourseCategory)
    .set(updateData)
    .where(eq(CourseCategory.category_id, categoryId));

  logger.info("Course category updated", { categoryId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "COURSE_CATEGORY_UPDATE",
      `Updated course category: ${updateData.name || "ID " + categoryId}`,
      "CourseCategory",
      categoryId,
      updateData,
      req.user.userId,
    );
  }

  successResponse(res, "Course category updated successfully");
});

export const deleteCourseCategory = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const categoryId = parseInt(id);

  if (isNaN(categoryId)) {
    throw new ValidationError("Invalid course category ID");
  }

  const existingCategory = await db
    .select()
    .from(CourseCategory)
    .where(eq(CourseCategory.category_id, categoryId))
    .limit(1);

  if (existingCategory.length === 0) {
    throw new NotFoundError("Course category not found");
  }

  // Check if category is used by any subjects
  const subjectsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(Subject)
    .where(eq(Subject.course_category_id, categoryId));

  if (subjectsCount[0].count > 0) {
    throw new ValidationError(
      "Cannot delete course category with existing subjects",
    );
  }

  // Instead of deleting, set status to DISABLED
  await db
    .update(CourseCategory)
    .set({ status: "DISABLED" })
    .where(eq(CourseCategory.category_id, categoryId));

  logger.info("Course category deleted", { categoryId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "COURSE_CATEGORY_DELETE",
      `Deleted course category ID: ${categoryId}`,
      "CourseCategory",
      categoryId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Course category deleted successfully");
});

// Subjects Management
export const getSubjects = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all subjects");
  const userPermissions = req.user.permissions;

  let whereCondition: SQL<unknown> = eq(Subject.status, "ACTIVE");

  // Define aliases to avoid ambiguity
  const GradeFromClass = alias(Grade, "grade_from_class");
  const ProgramFromClass = alias(Program, "program_from_class");

  // If user has VIEW_PROGRAM_ACADEMICS but not MANAGE_ACADEMICS,
  // filter to only subjects assigned to grades in their programs
  if (
    userPermissions.includes("VIEW_PROGRAM_ACADEMICS") &&
    !userPermissions.includes("MANAGE_ACADEMICS")
  ) {
    // Get user's assigned programs
    const currentYearIdForScope = await getCurrentAcademicYearId();
    const userPrograms = currentYearIdForScope
      ? await db
          .select({ program_id: UserProgramLead.program_id })
          .from(UserProgramLead)
          .where(
            and(
              eq(UserProgramLead.user_id, req.user.userId),
              eq(UserProgramLead.academic_year_id, currentYearIdForScope),
            ),
          )
      : [];

    const assignedProgramIds = userPrograms.map((up) => up.program_id);

    if (assignedProgramIds.length === 0) {
      return successResponse(res, "Subjects retrieved successfully", []);
    }

    whereCondition = and(
      whereCondition,
      or(
        sql`${ProgramFromClass.program_id} IN (${assignedProgramIds.join(
          ",",
        )})`,
        sql`${GradeFromClass.grade_id} IS NULL`,
      ),
    )!;
  }

  const subjects = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      course_category_id: Subject.course_category_id,
      category_name: CourseCategory.name,
      max_marks: Subject.max_marks,
      color: Subject.color,
      grade_id: GradeFromClass.grade_id,
      grade_name: GradeFromClass.name,
      program_id: ProgramFromClass.program_id,
      program_name: ProgramFromClass.name,
    })
    .from(Subject)
    .leftJoin(
      CourseCategory,
      eq(Subject.course_category_id, CourseCategory.category_id),
    )
    .leftJoin(
      TeacherSubjectAssignment,
      sql`${Subject.subject_id} = ${TeacherSubjectAssignment.subject_id}`,
    )
    .leftJoin(
      ClassGroup,
      sql`${TeacherSubjectAssignment.class_group_id} = ${ClassGroup.class_group_id}`,
    )
    .leftJoin(
      GradeFromClass,
      sql`${ClassGroup.grade_id} = ${GradeFromClass.grade_id}`,
    )
    .leftJoin(
      ProgramFromClass,
      sql`${GradeFromClass.program_id} = ${ProgramFromClass.program_id}`,
    )
    .where(whereCondition)
    .orderBy(Subject.name);

  // Group subjects by subject_id. The rows above may repeat per teacher
  // assignment (joined only for the VIEW_PROGRAM_ACADEMICS scoping filter
  // above), so grade/program columns from that join must not be used to
  // build the displayed grades list -- they reflect "grades a teacher of
  // this subject happens to teach in", not "grades this subject is
  // assigned to". The latter lives in the GradeSubject junction table
  // (the same table assignSubjectToGrade/removeSubjectFromGrade write to),
  // fetched separately below.
  const subjectMap = new Map<number, any>();

  subjects.forEach((row) => {
    const subjectId = row.subject_id;
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subject_id: row.subject_id,
        code: row.code,
        name: row.name,
        description: row.description,
        course_category_id: row.course_category_id,
        category_name: row.category_name,
        max_marks: row.max_marks,
        color: row.color,
        grades: [],
      });
    }
  });

  const subjectIds = Array.from(subjectMap.keys());

  if (subjectIds.length > 0) {
    const GradeAssigned = alias(Grade, "grade_assigned");
    const ProgramAssigned = alias(Program, "program_assigned");

    const assignedGrades = await db
      .select({
        subject_id: GradeSubject.subject_id,
        grade_id: GradeAssigned.grade_id,
        grade_name: GradeAssigned.name,
        program_id: ProgramAssigned.program_id,
        program_name: ProgramAssigned.name,
      })
      .from(GradeSubject)
      .innerJoin(
        GradeAssigned,
        eq(GradeSubject.grade_id, GradeAssigned.grade_id),
      )
      .leftJoin(
        ProgramAssigned,
        eq(GradeAssigned.program_id, ProgramAssigned.program_id),
      )
      .where(inArray(GradeSubject.subject_id, subjectIds));

    assignedGrades.forEach((row) => {
      const entry = subjectMap.get(row.subject_id);
      if (entry) {
        entry.grades.push({
          grade_id: row.grade_id,
          grade_name: row.grade_name,
          program_id: row.program_id,
          program_name: row.program_name,
        });
      }
    });
  }

  const result = Array.from(subjectMap.values());

  successResponse(res, "Subjects retrieved successfully", result);
});

export const getSubject = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const subjectId = parseInt(id);

  if (isNaN(subjectId)) {
    throw new ValidationError("Invalid subject ID");
  }

  const subject = await db
    .select()
    .from(Subject)
    .where(and(eq(Subject.subject_id, subjectId), eq(Subject.status, "ACTIVE")))
    .limit(1);

  if (subject.length === 0) {
    throw new NotFoundError("Subject not found");
  }

  successResponse(res, "Subject retrieved successfully", subject[0]);
});

export const createSubject = asyncHandler(async (req: any, res: any) => {
  const { code, name, description, course_category_id, max_marks, color } =
    req.body;

  if (!name) {
    throw new ValidationError("Subject name is required");
  }

  const sanitizedCode = code ? sanitizeString(code) : undefined;
  const sanitizedName = sanitizeString(name);
  const sanitizedDescription = description
    ? sanitizeString(description)
    : undefined;
  const sanitizedColor = color ? sanitizeString(color) : undefined;

  // Validate course_category_id if provided
  if (course_category_id !== undefined && course_category_id !== null) {
    const categoryId = parseInt(course_category_id);
    if (isNaN(categoryId)) {
      throw new ValidationError("Invalid course category ID");
    }

    const category = await db
      .select()
      .from(CourseCategory)
      .where(eq(CourseCategory.category_id, categoryId))
      .limit(1);

    if (category.length === 0) {
      throw new NotFoundError("Course category not found");
    }
  }

  // Validate max_marks if provided
  if (max_marks !== undefined && max_marks !== null) {
    const marks = parseInt(max_marks);
    if (isNaN(marks) || marks < 0) {
      throw new ValidationError("Max marks must be a positive number");
    }
  }

  // Check if code already exists (if provided)
  if (sanitizedCode) {
    const existingCode = await db
      .select()
      .from(Subject)
      .where(eq(Subject.code, sanitizedCode))
      .limit(1);

    if (existingCode.length > 0) {
      throw new ConflictError("Subject with this code already exists");
    }
  }

  const result = await db.insert(Subject).values({
    code: sanitizedCode || null,
    name: sanitizedName,
    description: sanitizedDescription || null,
    course_category_id: course_category_id || null,
    max_marks: max_marks || null,
    color: sanitizedColor || "#3B82F6",
  });

  const subjectId = (result as any).insertId;
  logger.info("Subject created", { name: sanitizedName });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "SUBJECT_CREATE",
      `Created subject: ${sanitizedName}`,
      "Subject",
      subjectId,
      { name: sanitizedName, description, code, color: sanitizedColor },
      req.user.userId,
    );
  }

  successResponse(
    res,
    "Subject created successfully",
    {
      subject_id: subjectId,
      code: sanitizedCode || null,
      name: sanitizedName,
      description: sanitizedDescription || null,
      course_category_id: course_category_id || null,
      max_marks: max_marks || null,
      color: sanitizedColor || "#3B82F6",
    },
    201,
  );
});

export const updateSubject = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const subjectId = parseInt(id);
  const { code, name, description, course_category_id, max_marks, color } =
    req.body;

  if (isNaN(subjectId)) {
    throw new ValidationError("Invalid subject ID");
  }

  const existingSubject = await db
    .select()
    .from(Subject)
    .where(eq(Subject.subject_id, subjectId))
    .limit(1);

  if (existingSubject.length === 0) {
    throw new NotFoundError("Subject not found");
  }

  const updateData: any = {};

  if (code !== undefined) {
    const sanitizedCode = code ? sanitizeString(code) : null;
    // Check for code conflicts
    if (sanitizedCode) {
      const codeConflict = await db
        .select()
        .from(Subject)
        .where(
          and(
            eq(Subject.code, sanitizedCode),
            sql`${Subject.subject_id} != ${subjectId}`,
          ),
        )
        .limit(1);

      if (codeConflict.length > 0) {
        throw new ConflictError("Subject with this code already exists");
      }
    }
    updateData.code = sanitizedCode;
  }

  if (name !== undefined) {
    updateData.name = sanitizeString(name);
  }

  if (description !== undefined) {
    updateData.description = description ? sanitizeString(description) : null;
  }

  if (course_category_id !== undefined) {
    if (course_category_id !== null) {
      const categoryId = parseInt(course_category_id);
      if (isNaN(categoryId)) {
        throw new ValidationError("Invalid course category ID");
      }

      const category = await db
        .select()
        .from(CourseCategory)
        .where(eq(CourseCategory.category_id, categoryId))
        .limit(1);

      if (category.length === 0) {
        throw new NotFoundError("Course category not found");
      }
      updateData.course_category_id = categoryId;
    } else {
      updateData.course_category_id = null;
    }
  }

  if (max_marks !== undefined) {
    if (max_marks !== null) {
      const marks = parseInt(max_marks);
      if (isNaN(marks) || marks < 0) {
        throw new ValidationError("Max marks must be a positive number");
      }
      updateData.max_marks = marks;
    } else {
      updateData.max_marks = null;
    }
  }

  if (color !== undefined) {
    updateData.color = color ? sanitizeString(color) : "#3B82F6";
  }

  await db
    .update(Subject)
    .set(updateData)
    .where(eq(Subject.subject_id, subjectId));

  logger.info("Subject updated", { subjectId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "SUBJECT_UPDATE",
      `Updated subject: ${updateData.name || "ID " + subjectId}`,
      "Subject",
      subjectId,
      updateData,
      req.user.userId,
    );
  }

  successResponse(res, "Subject updated successfully");
});

export const deleteSubject = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const subjectId = parseInt(id);

  if (isNaN(subjectId)) {
    throw new ValidationError("Invalid subject ID");
  }

  const existingSubject = await db
    .select()
    .from(Subject)
    .where(eq(Subject.subject_id, subjectId))
    .limit(1);

  if (existingSubject.length === 0) {
    throw new NotFoundError("Subject not found");
  }

  // Instead of deleting, set status to DISABLED
  await db
    .update(Subject)
    .set({ status: "DISABLED" })
    .where(eq(Subject.subject_id, subjectId));

  logger.info("Subject disabled", { subjectId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "SUBJECT_DELETE",
      `Disabled subject ID: ${subjectId}`,
      "Subject",
      subjectId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Subject disabled successfully");
});

// Grade-Subject Assignment Management
export const getGradeSubjects = asyncHandler(async (req: any, res: any) => {
  const { grade_id } = req.params;
  const userPermissions = req.user.permissions;

  if (!grade_id) {
    throw new ValidationError("Grade ID is required");
  }

  const gradeId = parseInt(grade_id);
  if (isNaN(gradeId)) {
    throw new ValidationError("Invalid grade ID");
  }

  // Verify grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // If user has VIEW_PROGRAM_ACADEMICS but not MANAGE_ACADEMICS,
  // verify that the grade belongs to one of their assigned programs
  if (
    userPermissions.includes("VIEW_PROGRAM_ACADEMICS") &&
    !userPermissions.includes("MANAGE_ACADEMICS")
  ) {
    // Get user's assigned programs
    const currentYearIdForScope = await getCurrentAcademicYearId();
    const userPrograms = currentYearIdForScope
      ? await db
          .select({ program_id: UserProgramLead.program_id })
          .from(UserProgramLead)
          .where(
            and(
              eq(UserProgramLead.user_id, req.user.userId),
              eq(UserProgramLead.academic_year_id, currentYearIdForScope),
            ),
          )
      : [];

    const assignedProgramIds = userPrograms.map((up) => up.program_id);

    if (!assignedProgramIds.includes(grade[0].program_id)) {
      throw new ValidationError(
        "Access denied: Grade not in your assigned programs",
      );
    }
  }

  const gradeSubjects = await db
    .select({
      grade_subject_id: sql`CONCAT(${GradeSubject.grade_id}, '-', ${GradeSubject.subject_id})`,
      grade_id: GradeSubject.grade_id,
      subject_id: GradeSubject.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_description: Subject.description,
    })
    .from(GradeSubject)
    .innerJoin(Subject, eq(GradeSubject.subject_id, Subject.subject_id))
    .where(
      and(eq(GradeSubject.grade_id, gradeId), eq(Subject.status, "ACTIVE")),
    )
    .orderBy(Subject.name);

  successResponse(res, "Grade subjects retrieved successfully", gradeSubjects);
});

export const assignSubjectToGrade = asyncHandler(async (req: any, res: any) => {
  const { grade_id, subject_id } = req.body;

  if (!grade_id || !subject_id) {
    throw new ValidationError("Grade ID and Subject ID are required");
  }

  const gradeId = parseInt(grade_id);
  const subjectId = parseInt(subject_id);

  if (isNaN(gradeId) || isNaN(subjectId)) {
    throw new ValidationError("Invalid grade ID or subject ID");
  }

  // Verify grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, gradeId))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  // Verify subject exists and is active
  const subject = await db
    .select()
    .from(Subject)
    .where(and(eq(Subject.subject_id, subjectId), eq(Subject.status, "ACTIVE")))
    .limit(1);

  if (subject.length === 0) {
    throw new NotFoundError("Subject not found");
  }

  // Check if assignment already exists
  const existingAssignment = await db
    .select()
    .from(GradeSubject)
    .where(
      and(
        eq(GradeSubject.grade_id, gradeId),
        eq(GradeSubject.subject_id, subjectId),
      ),
    )
    .limit(1);

  if (existingAssignment.length > 0) {
    throw new ConflictError("Subject is already assigned to this grade");
  }

  await db.insert(GradeSubject).values({
    grade_id: gradeId,
    subject_id: subjectId,
  });

  logger.info("Subject assigned to grade", { gradeId, subjectId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "GRADE_SUBJECT_ASSIGN",
      `Assigned subject ID ${subjectId} to grade ID ${gradeId}`,
      "GradeSubject",
      undefined,
      { grade_id: gradeId, subject_id: subjectId },
      req.user.userId,
    );
  }

  successResponse(res, "Subject assigned to grade successfully", null, 201);
});

export const removeSubjectFromGrade = asyncHandler(
  async (req: any, res: any) => {
    const { grade_id, subject_id } = req.params;

    const gradeId = parseInt(grade_id);
    const subjectId = parseInt(subject_id);

    if (isNaN(gradeId) || isNaN(subjectId)) {
      throw new ValidationError("Invalid grade ID or subject ID");
    }

    // Check if assignment exists
    const existingAssignment = await db
      .select()
      .from(GradeSubject)
      .where(
        and(
          eq(GradeSubject.grade_id, gradeId),
          eq(GradeSubject.subject_id, subjectId),
        ),
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      throw new NotFoundError("Subject assignment not found");
    }

    await db
      .delete(GradeSubject)
      .where(
        and(
          eq(GradeSubject.grade_id, gradeId),
          eq(GradeSubject.subject_id, subjectId),
        ),
      );

    logger.info("Subject removed from grade", { gradeId, subjectId });

    // Record activity
    if (req.user?.userId) {
      await recordActivity(
        req.user.userId,
        "GRADE_SUBJECT_REMOVE",
        `Removed subject ID ${subjectId} from grade ID ${gradeId}`,
        "GradeSubject",
        undefined,
        { grade_id: gradeId, subject_id: subjectId },
        req.user.userId,
      );
    }

    successResponse(res, "Subject removed from grade successfully");
  },
);

// Teacher-Subject Assignment Management
export const getTeacherSubjectAssignments = asyncHandler(
  async (req: any, res: any) => {
    const { teacherId } = req.params;

    if (!teacherId) {
      throw new ValidationError("Teacher ID is required");
    }

    const teacherIdNum = parseInt(teacherId);
    if (isNaN(teacherIdNum)) {
      throw new ValidationError("Invalid teacher ID");
    }

    // Verify user exists and is a teacher
    const user = await db
      .select()
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(User.user_id, teacherIdNum))
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError("User not found");
    }

    const assignments = await db
      .select({
        assignment_id: sql`CONCAT(${TeacherSubjectAssignment.user_id}, '-', ${TeacherSubjectAssignment.subject_id}, '-', ${TeacherSubjectAssignment.class_group_id}, '-', ${TeacherSubjectAssignment.academic_year_id})`,
        user_id: TeacherSubjectAssignment.user_id,
        subject_id: TeacherSubjectAssignment.subject_id,
        subject_name: Subject.name,
        subject_code: Subject.code,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        program_name: Program.name,
        academic_year_id: AcademicYear.academic_year_id,
        academic_year_name: AcademicYear.name,
        academic_year_is_current: AcademicYear.is_current,
        assigned_at: TeacherSubjectAssignment.assigned_at,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        Subject,
        eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
      )
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(Program, eq(Grade.program_id, Program.program_id))
      .innerJoin(
        AcademicYear,
        eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(eq(TeacherSubjectAssignment.user_id, teacherIdNum))
      .orderBy(desc(AcademicYear.academic_year_id), Subject.name);

    successResponse(
      res,
      "Teacher subject assignments retrieved successfully",
      assignments,
    );
  },
);

export const getSubjectTeacherAssignments = asyncHandler(
  async (req: any, res: any) => {
    const { subject_id } = req.params;

    if (!subject_id) {
      throw new ValidationError("Subject ID is required");
    }

    const subjId = parseInt(subject_id as string);
    if (isNaN(subjId)) {
      throw new ValidationError("Invalid subject ID");
    }

    const assignments = await db
      .select({
        assignment_id: sql`CONCAT(${TeacherSubjectAssignment.user_id}, '-', ${TeacherSubjectAssignment.subject_id}, '-', ${TeacherSubjectAssignment.class_group_id}, '-', ${TeacherSubjectAssignment.academic_year_id})`,
        user_id: TeacherSubjectAssignment.user_id,
        teacher_name: sql`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        teacher_username: User.username,
        subject_id: TeacherSubjectAssignment.subject_id,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        program_name: Program.name,
        academic_year_id: AcademicYear.academic_year_id,
        academic_year_name: AcademicYear.name,
        academic_year_is_current: AcademicYear.is_current,
        assigned_at: TeacherSubjectAssignment.assigned_at,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(User, eq(TeacherSubjectAssignment.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(Program, eq(Grade.program_id, Program.program_id))
      .innerJoin(
        AcademicYear,
        eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(eq(TeacherSubjectAssignment.subject_id, subjId))
      .orderBy(desc(AcademicYear.academic_year_id), UserProfile.first_name, UserProfile.last_name);

    successResponse(
      res,
      "Subject teacher assignments retrieved successfully",
      assignments,
    );
  },
);

// All teacher-subject assignments across every teacher, optionally scoped to
// one academic year -- powers the admin "Teacher Assignments" overview tab,
// which previously had no cross-teacher view at all (only per-teacher, via
// each teacher's profile).
export const getAllTeacherSubjectAssignments = asyncHandler(
  async (req: any, res: any) => {
    const { academic_year_id } = req.query;

    let whereCondition: SQL<unknown> | undefined;
    if (academic_year_id) {
      const yearIdNum = Number(academic_year_id);
      if (isNaN(yearIdNum)) {
        throw new ValidationError("Invalid academic year ID");
      }
      whereCondition = eq(TeacherSubjectAssignment.academic_year_id, yearIdNum);
    }

    const assignments = await db
      .select({
        assignment_id: sql`CONCAT(${TeacherSubjectAssignment.user_id}, '-', ${TeacherSubjectAssignment.subject_id}, '-', ${TeacherSubjectAssignment.class_group_id}, '-', ${TeacherSubjectAssignment.academic_year_id})`,
        user_id: TeacherSubjectAssignment.user_id,
        teacher_name: sql`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
        teacher_username: User.username,
        subject_id: TeacherSubjectAssignment.subject_id,
        subject_name: Subject.name,
        subject_code: Subject.code,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        program_name: Program.name,
        academic_year_id: AcademicYear.academic_year_id,
        academic_year_name: AcademicYear.name,
        academic_year_is_current: AcademicYear.is_current,
        assigned_at: TeacherSubjectAssignment.assigned_at,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(User, eq(TeacherSubjectAssignment.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .innerJoin(
        Subject,
        eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
      )
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(Program, eq(Grade.program_id, Program.program_id))
      .innerJoin(
        AcademicYear,
        eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(whereCondition)
      .orderBy(
        desc(AcademicYear.academic_year_id),
        UserProfile.first_name,
        UserProfile.last_name,
        Subject.name,
      );

    successResponse(
      res,
      "Teacher subject assignments retrieved successfully",
      assignments,
    );
  },
);

export const assignTeacherToSubject = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, subject_id, class_group_id, academic_year_id } = req.body;

    if (!user_id || !subject_id || !class_group_id) {
      throw new ValidationError(
        "User ID, Subject ID, and Class Group ID are required",
      );
    }

    const teacherId = parseInt(user_id);
    const subjId = parseInt(subject_id);
    const classGroupId = parseInt(class_group_id);
    const yearId = academic_year_id
      ? parseInt(academic_year_id)
      : await getCurrentAcademicYearId();

    if (isNaN(teacherId) || isNaN(subjId) || isNaN(classGroupId)) {
      throw new ValidationError("Invalid IDs provided");
    }
    if (!yearId || isNaN(yearId)) {
      throw new ValidationError(
        "Academic year ID is required (no current academic year set)",
      );
    }

    // Verify teacher exists and is a teacher
    const teacher = await db
      .select()
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(User.user_id, teacherId))
      .limit(1);

    if (teacher.length === 0) {
      throw new NotFoundError("Teacher not found");
    }

    // Verify subject exists and is active
    const subject = await db
      .select()
      .from(Subject)
      .where(and(eq(Subject.subject_id, subjId), eq(Subject.status, "ACTIVE")))
      .limit(1);

    if (subject.length === 0) {
      throw new NotFoundError("Subject not found");
    }

    // Verify class group exists
    const classGroup = await db
      .select()
      .from(ClassGroup)
      .where(eq(ClassGroup.class_group_id, classGroupId))
      .limit(1);

    if (classGroup.length === 0) {
      throw new NotFoundError("Class group not found");
    }

    // Verify academic year exists
    const academicYear = await db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, yearId))
      .limit(1);

    if (academicYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    // Check if assignment already exists for this academic year
    const existingAssignment = await db
      .select()
      .from(TeacherSubjectAssignment)
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, teacherId),
          eq(TeacherSubjectAssignment.subject_id, subjId),
          eq(TeacherSubjectAssignment.class_group_id, classGroupId),
          eq(TeacherSubjectAssignment.academic_year_id, yearId),
        ),
      )
      .limit(1);

    if (existingAssignment.length > 0) {
      throw new ConflictError(
        "Teacher is already assigned to this subject for the specified class group and academic year",
      );
    }

    await db.insert(TeacherSubjectAssignment).values({
      user_id: teacherId,
      subject_id: subjId,
      class_group_id: classGroupId,
      academic_year_id: yearId,
    });

    logger.info(`Teacher ID: ${teacherId} assigned to subject ID: ${subjId}`);

    // Record activity for teacher
    await recordActivity(
      teacherId,
      "SUBJECT_ASSIGN",
      `You have been assigned to subject ID: ${subjId}`,
      "TeacherSubjectAssignment",
      undefined,
      {
        subject_id: subjId,
        assigning_user_id: req.user?.userId,
      },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== teacherId) {
      await recordActivity(
        req.user.userId,
        "SUBJECT_ASSIGN_ADMIN",
        `Assigned teacher ID: ${teacherId} to subject ID: ${subjId}`,
        "TeacherSubjectAssignment",
        undefined,
        { teacherId, subjectId: subjId },
        req.user.userId,
      );
    }

    successResponse(res, "Teacher assigned to subject successfully", null, 201);
  },
);

export const removeTeacherFromSubject = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, subject_id, class_group_id, academic_year_id } =
      req.params;

    const teacherId = parseInt(user_id);
    const subjId = parseInt(subject_id);
    const classGroupId = parseInt(class_group_id);
    const yearId = parseInt(academic_year_id);

    if (
      isNaN(teacherId) ||
      isNaN(subjId) ||
      isNaN(classGroupId) ||
      isNaN(yearId)
    ) {
      throw new ValidationError("Invalid IDs provided");
    }

    // Check if assignment exists
    const existingAssignment = await db
      .select()
      .from(TeacherSubjectAssignment)
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, teacherId),
          eq(TeacherSubjectAssignment.subject_id, subjId),
          eq(TeacherSubjectAssignment.class_group_id, classGroupId),
          eq(TeacherSubjectAssignment.academic_year_id, yearId),
        ),
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      throw new NotFoundError("Teacher assignment not found");
    }

    await db
      .delete(TeacherSubjectAssignment)
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, teacherId),
          eq(TeacherSubjectAssignment.subject_id, subjId),
          eq(TeacherSubjectAssignment.class_group_id, classGroupId),
          eq(TeacherSubjectAssignment.academic_year_id, yearId),
        ),
      );

    logger.info("Teacher removed from subject", {
      teacherId,
      subjId,
      classGroupId,
      yearId,
    });

    // Record activity for teacher
    await recordActivity(
      teacherId,
      "SUBJECT_UNASSIGN",
      `You have been removed from subject ID: ${subjId}`,
      "TeacherSubjectAssignment",
      undefined,
      {
        subject_id: subjId,
        removing_user_id: req.user?.userId,
      },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== teacherId) {
      await recordActivity(
        req.user.userId,
        "SUBJECT_UNASSIGN_ADMIN",
        `Removed teacher ID: ${teacherId} from subject ID: ${subjId}`,
        "TeacherSubjectAssignment",
        undefined,
        { teacherId, subjectId: subjId },
        req.user.userId,
      );
    }

    successResponse(res, "Teacher removed from subject successfully");
  },
);

// Copy every teacher-subject assignment from one academic year into another.
// ClassGroup is a permanent label now (not per-year), so this is a direct
// (user_id, subject_id, class_group_id) copy into the target year -- no
// grade/name re-matching needed, unlike when ClassGroup was recreated per
// year. Only rows that don't already exist in the target year are inserted.
export const copyTeacherSubjectAssignments = asyncHandler(
  async (req: any, res: any) => {
    const { source_academic_year_id, target_academic_year_id } = req.body;

    if (!source_academic_year_id || !target_academic_year_id) {
      throw new ValidationError(
        "Source and target academic year IDs are required",
      );
    }

    const sourceYearId = parseInt(source_academic_year_id);
    const targetYearId = parseInt(target_academic_year_id);

    if (isNaN(sourceYearId) || isNaN(targetYearId)) {
      throw new ValidationError("Invalid academic year ID");
    }

    if (sourceYearId === targetYearId) {
      throw new ValidationError(
        "Source and target academic years must be different",
      );
    }

    const [sourceYear, targetYear] = await Promise.all([
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, sourceYearId))
        .limit(1),
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, targetYearId))
        .limit(1),
    ]);

    if (sourceYear.length === 0 || targetYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    const [sourceAssignments, targetAssignments] = await Promise.all([
      db
        .select({
          user_id: TeacherSubjectAssignment.user_id,
          subject_id: TeacherSubjectAssignment.subject_id,
          class_group_id: TeacherSubjectAssignment.class_group_id,
        })
        .from(TeacherSubjectAssignment)
        .where(eq(TeacherSubjectAssignment.academic_year_id, sourceYearId)),
      db
        .select({
          user_id: TeacherSubjectAssignment.user_id,
          subject_id: TeacherSubjectAssignment.subject_id,
          class_group_id: TeacherSubjectAssignment.class_group_id,
        })
        .from(TeacherSubjectAssignment)
        .where(eq(TeacherSubjectAssignment.academic_year_id, targetYearId)),
    ]);

    if (sourceAssignments.length === 0) {
      throw new ValidationError(
        `${sourceYear[0].name} has no teacher assignments to copy`,
      );
    }

    const existingKeys = new Set(
      targetAssignments.map(
        (a) => `${a.user_id}::${a.subject_id}::${a.class_group_id}`,
      ),
    );

    const toInsert = sourceAssignments
      .filter(
        (a) =>
          !existingKeys.has(
            `${a.user_id}::${a.subject_id}::${a.class_group_id}`,
          ),
      )
      .map((a) => ({
        user_id: a.user_id,
        subject_id: a.subject_id,
        class_group_id: a.class_group_id,
        academic_year_id: targetYearId,
      }));

    if (toInsert.length > 0) {
      await db.insert(TeacherSubjectAssignment).values(toInsert);
    }

    const skipped = sourceAssignments.length - toInsert.length;

    logger.info("Teacher subject assignments copied", {
      sourceYearId,
      targetYearId,
      copied: toInsert.length,
      skipped,
    });

    if (req.user?.userId) {
      await recordActivity(
        req.user.userId,
        "TEACHER_ASSIGNMENTS_COPY",
        `Copied ${toInsert.length} teacher assignment(s) from ${sourceYear[0].name} to ${targetYear[0].name}`,
        "TeacherSubjectAssignment",
        undefined,
        { sourceYearId, targetYearId, copied: toInsert.length, skipped },
        req.user.userId,
      );
    }

    successResponse(res, "Teacher assignments copied successfully", {
      copied: toInsert.length,
      skipped,
      total: sourceAssignments.length,
    });
  },
);

// Class Groups Management
export const getClassGroups = asyncHandler(async (req: any, res: any) => {
  const { grade_id } = req.query;
  const userPermissions = req.user.permissions;

  let whereCondition: SQL<unknown> | undefined = undefined;

  // If user has VIEW_PROGRAM_ACADEMICS but not MANAGE_ACADEMICS,
  // filter to only class groups in grades from their programs
  if (
    userPermissions.includes("VIEW_PROGRAM_ACADEMICS") &&
    !userPermissions.includes("MANAGE_ACADEMICS")
  ) {
    // Get user's assigned programs
    const currentYearIdForScope = await getCurrentAcademicYearId();
    const userPrograms = currentYearIdForScope
      ? await db
          .select({ program_id: UserProgramLead.program_id })
          .from(UserProgramLead)
          .where(
            and(
              eq(UserProgramLead.user_id, req.user.userId),
              eq(UserProgramLead.academic_year_id, currentYearIdForScope),
            ),
          )
      : [];

    const assignedProgramIds = userPrograms.map((up) => up.program_id);

    if (assignedProgramIds.length === 0) {
      return successResponse(res, "Class groups retrieved successfully", []);
    }

    whereCondition = sql`${Program.program_id} IN (${assignedProgramIds.join(
      ",",
    )})`;
  }

  if (grade_id) {
    const grdId = parseInt(grade_id as string);
    if (!isNaN(grdId)) {
      const gradeCondition = eq(ClassGroup.grade_id, grdId);
      whereCondition = whereCondition
        ? and(whereCondition, gradeCondition)!
        : gradeCondition;
    }
  }

  const classGroups = await db
    .select({
      class_group_id: ClassGroup.class_group_id,
      grade_id: ClassGroup.grade_id,
      name: ClassGroup.name,
      grade_name: Grade.name,
      program_name: Program.name,
    })
    .from(ClassGroup)
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(whereCondition)
    .orderBy(ClassGroup.name);

  successResponse(res, "Class groups retrieved successfully", classGroups);
});

export const getClassGroup = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const classGroupId = parseInt(id);

  if (isNaN(classGroupId)) {
    throw new ValidationError("Invalid class group ID");
  }

  const classGroup = await db
    .select()
    .from(ClassGroup)
    .where(eq(ClassGroup.class_group_id, classGroupId))
    .limit(1);

  if (classGroup.length === 0) {
    throw new NotFoundError("Class group not found");
  }

  successResponse(res, "Class group retrieved successfully", classGroup[0]);
});

export const createClassGroup = asyncHandler(async (req: any, res: any) => {
  const { grade_id, name } = req.body;

  if (!grade_id || !name) {
    throw new ValidationError("Grade ID and name are required");
  }

  const grdId = parseInt(grade_id);
  if (isNaN(grdId)) {
    throw new ValidationError("Invalid grade ID");
  }

  // Verify grade exists
  const grade = await db
    .select()
    .from(Grade)
    .where(eq(Grade.grade_id, grdId))
    .limit(1);

  if (grade.length === 0) {
    throw new NotFoundError("Grade not found");
  }

  const sanitizedName = sanitizeString(name);

  if (sanitizedName.length > 50) {
    throw new ValidationError("Class group name must be 50 characters or fewer");
  }

  // Class groups are a permanent label per grade -- creating the same
  // (grade, name) twice is almost always a mistake, not intentional.
  const existing = await db
    .select({ class_group_id: ClassGroup.class_group_id })
    .from(ClassGroup)
    .where(and(eq(ClassGroup.grade_id, grdId), eq(ClassGroup.name, sanitizedName)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(
      `A class group named "${sanitizedName}" already exists for this grade`,
    );
  }

  const result = await db.insert(ClassGroup).values({
    grade_id: grdId,
    name: sanitizedName,
  });

  const classGroupId = (result as any).insertId;

  logger.info("Class group created", {
    name: sanitizedName,
    gradeId: grdId,
  });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "CLASS_GROUP_CREATE",
      `Created class group: ${sanitizedName}`,
      "ClassGroup",
      classGroupId,
      { name: sanitizedName, grade_id: grdId },
      req.user.userId,
    );
  }

  successResponse(res, "Class group created successfully", null, 201);
});

export const updateClassGroup = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const classGroupId = parseInt(id);
  const { grade_id, name } = req.body;

  if (isNaN(classGroupId)) {
    throw new ValidationError("Invalid class group ID");
  }

  const existingClassGroup = await db
    .select()
    .from(ClassGroup)
    .where(eq(ClassGroup.class_group_id, classGroupId))
    .limit(1);

  if (existingClassGroup.length === 0) {
    throw new NotFoundError("Class group not found");
  }

  const updateData: any = {};

  if (grade_id !== undefined) {
    const grdId = parseInt(grade_id);
    if (isNaN(grdId)) {
      throw new ValidationError("Invalid grade ID");
    }

    // Verify grade exists
    const grade = await db
      .select()
      .from(Grade)
      .where(eq(Grade.grade_id, grdId))
      .limit(1);

    if (grade.length === 0) {
      throw new NotFoundError("Grade not found");
    }

    updateData.grade_id = grdId;
  }

  if (name !== undefined) {
    updateData.name = sanitizeString(name);
    if (updateData.name.length > 50) {
      throw new ValidationError("Class group name must be 50 characters or fewer");
    }
  }

  await db
    .update(ClassGroup)
    .set(updateData)
    .where(eq(ClassGroup.class_group_id, classGroupId));

  logger.info("Class group updated", { classGroupId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "CLASS_GROUP_UPDATE",
      `Updated class group: ${updateData.name || "ID " + classGroupId}`,
      "ClassGroup",
      classGroupId,
      updateData,
      req.user.userId,
    );
  }

  successResponse(res, "Class group updated successfully");
});

export const deleteClassGroup = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const classGroupId = parseInt(id);

  if (isNaN(classGroupId)) {
    throw new ValidationError("Invalid class group ID");
  }

  const existingClassGroup = await db
    .select()
    .from(ClassGroup)
    .where(eq(ClassGroup.class_group_id, classGroupId))
    .limit(1);

  if (existingClassGroup.length === 0) {
    throw new NotFoundError("Class group not found");
  }

  await db
    .delete(ClassGroup)
    .where(eq(ClassGroup.class_group_id, classGroupId));

  logger.info("Class group deleted", { classGroupId });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "CLASS_GROUP_DELETE",
      `Deleted class group ID: ${classGroupId}`,
      "ClassGroup",
      classGroupId,
      undefined,
      req.user.userId,
    );
  }

  successResponse(res, "Class group deleted successfully");
});

// Teacher Assigned Subjects for Dashboard
export const getMyAssignedSubjects = asyncHandler(
  async (req: any, res: any) => {
    const teacherId = req.user?.user_id || req.user?.id || req.user?.userId;
    if (!req.user || teacherId == null || teacherId === undefined) {
      throw new ValidationError("User not authenticated");
    }
    const teacherIdNum =
      typeof teacherId === "string" ? parseInt(teacherId) : teacherId;
    if (isNaN(teacherIdNum)) {
      throw new ValidationError("Invalid user ID");
    }

    // Optionally scope the SchemeOfWork badge (validation_status/scheme_id) to one specific term —
    // a class-group assignment spans the whole year, but a SchemeOfWork row exists per term, so
    // without this the left join below fans out into one result row per term that has a scheme.
    const requestedTermId = req.query?.academic_term_id
      ? parseInt(req.query.academic_term_id as string, 10)
      : undefined;
    const termFilter =
      requestedTermId && !isNaN(requestedTermId)
        ? eq(SchemeOfWork.academic_term_id, requestedTermId)
        : undefined;

    // A teacher's assignments span every year they've ever taught — without
    // resolving the requested term to its academic year and filtering on
    // it, callers (e.g. the ad-hoc lesson report picker) would show every
    // subject/class-group the teacher was ever assigned, not just the ones
    // for the academic year currently selected in the UI.
    let requestedYearId: number | undefined;
    if (requestedTermId && !isNaN(requestedTermId)) {
      const [termRow] = await db
        .select({ academic_year_id: AcademicTerm.academic_year_id })
        .from(AcademicTerm)
        .where(eq(AcademicTerm.academic_term_id, requestedTermId))
        .limit(1);
      requestedYearId = termRow?.academic_year_id;
    }
    const yearFilter =
      requestedYearId !== undefined
        ? eq(TeacherSubjectAssignment.academic_year_id, requestedYearId)
        : undefined;

    // Get all assignments for the teacher
    const assignments = await db
      .select({
        assignment_id: sql`CONCAT(${TeacherSubjectAssignment.user_id}, '-', ${TeacherSubjectAssignment.subject_id}, '-', ${TeacherSubjectAssignment.class_group_id}, '-', ${TeacherSubjectAssignment.academic_year_id})`,
        subject_id: TeacherSubjectAssignment.subject_id,
        subject_name: Subject.name,
        subject_code: Subject.code,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        class_group_name: ClassGroup.name,
        grade_id: Grade.grade_id,
        grade_name: Grade.name,
        program_id: Program.program_id,
        program_name: Program.name,
        academic_year_id: AcademicYear.academic_year_id,
        academic_year_name: AcademicYear.name,
        assigned_at: TeacherSubjectAssignment.assigned_at,
        validation_status: SchemeOfWork.validation_status,
        validation_comment: SchemeOfWork.validation_comment,
        scheme_id: SchemeOfWork.scheme_id,
      })
      .from(TeacherSubjectAssignment)
      .innerJoin(
        Subject,
        eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
      )
      .innerJoin(
        ClassGroup,
        eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
      )
      .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .innerJoin(Program, eq(Grade.program_id, Program.program_id))
      .innerJoin(
        AcademicYear,
        eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
      )
      .leftJoin(
        SchemeOfWork,
        and(
          eq(TeacherSubjectAssignment.user_id, SchemeOfWork.user_id),
          eq(TeacherSubjectAssignment.subject_id, SchemeOfWork.subject_id),
          eq(TeacherSubjectAssignment.class_group_id, SchemeOfWork.class_group_id),
          // ClassGroup is a permanent label now, not year-scoped, so the
          // scheme's own term must be checked against the assignment's year
          // to avoid attaching a different year's scheme of work.
          sql`(SELECT at.academic_year_id FROM AcademicTerm at WHERE at.academic_term_id = ${SchemeOfWork.academic_term_id}) = ${TeacherSubjectAssignment.academic_year_id}`,
          ...(termFilter ? [termFilter] : []),
        ),
      )
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, teacherIdNum),
          ...(yearFilter ? [yearFilter] : []),
        ),
      )
      .orderBy(Subject.name);

    // Group by subject to avoid duplicates
    const subjectMap = new Map<number, any>();

    assignments.forEach((assignment) => {
      const subjectId = assignment.subject_id;
      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subject_id: assignment.subject_id,
          subject_name: assignment.subject_name,
          subject_code: assignment.subject_code,
          grades: [],
        });
      }

      const grade = {
        grade_id: assignment.grade_id,
        grade_name: assignment.grade_name,
        program_id: assignment.program_id,
        program_name: assignment.program_name,
        class_group_id: assignment.class_group_id,
        class_group_name: assignment.class_group_name,
        academic_year_id: assignment.academic_year_id,
        academic_year_name: assignment.academic_year_name,
        assigned_at: assignment.assigned_at,
        validation_status: assignment.validation_status || "PENDING",
        validation_comment: assignment.validation_comment,
        scheme_id: assignment.scheme_id,
      };

      // A class-group assignment is one row per (user, subject, class_group), but the left join
      // to SchemeOfWork fans out into one row per matching term when a term filter isn't applied
      // (or when a class group ends up with schemes across more than one term). Keep at most one
      // grade entry per class group per subject — preferring whichever has an actual scheme
      // attached, and the most recently created one if more than one does.
      const grades = subjectMap.get(subjectId).grades;
      const existingIdx = grades.findIndex(
        (g: any) => g.class_group_id === grade.class_group_id,
      );
      if (existingIdx === -1) {
        grades.push(grade);
      } else if ((grade.scheme_id || 0) > (grades[existingIdx].scheme_id || 0)) {
        grades[existingIdx] = grade;
      }
    });

    const result = Array.from(subjectMap.values());

    successResponse(res, "Assigned subjects retrieved successfully", result);
  },
);

// Get students enrolled in a specific subject for a teacher
export const getSubjectEnrolledStudents = asyncHandler(
  async (req: any, res: any) => {
    const teacherId = req.user?.user_id || req.user?.id || req.user?.userId;
    if (!teacherId) {
      throw new ValidationError("User not authenticated");
    }
    const teacherIdNum =
      typeof teacherId === "string" ? parseInt(teacherId) : teacherId;
    if (isNaN(teacherIdNum)) {
      throw new ValidationError("Invalid user ID");
    }
    const { subject_id, academic_year_id } = req.params;

    const subjId = parseInt(subject_id);
    const yearId = parseInt(academic_year_id);

    if (isNaN(subjId) || isNaN(yearId)) {
      throw new ValidationError("Invalid subject ID or academic year ID");
    }

    // Verify the teacher is assigned to this subject
    // const assignment = await db
    //   .select()
    //   .from(TeacherSubjectAssignment)
    //   .where(
    //     and(
    //       eq(TeacherSubjectAssignment.user_id, teacherIdNum),
    //       eq(TeacherSubjectAssignment.subject_id, subjId),
    //       eq(TeacherSubjectAssignment.academic_term_id, termId),
    //     ),
    //   )
    //   .limit(1);

    // if (assignment.length === 0) {
    //   throw new ValidationError("Teacher is not assigned to this subject");
    // }

    // Get enrolled students
    const students = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        gender: UserProfile.gender,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        program_name: Program.name,
        enrolled_at: StudentSubjectEnrollment.enrolled_at,
      })
      .from(StudentSubjectEnrollment)
      .innerJoin(User, eq(StudentSubjectEnrollment.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      // Scoped to this same year and ACTIVE only -- a student can have
      // StudentClassGroup rows from other years (their promotion history)
      // and the app guarantees at most one ACTIVE row per (user, year), see
      // assignGradeToUser's DISABLED-the-others step. Without both of these
      // this left join fans out into one duplicate result row per historical
      // class group match.
      .leftJoin(
        StudentClassGroup,
        and(
          eq(User.user_id, StudentClassGroup.user_id),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .leftJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .leftJoin(Program, eq(Grade.program_id, Program.program_id))
      .where(
        and(
          eq(StudentSubjectEnrollment.subject_id, subjId),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
        ),
      )
      .orderBy(UserProfile.first_name, UserProfile.last_name);

    successResponse(res, "Enrolled students retrieved successfully", students);
  },
);

// GET /subjects/:subject_id/terms/:term_id/students
// Resolves term → academic_year then returns the same enrollment data
export const getSubjectEnrolledStudentsByTerm = asyncHandler(
  async (req: any, res: any) => {
    const { subject_id, term_id } = req.params;

    const subjId = parseInt(subject_id);
    const termId = parseInt(term_id);

    if (isNaN(subjId) || isNaN(termId)) {
      throw new ValidationError("Invalid subject ID or term ID");
    }

    // Resolve term → academic_year_id
    const [term] = await db
      .select({ academic_year_id: AcademicTerm.academic_year_id })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, termId))
      .limit(1);

    if (!term) {
      return successResponse(res, "Enrolled students retrieved successfully", []);
    }

    const students = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        gender: UserProfile.gender,
        class_group_name: ClassGroup.name,
        grade_name: Grade.name,
        program_name: Program.name,
        enrolled_at: StudentSubjectEnrollment.enrolled_at,
      })
      .from(StudentSubjectEnrollment)
      .innerJoin(User, eq(StudentSubjectEnrollment.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      // See getSubjectEnrolledStudents above -- scoping to this year and
      // ACTIVE only is what keeps this left join from fanning out into one
      // duplicate result row per historical class group match.
      .leftJoin(
        StudentClassGroup,
        and(
          eq(User.user_id, StudentClassGroup.user_id),
          eq(StudentClassGroup.academic_year_id, term.academic_year_id),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .leftJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .leftJoin(Program, eq(Grade.program_id, Program.program_id))
      .where(
        and(
          eq(StudentSubjectEnrollment.subject_id, subjId),
          eq(StudentSubjectEnrollment.academic_year_id, term.academic_year_id),
        ),
      )
      .orderBy(UserProfile.first_name, UserProfile.last_name);

    successResponse(res, "Enrolled students retrieved successfully", students);
  },
);

// GET /class-groups/:class_group_id/students
// Roster for a homeroom/class group -- distinct from the subject-enrollment
// endpoints above, which list who's taking a *subject*, not who's *in* a
// class group. Used by external SSO-linked systems (e.g. the discipline &
// attendance app) that mark attendance per class group rather than per
// subject. Unauthenticated beyond a valid MIS session, matching the
// looseness of the equivalent single-student lookup (getStudentClassGroup).
export const getClassGroupStudents = asyncHandler(
  async (req: any, res: any) => {
    const { class_group_id } = req.params;
    const { academic_year_id } = req.query;
    const classGroupId = parseInt(class_group_id);

    if (isNaN(classGroupId)) {
      throw new ValidationError("Invalid class group ID");
    }

    const filters = [
      eq(StudentClassGroup.class_group_id, classGroupId),
      eq(StudentClassGroup.status, "ACTIVE"),
      // A class group is a permanent label reused across years, so its
      // membership rows accumulate one cohort per academic year. Without
      // this filter the roster returned last year's cohort alongside (or
      // instead of) the selected year's -- callers marking attendance for
      // the current term got the wrong students entirely.
    ];

    if (academic_year_id !== undefined) {
      const yearId = parseInt(academic_year_id as string);
      if (isNaN(yearId)) {
        throw new ValidationError("Invalid academic year ID");
      }
      filters.push(eq(StudentClassGroup.academic_year_id, yearId));
    }

    const students = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        gender: UserProfile.gender,
        academic_year_id: StudentClassGroup.academic_year_id,
        enrolled_at: StudentClassGroup.assigned_at,
      })
      .from(StudentClassGroup)
      .innerJoin(User, eq(StudentClassGroup.user_id, User.user_id))
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          ...filters,
          // This is a *student* roster, so never surface a staff account
          // that picked up a class-group row. Either signal counts: a real
          // student missing one of them still appears (dropping them would
          // silently remove someone from attendance), while staff have
          // neither. EXISTS rather than a join so a user holding several
          // roles can't be returned twice.
          or(
            eq(UserProfile.user_type, "STUDENT"),
            sql`EXISTS (SELECT 1 FROM ${UserRole} ur JOIN ${Role} r ON r.role_id = ur.role_id
                        WHERE ur.user_id = ${User.user_id} AND r.name = 'STUDENT')`,
          )!,
        ),
      )
      .orderBy(UserProfile.first_name, UserProfile.last_name);

    successResponse(res, "Class group students retrieved successfully", students);
  },
);

// Student Subject Enrollment Management
export const getStudentEnrolledSubjects = asyncHandler(
  async (req: any, res: any) => {
    const { studentId } = req.params;
    const { academic_year_id } = req.query;

    const studentIdNum = parseInt(studentId);
    if (isNaN(studentIdNum)) {
      throw new ValidationError("Invalid student ID");
    }

    // Verify user exists and is a student
    const user = await db
      .select()
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          eq(User.user_id, studentIdNum),
          eq(UserProfile.user_type, "STUDENT"),
        ),
      )
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError("Student not found");
    }

    let whereCondition: SQL<unknown> = eq(
      StudentSubjectEnrollment.user_id,
      studentIdNum,
    );

    if (academic_year_id) {
      const yearIdNum = Number(academic_year_id);
      if (!Number.isNaN(yearIdNum)) {
        whereCondition =
          and(
            whereCondition,
            eq(StudentSubjectEnrollment.academic_year_id, yearIdNum),
          ) ?? whereCondition;
      }
    }

    const enrolledSubjects = await db
      .select({
        enrollment_id: sql`CONCAT(${StudentSubjectEnrollment.user_id}, '-', ${StudentSubjectEnrollment.subject_id}, '-', ${StudentSubjectEnrollment.academic_year_id})`,
        subject_id: StudentSubjectEnrollment.subject_id,
        subject_name: Subject.name,
        subject_code: Subject.code,
        subject_description: Subject.description,
        academic_year_id: StudentSubjectEnrollment.academic_year_id,
        academic_year_name: AcademicYear.name,
        academic_year_is_current: AcademicYear.is_current,
        enrolled_at: StudentSubjectEnrollment.enrolled_at,
      })
      .from(StudentSubjectEnrollment)
      .innerJoin(
        Subject,
        eq(StudentSubjectEnrollment.subject_id, Subject.subject_id),
      )
      .innerJoin(
        AcademicYear,
        eq(StudentSubjectEnrollment.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(
        whereCondition
          ? and(whereCondition, eq(StudentSubjectEnrollment.status, "ACTIVE"))
          : eq(StudentSubjectEnrollment.status, "ACTIVE"),
      )
      .orderBy(desc(AcademicYear.academic_year_id), Subject.name);

    successResponse(
      res,
      "Student enrolled subjects retrieved successfully",
      enrolledSubjects,
    );
  },
);

export const getAvailableSubjectsForStudent = asyncHandler(
  async (req: any, res: any) => {
    const { studentId } = req.params;
    const { academic_year_id } = req.query;

    const studentIdNum = Number(studentId);

    if (isNaN(studentIdNum)) {
      throw new ValidationError("Invalid student ID");
    }

    // 1. Get student's current active class group and its grade/year info
    const studentClassGroup = await db
      .select({
        grade_id: ClassGroup.grade_id,
        grade_name: Grade.name,
        program_id: Grade.program_id,
        program_name: Program.name,
        class_group_id: ClassGroup.class_group_id,
        academic_year_id: StudentClassGroup.academic_year_id,
      })
      .from(StudentClassGroup)
      .innerJoin(
        ClassGroup,
        eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
      )
      .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
      .leftJoin(Program, eq(Grade.program_id, Program.program_id))
      .where(
        and(
          eq(StudentClassGroup.user_id, studentIdNum),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(StudentClassGroup.academic_year_id))
      .limit(1);

    if (studentClassGroup.length === 0) {
      return successResponse(
        res,
        "No active class group found for student",
        [],
      );
    }

    const { grade_id, grade_name, program_id, program_name } =
      studentClassGroup[0];
    const gradeIdNum = Number(grade_id);

    // Resolve academic year: use query param if provided, otherwise fall back to student's class group year
    const yearId = academic_year_id
      ? Number(academic_year_id)
      : Number(studentClassGroup[0].academic_year_id);

    if (isNaN(yearId)) {
      throw new ValidationError("Invalid academic year ID");
    }

    // 2. Get ALL active subjects (not restricted to GradeSubject so nothing is
    //    missed when that junction table is incomplete)
    const allSubjects = await db
      .select({
        subject_id: Subject.subject_id,
        code: Subject.code,
        name: Subject.name,
        description: Subject.description,
      })
      .from(Subject)
      .where(eq(Subject.status, "ACTIVE"))
      .orderBy(Subject.name);

    // 3. Get active enrollments for this student and year to exclude them
    const enrolledEntries = await db
      .select({ subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentIdNum),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      );

    const enrolledIds = new Set(
      enrolledEntries.map((e) => Number(e.subject_id)),
    );

    // 4. Which subjects are actually part of this grade's curriculum, so we
    //    can surface those first -- without hiding the rest, since GradeSubject
    //    coverage is sometimes incomplete (see comment on step 2 above).
    const gradeSubjectRows = await db
      .select({ subject_id: GradeSubject.subject_id })
      .from(GradeSubject)
      .where(eq(GradeSubject.grade_id, gradeIdNum));
    const gradeSubjectIds = new Set(
      gradeSubjectRows.map((r) => Number(r.subject_id)),
    );

    // 5. Filter out already-enrolled subjects, attach grade context, and put
    //    subjects that belong to this grade's curriculum first.
    const result = allSubjects
      .filter((s) => !enrolledIds.has(Number(s.subject_id)))
      .map((s) => ({
        subject_id: s.subject_id,
        code: s.code,
        name: s.name,
        description: s.description,
        in_grade_curriculum: gradeSubjectIds.has(Number(s.subject_id)),
        grades: [
          {
            grade_id: grade_id,
            grade_name: grade_name || "Unknown Grade",
            program_id: program_id,
            program_name: program_name || "Unknown Program",
          },
        ],
      }))
      .sort((a, b) => Number(b.in_grade_curriculum) - Number(a.in_grade_curriculum));

    successResponse(res, "Subjects retrieved successfully", result);
  },
);

export const enrollStudentInSubject = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, subject_id, academic_year_id } = req.body;

    if (!user_id || !subject_id) {
      throw new ValidationError("User ID and Subject ID are required");
    }

    const studentId = parseInt(user_id);
    const subjId = parseInt(subject_id);
    const yearId = academic_year_id
      ? parseInt(academic_year_id)
      : await getCurrentAcademicYearId();

    if (isNaN(studentId) || isNaN(subjId) || !yearId || isNaN(yearId)) {
      throw new ValidationError(
        "Invalid IDs provided, or no current academic year is set",
      );
    }

    // Verify student exists and is a student
    const student = await db
      .select()
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(eq(User.user_id, studentId), eq(UserProfile.user_type, "STUDENT")),
      )
      .limit(1);

    if (student.length === 0) {
      throw new NotFoundError("Student not found");
    }

    // Verify subject exists and is active
    const subject = await db
      .select()
      .from(Subject)
      .where(and(eq(Subject.subject_id, subjId), eq(Subject.status, "ACTIVE")))
      .limit(1);

    if (subject.length === 0) {
      throw new NotFoundError("Subject not found");
    }

    // Verify academic year exists
    const academicYear = await db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, yearId))
      .limit(1);

    if (academicYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    // Check if enrollment already exists
    const existingEnrollment = await db
      .select()
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.subject_id, subjId),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
        ),
      )
      .limit(1);

    if (existingEnrollment.length > 0) {
      throw new ConflictError(
        "Student is already enrolled in this subject for the specified academic year",
      );
    }

    await db.insert(StudentSubjectEnrollment).values({
      user_id: studentId,
      subject_id: subjId,
      academic_year_id: yearId,
    });

    logger.info(`Student ID: ${studentId} enrolled in subject ID: ${subjId}`);

    // Record activity for student
    await recordActivity(
      studentId,
      "SUBJECT_ENROLL",
      `You have been enrolled in subject ID: ${subjId}`,
      "StudentSubjectEnrollment",
      undefined,
      {
        subject_id: subjId,
        academic_year_id: yearId,
        enrolling_user_id: req.user?.userId,
      },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== studentId) {
      await recordActivity(
        req.user.userId,
        "SUBJECT_ENROLL_ADMIN",
        `Enrolled student ID: ${studentId} in subject ID: ${subjId}`,
        "StudentSubjectEnrollment",
        undefined,
        { studentId, subjectId: subjId, academic_year_id: yearId },
        req.user.userId,
      );
    }

    successResponse(res, "Student enrolled in subject successfully", null, 201);
  },
);

export const unenrollStudentFromSubject = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, subject_id, academic_year_id } = req.params;

    const studentId = parseInt(user_id);
    const subjId = parseInt(subject_id);
    const yearId = parseInt(academic_year_id);

    if (isNaN(studentId) || isNaN(subjId) || isNaN(yearId)) {
      throw new ValidationError("Invalid IDs provided");
    }

    // Check if enrollment exists and is active
    const existingEnrollment = await db
      .select()
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.subject_id, subjId),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (existingEnrollment.length === 0) {
      throw new NotFoundError("Student enrollment not found");
    }

    await db
      .update(StudentSubjectEnrollment)
      .set({ status: "DISABLED" })
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.subject_id, subjId),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
        ),
      );

    logger.info("Student unenrolled from subject", {
      studentId,
      subjId,
      yearId,
    });

    // Record activity for student
    await recordActivity(
      studentId,
      "SUBJECT_UNENROLL",
      `You have been unenrolled from subject ID: ${subjId}`,
      "StudentSubjectEnrollment",
      undefined,
      {
        subject_id: subjId,
        academic_year_id: yearId,
        unenrolling_user_id: req.user?.userId,
      },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== studentId) {
      await recordActivity(
        req.user.userId,
        "SUBJECT_UNENROLL_ADMIN",
        `Unenrolled student ID: ${studentId} from subject ID: ${subjId}`,
        "StudentSubjectEnrollment",
        undefined,
        { studentId, subjectId: subjId, academic_year_id: yearId },
        req.user.userId,
      );
    }

    successResponse(res, "Student unenrolled from subject successfully");
  },
);

// Student Class Group Assignment Management
export const getStudentClassGroup = asyncHandler(async (req: any, res: any) => {
  const { studentId } = req.params;

  const studentIdNum = parseInt(studentId);
  if (isNaN(studentIdNum)) {
    throw new ValidationError("Invalid student ID");
  }

  // Verify user exists and is a student
  const user = await db
    .select()
    .from(User)
    .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .where(
      and(eq(User.user_id, studentIdNum), eq(UserProfile.user_type, "STUDENT")),
    )
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("Student not found");
  }

  const studentClassGroup = await db
    .select({
      class_group_id: ClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      grade_id: Grade.grade_id,
      grade_name: Grade.name,
      program_id: Program.program_id,
      program_name: Program.name,
      academic_year_id: AcademicYear.academic_year_id,
      academic_year_name: AcademicYear.name,
      assigned_at: StudentClassGroup.assigned_at,
    })
    .from(StudentClassGroup)
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(StudentClassGroup.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(
      and(
        eq(StudentClassGroup.user_id, studentIdNum),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    )
    // A student can have an active class group in more than one academic
    // year at once (e.g. right after being promoted to the next year's
    // class, the prior year's row is still valid history) -- without this
    // ordering, `.limit(1)` would pick an arbitrary one instead of the most
    // recent year's.
    .orderBy(desc(AcademicYear.academic_year_id))
    .limit(1);

  successResponse(
    res,
    "Student class group retrieved successfully",
    studentClassGroup[0] || null,
  );
});

export const assignStudentToClassGroup = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, class_group_id, academic_year_id } = req.body;

    if (!user_id || !class_group_id) {
      throw new ValidationError("User ID and Class Group ID are required");
    }

    const studentId = Number(user_id);
    const classGroupId = Number(class_group_id);
    const yearId = academic_year_id
      ? Number(academic_year_id)
      : await getCurrentAcademicYearId();

    if (isNaN(studentId) || isNaN(classGroupId)) {
      throw new ValidationError("Invalid IDs provided");
    }
    if (!yearId || isNaN(yearId)) {
      throw new ValidationError(
        "Academic year ID is required (no current academic year set)",
      );
    }

    // Verify student exists and is a student
    const student = await db
      .select()
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(eq(User.user_id, studentId), eq(UserProfile.user_type, "STUDENT")),
      )
      .limit(1);

    if (student.length === 0) {
      throw new NotFoundError("Student not found");
    }

    // Verify class group exists
    const classGroup = await db
      .select()
      .from(ClassGroup)
      .where(eq(ClassGroup.class_group_id, classGroupId))
      .limit(1);

    if (classGroup.length === 0) {
      throw new NotFoundError("Class group not found");
    }

    // Verify academic year exists
    const academicYear = await db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, yearId))
      .limit(1);

    if (academicYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    // Check if assignment already exists for this year
    const existingAssignment = await db
      .select()
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.user_id, studentId),
          eq(StudentClassGroup.class_group_id, classGroupId),
          eq(StudentClassGroup.academic_year_id, yearId),
        ),
      )
      .limit(1);

    // Disable all OTHER active class group assignments for this student in
    // this SAME academic year only -- a student can validly have an active
    // assignment in a different year too (that's their history/promotion
    // trail, not something this should touch).
    await db
      .update(StudentClassGroup)
      .set({ status: "DISABLED" })
      .where(
        and(
          eq(StudentClassGroup.user_id, studentId),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
          not(eq(StudentClassGroup.class_group_id, classGroupId)),
        ),
      );

    if (existingAssignment.length > 0) {
      if (existingAssignment[0].status === "ACTIVE") {
        return successResponse(
          res,
          "Student is already assigned to this class group",
          null,
          200,
        );
      } else {
        // Reactivate the assignment
        await db
          .update(StudentClassGroup)
          .set({
            status: "ACTIVE",
            assigned_at: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(StudentClassGroup.user_id, studentId),
              eq(StudentClassGroup.class_group_id, classGroupId),
              eq(StudentClassGroup.academic_year_id, yearId),
            ),
          );

        logger.info("Student class group assignment reactivated", {
          studentId,
          classGroupId,
          yearId,
        });

        return successResponse(
          res,
          "Student assigned to class group successfully",
          null,
          200,
        );
      }
    }

    await db.insert(StudentClassGroup).values({
      user_id: studentId,
      class_group_id: classGroupId,
      academic_year_id: yearId,
      status: "ACTIVE",
    });

    logger.info("Student assigned to class group", {
      studentId,
      classGroupId,
      yearId,
    });

    // Record activity for student
    await recordActivity(
      studentId,
      "CLASS_GROUP_ASSIGN",
      `You have been assigned to class group ID: ${classGroupId}`,
      "StudentClassGroup",
      undefined,
      { class_group_id: classGroupId, assigning_user_id: req.user?.userId },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== studentId) {
      await recordActivity(
        req.user.userId,
        "CLASS_GROUP_ASSIGN_ADMIN",
        `Assigned student ID: ${studentId} to class group ID: ${classGroupId}`,
        "StudentClassGroup",
        undefined,
        { studentId, classGroupId },
        req.user.userId,
      );
    }

    successResponse(
      res,
      "Student assigned to class group successfully",
      null,
      201,
    );
  },
);

export const removeStudentFromClassGroup = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, class_group_id, academic_year_id } = req.params;

    const studentId = parseInt(user_id);
    const classGroupId = parseInt(class_group_id);
    const yearId = parseInt(academic_year_id);

    if (isNaN(studentId) || isNaN(classGroupId) || isNaN(yearId)) {
      throw new ValidationError("Invalid IDs provided");
    }

    // Check if assignment exists and is active
    const existingAssignment = await db
      .select()
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.user_id, studentId),
          eq(StudentClassGroup.class_group_id, classGroupId),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      throw new NotFoundError("Student class group assignment not found");
    }

    // Disable the class group assignment
    await db
      .update(StudentClassGroup)
      .set({ status: "DISABLED" })
      .where(
        and(
          eq(StudentClassGroup.user_id, studentId),
          eq(StudentClassGroup.class_group_id, classGroupId),
          eq(StudentClassGroup.academic_year_id, yearId),
        ),
      );

    // Disable this student's subject enrollments for that same academic
    // year only — enrollments from other academic years must be left alone.
    await db
      .update(StudentSubjectEnrollment)
      .set({ status: "DISABLED" })
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          eq(StudentSubjectEnrollment.academic_year_id, yearId),
        ),
      );

    logger.info("Student removed from class group and subjects disabled", {
      studentId,
      classGroupId,
      academicYearId: yearId,
    });

    // Record activity for student
    await recordActivity(
      studentId,
      "CLASS_GROUP_REMOVE",
      `You have been removed from class group ID: ${classGroupId}`,
      "StudentClassGroup",
      undefined,
      { class_group_id: classGroupId, removing_user_id: req.user?.userId },
      req.user?.userId,
    );

    // Record activity for admin
    if (req.user?.userId && req.user.userId !== studentId) {
      await recordActivity(
        req.user.userId,
        "CLASS_GROUP_REMOVE_ADMIN",
        `Removed student ID: ${studentId} from class group ID: ${classGroupId}`,
        "StudentClassGroup",
        undefined,
        { studentId, classGroupId },
        req.user.userId,
      );
    }

    successResponse(
      res,
      "Student removed from class group and subject enrollments disabled successfully",
    );
  },
);

// Bulk-move every active student from one class group into another --
// "promote" a whole class at once instead of moving students one at a time.
// Deliberately NOT the same shape as copyClassGroups/copyTeacherAssignments:
// those match same-named class groups across a whole academic year, which is
// wrong here (a student promoted from Grade 5 to Grade 6 must land in a
// *different*-named class group, not the same name in a new year). So the
// admin picks the exact source and target class group explicitly rather
// than this being inferred from a source/target year pair.
//
// The source class group's students are NOT unenrolled -- their prior-year
// StudentClassGroup row stays ACTIVE as valid history (see the ordering fix
// on getStudentClassGroup, which now prefers the most recent year when a
// student has more than one active row).
export const promoteStudentsToClassGroup = asyncHandler(
  async (req: any, res: any) => {
    const {
      source_class_group_id,
      source_academic_year_id,
      target_class_group_id,
      target_academic_year_id,
    } = req.body;

    if (
      !source_class_group_id ||
      !target_class_group_id ||
      !source_academic_year_id ||
      !target_academic_year_id
    ) {
      throw new ValidationError(
        "Source class group, target class group, source academic year, and target academic year are all required",
      );
    }

    const sourceClassGroupId = parseInt(source_class_group_id);
    const targetClassGroupId = parseInt(target_class_group_id);
    const sourceYearId = parseInt(source_academic_year_id);
    const targetYearId = parseInt(target_academic_year_id);

    if (
      isNaN(sourceClassGroupId) ||
      isNaN(targetClassGroupId) ||
      isNaN(sourceYearId) ||
      isNaN(targetYearId)
    ) {
      throw new ValidationError("Invalid ID provided");
    }

    if (sourceClassGroupId === targetClassGroupId && sourceYearId === targetYearId) {
      throw new ValidationError(
        "Source and target must differ in class group or academic year",
      );
    }

    const [sourceGroup, targetGroup, sourceYear, targetYear] = await Promise.all([
      db
        .select()
        .from(ClassGroup)
        .where(eq(ClassGroup.class_group_id, sourceClassGroupId))
        .limit(1),
      db
        .select()
        .from(ClassGroup)
        .where(eq(ClassGroup.class_group_id, targetClassGroupId))
        .limit(1),
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, sourceYearId))
        .limit(1),
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, targetYearId))
        .limit(1),
    ]);

    if (sourceGroup.length === 0 || targetGroup.length === 0) {
      throw new NotFoundError("Class group not found");
    }
    if (sourceYear.length === 0 || targetYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    const sourceStudents = await db
      .select({ user_id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.class_group_id, sourceClassGroupId),
          eq(StudentClassGroup.academic_year_id, sourceYearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      );

    if (sourceStudents.length === 0) {
      throw new ValidationError(
        `${sourceGroup[0].name} has no active students in ${sourceYear[0].name} to promote`,
      );
    }

    const existingTargetStudents = await db
      .select({ user_id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.class_group_id, targetClassGroupId),
          eq(StudentClassGroup.academic_year_id, targetYearId),
        ),
      );
    const existingUserIds = new Set(
      existingTargetStudents.map((s) => s.user_id),
    );

    const toInsert = sourceStudents.filter(
      (s) => !existingUserIds.has(s.user_id),
    );

    if (toInsert.length > 0) {
      await db.insert(StudentClassGroup).values(
        toInsert.map((s) => ({
          user_id: s.user_id,
          class_group_id: targetClassGroupId,
          academic_year_id: targetYearId,
        })),
      );
    }

    logger.info("Students promoted to new class group", {
      sourceClassGroupId,
      sourceYearId,
      targetClassGroupId,
      targetYearId,
      promoted: toInsert.length,
      skipped: sourceStudents.length - toInsert.length,
    });

    if (req.user?.userId) {
      await recordActivity(
        req.user.userId,
        "STUDENTS_PROMOTE",
        `Promoted ${toInsert.length} student(s) from ${sourceGroup[0].name} (${sourceYear[0].name}) to ${targetGroup[0].name} (${targetYear[0].name})`,
        "StudentClassGroup",
        undefined,
        {
          sourceClassGroupId,
          sourceYearId,
          targetClassGroupId,
          targetYearId,
          promoted: toInsert.length,
        },
        req.user.userId,
      );
    }

    successResponse(res, "Students promoted successfully", {
      promoted: toInsert.length,
      skipped: sourceStudents.length - toInsert.length,
      total: sourceStudents.length,
    });
  },
);

interface PromotionGradePlan {
  source_grade_id: number;
  source_grade_name: string;
  program_id: number;
  program_name: string;
  student_count: number;
  target_grade_id: number | null;
  target_grade_name: string | null;
  target_class_group_id: number | null;
  target_class_group_name: string | null;
  status: "ready" | "no_next_grade" | "no_class_group" | "ambiguous";
}

// Shared by the preview and execute endpoints below. For every grade that
// has active students in the source academic year, suggests the grade a
// student in it should be promoted into: the next-highest level_order grade
// *within the same program* (not simply level_order + 1 -- level_order is
// only guaranteed consecutive within a program, not globally, so "+1" can
// jump across an unrelated program/track). Then resolves that suggested
// grade to a class group -- ClassGroup is a permanent label now (not
// per-year), so this no longer depends on the target year at all; a grade
// either has a defined class group (or several, or none) full stop.
async function resolvePromotionPlan(
  sourceYearId: number,
): Promise<PromotionGradePlan[]> {
  const sourceGrades = await db
    .select({
      grade_id: Grade.grade_id,
      grade_name: Grade.name,
      program_id: Grade.program_id,
      program_name: Program.name,
      level_order: Grade.level_order,
      student_count: sql<number>`COUNT(DISTINCT ${StudentClassGroup.user_id})`,
    })
    .from(StudentClassGroup)
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(
      and(
        eq(StudentClassGroup.academic_year_id, sourceYearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    )
    .groupBy(
      Grade.grade_id,
      Grade.name,
      Grade.program_id,
      Program.name,
      Grade.level_order,
    );

  const plans: PromotionGradePlan[] = [];

  for (const sg of sourceGrades) {
    // Next-highest grade *school-wide* by level_order, not scoped to the
    // same program: many schools split the K-12 ladder across several
    // Program records (e.g. Nursery / Grade1-6 / Grade7-8 / Grade9-10 /
    // Grade11 / Grade12 as separate programs here), so scoping to "same
    // program" would incorrectly report "no next grade" at every one of
    // those boundaries. level_order is treated as the single source of
    // truth for progression order; this is a best-effort suggestion the
    // admin reviews (and can skip or override) in the promotion preview
    // before anything is written, which is what actually guards against a
    // stray/incorrect level_order value rather than a smarter heuristic.
    const [nextGrade] = await db
      .select({ grade_id: Grade.grade_id, name: Grade.name })
      .from(Grade)
      .where(sql`${Grade.level_order} > ${sg.level_order}`)
      .orderBy(Grade.level_order)
      .limit(1);

    if (!nextGrade) {
      plans.push({
        source_grade_id: sg.grade_id,
        source_grade_name: sg.grade_name,
        program_id: sg.program_id,
        program_name: sg.program_name,
        student_count: Number(sg.student_count),
        target_grade_id: null,
        target_grade_name: null,
        target_class_group_id: null,
        target_class_group_name: null,
        status: "no_next_grade",
      });
      continue;
    }

    const targetClassGroups = await db
      .select({
        class_group_id: ClassGroup.class_group_id,
        name: ClassGroup.name,
      })
      .from(ClassGroup)
      .where(eq(ClassGroup.grade_id, nextGrade.grade_id));

    plans.push({
      source_grade_id: sg.grade_id,
      source_grade_name: sg.grade_name,
      program_id: sg.program_id,
      program_name: sg.program_name,
      student_count: Number(sg.student_count),
      target_grade_id: nextGrade.grade_id,
      target_grade_name: nextGrade.name,
      target_class_group_id:
        targetClassGroups.length === 1
          ? targetClassGroups[0].class_group_id
          : null,
      target_class_group_name:
        targetClassGroups.length === 1 ? targetClassGroups[0].name : null,
      status:
        targetClassGroups.length === 1
          ? "ready"
          : targetClassGroups.length === 0
            ? "no_class_group"
            : "ambiguous",
    });
  }

  return plans.sort((a, b) => a.source_grade_name.localeCompare(b.source_grade_name));
}

// Preview what an automatic whole-year promotion would do, before running
// it -- lets the admin see and override the suggested next grade/class group
// per source grade instead of a silent black-box bulk write.
export const getPromotionPreview = asyncHandler(
  async (req: any, res: any) => {
    const { source_academic_year_id, target_academic_year_id } = req.query;

    const sourceYearId = parseInt(source_academic_year_id as string);
    const targetYearId = parseInt(target_academic_year_id as string);

    if (isNaN(sourceYearId) || isNaN(targetYearId)) {
      throw new ValidationError(
        "Source and target academic year IDs are required",
      );
    }
    if (sourceYearId === targetYearId) {
      throw new ValidationError(
        "Source and target academic years must be different",
      );
    }

    const [sourceYear, targetYear] = await Promise.all([
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, sourceYearId))
        .limit(1),
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, targetYearId))
        .limit(1),
    ]);

    if (sourceYear.length === 0 || targetYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    const plan = await resolvePromotionPlan(sourceYearId);

    successResponse(res, "Promotion preview generated successfully", plan);
  },
);

// Execute a whole-year promotion: every grade resolved as "ready" by
// resolvePromotionPlan (or explicitly overridden by the admin) has its
// active students bulk-moved into the corresponding class group in the
// target year. Grades left ambiguous/unresolved and not overridden are
// skipped and reported, not guessed at.
export const promoteStudentsForYear = asyncHandler(
  async (req: any, res: any) => {
    const {
      source_academic_year_id,
      target_academic_year_id,
      grade_overrides,
      excluded_grade_ids,
    } = req.body;

    const sourceYearId = parseInt(source_academic_year_id);
    const targetYearId = parseInt(target_academic_year_id);

    if (isNaN(sourceYearId) || isNaN(targetYearId)) {
      throw new ValidationError(
        "Source and target academic year IDs are required",
      );
    }
    if (sourceYearId === targetYearId) {
      throw new ValidationError(
        "Source and target academic years must be different",
      );
    }

    const [sourceYear, targetYear] = await Promise.all([
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, sourceYearId))
        .limit(1),
      db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, targetYearId))
        .limit(1),
    ]);

    if (sourceYear.length === 0 || targetYear.length === 0) {
      throw new NotFoundError("Academic year not found");
    }

    const plan = await resolvePromotionPlan(sourceYearId);

    if (plan.length === 0) {
      throw new ValidationError(
        `${sourceYear[0].name} has no active students to promote`,
      );
    }

    const overrides: Record<string, number> = grade_overrides || {};
    const excludedIds = new Set<number>(
      (excluded_grade_ids || []).map((id: any) => Number(id)),
    );

    const promotedGrades: {
      source_grade_name: string;
      target_class_group_name: string;
      promoted: number;
      skipped: number;
    }[] = [];
    const skippedGrades: {
      source_grade_name: string;
      reason: string;
      student_count: number;
    }[] = [];

    for (const gradePlan of plan) {
      if (excludedIds.has(gradePlan.source_grade_id)) {
        skippedGrades.push({
          source_grade_name: gradePlan.source_grade_name,
          reason: "Excluded from this promotion run",
          student_count: gradePlan.student_count,
        });
        continue;
      }

      const overrideTargetId = overrides[String(gradePlan.source_grade_id)];
      const targetClassGroupId =
        overrideTargetId || gradePlan.target_class_group_id;

      if (!targetClassGroupId) {
        skippedGrades.push({
          source_grade_name: gradePlan.source_grade_name,
          reason:
            gradePlan.status === "no_next_grade"
              ? "No next grade exists (likely the final grade)"
              : gradePlan.status === "ambiguous"
                ? "Multiple class groups exist for the next grade -- promote this one manually"
                : "The next grade has no class group defined yet -- create one first",
          student_count: gradePlan.student_count,
        });
        continue;
      }

      // Verify the (overridden or suggested) target class group still
      // exists -- an override is client-supplied, so it must be
      // re-validated server-side rather than trusted blindly. ClassGroup is
      // a permanent label now (not year-scoped), so there's no "does it
      // belong to the target year" check to make here anymore.
      const [targetGroup] = await db
        .select({ name: ClassGroup.name })
        .from(ClassGroup)
        .where(eq(ClassGroup.class_group_id, targetClassGroupId))
        .limit(1);

      if (!targetGroup) {
        skippedGrades.push({
          source_grade_name: gradePlan.source_grade_name,
          reason: "The selected target class group no longer exists",
          student_count: gradePlan.student_count,
        });
        continue;
      }

      const sourceStudents = await db
        .select({ user_id: StudentClassGroup.user_id })
        .from(StudentClassGroup)
        .innerJoin(
          ClassGroup,
          eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
        )
        .where(
          and(
            eq(StudentClassGroup.academic_year_id, sourceYearId),
            eq(ClassGroup.grade_id, gradePlan.source_grade_id),
            eq(StudentClassGroup.status, "ACTIVE"),
          ),
        );

      const existingTargetStudents = await db
        .select({ user_id: StudentClassGroup.user_id })
        .from(StudentClassGroup)
        .where(
          and(
            eq(StudentClassGroup.class_group_id, targetClassGroupId),
            eq(StudentClassGroup.academic_year_id, targetYearId),
          ),
        );
      const existingUserIds = new Set(
        existingTargetStudents.map((s) => s.user_id),
      );

      const toInsert = sourceStudents.filter(
        (s) => !existingUserIds.has(s.user_id),
      );

      if (toInsert.length > 0) {
        await db.insert(StudentClassGroup).values(
          toInsert.map((s) => ({
            user_id: s.user_id,
            class_group_id: targetClassGroupId,
            academic_year_id: targetYearId,
          })),
        );
      }

      promotedGrades.push({
        source_grade_name: gradePlan.source_grade_name,
        target_class_group_name: targetGroup.name,
        promoted: toInsert.length,
        skipped: sourceStudents.length - toInsert.length,
      });
    }

    const totalPromoted = promotedGrades.reduce((sum, g) => sum + g.promoted, 0);
    const totalSkippedExisting = promotedGrades.reduce(
      (sum, g) => sum + g.skipped,
      0,
    );

    logger.info("Students promoted for academic year rollover", {
      sourceYearId,
      targetYearId,
      totalPromoted,
      gradesPromoted: promotedGrades.length,
      gradesSkipped: skippedGrades.length,
    });

    if (req.user?.userId) {
      await recordActivity(
        req.user.userId,
        "STUDENTS_PROMOTE_YEAR",
        `Promoted ${totalPromoted} student(s) across ${promotedGrades.length} grade(s) from ${sourceYear[0].name} to ${targetYear[0].name}`,
        "StudentClassGroup",
        undefined,
        {
          sourceYearId,
          targetYearId,
          totalPromoted,
          promotedGrades,
          skippedGrades,
        },
        req.user.userId,
      );
    }

    successResponse(res, "Students promoted successfully", {
      totalPromoted,
      totalSkippedExisting,
      promotedGrades,
      skippedGrades,
    });
  },
);

// Get users by program (for program leads)
export const getUsersByProgram = asyncHandler(async (req: any, res: any) => {
  const { programId } = req.params;
  const { page = 1, limit = 10, search, status } = req.query;

  const programIdNum = parseInt(programId);
  if (isNaN(programIdNum)) {
    throw new ValidationError("Invalid program ID");
  }

  // Verify program exists
  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programIdNum))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let whereConditions: any[] = [];

  if (search) {
    whereConditions.push(
      or(
        sql`${User.username} LIKE ${`%${search}%`}`,
        sql`${User.email} LIKE ${`%${search}%`}`,
        sql`${UserProfile.first_name} LIKE ${`%${search}%`}`,
        sql`${UserProfile.last_name} LIKE ${`%${search}%`}`,
      ),
    );
  }

  if (status && status !== "all") {
    whereConditions.push(eq(User.status, status.toUpperCase()));
  }

  // Get users who are in grades of this program
  const totalCountResult = await db
    .select({ count: sql<number>`count(distinct ${User.user_id})` })
    .from(User)
    .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        eq(Grade.program_id, programIdNum),
        eq(StudentClassGroup.status, "ACTIVE"),
        ...whereConditions,
      ),
    );

  const totalCount = totalCountResult[0]?.count || 0;

  const users = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      phone_number: User.phone_number,
      status: User.status,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      user_type: UserProfile.user_type,
      grade_name: Grade.name,
      class_group_name: ClassGroup.name,
    })
    .from(User)
    .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(StudentClassGroup, eq(User.user_id, StudentClassGroup.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        eq(Grade.program_id, programIdNum),
        eq(StudentClassGroup.status, "ACTIVE"),
        ...whereConditions,
      ),
    )
    .limit(limitNum)
    .offset(offset)
    .orderBy(UserProfile.first_name, UserProfile.last_name);

  const totalPages = Math.ceil(totalCount / limitNum);

  res.setHeader("X-Total-Count", totalCount.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());
  res.setHeader("X-Current-Page", pageNum.toString());
  res.setHeader("X-Per-Page", limitNum.toString());

  successResponse(res, "Users retrieved successfully", users);
});

// Assign user to program as lead
export const assignUserToProgram = asyncHandler(async (req: any, res: any) => {
  const { user_id, program_id, academic_year_id } = req.body;

  if (!user_id || !program_id) {
    throw new ValidationError("User ID and Program ID are required");
  }

  const userId = parseInt(user_id);
  const programId = parseInt(program_id);

  if (isNaN(userId) || isNaN(programId)) {
    throw new ValidationError("Invalid user ID or program ID");
  }

  const yearId = academic_year_id
    ? parseInt(academic_year_id)
    : await getCurrentAcademicYearId();

  if (!yearId || isNaN(yearId)) {
    throw new ValidationError(
      "Academic year ID is required (no current academic year set)",
    );
  }

  // Verify academic year exists
  const academicYear = await db
    .select()
    .from(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, yearId))
    .limit(1);

  if (academicYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  // Verify user exists
  const user = await db
    .select()
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new NotFoundError("User not found");
  }

  // Verify program exists
  const program = await db
    .select()
    .from(Program)
    .where(eq(Program.program_id, programId))
    .limit(1);

  if (program.length === 0) {
    throw new NotFoundError("Program not found");
  }

  // Check if assignment already exists for this academic year
  const existingAssignment = await db
    .select()
    .from(UserProgramLead)
    .where(
      and(
        eq(UserProgramLead.user_id, userId),
        eq(UserProgramLead.program_id, programId),
        eq(UserProgramLead.academic_year_id, yearId),
      ),
    )
    .limit(1);

  if (existingAssignment.length > 0) {
    throw new ConflictError(
      "User is already assigned to this program for the selected academic year",
    );
  }

  await db.insert(UserProgramLead).values({
    user_id: userId,
    program_id: programId,
    academic_year_id: yearId,
  });

  logger.info("User assigned to program as lead", {
    userId,
    programId,
    academicYearId: yearId,
  });

  // Record activity
  if (req.user?.userId) {
    await recordActivity(
      userId,
      "PROGRAM_LEAD_ASSIGN",
      `You have been assigned as lead for program ID: ${programId}`,
      "UserProgramLead",
      undefined,
      {
        program_id: programId,
        academic_year_id: yearId,
        assigned_by: req.user.userId,
      },
      req.user.userId,
    );
  }

  successResponse(res, "User assigned to program successfully", null, 201);
});

// Remove user from program lead
export const removeUserFromProgram = asyncHandler(
  async (req: any, res: any) => {
    const { user_id, program_id, academic_year_id } = req.params;

    const userId = parseInt(user_id);
    const programId = parseInt(program_id);
    const yearId = parseInt(academic_year_id);

    if (isNaN(userId) || isNaN(programId) || isNaN(yearId)) {
      throw new ValidationError(
        "Invalid user ID, program ID, or academic year ID",
      );
    }

    // Check if assignment exists
    const existingAssignment = await db
      .select()
      .from(UserProgramLead)
      .where(
        and(
          eq(UserProgramLead.user_id, userId),
          eq(UserProgramLead.program_id, programId),
          eq(UserProgramLead.academic_year_id, yearId),
        ),
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      throw new NotFoundError(
        "User is not assigned to this program for the selected academic year",
      );
    }

    await db
      .delete(UserProgramLead)
      .where(
        and(
          eq(UserProgramLead.user_id, userId),
          eq(UserProgramLead.program_id, programId),
          eq(UserProgramLead.academic_year_id, yearId),
        ),
      );

    logger.info("User removed from program lead", {
      userId,
      programId,
      academicYearId: yearId,
    });

    // Record activity
    if (req.user?.userId) {
      await recordActivity(
        userId,
        "PROGRAM_LEAD_REMOVE",
        `You have been removed as lead for program ID: ${programId}`,
        "UserProgramLead",
        undefined,
        {
          program_id: programId,
          academic_year_id: yearId,
          removed_by: req.user.userId,
        },
        req.user.userId,
      );
    }

    successResponse(res, "User removed from program successfully");
  },
);

// All program-lead assignments across every user, optionally scoped to one
// academic year -- powers the admin "Program Leads" overview tab, which
// previously had no cross-user view (only per-user, via each user's profile).
export const getAllProgramLeads = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id } = req.query;

  let whereCondition: SQL<unknown> | undefined;
  if (academic_year_id) {
    const yearIdNum = Number(academic_year_id);
    if (isNaN(yearIdNum)) {
      throw new ValidationError("Invalid academic year ID");
    }
    whereCondition = eq(UserProgramLead.academic_year_id, yearIdNum);
  }

  const leads = await db
    .select({
      lead_id: sql`CONCAT(${UserProgramLead.user_id}, '-', ${UserProgramLead.program_id}, '-', ${UserProgramLead.academic_year_id})`,
      user_id: UserProgramLead.user_id,
      user_name: sql`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
      username: User.username,
      program_id: UserProgramLead.program_id,
      program_name: Program.name,
      academic_year_id: UserProgramLead.academic_year_id,
      academic_year_name: AcademicYear.name,
      academic_year_is_current: AcademicYear.is_current,
      assigned_at: UserProgramLead.assigned_at,
    })
    .from(UserProgramLead)
    .innerJoin(User, eq(UserProgramLead.user_id, User.user_id))
    .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(Program, eq(UserProgramLead.program_id, Program.program_id))
    .innerJoin(
      AcademicYear,
      eq(UserProgramLead.academic_year_id, AcademicYear.academic_year_id),
    )
    .where(whereCondition)
    .orderBy(
      desc(AcademicYear.academic_year_id),
      UserProfile.first_name,
      UserProfile.last_name,
    );

  successResponse(res, "Program leads retrieved successfully", leads);
});

// Copy every program-lead assignment from one academic year into another.
// Unlike TeacherSubjectAssignment, UserProgramLead points directly at Program
// (not at a per-year row), so this is a straight (user_id, program_id) copy
// with no re-matching step needed -- skip pairs that already exist in the
// target year.
export const copyProgramLeads = asyncHandler(async (req: any, res: any) => {
  const { source_academic_year_id, target_academic_year_id } = req.body;

  if (!source_academic_year_id || !target_academic_year_id) {
    throw new ValidationError(
      "Source and target academic year IDs are required",
    );
  }

  const sourceYearId = parseInt(source_academic_year_id);
  const targetYearId = parseInt(target_academic_year_id);

  if (isNaN(sourceYearId) || isNaN(targetYearId)) {
    throw new ValidationError("Invalid academic year ID");
  }

  if (sourceYearId === targetYearId) {
    throw new ValidationError(
      "Source and target academic years must be different",
    );
  }

  const [sourceYear, targetYear] = await Promise.all([
    db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, sourceYearId))
      .limit(1),
    db
      .select()
      .from(AcademicYear)
      .where(eq(AcademicYear.academic_year_id, targetYearId))
      .limit(1),
  ]);

  if (sourceYear.length === 0 || targetYear.length === 0) {
    throw new NotFoundError("Academic year not found");
  }

  const [sourceLeads, targetLeads] = await Promise.all([
    db
      .select({
        user_id: UserProgramLead.user_id,
        program_id: UserProgramLead.program_id,
      })
      .from(UserProgramLead)
      .where(eq(UserProgramLead.academic_year_id, sourceYearId)),
    db
      .select({
        user_id: UserProgramLead.user_id,
        program_id: UserProgramLead.program_id,
      })
      .from(UserProgramLead)
      .where(eq(UserProgramLead.academic_year_id, targetYearId)),
  ]);

  if (sourceLeads.length === 0) {
    throw new ValidationError(
      `${sourceYear[0].name} has no program leads to copy`,
    );
  }

  const existingKeys = new Set(
    targetLeads.map((l) => `${l.user_id}::${l.program_id}`),
  );

  const toInsert = sourceLeads.filter(
    (l) => !existingKeys.has(`${l.user_id}::${l.program_id}`),
  );

  if (toInsert.length > 0) {
    await db.insert(UserProgramLead).values(
      toInsert.map((l) => ({
        user_id: l.user_id,
        program_id: l.program_id,
        academic_year_id: targetYearId,
      })),
    );
  }

  logger.info("Program leads copied", {
    sourceYearId,
    targetYearId,
    copied: toInsert.length,
    skipped: sourceLeads.length - toInsert.length,
  });

  if (req.user?.userId) {
    await recordActivity(
      req.user.userId,
      "PROGRAM_LEADS_COPY",
      `Copied ${toInsert.length} program lead(s) from ${sourceYear[0].name} to ${targetYear[0].name}`,
      "UserProgramLead",
      undefined,
      { sourceYearId, targetYearId, copied: toInsert.length },
      req.user.userId,
    );
  }

  successResponse(res, "Program leads copied successfully", {
    copied: toInsert.length,
    skipped: sourceLeads.length - toInsert.length,
    total: sourceLeads.length,
  });
});
