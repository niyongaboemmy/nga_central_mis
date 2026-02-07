import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  SchemeOfWork,
  SchemeOfWorkEntry,
  Subject,
  ClassGroup,
  AcademicTerm,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";
import mammoth = require("mammoth");

/**
 * Parses DOCX and extracts entries based on date ranges
 */
export const uploadAndExtractScheme = asyncHandler(
  async (req: any, res: any) => {
    const { subject_id, class_group_id, academic_term_id } = req.body;
    const userId = req.user.userId;

    const subjectId = parseInt(subject_id);
    const classGroupId = parseInt(class_group_id);
    const academicTermId = parseInt(academic_term_id);

    if (!req.file) {
      throw new ValidationError("No file uploaded");
    }

    if (!subject_id || !class_group_id || !academic_term_id) {
      throw new ValidationError(
        "Subject, Class Group, and Academic Term are required",
      );
    }

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    const html = result.value;

    // Extraction logic
    // Looking for rows that contain "Week X:" and a date range
    const entries: any[] = [];

    // Basic regex to find Week and Date Range in table cells
    // Example: Week 1: 05-09/1/2026
    const weekRegex =
      /Week\s+(\d+):?\s*<p>\s*(\d{1,2}-\d{1,2}\/\d{1,2}\/\d{4})\s*<\/p>/gi;

    // We need to parse the HTML table properly.
    // For now, let's use a simpler approach of splitting by <tr> if possible,
    // but mammoth output might be complex.

    const rows = html.split("<tr>");

    for (const row of rows) {
      // 1. Try to find "Week X" and a date range in the row
      // We'll strip tags temporarily for matching but keep the row for cell splitting
      const cleanRow = row.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

      // Look for "Week X"
      const weekMatch = /Week\s+(\d+)/i.exec(cleanRow);
      if (!weekMatch) continue;

      const weekNum = weekMatch[1];

      // Look for a date range in the same row
      // Format A: 05-09/1/2026 or 5-9/1/2026
      // Format B: 30/3/2026 - 03/04/2026

      let startDate: string | null = null;
      let endDate: string | null = null;

      // Try Format B first (Full dates): (\d{1,2})/(\d{1,2})/(\d{4}) - (\d{1,2})/(\d{1,2})/(\d{4})
      const formatBMatch =
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(
          cleanRow,
        );

      if (formatBMatch) {
        startDate = `${formatBMatch[3]}-${formatBMatch[2].padStart(2, "0")}-${formatBMatch[1].padStart(2, "0")}`;
        endDate = `${formatBMatch[6]}-${formatBMatch[5].padStart(2, "0")}-${formatBMatch[4].padStart(2, "0")}`;
      } else {
        // Try Format A (Day range): (\d{1,2})-(\d{1,2})/(\d{1,2})/(\d{4})
        // Ensure it's not preceded by a digit to avoid matching end of years (e.g. 2026 - 03/04/2026)
        const formatAMatch =
          /(?<!\d)(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(cleanRow);
        if (formatAMatch) {
          const dayStart = formatAMatch[1].padStart(2, "0");
          const dayEnd = formatAMatch[2].padStart(2, "0");
          const month = formatAMatch[3].padStart(2, "0");
          const year = formatAMatch[4];
          startDate = `${year}-${month}-${dayStart}`;
          endDate = `${year}-${month}-${dayEnd}`;
        }
      }

      if (startDate && endDate) {
        // Extract other columns
        const cells = row.split(/<(?:td|th)[^>]*>/).slice(1);
        const clean = (str: string) =>
          str
            ? str
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            : "";

        // Based on the observed structure:
        // cells[0] is the Week/Date
        // cells[1] is Learning Outcome (LO)
        // cells[2] is Duration
        // cells[3] is Indicative Content (IC)
        // cells[4] is Learning Activities
        // cells[5] is Resources
        // cells[6] is Evidences
        // cells[7] is Learning Place

        let topic = clean(cells[3] || "");
        if (!topic && cleanRow.toLowerCase().includes("midterm")) {
          topic = "Midterm / Holidays";
        }

        entries.push({
          week_number: `Week ${weekNum}`,
          start_date: startDate,
          end_date: endDate,
          topic: topic,
          sub_topic: "",
          objective: clean(cells[1] || ""),
          methodology: clean(cells[4] || ""),
          resources: clean(cells[5] || ""),
          evaluation: clean(cells[6] || ""),
        });
      }
    }

    if (entries.length === 0) {
      throw new ValidationError(
        "No valid scheme rows found in the document. Please ensure it follows the standard format.",
      );
    }

    // Save to database
    let scheme = await db
      .select()
      .from(SchemeOfWork)
      .where(
        and(
          eq(SchemeOfWork.subject_id, subjectId),
          eq(SchemeOfWork.class_group_id, classGroupId),
          eq(SchemeOfWork.academic_term_id, academicTermId),
        ),
      )
      .limit(1);

    let schemeId: number;

    if (scheme.length > 0) {
      schemeId = scheme[0].scheme_id;
      logger.info(`Updating existing scheme ID: ${schemeId}`);
      await db
        .delete(SchemeOfWorkEntry)
        .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));
    } else {
      logger.info("Creating new scheme record");
      const schemeResult = await db.insert(SchemeOfWork).values({
        user_id: userId,
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
      });

      // Fix: Drizzle with mysql2 returns [ResultSetHeader, undefined] or the header itself
      const resultHeader = Array.isArray(schemeResult)
        ? schemeResult[0]
        : schemeResult;
      schemeId = (resultHeader as any).insertId;

      logger.info(`New scheme created with ID: ${schemeId}`);
    }

    if (!schemeId) {
      logger.error("Failed to obtain schemeId after insert/select", {
        schemeId,
      });
      throw new Error("Failed to initialize scheme record in database");
    }

    // Insert new entries
    logger.info(
      `Inserting ${entries.length} new entries for scheme ID: ${schemeId}`,
    );
    for (const entry of entries) {
      await db.insert(SchemeOfWorkEntry).values({
        scheme_id: schemeId,
        ...entry,
      });
    }

    logger.info(`Scheme of Work extracted and saved for subject ${subject_id}`);

    await recordActivity(
      userId,
      "SCHEME_UPLOAD",
      `Uploaded scheme of work for subject ID ${subject_id}`,
      "SchemeOfWork",
      schemeId,
      { subject_id, entries_count: entries.length },
      userId,
    );

    successResponse(res, "Scheme of work extracted and saved successfully", {
      schemeId,
      entriesCount: entries.length,
    });
  },
);

/**
 * Retrieves scheme entries for a specific subject assignment
 */
export const getSchemeEntries = asyncHandler(async (req: any, res: any) => {
  const { subject_id, class_group_id, academic_term_id } = req.query;

  if (!subject_id || !class_group_id || !academic_term_id) {
    throw new ValidationError("Missing required parameters");
  }

  const scheme = await db
    .select()
    .from(SchemeOfWork)
    .where(
      and(
        eq(SchemeOfWork.subject_id, parseInt(subject_id)),
        eq(SchemeOfWork.class_group_id, parseInt(class_group_id)),
        eq(SchemeOfWork.academic_term_id, parseInt(academic_term_id)),
      ),
    )
    .limit(1);

  if (scheme.length === 0) {
    return successResponse(res, "No scheme of work found", [], 200);
  }

  const entries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, scheme[0].scheme_id))
    .orderBy(SchemeOfWorkEntry.start_date);

  successResponse(res, "Scheme entries retrieved successfully", entries);
});

/**
 * Adds a single scheme entry
 */
export const addSchemeEntry = asyncHandler(async (req: any, res: any) => {
  const {
    subject_id,
    class_group_id,
    academic_term_id,
    week_number,
    start_date,
    end_date,
    topic,
    sub_topic,
    objective,
    methodology,
    resources,
    evaluation,
  } = req.body;
  const userId = req.user.userId;

  if (
    !subject_id ||
    !class_group_id ||
    !academic_term_id ||
    !week_number ||
    !start_date ||
    !end_date
  ) {
    throw new ValidationError("Required fields missing");
  }

  // Ensure SchemeOfWork exists
  let scheme = await db
    .select()
    .from(SchemeOfWork)
    .where(
      and(
        eq(SchemeOfWork.subject_id, subject_id),
        eq(SchemeOfWork.class_group_id, class_group_id),
        eq(SchemeOfWork.academic_term_id, academic_term_id),
      ),
    )
    .limit(1);

  let schemeId: number;
  if (scheme.length === 0) {
    const result = await db.insert(SchemeOfWork).values({
      user_id: userId,
      subject_id,
      class_group_id,
      academic_term_id,
    });
    const resultHeader = Array.isArray(result) ? result[0] : result;
    schemeId = (resultHeader as any).insertId;
  } else {
    schemeId = scheme[0].scheme_id;
  }

  const result = await db.insert(SchemeOfWorkEntry).values({
    scheme_id: schemeId,
    week_number,
    start_date,
    end_date,
    topic,
    sub_topic,
    objective,
    methodology,
    resources,
    evaluation,
  });

  const resultHeader = Array.isArray(result) ? result[0] : result;
  const entryId = (resultHeader as any).insertId;

  successResponse(
    res,
    "Scheme entry added successfully",
    { entry_id: entryId },
    201,
  );
});

/**
 * Deletes a single scheme entry
 */
export const deleteSchemeEntry = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;

  const entryId = parseInt(id);
  if (isNaN(entryId)) {
    throw new ValidationError("Invalid entry ID");
  }

  const result = await db
    .delete(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.entry_id, entryId));

  if ((result as any).affectedRows === 0) {
    throw new NotFoundError("Scheme entry not found");
  }

  successResponse(res, "Scheme entry deleted successfully");
});

/**
 * Updates a single scheme entry
 */
export const updateSchemeEntry = asyncHandler(async (req: any, res: any) => {
  const { id } = req.params;
  const {
    week_number,
    start_date,
    end_date,
    topic,
    sub_topic,
    objective,
    methodology,
    resources,
    evaluation,
    is_completed,
  } = req.body;

  const entryId = parseInt(id);
  if (isNaN(entryId)) {
    throw new ValidationError("Invalid entry ID");
  }

  const existingEntry = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.entry_id, entryId))
    .limit(1);

  if (existingEntry.length === 0) {
    throw new NotFoundError("Scheme entry not found");
  }

  await db
    .update(SchemeOfWorkEntry)
    .set({
      week_number: week_number ?? existingEntry[0].week_number,
      start_date: start_date ?? existingEntry[0].start_date,
      end_date: end_date ?? existingEntry[0].end_date,
      topic: topic ?? existingEntry[0].topic,
      sub_topic: sub_topic ?? existingEntry[0].sub_topic,
      objective: objective ?? existingEntry[0].objective,
      methodology: methodology ?? existingEntry[0].methodology,
      resources: resources ?? existingEntry[0].resources,
      evaluation: evaluation ?? existingEntry[0].evaluation,
      is_completed: is_completed ?? existingEntry[0].is_completed,
    })
    .where(eq(SchemeOfWorkEntry.entry_id, entryId));

  successResponse(res, "Scheme entry updated successfully");
});
