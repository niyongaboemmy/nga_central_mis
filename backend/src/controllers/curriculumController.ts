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
} from "../db/schema";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import ftpService from "../utils/ftp";
import path from "path";

// ======================
// SUBJECT OVERVIEW
// ======================

export const getSubjectDetail = asyncHandler(async (req: any, res: any) => {
  const { subjectId } = req.params;
  const id = parseInt(subjectId);

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

// ======================
// COMPETENCY OPERATIONS
// ======================

export const getSubjectCompetencies = asyncHandler(
  async (req: any, res: any) => {
    const { subjectId } = req.params;
    const id = parseInt(subjectId);

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
  const { title, description, element_number, sort_order } = req.body;
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
    title: sanitizeString(title),
    description: description ? sanitizeString(description) : null,
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

export const updateCompetency = asyncHandler(async (req: any, res: any) => {
  const { subjectId, competencyId } = req.params;
  const { title, description, element_number, sort_order } = req.body;

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

// ==============================
// DOCUMENT CATEGORY OPERATIONS
// ==============================

export const getDocumentCategories = asyncHandler(
  async (req: any, res: any) => {
    const { subjectId } = req.params;
    const id = parseInt(subjectId);

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
          SELECT COUNT(*) FROM SubjectDocument
          WHERE category_id = ${SubjectDocumentCategory.category_id}
        )`,
      })
      .from(SubjectDocumentCategory)
      .where(eq(SubjectDocumentCategory.subject_id, id))
      .orderBy(SubjectDocumentCategory.sort_order, SubjectDocumentCategory.name);

    successResponse(res, "Document categories retrieved", categories);
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
