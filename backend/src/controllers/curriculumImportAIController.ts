import { randomUUID } from "crypto";
import { extractTextFromFile } from "../utils/docExtract";
import { generateCurriculumWithGemini } from "../services/curriculumExtraction";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { Subject, SubjectCompetency, CompetencyPerformanceCriteria } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { sanitizeString } from "../utils/sanitization";
import logger from "../utils/logger";
import {
  createImportJob,
  getImportJob,
  deleteImportJob,
  updateImportJob,
} from "../services/curriculumImportJobStore";

const MAX_CURRICULUM_CHARS = 60000;

const isGeminiConfigured = () =>
  !!process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";

const processImportJob = async (
  jobId: string,
  file: Express.Multer.File,
  subjectName: string,
) => {
  try {
    updateImportJob(jobId, { status: "parsing", message: "Reading document..." });

    const fullText = await extractTextFromFile(file);
    const rawText = fullText.slice(0, MAX_CURRICULUM_CHARS);

    if (!rawText.trim()) {
      throw new ValidationError("No readable text found in the uploaded document.");
    }

    updateImportJob(jobId, {
      status: "analyzing",
      message: "Analyzing curriculum with AI...",
    });

    const elements = await generateCurriculumWithGemini(rawText, subjectName);

    updateImportJob(jobId, {
      status: "structuring",
      message: "Structuring elements and performance criteria...",
    });

    updateImportJob(jobId, {
      status: "done",
      message: `Extracted ${elements.length} element${elements.length !== 1 ? "s" : ""} of competency.`,
      elements,
      sourceFilename: file.originalname,
    });
  } catch (err: any) {
    logger.error("AI curriculum import failed", { jobId, error: err?.message });
    updateImportJob(jobId, {
      status: "error",
      message: "Extraction failed",
      error: err?.message || "AI curriculum extraction failed",
    });
  }
};

export const startCurriculumImport = asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw new ValidationError("No file uploaded");
  }

  if (!isGeminiConfigured()) {
    throw new ValidationError(
      "AI curriculum import is not configured. Add a GEMINI_API_KEY to the backend environment (get a free key at https://aistudio.google.com/apikey).",
    );
  }

  const { subjectId } = req.params;
  const id = parseInt(subjectId);

  const [subject] = await db
    .select({ subject_id: Subject.subject_id, name: Subject.name })
    .from(Subject)
    .where(eq(Subject.subject_id, id))
    .limit(1);

  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  const userId = req.user.userId;
  const jobId = randomUUID();

  createImportJob(jobId, userId, id);

  successResponse(res, "Curriculum import started", { jobId }, 202);

  // Fire-and-forget: progress is tracked via the job store and polled by the client.
  processImportJob(jobId, req.file, req.body.subject_name || subject.name);
});

export const getCurriculumImportStatus = asyncHandler(
  async (req: any, res: any) => {
    const { subjectId, jobId } = req.params;
    const job = getImportJob(jobId);

    if (
      !job ||
      job.userId !== req.user.userId ||
      job.subjectId !== parseInt(subjectId)
    ) {
      throw new NotFoundError("Import job not found");
    }

    successResponse(res, "Job status", {
      status: job.status,
      stepIndex: job.stepIndex,
      totalSteps: job.totalSteps,
      message: job.message,
      elements: job.elements,
      sourceFilename: job.sourceFilename,
      error: job.error,
    });
  },
);

export const confirmCurriculumImport = asyncHandler(async (req: any, res: any) => {
  const { subjectId } = req.params;
  const { elements, jobId, source_filename } = req.body;
  const id = parseInt(subjectId);
  const userId = req.user.userId;

  const [subject] = await db
    .select({ subject_id: Subject.subject_id })
    .from(Subject)
    .where(eq(Subject.subject_id, id))
    .limit(1);

  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  if (!Array.isArray(elements) || elements.length === 0) {
    throw new ValidationError("At least one element of competency is required");
  }

  for (const el of elements) {
    if (!el?.title?.trim()) {
      throw new ValidationError("Every element requires a title");
    }
    if (!Array.isArray(el.criteria) || el.criteria.length === 0) {
      throw new ValidationError(
        `Element "${el.title}" requires at least one performance criteria`,
      );
    }
    for (const c of el.criteria) {
      if (!c?.criteria_number?.trim() || !c?.description?.trim()) {
        throw new ValidationError(
          `Every performance criteria under "${el.title}" requires a number and description`,
        );
      }
    }
  }

  const createdCompetencyIds = await db.transaction(async (tx) => {
    const ids: number[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const compResult = await tx.insert(SubjectCompetency).values({
        subject_id: id,
        user_id: userId,
        element_number: Number.isInteger(el.element_number)
          ? el.element_number
          : i + 1,
        learning_hours:
          Number.isInteger(el.learning_hours) && el.learning_hours > 0
            ? el.learning_hours
            : null,
        title: sanitizeString(el.title),
        description: el.description ? sanitizeString(el.description) : null,
        indicative_content: el.indicative_content
          ? sanitizeString(el.indicative_content)
          : null,
        sort_order: i,
      });
      const competencyId = (compResult as any)[0].insertId;
      ids.push(competencyId);

      for (let j = 0; j < el.criteria.length; j++) {
        const c = el.criteria[j];
        await tx.insert(CompetencyPerformanceCriteria).values({
          competency_id: competencyId,
          criteria_number: sanitizeString(c.criteria_number).slice(0, 20),
          description: sanitizeString(c.description),
          sort_order: j,
        });
      }
    }
    return ids;
  });

  await recordActivity(
    userId,
    "CURRICULUM_IMPORT",
    `Imported ${elements.length} element(s) of competency from "${source_filename || "an uploaded curriculum document"}"`,
    "Subject",
    id,
    { subject_id: id, elements_count: elements.length },
    userId,
  );

  if (jobId) deleteImportJob(jobId);

  successResponse(res, "Curriculum imported successfully", {
    competency_ids: createdCompetencyIds,
    count: createdCompetencyIds.length,
  });
});
