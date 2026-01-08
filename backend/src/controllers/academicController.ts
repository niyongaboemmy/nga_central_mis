import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  AcademicYear,
  AcademicTerm,
  Program,
  Grade,
  Subject,
  ClassGroup,
  GradeSubject,
} from "../db/schema";
import { sanitizeString } from "../utils/sanitization";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import logger from "../utils/logger";

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
          sql`${AcademicYear.academic_year_id} != ${academicYearId}`
        )
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
      "Cannot delete academic year with existing terms"
    );
  }

  await db
    .delete(AcademicYear)
    .where(eq(AcademicYear.academic_year_id, academicYearId));

  logger.info("Academic year deleted", { academicYearId });

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
      "Academic year ID, name, start date, and end date are required"
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

  logger.info("Program created", { name: sanitizedName });

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
          sql`${Program.program_id} != ${programId}`
        )
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

  successResponse(res, "Program deleted successfully");
});

// Grades Management
export const getGrades = asyncHandler(async (req: any, res: any) => {
  const { program_id } = req.query;

  let whereCondition = undefined;

  if (program_id) {
    const progId = parseInt(program_id as string);
    if (!isNaN(progId)) {
      whereCondition = eq(Grade.program_id, progId);
    }
  }

  const grades = await db
    .select()
    .from(Grade)
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

  logger.info("Grade created", { name: sanitizedName, programId: progId });

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

  successResponse(res, "Grade deleted successfully");
});

// Subjects Management
export const getSubjects = asyncHandler(async (req: any, res: any) => {
  logger.info("Fetching all subjects");

  const subjects = await db.select().from(Subject).orderBy(Subject.name);

  successResponse(res, "Subjects retrieved successfully", subjects);
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
    .where(eq(Subject.subject_id, subjectId))
    .limit(1);

  if (subject.length === 0) {
    throw new NotFoundError("Subject not found");
  }

  successResponse(res, "Subject retrieved successfully", subject[0]);
});

export const createSubject = asyncHandler(async (req: any, res: any) => {
  const { code, name, description } = req.body;

  if (!name) {
    throw new ValidationError("Subject name is required");
  }

  const sanitizedCode = code ? sanitizeString(code) : undefined;
  const sanitizedName = sanitizeString(name);
  const sanitizedDescription = description
    ? sanitizeString(description)
    : undefined;

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
  });

  logger.info("Subject created", { name: sanitizedName });

  successResponse(res, "Subject created successfully", null, 201);
});

export const updateSubject = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const subjectId = parseInt(id);
  const { code, name, description } = req.body;

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
            sql`${Subject.subject_id} != ${subjectId}`
          )
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

  await db
    .update(Subject)
    .set(updateData)
    .where(eq(Subject.subject_id, subjectId));

  logger.info("Subject updated", { subjectId });

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

  await db.delete(Subject).where(eq(Subject.subject_id, subjectId));

  logger.info("Subject deleted", { subjectId });

  successResponse(res, "Subject deleted successfully");
});

// Grade-Subject Assignment Management
export const getGradeSubjects = asyncHandler(async (req: any, res: any) => {
  const { grade_id } = req.query;

  if (!grade_id) {
    throw new ValidationError("Grade ID is required");
  }

  const gradeId = parseInt(grade_id as string);
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

  const gradeSubjects = await db
    .select({
      grade_subject_id: sql`${GradeSubject.grade_id} || '-' || ${GradeSubject.subject_id}`,
      grade_id: GradeSubject.grade_id,
      subject_id: GradeSubject.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_description: Subject.description,
    })
    .from(GradeSubject)
    .innerJoin(Subject, eq(GradeSubject.subject_id, Subject.subject_id))
    .where(eq(GradeSubject.grade_id, gradeId))
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

  // Verify subject exists
  const subject = await db
    .select()
    .from(Subject)
    .where(eq(Subject.subject_id, subjectId))
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
        eq(GradeSubject.subject_id, subjectId)
      )
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
          eq(GradeSubject.subject_id, subjectId)
        )
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
          eq(GradeSubject.subject_id, subjectId)
        )
      );

    logger.info("Subject removed from grade", { gradeId, subjectId });

    successResponse(res, "Subject removed from grade successfully");
  }
);

// Class Groups Management
export const getClassGroups = asyncHandler(async (req: any, res: any) => {
  const { academic_year_id, grade_id } = req.query;

  let whereCondition = undefined;

  if (academic_year_id && grade_id) {
    const yearId = parseInt(academic_year_id as string);
    const grdId = parseInt(grade_id as string);
    if (!isNaN(yearId) && !isNaN(grdId)) {
      whereCondition = and(
        eq(ClassGroup.academic_year_id, yearId),
        eq(ClassGroup.grade_id, grdId)
      );
    }
  } else if (academic_year_id) {
    const yearId = parseInt(academic_year_id as string);
    if (!isNaN(yearId)) {
      whereCondition = eq(ClassGroup.academic_year_id, yearId);
    }
  } else if (grade_id) {
    const grdId = parseInt(grade_id as string);
    if (!isNaN(grdId)) {
      whereCondition = eq(ClassGroup.grade_id, grdId);
    }
  }

  const classGroups = await db
    .select()
    .from(ClassGroup)
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
  const { academic_year_id, grade_id, name } = req.body;

  if (!academic_year_id || !grade_id || !name) {
    throw new ValidationError(
      "Academic year ID, grade ID, and name are required"
    );
  }

  const yearId = parseInt(academic_year_id);
  const grdId = parseInt(grade_id);
  if (isNaN(yearId) || isNaN(grdId)) {
    throw new ValidationError("Invalid academic year ID or grade ID");
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

  const result = await db.insert(ClassGroup).values({
    academic_year_id: yearId,
    grade_id: grdId,
    name: sanitizedName,
  });

  logger.info("Class group created", {
    name: sanitizedName,
    academicYearId: yearId,
    gradeId: grdId,
  });

  successResponse(res, "Class group created successfully", null, 201);
});

export const updateClassGroup = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const classGroupId = parseInt(id);
  const { academic_year_id, grade_id, name } = req.body;

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
  }

  await db
    .update(ClassGroup)
    .set(updateData)
    .where(eq(ClassGroup.class_group_id, classGroupId));

  logger.info("Class group updated", { classGroupId });

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

  successResponse(res, "Class group deleted successfully");
});
