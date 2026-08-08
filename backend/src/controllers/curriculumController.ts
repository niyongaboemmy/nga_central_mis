import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  Subject,
  CourseCategory,
  SubjectCompetency,
  CompetencyPerformanceCriteria,
  SubjectDocumentCategory,
  SubjectDocument,
  UserProfile,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  SchemeEntryCriteria,
  SchemeOfWorkEntry,
  SchemeOfWork,
  ClassGroup,
  AcademicTerm,
} from "../db/schema";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import ftpService from "../utils/ftp";
import path from "path";
import { Permissions } from "../utils/permissions";
import { getCurrentAcademicYearId } from "../utils/academicYear";

// ======================
// SUBJECT ACCESS CONTROL
//
// Curriculum managers (MANAGE_CURRICULUM), staff who can upload materials
// (UPLOAD_SUBJECT_DOCUMENTS), and teachers assigned to the subject retain
// unrestricted access to a subject's overview/curriculum/materials, as
// before. Anyone else — most importantly students — must hold the
// permission matching the resource being read (VIEW_MY_ENROLLED_SUBJECTS
// for overview/curriculum, VIEW_SUBJECT_DOCUMENTS/DOWNLOAD_SUBJECT_DOCUMENTS
// for materials) AND have an active enrollment in that specific subject.
// ======================

async function canAccessSubject(
  user: { userId: number; permissions: string[] },
  subjectId: number,
  requiredPerm: string,
): Promise<boolean> {
  if (
    user.permissions.includes(Permissions.MANAGE_CURRICULUM) ||
    user.permissions.includes(Permissions.UPLOAD_SUBJECT_DOCUMENTS)
  ) {
    return true;
  }

  const [assignment] = await db
    .select({ subject_id: TeacherSubjectAssignment.subject_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, user.userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
      ),
    )
    .limit(1);
  if (assignment) return true;

  if (!user.permissions.includes(requiredPerm)) {
    return false;
  }

  const [enrollment] = await db
    .select({ subject_id: StudentSubjectEnrollment.subject_id })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.user_id, user.userId),
        eq(StudentSubjectEnrollment.subject_id, subjectId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return !!enrollment;
}

async function assertSubjectAccess(
  req: any,
  subjectId: number,
  requiredPerm: string,
) {
  const allowed = await canAccessSubject(req.user, subjectId, requiredPerm);
  if (!allowed) {
    throw new AuthorizationError("You do not have access to this subject");
  }
}

// ======================
// SUBJECT OVERVIEW
// ======================

export const getSubjectDetail = asyncHandler(async (req: any, res: any) => {
  const { subjectId } = req.params;
  const id = parseInt(subjectId);

  await assertSubjectAccess(req, id, Permissions.VIEW_MY_ENROLLED_SUBJECTS);

  const [subject] = await db
    .select({
      subject_id: Subject.subject_id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      color: Subject.color,
      max_marks: Subject.max_marks,
      status: Subject.status,
      category_name: CourseCategory.name,
    })
    .from(Subject)
    .leftJoin(CourseCategory, eq(Subject.course_category_id, CourseCategory.category_id))
    .where(eq(Subject.subject_id, id))
    .limit(1);

  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  const [[compRow], [docRow], [catRow]] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(SubjectCompetency)
      .where(eq(SubjectCompetency.subject_id, id)),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(SubjectDocument)
      .where(eq(SubjectDocument.subject_id, id)),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.subject_id, id)),
  ]);

  successResponse(res, "Subject detail retrieved", {
    ...subject,
    competency_count: Number(compRow.count),
    document_count: Number(docRow.count),
    category_count: Number(catRow.count),
  });
});

export const getMyEnrolledSubjects = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;

    // Enrollment is per (user, subject, academic_year) — scope the list to
    // whichever year is selected in the academic period picker, mirroring
    // the teacher's assigned-subjects list. Falls back to every active
    // enrollment across all years when no year is specified.
    const academicYearId = req.query?.academic_year_id
      ? parseInt(req.query.academic_year_id as string, 10)
      : undefined;
    const yearFilter =
      academicYearId && !isNaN(academicYearId)
        ? eq(StudentSubjectEnrollment.academic_year_id, academicYearId)
        : undefined;

    const enrollments = await db
      .select({
        subject_id: Subject.subject_id,
        code: Subject.code,
        name: Subject.name,
        description: Subject.description,
        color: Subject.color,
        category_name: CourseCategory.name,
        enrolled_at: StudentSubjectEnrollment.enrolled_at,
        competency_count: sql<number>`(
          SELECT COUNT(*) FROM SubjectCompetency sc
          WHERE sc.subject_id = ${Subject.subject_id}
        )`,
        document_count: sql<number>`(
          SELECT COUNT(*) FROM SubjectDocument sd
          WHERE sd.subject_id = ${Subject.subject_id}
        )`,
      })
      .from(StudentSubjectEnrollment)
      .innerJoin(Subject, eq(StudentSubjectEnrollment.subject_id, Subject.subject_id))
      .leftJoin(CourseCategory, eq(Subject.course_category_id, CourseCategory.category_id))
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, userId),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
          ...(yearFilter ? [yearFilter] : []),
        ),
      )
      .orderBy(Subject.name);

    // Without a year filter, a student can hold an ACTIVE enrollment row for
    // the same subject in more than one academic year (composite key
    // includes academic_year_id) — dedupe so each subject shows once,
    // keeping the latest.
    const bySubject = new Map<number, (typeof enrollments)[number]>();
    for (const e of enrollments) {
      const existing = bySubject.get(e.subject_id);
      const enrolledAt = e.enrolled_at ? new Date(e.enrolled_at).getTime() : 0;
      const existingAt = existing?.enrolled_at
        ? new Date(existing.enrolled_at).getTime()
        : -1;
      if (!existing || enrolledAt > existingAt) {
        bySubject.set(e.subject_id, e);
      }
    }

    successResponse(
      res,
      "Enrolled subjects retrieved",
      Array.from(bySubject.values()).map((e) => ({
        ...e,
        competency_count: Number(e.competency_count),
        document_count: Number(e.document_count),
      })),
    );
  },
);

// ======================
// COMPETENCY OPERATIONS
// ======================

export const getSubjectCompetencies = asyncHandler(
  async (req: any, res: any) => {
    const { subjectId } = req.params;
    const id = parseInt(subjectId);

    await assertSubjectAccess(req, id, Permissions.VIEW_MY_ENROLLED_SUBJECTS);

    const competencies = await db
      .select()
      .from(SubjectCompetency)
      .where(eq(SubjectCompetency.subject_id, id))
      .orderBy(SubjectCompetency.sort_order, SubjectCompetency.element_number);

    const criteria = competencies.length
      ? await db
          .select()
          .from(CompetencyPerformanceCriteria)
          .where(
            sql`${CompetencyPerformanceCriteria.competency_id} IN (${sql.join(
              competencies.map((c) => sql`${c.competency_id}`),
              sql`, `,
            )})`,
          )
          .orderBy(
            CompetencyPerformanceCriteria.competency_id,
            CompetencyPerformanceCriteria.sort_order,
          )
      : [];

    const result = competencies.map((comp) => ({
      ...comp,
      criteria: criteria.filter((c) => c.competency_id === comp.competency_id),
    }));

    successResponse(res, "Competencies retrieved", result);
  },
);

export const createCompetency = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { subjectId } = req.params;
  const {
    title,
    description,
    element_number,
    sort_order,
    learning_hours,
    indicative_content,
  } = req.body;
  const id = parseInt(subjectId);

  if (!title?.trim()) {
    throw new ValidationError("Title is required");
  }

  const [subject] = await db
    .select({ subject_id: Subject.subject_id })
    .from(Subject)
    .where(eq(Subject.subject_id, id))
    .limit(1);

  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  const result = await db.insert(SubjectCompetency).values({
    subject_id: id,
    user_id: userId,
    element_number: element_number ? parseInt(element_number) : 1,
    learning_hours:
      learning_hours !== undefined && learning_hours !== null && learning_hours !== ""
        ? parseInt(learning_hours)
        : null,
    title: sanitizeString(title),
    description: description ? sanitizeString(description) : null,
    indicative_content: indicative_content
      ? sanitizeString(indicative_content)
      : null,
    sort_order: sort_order ? parseInt(sort_order) : 0,
  });

  const competencyId = result[0].insertId;

  const [created] = await db
    .select()
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.competency_id, competencyId))
    .limit(1);

  await recordActivity(
    userId,
    "COMPETENCY_CREATE",
    `Competency created: ${title}`,
    "SubjectCompetency",
    competencyId,
    { subject_id: id, title },
    userId,
  );

  successResponse(res, "Competency created successfully", {
    ...created,
    criteria: [],
  });
});

export const reorderCompetencies = asyncHandler(async (req: any, res: any) => {
  const { subjectId } = req.params;
  const { order } = req.body;
  const id = parseInt(subjectId);

  if (!Array.isArray(order) || order.length === 0) {
    throw new ValidationError(
      "order must be a non-empty array of competency IDs",
    );
  }

  const existing = await db
    .select({ competency_id: SubjectCompetency.competency_id })
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.subject_id, id));

  const existingIds = new Set(existing.map((c) => c.competency_id));
  const orderedIds = order.map((n: any) => parseInt(n));

  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((cId) => !existingIds.has(cId))
  ) {
    throw new ValidationError(
      "order must include exactly the subject's existing competency IDs",
    );
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(SubjectCompetency)
        .set({ sort_order: i, element_number: i + 1 })
        .where(eq(SubjectCompetency.competency_id, orderedIds[i]));
    }
  });

  successResponse(res, "Competencies reordered");
});

export const updateCompetency = asyncHandler(async (req: any, res: any) => {
  const { subjectId, competencyId } = req.params;
  const {
    title,
    description,
    element_number,
    sort_order,
    learning_hours,
    indicative_content,
  } = req.body;

  const [existing] = await db
    .select()
    .from(SubjectCompetency)
    .where(
      and(
        eq(SubjectCompetency.competency_id, parseInt(competencyId)),
        eq(SubjectCompetency.subject_id, parseInt(subjectId)),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Competency not found");
  }

  const updates: Record<string, any> = {};
  if (title?.trim()) updates.title = sanitizeString(title);
  if (description !== undefined)
    updates.description = description ? sanitizeString(description) : null;
  if (element_number !== undefined)
    updates.element_number = parseInt(element_number);
  if (sort_order !== undefined) updates.sort_order = parseInt(sort_order);
  if (learning_hours !== undefined)
    updates.learning_hours =
      learning_hours === null || learning_hours === ""
        ? null
        : parseInt(learning_hours);
  if (indicative_content !== undefined)
    updates.indicative_content = indicative_content
      ? sanitizeString(indicative_content)
      : null;

  await db
    .update(SubjectCompetency)
    .set(updates)
    .where(eq(SubjectCompetency.competency_id, parseInt(competencyId)));

  const [updated] = await db
    .select()
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.competency_id, parseInt(competencyId)))
    .limit(1);

  successResponse(res, "Competency updated", updated);
});

export const deleteCompetency = asyncHandler(async (req: any, res: any) => {
  const userId = req.user.userId;
  const { subjectId, competencyId } = req.params;
  const cId = parseInt(competencyId);

  const [existing] = await db
    .select()
    .from(SubjectCompetency)
    .where(
      and(
        eq(SubjectCompetency.competency_id, cId),
        eq(SubjectCompetency.subject_id, parseInt(subjectId)),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Competency not found");
  }

  // Delete FTP files linked to this competency before DB delete
  const linkedDocs = await db
    .select()
    .from(SubjectDocument)
    .where(eq(SubjectDocument.competency_id, cId));

  for (const doc of linkedDocs) {
    try {
      await ftpService.deleteFile(doc.file_path);
    } catch (err) {
      logger.warn(`Could not delete FTP file ${doc.file_path}: ${err}`);
    }
    await db
      .delete(SubjectDocument)
      .where(eq(SubjectDocument.document_id, doc.document_id));
  }

  await db
    .delete(SubjectCompetency)
    .where(eq(SubjectCompetency.competency_id, cId));

  await recordActivity(
    userId,
    "COMPETENCY_DELETE",
    `Competency deleted: ${existing.title}`,
    "SubjectCompetency",
    cId,
    {},
    userId,
  );

  successResponse(res, "Competency deleted");
});

// ======================
// CRITERIA OPERATIONS
// ======================

export const createCriteria = asyncHandler(async (req: any, res: any) => {
  const { competencyId } = req.params;
  const { criteria_number, description, sort_order } = req.body;
  const cId = parseInt(competencyId);

  if (!criteria_number?.trim() || criteria_number.length > 20) {
    throw new ValidationError(
      "criteria_number is required and must be ≤20 characters",
    );
  }
  if (!description?.trim()) {
    throw new ValidationError("Description is required");
  }

  const [competency] = await db
    .select({ competency_id: SubjectCompetency.competency_id })
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.competency_id, cId))
    .limit(1);

  if (!competency) {
    throw new NotFoundError("Competency not found");
  }

  const result = await db.insert(CompetencyPerformanceCriteria).values({
    competency_id: cId,
    criteria_number: sanitizeString(criteria_number),
    description: sanitizeString(description),
    sort_order: sort_order ? parseInt(sort_order) : 0,
  });

  const [created] = await db
    .select()
    .from(CompetencyPerformanceCriteria)
    .where(
      eq(CompetencyPerformanceCriteria.criteria_id, result[0].insertId),
    )
    .limit(1);

  successResponse(res, "Criteria created", created);
});

export const updateCriteria = asyncHandler(async (req: any, res: any) => {
  const { criteriaId } = req.params;
  const { criteria_number, description, sort_order } = req.body;
  const cId = parseInt(criteriaId);

  const [existing] = await db
    .select()
    .from(CompetencyPerformanceCriteria)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, cId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Criteria not found");
  }

  const updates: Record<string, any> = {};
  if (criteria_number?.trim()) {
    if (criteria_number.length > 20)
      throw new ValidationError("criteria_number must be ≤20 characters");
    updates.criteria_number = sanitizeString(criteria_number);
  }
  if (description?.trim()) updates.description = sanitizeString(description);
  if (sort_order !== undefined) updates.sort_order = parseInt(sort_order);

  await db
    .update(CompetencyPerformanceCriteria)
    .set(updates)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, cId));

  const [updated] = await db
    .select()
    .from(CompetencyPerformanceCriteria)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, cId))
    .limit(1);

  successResponse(res, "Criteria updated", updated);
});

export const deleteCriteria = asyncHandler(async (req: any, res: any) => {
  const { criteriaId } = req.params;
  const cId = parseInt(criteriaId);

  const [existing] = await db
    .select()
    .from(CompetencyPerformanceCriteria)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, cId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Criteria not found");
  }

  await db
    .delete(CompetencyPerformanceCriteria)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, cId));

  successResponse(res, "Criteria deleted");
});

/**
 * Reverse lookup: every Scheme of Work entry (across all terms/classes of the requested academic
 * year) currently linked to a given Performance Criteria, with enough context (class group, term,
 * week) to tell them apart. Lets a Curriculum reviewer confirm "is this criterion actually being
 * taught anywhere?" without having to open each term's Scheme of Work individually. Scoped to a
 * single academic year (via `academic_year_id` query param, defaulting to the current year) so
 * results don't include scheme entries from other years. See
 * CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md.
 */
export const getCriteriaSchemeUsage = asyncHandler(async (req: any, res: any) => {
  const criteriaId = parseInt(req.params.criteriaId);
  const { academic_year_id } = req.query;

  const [criteria] = await db
    .select({
      criteria_id: CompetencyPerformanceCriteria.criteria_id,
      competency_id: CompetencyPerformanceCriteria.competency_id,
    })
    .from(CompetencyPerformanceCriteria)
    .where(eq(CompetencyPerformanceCriteria.criteria_id, criteriaId))
    .limit(1);

  if (!criteria) {
    throw new NotFoundError("Performance criteria not found");
  }

  const [competency] = await db
    .select({ subject_id: SubjectCompetency.subject_id })
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.competency_id, criteria.competency_id))
    .limit(1);

  if (!competency) {
    throw new NotFoundError("Element of competency not found");
  }

  await assertSubjectAccess(req, competency.subject_id, Permissions.VIEW_MY_ENROLLED_SUBJECTS);

  const yearId = academic_year_id
    ? parseInt(academic_year_id)
    : await getCurrentAcademicYearId();

  const usage = yearId
    ? await db
        .select({
          entry_id: SchemeOfWorkEntry.entry_id,
          week_number: SchemeOfWorkEntry.week_number,
          topic: SchemeOfWorkEntry.topic,
          scheme_id: SchemeOfWork.scheme_id,
          class_group_name: ClassGroup.name,
          academic_term_name: AcademicTerm.name,
        })
        .from(SchemeEntryCriteria)
        .innerJoin(
          SchemeOfWorkEntry,
          eq(SchemeEntryCriteria.entry_id, SchemeOfWorkEntry.entry_id),
        )
        .innerJoin(
          SchemeOfWork,
          eq(SchemeOfWorkEntry.scheme_id, SchemeOfWork.scheme_id),
        )
        .innerJoin(
          ClassGroup,
          eq(SchemeOfWork.class_group_id, ClassGroup.class_group_id),
        )
        .leftJoin(
          AcademicTerm,
          eq(SchemeOfWork.academic_term_id, AcademicTerm.academic_term_id),
        )
        .where(
          and(
            eq(SchemeEntryCriteria.criteria_id, criteriaId),
            eq(AcademicTerm.academic_year_id, yearId),
          ),
        )
        .orderBy(SchemeOfWorkEntry.start_date)
    : [];

  successResponse(res, "Scheme of work usage retrieved", usage);
});

// ==============================
// DOCUMENT CATEGORY OPERATIONS
// ==============================

export const getDocumentCategories = asyncHandler(
  async (req: any, res: any) => {
    const { subjectId } = req.params;
    const id = parseInt(subjectId);

    await assertSubjectAccess(req, id, Permissions.VIEW_SUBJECT_DOCUMENTS);

    const categories = await db
      .select({
        category_id: SubjectDocumentCategory.category_id,
        subject_id: SubjectDocumentCategory.subject_id,
        user_id: SubjectDocumentCategory.user_id,
        name: SubjectDocumentCategory.name,
        description: SubjectDocumentCategory.description,
        color: SubjectDocumentCategory.color,
        sort_order: SubjectDocumentCategory.sort_order,
        created_at: SubjectDocumentCategory.created_at,
        updated_at: SubjectDocumentCategory.updated_at,
        document_count: sql<number>`(
          SELECT COUNT(*) FROM SubjectDocument sd
          WHERE sd.category_id = SubjectDocumentCategory.category_id
        )`,
      })
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.subject_id, id))
      .orderBy(SubjectDocumentCategory.sort_order, SubjectDocumentCategory.name);

    successResponse(
      res,
      "Document categories retrieved",
      categories.map((c) => ({
        ...c,
        document_count: Number(c.document_count),
      })),
    );
  },
);

export const createDocumentCategory = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { subjectId } = req.params;
    const { name, description, color, sort_order } = req.body;
    const id = parseInt(subjectId);

    if (!name?.trim() || name.length > 150) {
      throw new ValidationError(
        "Name is required and must be ≤150 characters",
      );
    }

    const [subject] = await db
      .select({ subject_id: Subject.subject_id })
      .from(Subject)
      .where(eq(Subject.subject_id, id))
      .limit(1);

    if (!subject) {
      throw new NotFoundError("Subject not found");
    }

    const result = await db.insert(SubjectDocumentCategory).values({
      subject_id: id,
      user_id: userId,
      name: sanitizeString(name),
      description: description ? sanitizeString(description) : null,
      color: color || "#3B82F6",
      sort_order: sort_order ? parseInt(sort_order) : 0,
    });

    const [created] = await db
      .select()
      .from(SubjectDocumentCategory)
      .where(
        eq(SubjectDocumentCategory.category_id, result[0].insertId),
      )
      .limit(1);

    successResponse(res, "Category created", { ...created, document_count: 0 });
  },
);

export const updateDocumentCategory = asyncHandler(
  async (req: any, res: any) => {
    const { categoryId } = req.params;
    const { name, description, color, sort_order } = req.body;
    const cId = parseInt(categoryId);

    const [existing] = await db
      .select()
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.category_id, cId))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Category not found");
    }

    if (name !== undefined && (!name.trim() || name.length > 150)) {
      throw new ValidationError("Name must be between 1 and 150 characters");
    }

    const updates: Record<string, any> = {};
    if (name?.trim()) updates.name = sanitizeString(name);
    if (description !== undefined)
      updates.description = description ? sanitizeString(description) : null;
    if (color) updates.color = color;
    if (sort_order !== undefined) updates.sort_order = parseInt(sort_order);

    await db
      .update(SubjectDocumentCategory)
      .set(updates)
      .where(eq(SubjectDocumentCategory.category_id, cId));

    const [updated] = await db
      .select()
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.category_id, cId))
      .limit(1);

    successResponse(res, "Category updated", updated);
  },
);

export const deleteDocumentCategory = asyncHandler(
  async (req: any, res: any) => {
    const { categoryId } = req.params;
    const cId = parseInt(categoryId);

    const [existing] = await db
      .select()
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.category_id, cId))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Category not found");
    }

    // Delete all FTP files in this category
    const docs = await db
      .select()
      .from(SubjectDocument)
      .where(eq(SubjectDocument.category_id, cId));

    for (const doc of docs) {
      try {
        await ftpService.deleteFile(doc.file_path);
      } catch (err) {
        logger.warn(`Could not delete FTP file ${doc.file_path}: ${err}`);
      }
    }

    await db
      .delete(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.category_id, cId));

    successResponse(res, "Category deleted");
  },
);

// ==============================
// SUBJECT DOCUMENT OPERATIONS
// ==============================

export const getSubjectDocuments = asyncHandler(async (req: any, res: any) => {
  const { subjectId } = req.params;
  const { categoryId } = req.query;
  const id = parseInt(subjectId);

  await assertSubjectAccess(req, id, Permissions.VIEW_SUBJECT_DOCUMENTS);

  const conditions = [eq(SubjectDocument.subject_id, id)];
  if (categoryId) {
    conditions.push(eq(SubjectDocument.category_id, parseInt(categoryId as string)));
  }

  const documents = await db
    .select({
      document_id: SubjectDocument.document_id,
      category_id: SubjectDocument.category_id,
      subject_id: SubjectDocument.subject_id,
      user_id: SubjectDocument.user_id,
      competency_id: SubjectDocument.competency_id,
      file_name: SubjectDocument.file_name,
      original_name: SubjectDocument.original_name,
      file_path: SubjectDocument.file_path,
      file_size: SubjectDocument.file_size,
      mime_type: SubjectDocument.mime_type,
      file_extension: SubjectDocument.file_extension,
      description: SubjectDocument.description,
      created_at: SubjectDocument.created_at,
      category_name: SubjectDocumentCategory.name,
      category_color: SubjectDocumentCategory.color,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(SubjectDocument)
    .leftJoin(
      SubjectDocumentCategory,
      eq(SubjectDocument.category_id, SubjectDocumentCategory.category_id),
    )
    .leftJoin(UserProfile, eq(SubjectDocument.user_id, UserProfile.user_id))
    .where(and(...conditions))
    .orderBy(sql`${SubjectDocument.created_at} DESC`);

  successResponse(res, "Documents retrieved", documents);
});

export const uploadSubjectDocument = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { subjectId } = req.params;
    const { categoryId, competencyId, description } = req.body;
    const file = req.file;
    const sId = parseInt(subjectId);

    if (!file) {
      throw new ValidationError("No file uploaded");
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ValidationError("File size exceeds 50MB limit");
    }

    if (!categoryId) {
      throw new ValidationError("categoryId is required");
    }

    const [category] = await db
      .select()
      .from(SubjectDocumentCategory)
      .where(
        and(
          eq(SubjectDocumentCategory.category_id, parseInt(categoryId)),
          eq(SubjectDocumentCategory.subject_id, sId),
        ),
      )
      .limit(1);

    if (!category) {
      throw new ValidationError("Category not found for this subject");
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}${fileExtension}`;
    const remoteFilePath = `subjects/${sId}/${fileName}`;

    try {
      await ftpService.uploadFile(file.buffer, remoteFilePath);

      const result = await db.insert(SubjectDocument).values({
        category_id: parseInt(categoryId),
        subject_id: sId,
        user_id: userId,
        competency_id: competencyId ? parseInt(competencyId) : null,
        file_name: fileName,
        original_name: file.originalname,
        file_path: remoteFilePath,
        file_size: file.size,
        mime_type: file.mimetype,
        file_extension: fileExtension.replace(".", ""),
        description: description ? sanitizeString(description) : null,
      });

      const [created] = await db
        .select({
          document_id: SubjectDocument.document_id,
          category_id: SubjectDocument.category_id,
          subject_id: SubjectDocument.subject_id,
          user_id: SubjectDocument.user_id,
          competency_id: SubjectDocument.competency_id,
          file_name: SubjectDocument.file_name,
          original_name: SubjectDocument.original_name,
          file_path: SubjectDocument.file_path,
          file_size: SubjectDocument.file_size,
          mime_type: SubjectDocument.mime_type,
          file_extension: SubjectDocument.file_extension,
          description: SubjectDocument.description,
          created_at: SubjectDocument.created_at,
          category_name: SubjectDocumentCategory.name,
          category_color: SubjectDocumentCategory.color,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(SubjectDocument)
        .leftJoin(
          SubjectDocumentCategory,
          eq(SubjectDocument.category_id, SubjectDocumentCategory.category_id),
        )
        .leftJoin(UserProfile, eq(SubjectDocument.user_id, UserProfile.user_id))
        .where(eq(SubjectDocument.document_id, result[0].insertId))
        .limit(1);

      logger.info(
        `Subject document uploaded: ${result[0].insertId} by user ${userId}`,
      );

      await recordActivity(
        userId,
        "SUBJECT_DOCUMENT_UPLOAD",
        `Subject document uploaded: ${file.originalname}`,
        "SubjectDocument",
        result[0].insertId,
        { subject_id: sId, category_id: parseInt(categoryId) },
        userId,
      );

      successResponse(res, "Document uploaded successfully", created);
    } catch (error) {
      logger.error("Subject document upload failed:", error);
      throw error;
    }
  },
);

export const deleteSubjectDocument = asyncHandler(
  async (req: any, res: any) => {
    const userId = req.user.userId;
    const { documentId } = req.params;
    const dId = parseInt(documentId);

    const [doc] = await db
      .select()
      .from(SubjectDocument)
      .where(eq(SubjectDocument.document_id, dId))
      .limit(1);

    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    try {
      await ftpService.deleteFile(doc.file_path);
    } catch (err) {
      logger.warn(`Could not delete FTP file ${doc.file_path}: ${err}`);
    }

    await db
      .delete(SubjectDocument)
      .where(eq(SubjectDocument.document_id, dId));

    await recordActivity(
      userId,
      "SUBJECT_DOCUMENT_DELETE",
      `Subject document deleted: ${doc.original_name}`,
      "SubjectDocument",
      dId,
      {},
      userId,
    );

    successResponse(res, "Document deleted");
  },
);

export const downloadSubjectDocument = asyncHandler(
  async (req: any, res: any) => {
    const { documentId } = req.params;

    const [doc] = await db
      .select()
      .from(SubjectDocument)
      .where(eq(SubjectDocument.document_id, parseInt(documentId)))
      .limit(1);

    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    await assertSubjectAccess(
      req,
      doc.subject_id,
      Permissions.DOWNLOAD_SUBJECT_DOCUMENTS,
    );

    const exists = await ftpService.fileExists(doc.file_path);
    if (!exists) {
      throw new NotFoundError("File not found on server");
    }

    const buffer = await ftpService.downloadToBuffer(doc.file_path);

    if (!buffer.length) {
      throw new NotFoundError("File is empty or corrupted");
    }

    const mime =
      doc.file_extension?.toLowerCase() === "pdf"
        ? "application/pdf"
        : doc.mime_type || "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.original_name}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  },
);
