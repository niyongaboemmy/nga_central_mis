import { db } from "../db";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import {
  SchemeOfWork,
  SchemeOfWorkEntry,
  SchemeEntryCriteria,
  CompetencyPerformanceCriteria,
  Subject,
  ClassGroup,
  AcademicTerm,
  TeacherSubjectAssignment,
  UserProfile,
  User,
  Grade,
  Program,
  AcademicYear,
  LO_Lesson,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";
import mammoth = require("mammoth");
import { computeWeekDates } from "../utils/weekDates";
import { assertTeacherOwnsScheme } from "../utils/schemeAuthorization";
import { extractTextFromFile } from "../utils/docExtract";
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

/**
 * Parses DOCX and extracts entries based on date ranges
 */
import * as cheerio from "cheerio";

interface AIExtractedEntry {
  week_number: number;
  start_date?: string;
  end_date?: string;
  topic: string;
  sub_topic?: string;
  objective?: string;
  methodology?: string;
  resources?: string;
  evaluation?: string;
  duration?: string;
  learning_place?: string;
  observation?: string;
}

const aiExtractedEntrySchema: JSONSchema = {
  type: "object",
  properties: {
    week_number: { type: "number" },
    start_date: { type: "string" },
    end_date: { type: "string" },
    topic: { type: "string" },
    sub_topic: { type: "string" },
    objective: { type: "string" },
    methodology: { type: "string" },
    resources: { type: "string" },
    evaluation: { type: "string" },
    duration: { type: "string" },
    learning_place: { type: "string" },
    observation: { type: "string" },
  },
  required: ["week_number", "topic"],
};

/**
 * Fallback for when the fixed-column table parser above finds nothing — the uploaded document is
 * the teacher's own Scheme of Work, but not in this system's standard table template (different
 * column order/headers, a list instead of a table, merged cells, etc.), so it can't be parsed with
 * fixed rules. Reads the raw document text with an AI provider and asks it to faithfully extract
 * the weekly entries that are already there, rather than generating new content (that's the
 * separate "Generate with AI" flow in schemeAIController.ts).
 */
const extractEntriesWithAI = async (
  documentText: string,
  subjectName: string,
): Promise<AIExtractedEntry[]> => {
  const { data: parsed } = await generateStructuredContent<{
    entries?: AIExtractedEntry[];
  }>({
    schemaName: "scheme_of_work_entries",
    schema: {
      type: "object",
      properties: { entries: { type: "array", items: aiExtractedEntrySchema } },
      required: ["entries"],
    },
    prompt: `You are reading a teacher's own Scheme of Work document for "${subjectName}". It was written in a
layout this system's standard parser could not recognize (different column order or headers, merged/split table
cells, a numbered list, or plain paragraphs per week instead of a table) — so it needs to be read and understood
rather than parsed with fixed rules.

Your job is to carefully READ and FAITHFULLY EXTRACT the weekly entries the teacher already wrote. Do NOT invent,
rewrite, summarize, or improve their content — preserve their own wording as closely as possible. You may only clean
up obvious noise introduced by automatic document-to-text conversion (broken line breaks, stray table artifacts,
duplicated whitespace, jumbled ordering near page breaks).

Identify every distinct week/session/lesson the document describes and, for each one, extract:
- week_number: the week's ordinal number (1, 2, 3, ...). If the document doesn't number weeks explicitly, infer the
  sequence from the order entries appear in the document, starting at 1.
- start_date / end_date: ONLY if the document states an actual calendar date (or date range) for that week, in ISO
  format "YYYY-MM-DD". If no date is given for a week, omit both fields entirely for that entry — never guess or
  invent a date.
- topic: the indicative content / subject matter for that week (required — every entry must have one).
- sub_topic: a narrower focus within the topic, only if the document distinguishes one.
- objective: the learning outcome/objective for that week, if stated.
- methodology: the teaching/learning activities described, if stated.
- resources: materials, tools, or equipment mentioned, if stated.
- evaluation: the assessment method or evidence described, if stated.
- duration: the time allocation for that week, if stated (e.g. "6 hours", "2 periods").
- learning_place: where the session happens, if stated (e.g. classroom, workshop, computer lab).
- observation: any notes, remarks, or comments attached to that week, if present.

Omit a field entirely when the document simply doesn't mention it for that week — never fabricate a value to fill a
gap. Extract EVERY week you can find, even if some fields are sparse for it; do not skip a week just because most of
its fields are missing, as long as it clearly has a topic.

DOCUMENT CONTENT (extracted automatically — a table may appear flattened into plain lines; use context and any
repeated structure to tell entries apart):
"""
${documentText}
"""`,
  });

  const list = Array.isArray(parsed.entries) ? parsed.entries : [];
  return list
    .filter((e) => e && typeof e.topic === "string" && e.topic.trim())
    .sort((a, b) => (a.week_number || 0) - (b.week_number || 0));
};

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

    await assertTeacherOwnsScheme(
      userId,
      subjectId,
      classGroupId,
      academicTermId,
    );

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    const html = result.value;

    const entries: any[] = [];
    const $ = cheerio.load(html);

    // Clean text utility
    const cleanText = (str: string) =>
      str ? str.replace(/\s+/g, " ").trim() : "";

    // Parse DOCX table rows directly
    $("tr").each((i, tr) => {
      const tds = $(tr).find("td, th").toArray();
      if (tds.length === 0) return;

      // Extract text for each cell in this row, separated by newlines
      const cells = tds.map((td) => {
        let cellHtml = $(td).html() || "";
        cellHtml = cellHtml
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p><p>/gi, "\n");
        return cheerio.load(cellHtml).text().trim();
      });

      // Usually Week is in the first column for SOW standard format
      const firstColumn = cells[0] || "";

      // Look for "Week X"
      const weekMatch = /Week\s+(\d+)/i.exec(firstColumn);
      if (!weekMatch) return; // Skip rows that aren't week entries

      const weekNum = weekMatch[1];

      // Format A: 05-09/1/2026 or 5-9/1/2026
      // Format B: 30/3/2026 - 03/04/2026
      let startDate: string | null = null;
      let endDate: string | null = null;

      const formatBMatch =
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(
          firstColumn,
        );
      if (formatBMatch) {
        startDate = `${formatBMatch[3]}-${formatBMatch[2].padStart(2, "0")}-${formatBMatch[1].padStart(2, "0")}`;
        endDate = `${formatBMatch[6]}-${formatBMatch[5].padStart(2, "0")}-${formatBMatch[4].padStart(2, "0")}`;
      } else {
        const formatAMatch =
          /(?<!\d)(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(
            firstColumn,
          );
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
        // cells[0] is the Week/Date
        // cells[1] is Learning Outcome (LO)
        // cells[2] is Duration
        // cells[3] is Indicative Content (IC) (Topic)
        // cells[4] is Learning Activities / Methodology
        // cells[5] is Resources
        // cells[6] is Evidences / Evaluation
        // cells[7] is Learning Place
        // cells[8] is Observation

        let topic = cleanText(cells[3] || "");
        if (!topic && firstColumn.toLowerCase().includes("midterm")) {
          topic = "Midterm / Holidays";
        }

        // Only add if it actually matched something substantive
        entries.push({
          week_number: `Week ${weekNum}`,
          start_date: startDate,
          end_date: endDate,
          topic: topic,
          sub_topic: "",
          objective: cleanText(cells[1] || ""),
          duration: cleanText(cells[2] || ""),
          methodology: cleanText(cells[4] || ""),
          resources: cleanText(cells[5] || ""),
          evaluation: cleanText(cells[6] || ""),
          learning_place: cleanText(cells[7] || ""),
          observation: cleanText(cells[8] || ""),
        });
      }
    });

    let usedAIExtraction = false;

    if (entries.length === 0) {
      if (!isAnyProviderConfigured()) {
        throw new ValidationError(
          "No valid scheme rows found in the document. Please ensure it follows the standard format, or ask an administrator to configure an AI provider so non-standard documents can be read automatically.",
        );
      }

      logger.info(
        "Standard DOCX table parsing found no rows — falling back to AI-assisted extraction",
        { subjectId, classGroupId, academicTermId },
      );

      const rawText = await extractTextFromFile(req.file);
      if (!rawText.trim()) {
        throw new ValidationError(
          "No readable text found in the uploaded document.",
        );
      }

      const [subjectRecord] = await db
        .select({ name: Subject.name })
        .from(Subject)
        .where(eq(Subject.subject_id, subjectId))
        .limit(1);

      const aiEntries = await extractEntriesWithAI(
        rawText,
        subjectRecord?.name || "this subject",
      );

      if (aiEntries.length === 0) {
        throw new ValidationError(
          "Could not detect any scheme-of-work entries in this document, even with AI assistance. Please check the file, or use the 'Build Manually' / 'Generate with AI' options instead.",
        );
      }

      // The document may not state a calendar date for every (or any) week -- fill in whatever the
      // AI couldn't find by continuing a Mon-Fri weekly cadence from the academic term's start
      // date, the same way the "Generate with AI" flow schedules its own output.
      const [term] = await db
        .select()
        .from(AcademicTerm)
        .where(eq(AcademicTerm.academic_term_id, academicTermId))
        .limit(1);
      const anchor = term?.start_date ? new Date(term.start_date) : new Date();
      const computedDates = computeWeekDates(anchor, aiEntries.length);

      aiEntries.forEach((e, idx) => {
        const hasValidDates =
          !!e.start_date &&
          !!e.end_date &&
          !isNaN(Date.parse(e.start_date)) &&
          !isNaN(Date.parse(e.end_date));

        entries.push({
          week_number: `Week ${e.week_number || idx + 1}`,
          start_date: hasValidDates ? e.start_date : computedDates[idx].start_date,
          end_date: hasValidDates ? e.end_date : computedDates[idx].end_date,
          topic: e.topic || "",
          sub_topic: e.sub_topic || "",
          objective: e.objective || "",
          duration: e.duration || "",
          methodology: e.methodology || "",
          resources: e.resources || "",
          evaluation: e.evaluation || "",
          learning_place: e.learning_place || "",
          observation: e.observation || "",
        });
      });

      usedAIExtraction = true;
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

    const source = usedAIExtraction ? "DOCX_IMPORT_AI" : "DOCX_IMPORT";

    if (scheme.length > 0) {
      schemeId = scheme[0].scheme_id;
      logger.info(`Updating existing scheme ID: ${schemeId}`);
      await db
        .delete(SchemeOfWorkEntry)
        .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));
      await db
        .update(SchemeOfWork)
        .set({
          source,
          ai_source_filename: usedAIExtraction ? req.file.originalname : null,
        })
        .where(eq(SchemeOfWork.scheme_id, schemeId));
    } else {
      logger.info("Creating new scheme record");
      const schemeResult = await db.insert(SchemeOfWork).values({
        user_id: userId,
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
        source,
        ai_source_filename: usedAIExtraction ? req.file.originalname : null,
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

  // Get scheme along with all related names via JOIN
  const schemeWithNames = await db
    .select({
      scheme_id: SchemeOfWork.scheme_id,
      subject_id: SchemeOfWork.subject_id,
      class_group_id: SchemeOfWork.class_group_id,
      academic_term_id: SchemeOfWork.academic_term_id,
      user_id: SchemeOfWork.user_id,
      created_at: SchemeOfWork.created_at,
      validation_status: SchemeOfWork.validation_status,
      // Joined names
      subject_name: Subject.name,
      subject_code: Subject.code,
      class_group_name: ClassGroup.name,
      academic_term_name: AcademicTerm.name,
      academic_year_name: AcademicYear.name,
      teacher_name: sql<string>`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name})`,
    })
    .from(SchemeOfWork)
    .leftJoin(Subject, eq(SchemeOfWork.subject_id, Subject.subject_id))
    .leftJoin(ClassGroup, eq(SchemeOfWork.class_group_id, ClassGroup.class_group_id))
    .leftJoin(AcademicTerm, eq(SchemeOfWork.academic_term_id, AcademicTerm.academic_term_id))
    .leftJoin(AcademicYear, eq(AcademicTerm.academic_year_id, AcademicYear.academic_year_id))
    .leftJoin(UserProfile, eq(SchemeOfWork.user_id, UserProfile.user_id))
    .where(
      and(
        eq(SchemeOfWork.subject_id, parseInt(subject_id)),
        eq(SchemeOfWork.class_group_id, parseInt(class_group_id)),
        eq(SchemeOfWork.academic_term_id, parseInt(academic_term_id)),
      ),
    )
    .limit(1);

  if (schemeWithNames.length === 0) {
    return successResponse(res, "No scheme of work found", [], 200);
  }

  const entries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeWithNames[0].scheme_id))
    .orderBy(SchemeOfWorkEntry.start_date);

  // Attach each entry's linked Curriculum Performance Criteria (if any) in one extra query rather
  // than N+1 — most schemes have no links yet, so this is cheap in the common case too.
  const entryIds = entries.map((e) => e.entry_id);
  const links = entryIds.length
    ? await db
        .select({
          entry_id: SchemeEntryCriteria.entry_id,
          criteria_id: CompetencyPerformanceCriteria.criteria_id,
          criteria_number: CompetencyPerformanceCriteria.criteria_number,
          description: CompetencyPerformanceCriteria.description,
        })
        .from(SchemeEntryCriteria)
        .innerJoin(
          CompetencyPerformanceCriteria,
          eq(SchemeEntryCriteria.criteria_id, CompetencyPerformanceCriteria.criteria_id),
        )
        .where(inArray(SchemeEntryCriteria.entry_id, entryIds))
    : [];

  const entriesWithCriteria = entries.map((entry) => ({
    ...entry,
    criteria: links
      .filter((l) => l.entry_id === entry.entry_id)
      .map((l) => ({
        criteria_id: l.criteria_id,
        criteria_number: l.criteria_number,
        description: l.description,
      })),
  }));

  successResponse(res, "Scheme entries retrieved successfully", {
    scheme: schemeWithNames[0],
    entries: entriesWithCriteria,
  });
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
    duration,
    learning_place,
    observation,
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

  await assertTeacherOwnsScheme(
    userId,
    parseInt(subject_id),
    parseInt(class_group_id),
    parseInt(academic_term_id),
  );

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
    duration: duration || null,
    learning_place: learning_place || null,
    observation: observation || null,
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
 * Inserts a new entry at any position in the timeline (after a given entry, or
 * at the very start if `after_entry_id` is omitted), then automatically
 * renumbers and reschedules every entry from that point onward so the whole
 * scheme stays sequential (Week 1, Week 2, ... with a continuous Mon-Fri
 * date cadence).
 */
export const insertSchemeEntry = asyncHandler(async (req: any, res: any) => {
  const {
    subject_id,
    class_group_id,
    academic_term_id,
    after_entry_id,
    topic,
    sub_topic,
    objective,
    methodology,
    resources,
    evaluation,
    duration,
    learning_place,
    observation,
  } = req.body;
  const userId = req.user.userId;

  if (!subject_id || !class_group_id || !academic_term_id) {
    throw new ValidationError(
      "Subject, Class Group, and Academic Term are required",
    );
  }
  if (!topic) {
    throw new ValidationError("Topic is required");
  }

  await assertTeacherOwnsScheme(
    userId,
    parseInt(subject_id),
    parseInt(class_group_id),
    parseInt(academic_term_id),
  );

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

  const existingEntries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId))
    .orderBy(SchemeOfWorkEntry.start_date);

  let insertIndex = 0;
  if (after_entry_id) {
    const idx = existingEntries.findIndex(
      (e) => e.entry_id === parseInt(after_entry_id),
    );
    if (idx === -1) {
      throw new ValidationError("Reference entry not found");
    }
    insertIndex = idx + 1;
  }

  // Anchor the whole recomputed sequence to the scheme's existing start date
  // (or the academic term's start date for a brand-new scheme) so unrelated
  // entries don't drift every time something is inserted.
  let anchor: Date;
  if (existingEntries.length > 0 && existingEntries[0].start_date) {
    anchor = new Date(existingEntries[0].start_date);
  } else {
    const term = await db
      .select()
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, academic_term_id))
      .limit(1);
    anchor = term[0]?.start_date ? new Date(term[0].start_date) : new Date();
  }

  const weekDates = computeWeekDates(anchor, existingEntries.length + 1);

  const newEntryId = await db.transaction(async (tx) => {
    let insertedId: number | null = null;

    for (let i = 0; i < existingEntries.length + 1; i++) {
      const { start_date, end_date } = weekDates[i];
      const week_number = `Week ${i + 1}`;

      if (i === insertIndex) {
        const newEntry: any = {
          scheme_id: schemeId,
          week_number,
          start_date,
          end_date,
          topic,
          sub_topic: sub_topic || "",
          objective: objective || "",
          methodology: methodology || "",
          resources: resources || "",
          evaluation: evaluation || "",
          duration: duration || null,
          learning_place: learning_place || null,
          observation: observation || null,
        };
        const result = await tx.insert(SchemeOfWorkEntry).values(newEntry);
        const resultHeader = Array.isArray(result) ? result[0] : result;
        insertedId = (resultHeader as any).insertId;
      } else {
        const existing = existingEntries[i < insertIndex ? i : i - 1];
        const shifted: any = { week_number, start_date, end_date };
        await tx
          .update(SchemeOfWorkEntry)
          .set(shifted)
          .where(eq(SchemeOfWorkEntry.entry_id, existing.entry_id));
      }
    }

    return insertedId;
  });

  await recordActivity(
    userId,
    "SCHEME_ENTRY_INSERT",
    `Inserted a new week into the scheme of work (subject ID ${subject_id}), rescheduling ${existingEntries.length} following weeks`,
    "SchemeOfWork",
    schemeId,
    { subject_id, entries_count: existingEntries.length + 1 },
    userId,
  );

  successResponse(
    res,
    "Entry inserted and schedule updated",
    { entry_id: newEntryId, entries_count: existingEntries.length + 1 },
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
    duration,
    learning_place,
    observation,
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
      duration: duration !== undefined ? duration : existingEntry[0].duration,
      learning_place: learning_place !== undefined ? learning_place : existingEntry[0].learning_place,
      observation: observation !== undefined ? observation : existingEntry[0].observation,
      is_completed: is_completed ?? existingEntry[0].is_completed,
    })
    .where(eq(SchemeOfWorkEntry.entry_id, entryId));

  successResponse(res, "Scheme entry updated successfully");
});

/**
 * Get all teachers with their scheme of work status
 * Grouped by: academic_year, academic_term, program, grade
 */
export const getAllTeachersSchemeOfWork = asyncHandler(
  async (req: any, res: any) => {
    const { academic_year_id, academic_term_id, program_id, grade_id, role } =
      req.query;

    if (!academic_year_id || !academic_term_id || !program_id || !grade_id) {
      throw new ValidationError(
        "academic_year_id, academic_term_id, program_id, grade_id are required",
      );
    }

    const termId = parseInt(academic_term_id);
    const gradeId = parseInt(grade_id);
    const userType = role || "TEACHER";

    // Get all grades in this program
    const gradesInProgram = await db
      .select({ grade_id: Grade.grade_id })
      .from(Grade)
      .where(
        and(
          eq(Grade.program_id, parseInt(program_id)),
          eq(Grade.grade_id, gradeId),
        ),
      );

    if (gradesInProgram.length === 0) {
      return successResponse(res, "No grades found for this program", [], 200);
    }

    // Get class groups for this grade (a permanent label, not year-scoped --
    // the academic year is applied below when filtering assignments)
    const classGroups = await db
      .select()
      .from(ClassGroup)
      .where(eq(ClassGroup.grade_id, gradeId));

    if (classGroups.length === 0) {
      return successResponse(
        res,
        "No class groups found for this grade",
        [],
        200,
      );
    }

    const classGroupIds = classGroups.map((cg) => cg.class_group_id);

    // Fetch term name for use in response
    const termRecord = await db
      .select({ name: AcademicTerm.name })
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, termId))
      .limit(1);
    const termName = termRecord[0]?.name ?? null;

    // Get all teacher-subject assignments for these class groups (year-wide)
    const assignments = await db
      .select({
        user_id: TeacherSubjectAssignment.user_id,
        subject_id: TeacherSubjectAssignment.subject_id,
        class_group_id: TeacherSubjectAssignment.class_group_id,
        assigned_at: TeacherSubjectAssignment.assigned_at,
        subject_name: Subject.name,
        subject_code: Subject.code,
        subject_color: Subject.color,
        class_group_name: ClassGroup.name,
        year_name: AcademicYear.name,
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
      .innerJoin(
        AcademicYear,
        eq(TeacherSubjectAssignment.academic_year_id, AcademicYear.academic_year_id),
      )
      .where(
        and(
          inArray(TeacherSubjectAssignment.class_group_id, classGroupIds),
          eq(TeacherSubjectAssignment.academic_year_id, parseInt(academic_year_id)),
        ),
      );

    if (assignments.length === 0) {
      return successResponse(res, "No assignments found", [], 200);
    }

    // Unique teacher IDs
    const teacherIds = [...new Set(assignments.map((a) => a.user_id))];

    // Get teacher profiles filtered by user_type
    const teacherProfiles = await db
      .select({
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        user_type: UserProfile.user_type,
      })
      .from(User)
      .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          inArray(User.user_id, teacherIds),
          eq(UserProfile.user_type, userType as any),
        ),
      );

    // Get all existing SchemeOfWork records for these assignments
    const existingSchemes = await db
      .select({
        scheme_id: SchemeOfWork.scheme_id,
        user_id: SchemeOfWork.user_id,
        subject_id: SchemeOfWork.subject_id,
        class_group_id: SchemeOfWork.class_group_id,
        academic_term_id: SchemeOfWork.academic_term_id,
        validation_status: SchemeOfWork.validation_status,
        validation_comment: SchemeOfWork.validation_comment,
        created_at: SchemeOfWork.created_at,
        updated_at: SchemeOfWork.updated_at,
      })
      .from(SchemeOfWork)
      .where(
        and(
          eq(SchemeOfWork.academic_term_id, termId),
          inArray(SchemeOfWork.class_group_id, classGroupIds),
        ),
      );

    // Get entry counts per scheme
    const schemesWithCounts = await Promise.all(
      existingSchemes.map(async (scheme) => {
        const entriesCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(SchemeOfWorkEntry)
          .where(eq(SchemeOfWorkEntry.scheme_id, scheme.scheme_id));
          
        const firstEntry = await db
          .select({
             validation_status: SchemeOfWorkEntry.validation_status,
             validation_comment: SchemeOfWorkEntry.validation_comment,
          })
          .from(SchemeOfWorkEntry)
          .where(eq(SchemeOfWorkEntry.scheme_id, scheme.scheme_id))
          .orderBy(asc(SchemeOfWorkEntry.entry_id))
          .limit(1);

        return {
          ...scheme,
          entries_count: Number(entriesCount[0]?.count ?? 0),
          validation_status: firstEntry.length > 0 && firstEntry[0].validation_status ? firstEntry[0].validation_status : "PENDING",
          validation_comment: firstEntry.length > 0 ? firstEntry[0].validation_comment : null,
        };
      }),
    );

    // Build scheme lookup: key = `userId-subjectId-classGroupId-termId`
    const schemeMap = new Map<string, (typeof schemesWithCounts)[0]>();
    schemesWithCounts.forEach((s) => {
      const key = `${s.user_id}-${s.subject_id}-${s.class_group_id}-${s.academic_term_id}`;
      schemeMap.set(key, s);
    });

    // Build result grouped by teacher
    const teacherMap = new Map<number, any>();

    for (const assignment of assignments) {
      const profile = teacherProfiles.find(
        (p) => p.user_id === assignment.user_id,
      );
      if (!profile) continue; // skip if not matching user_type filter

      const key = `${assignment.user_id}-${assignment.subject_id}-${assignment.class_group_id}-${termId}`;
      const scheme = schemeMap.get(key) || null;

      const schemeRecord = {
        subject_id: assignment.subject_id,
        subject_name: assignment.subject_name,
        subject_code: assignment.subject_code,
        subject_color: assignment.subject_color,
        class_group_id: assignment.class_group_id,
        class_group_name: assignment.class_group_name,
        academic_term_id: termId,
        academic_term_name: termName,
        academic_year_name: assignment.year_name,
        scheme_id: scheme?.scheme_id ?? null,
        status: scheme ? "submitted" : "pending",
        entries_count: scheme?.entries_count ?? 0,
        validation_status: scheme?.validation_status ?? "PENDING",
        validation_comment: scheme?.validation_comment ?? null,
        submitted_at: scheme?.created_at ?? null,
        updated_at: scheme?.updated_at ?? null,
      };

      if (!teacherMap.has(assignment.user_id)) {
        teacherMap.set(assignment.user_id, {
          user_id: profile.user_id,
          username: profile.username,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          user_type: profile.user_type,
          full_name:
            [profile.first_name, profile.last_name]
              .filter(Boolean)
              .join(" ") || profile.username,
          schemes: [],
        });
      }

      teacherMap.get(assignment.user_id).schemes.push(schemeRecord);
    }

    const result = Array.from(teacherMap.values()).map((teacher) => ({
      ...teacher,
      total_subjects: teacher.schemes.length,
      submitted_count: teacher.schemes.filter(
        (s: any) => s.status === "submitted",
      ).length,
      pending_count: teacher.schemes.filter((s: any) => s.status === "pending")
        .length,
      overall_status:
        teacher.schemes.every((s: any) => s.status === "submitted")
          ? "submitted"
          : teacher.schemes.some((s: any) => s.status === "submitted")
            ? "partial"
            : "pending",
    }));

    successResponse(
      res,
      "Teachers scheme of work list retrieved successfully",
      result,
    );
  },
);

/**
 * Validates multiple scheme entries (Approve/Reject)
 */
export const validateScheme = asyncHandler(async (req: any, res: any) => {
  const { entry_ids, status, comment } = req.body;
  const actorId = req.user.userId;

  if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0 || !status) {
    throw new ValidationError("Entry IDs array and status are required");
  }

  // Update validation status for the specified entries
  await db
    .update(SchemeOfWorkEntry)
    .set({
      validation_status: status,
      validation_comment: comment || null,
    })
    .where(inArray(SchemeOfWorkEntry.entry_id, entry_ids));

  // Get one of the entries to find the owner for activity logging
  const sampleEntry = await db
    .select({ scheme_id: SchemeOfWorkEntry.scheme_id })
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.entry_id, entry_ids[0]))
    .limit(1);

  if (sampleEntry.length > 0) {
    const scheme = await db
      .select({ user_id: SchemeOfWork.user_id })
      .from(SchemeOfWork)
      .where(eq(SchemeOfWork.scheme_id, sampleEntry[0].scheme_id))
      .limit(1);

    if (scheme.length > 0) {
      await recordActivity(
        actorId,
        "SCHEME_ENTRIES_VALIDATION",
        `Validated ${entry_ids.length} scheme entries as ${status}`,
        "SchemeOfWork",
        sampleEntry[0].scheme_id,
        { entry_ids, status, comment },
        scheme[0].user_id,
      );
    }
  }

  successResponse(res, `Selected scheme entries ${status.toLowerCase()} successfully`);
});
