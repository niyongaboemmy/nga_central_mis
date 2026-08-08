import { randomUUID } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import {
  extractTextFromFile,
  extractCurriculumStructure,
  extractLoContentItems,
  mapTermToLearningOutcome,
} from "../utils/docExtract";
import { generateCurriculumWithGemini } from "../services/curriculumExtraction";
import { computeWeekDates } from "../utils/weekDates";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  AcademicTerm,
  SchemeOfWork,
  SchemeOfWorkEntry,
  SubjectCompetency,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import logger from "../utils/logger";
import { createJob, getJob, updateJob } from "../services/aiSchemeJobStore";
import { ImportedElement } from "../services/curriculumImportJobStore";
import { assertTeacherOwnsScheme } from "../utils/schemeAuthorization";
import {
  getSubjectCriteria,
  resolveAndLinkCriteria,
} from "./schemeEntryCriteriaController";
import { Permissions } from "../utils/permissions";

const MAX_CURRICULUM_CHARS = 60000;
const MAX_ADDITIONAL_INSTRUCTIONS_CHARS = 2000;

const isGeminiConfigured = () =>
  !!process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";

interface GeneratedWeek {
  week_number: number;
  topic: string;
  sub_topic?: string;
  objective: string;
  methodology: string;
  resources: string;
  evaluation: string;
  learning_place?: string;
  observation?: string;
  duration?: string;
  /** Curriculum Performance Criteria numbers (e.g. "1.1") this week's AI-generated content
   * addresses, if any curriculum criteria (existing or freshly proposed) were available at
   * generation time to match against. */
  criteria_numbers?: string[];
}

const computeMaxWeeks = (start: Date, end: Date): number => {
  const days = Math.max((end.getTime() - start.getTime()) / 86400000, 0);
  return Math.max(1, Math.min(52, Math.round(days / 7)));
};

/** Parses a comma/space-separated list of week numbers, e.g. "3, 8, 12" -> Set{3,8,12}. Ignores invalid tokens. */
const parseSkipWeeks = (raw: unknown): Set<number> => {
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  const nums = raw
    .split(/[,\s]+/)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return new Set(nums);
};

/**
 * Parses a comma-separated list of "loNumber:itemIndex" refs (e.g. "1:0,1:2,3:0") into a
 * Map<loNumber, Set<itemIndex>>, representing exactly which indicative-content lines within each
 * Learning Outcome were confirmed for this term. Ignores malformed tokens.
 */
const parseContentRefs = (raw: unknown): Map<number, Set<number>> => {
  const refs = new Map<number, Set<number>>();
  if (typeof raw !== "string" || !raw.trim()) return refs;

  for (const token of raw.split(",")) {
    const [loRaw, itemRaw] = token.trim().split(":");
    const loNumber = parseInt(loRaw, 10);
    const itemIndex = parseInt(itemRaw, 10);
    if (
      Number.isInteger(loNumber) &&
      loNumber > 0 &&
      Number.isInteger(itemIndex) &&
      itemIndex >= 0
    ) {
      if (!refs.has(loNumber)) refs.set(loNumber, new Set());
      refs.get(loNumber)!.add(itemIndex);
    }
  }
  return refs;
};

const weekSchema = {
  type: Type.OBJECT,
  properties: {
    week_number: { type: Type.INTEGER },
    topic: { type: Type.STRING },
    sub_topic: { type: Type.STRING },
    objective: { type: Type.STRING },
    methodology: { type: Type.STRING },
    resources: { type: Type.STRING },
    evaluation: { type: Type.STRING },
    learning_place: { type: Type.STRING },
    observation: { type: Type.STRING },
    duration: { type: Type.STRING },
    criteria_numbers: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "week_number",
    "topic",
    "objective",
    "methodology",
    "resources",
    "evaluation",
  ],
};

const generateWeeksWithGemini = async (
  curriculumText: string,
  maxWeeks: number,
  subjectName: string,
  additionalInstructions?: string,
  criteriaList?: string[],
): Promise<GeneratedWeek[]> => {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await genAI.models.generateContent({
    model,
    contents: `You are a highly experienced, subject-matter-expert teacher of "${subjectName}", with years of
classroom practice delivering this exact subject. You have been handed the official curriculum below and asked to
personally plan your own Scheme of Work for the term — the way a seasoned, professional teacher would, not a
generic assistant. Read and genuinely understand the curriculum's learning outcomes, indicative content, and
assessment criteria before planning: think about what a real trainee needs to master each concept, in what order,
and how much time each idea realistically deserves.

The term has ${maxWeeks} available teaching weeks. Produce a week-by-week scheme that sequences the material
logically (foundational concepts before concepts that depend on them), respects the relative weighting/hours given
to each learning outcome in the curriculum, and reads like it was written by a teacher who knows this subject well
— not a summary or a copy-paste of the document. Use AT MOST ${maxWeeks} weeks (fewer is fine if the content
doesn't need that many). Number weeks sequentially starting at 1.

For each week, write as a professional teacher planning their own lesson would:
- topic: the specific indicative content covered that week (precise, not vague)
- sub_topic: a narrower focus within the topic, if applicable
- objective: a clear, measurable learning outcome a trainee should achieve that week
- methodology: concrete teaching/learning activities and techniques you would actually use (e.g. demonstration,
  hands-on practice, group work, guided exercises) — grounded in the curriculum's own facilitation techniques where
  given
- resources: the specific tools, materials, or equipment needed, drawn from the curriculum's resource lists where
  available
- evaluation: a realistic formative assessment method or evidence you would collect that week
- learning_place: where this would realistically happen (e.g. classroom, computer lab, workshop)
- observation: any practical notes a teacher would jot down (pacing, prerequisites, common pitfalls) — optional

Keep each field concise (1-3 sentences), specific, and directly grounded in the curriculum content provided. Avoid
generic filler — every field should sound like it came from someone who actually teaches this subject.

The curriculum content below was extracted automatically from an uploaded document (PDF/DOCX) and may not have come
through perfectly — tables can get flattened or scrambled, bullet structure can be lost, and text near page breaks
can be jumbled or duplicated. Where the extracted text looks garbled, incomplete, or out of order, use your own
subject-matter expertise to infer the intended meaning rather than reproducing the noise verbatim.
${
  additionalInstructions?.trim()
    ? `
TEACHER'S ADDITIONAL GUIDANCE (a human teacher reviewed this document and left the note below — follow it closely;
it may correct for content that didn't extract cleanly, clarify which parts to emphasize or ignore, or add context
the document itself is missing):
"""
${additionalInstructions.trim()}
"""
`
    : ""
}${
  criteriaList && criteriaList.length > 0
    ? `
This subject's official Curriculum defines the following Performance Criteria (number: description). For EACH
week you plan, also judge which of these (if any) that week's content genuinely addresses by meaning — the
criteria's wording will not match your week's wording exactly, so don't rely on text similarity. List their
numbers in "criteria_numbers". It's completely normal and expected for a week to match zero, one, or a few —
never force a match that doesn't genuinely fit just to fill the field.
"""
${criteriaList.join("\n")}
"""
`
    : ""
}
CURRICULUM CONTENT:
"""
${curriculumText}
"""`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weeks: { type: Type.ARRAY, items: weekSchema },
        },
        required: ["weeks"],
      },
    },
  });

  const text = response.text || "{}";
  const parsed = JSON.parse(text);
  const weeks: GeneratedWeek[] = Array.isArray(parsed.weeks)
    ? parsed.weeks
    : [];

  if (weeks.length === 0) {
    throw new ValidationError(
      "The AI could not extract any weekly content from this document. Please try a different file.",
    );
  }

  return weeks
    .sort((a, b) => (a.week_number || 0) - (b.week_number || 0))
    .slice(0, maxWeeks);
};

const processJob = async (
  jobId: string,
  file: Express.Multer.File,
  params: {
    userId: number;
    subjectId: number;
    classGroupId: number;
    academicTermId: number;
    subjectName: string;
    numWeeksOverride?: number;
    startDateOverride?: string;
    skipWeeks: Set<number>;
    selectedContentRefs: Map<number, Set<number>>;
    additionalInstructions?: string;
    /** True only when the caller requested curriculum generation, holds MANAGE_CURRICULUM, and the
     * subject had zero existing SubjectCompetency rows at request time (checked in
     * startAIGeneration) — see CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md §5.3. */
    shouldGenerateCurriculum: boolean;
  },
) => {
  // Step numbering is conditional: 5 steps when curriculum extraction runs, 4 otherwise.
  const totalSteps = params.shouldGenerateCurriculum ? 5 : 4;
  const stepFor = {
    parsing: 1,
    extracting_curriculum: 2,
    analyzing: params.shouldGenerateCurriculum ? 3 : 2,
    structuring: params.shouldGenerateCurriculum ? 4 : 3,
    saving: params.shouldGenerateCurriculum ? 5 : 4,
  } as const;

  try {
    updateJob(jobId, {
      status: "parsing",
      message: "Reading document...",
      stepIndex: stepFor.parsing,
      totalSteps,
    });

    const term = await db
      .select()
      .from(AcademicTerm)
      .where(eq(AcademicTerm.academic_term_id, params.academicTermId))
      .limit(1);

    if (term.length === 0 || !term[0].start_date || !term[0].end_date) {
      throw new ValidationError(
        "The selected academic term has no start/end date configured.",
      );
    }

    const termEnd = new Date(term[0].end_date);
    const termStart =
      params.startDateOverride && !isNaN(Date.parse(params.startDateOverride))
        ? new Date(params.startDateOverride)
        : new Date(term[0].start_date);

    const totalWeeks =
      params.numWeeksOverride && params.numWeeksOverride > 0
        ? Math.min(52, Math.round(params.numWeeksOverride))
        : computeMaxWeeks(termStart, termEnd);

    const skipWeeks = params.skipWeeks;
    const contentCount = totalWeeks - skipWeeks.size;

    if (contentCount < 1) {
      throw new ValidationError(
        "All requested weeks are marked to skip — there's nothing left to generate.",
      );
    }

    const fullText = await extractTextFromFile(file);
    let rawText = fullText;

    if (params.selectedContentRefs.size > 0) {
      const structure = extractCurriculumStructure(fullText);
      const blocks: string[] = [];

      for (const lo of structure.los) {
        const selectedItemIndices = params.selectedContentRefs.get(
          lo.loNumber,
        );
        if (!selectedItemIndices || selectedItemIndices.size === 0) continue;

        const items = extractLoContentItems(fullText, lo);

        if (selectedItemIndices.size >= items.length) {
          // Every detected line for this LO was selected — use the full contiguous slice so
          // nothing outside the line-splitting heuristic (surrounding context, resource lists,
          // etc.) is lost.
          blocks.push(fullText.slice(lo.start, lo.end));
        } else {
          // Only part of the LO applies this term — assemble just the selected lines, with a
          // header for context so the model knows which Learning Outcome they belong to.
          const selectedLines = items
            .filter((item) => selectedItemIndices.has(item.index))
            .map((item) => item.text)
            .join("\n");
          blocks.push(
            `Learning Outcome ${lo.loNumber}: ${lo.title}\n${selectedLines}`,
          );
        }
      }

      if (blocks.length > 0) {
        rawText = blocks.join("\n\n");
      }
      // If nothing matched (e.g. a different file was uploaded than was previewed), fall through
      // to the full text below rather than failing the generation.
    }

    rawText = rawText.slice(0, MAX_CURRICULUM_CHARS);
    if (!rawText.trim()) {
      throw new ValidationError(
        "No readable text found in the uploaded document.",
      );
    }

    // Curriculum generation (only when requested, permitted, and the subject had none — checked
    // in startAIGeneration) and/or fetching the subject's existing criteria, both feeding the
    // same AI-matching prompt used to tag each generated week with criteria_numbers.
    let proposedCurriculum: ImportedElement[] | undefined;
    let criteriaForPrompt: { criteria_number: string; description: string }[] = [];

    if (params.shouldGenerateCurriculum) {
      updateJob(jobId, {
        status: "extracting_curriculum",
        message: "Extracting curriculum structure...",
        stepIndex: stepFor.extracting_curriculum,
        totalSteps,
      });
      proposedCurriculum = await generateCurriculumWithGemini(
        rawText,
        params.subjectName,
      );
      criteriaForPrompt = proposedCurriculum.flatMap((el) =>
        el.criteria.map((c) => ({
          criteria_number: c.criteria_number,
          description: c.description,
        })),
      );
    } else {
      const existingCriteria = await getSubjectCriteria(params.subjectId);
      criteriaForPrompt = existingCriteria.map((c) => ({
        criteria_number: c.criteria_number,
        description: c.description,
      }));
    }

    updateJob(jobId, {
      status: "analyzing",
      message: "Analyzing curriculum with AI...",
      stepIndex: stepFor.analyzing,
      totalSteps,
    });

    const generatedWeeks = await generateWeeksWithGemini(
      rawText,
      contentCount,
      params.subjectName,
      params.additionalInstructions,
      criteriaForPrompt.length > 0
        ? criteriaForPrompt.map((c) => `${c.criteria_number}: ${c.description}`)
        : undefined,
    );

    updateJob(jobId, {
      status: "structuring",
      message: "Structuring weekly plan...",
      stepIndex: stepFor.structuring,
      totalSteps,
    });

    const weekDates = computeWeekDates(termStart, totalWeeks);
    const entries: any[] = [];
    const entryCriteriaNumbers: Record<string, string[]> = {};
    let contentIdx = 0;
    for (
      let slot = 1;
      slot <= totalWeeks && contentIdx < generatedWeeks.length;
      slot++
    ) {
      if (skipWeeks.has(slot)) continue;
      const w = generatedWeeks[contentIdx++];
      const weekNumber = `Week ${slot}`;
      entries.push({
        week_number: weekNumber,
        start_date: weekDates[slot - 1].start_date,
        end_date: weekDates[slot - 1].end_date,
        topic: w.topic || "",
        sub_topic: w.sub_topic || "",
        objective: w.objective || "",
        methodology: w.methodology || "",
        resources: w.resources || "",
        evaluation: w.evaluation || "",
        duration: w.duration || "",
        learning_place: w.learning_place || "",
        observation: w.observation || "",
      });
      if (Array.isArray(w.criteria_numbers) && w.criteria_numbers.length > 0) {
        entryCriteriaNumbers[weekNumber] = w.criteria_numbers;
      }
    }

    updateJob(jobId, {
      status: "saving",
      message: "Saving to database...",
      stepIndex: stepFor.saving,
      totalSteps,
    });

    let scheme = await db
      .select()
      .from(SchemeOfWork)
      .where(
        and(
          eq(SchemeOfWork.subject_id, params.subjectId),
          eq(SchemeOfWork.class_group_id, params.classGroupId),
          eq(SchemeOfWork.academic_term_id, params.academicTermId),
        ),
      )
      .limit(1);

    let schemeId: number;

    if (scheme.length > 0) {
      schemeId = scheme[0].scheme_id;
      await db
        .delete(SchemeOfWorkEntry)
        .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));
      await db
        .update(SchemeOfWork)
        .set({
          source: "AI_GENERATED",
          ai_source_filename: file.originalname,
        })
        .where(eq(SchemeOfWork.scheme_id, schemeId));
    } else {
      const schemeResult = await db.insert(SchemeOfWork).values({
        user_id: params.userId,
        subject_id: params.subjectId,
        class_group_id: params.classGroupId,
        academic_term_id: params.academicTermId,
        source: "AI_GENERATED",
        ai_source_filename: file.originalname,
      });
      const resultHeader = Array.isArray(schemeResult)
        ? schemeResult[0]
        : schemeResult;
      schemeId = (resultHeader as any).insertId;
    }

    if (!schemeId) {
      throw new Error("Failed to initialize scheme record in database");
    }

    for (const entry of entries) {
      await db.insert(SchemeOfWorkEntry).values({
        scheme_id: schemeId,
        ...entry,
      });
    }

    await recordActivity(
      params.userId,
      "SCHEME_AI_GENERATE",
      `AI-generated scheme of work for subject ID ${params.subjectId} from "${file.originalname}"`,
      "SchemeOfWork",
      schemeId,
      { subject_id: params.subjectId, entries_count: entries.length },
      params.userId,
    );

    // If the subject already had Curriculum, criteria_ids already exist — resolve and save the
    // links immediately, no confirmation step needed. If curriculum was just proposed above, its
    // criteria don't exist in the DB yet; entryCriteriaNumbers is returned as-is for the frontend
    // to resolve via /schemes/:schemeId/link-criteria once the user confirms/saves it.
    let autoTaggedCriteriaCount: number | undefined;
    if (!params.shouldGenerateCurriculum && Object.keys(entryCriteriaNumbers).length > 0) {
      autoTaggedCriteriaCount = await resolveAndLinkCriteria(
        schemeId,
        params.subjectId,
        entryCriteriaNumbers,
      );
    }

    updateJob(jobId, {
      status: "done",
      message: "Scheme of work generated successfully!",
      schemeId,
      entriesCount: entries.length,
      stepIndex: stepFor.saving,
      totalSteps,
      ...(proposedCurriculum
        ? {
            proposedCurriculum,
            curriculumSubjectHadNone: true,
            entryCriteriaNumbers,
          }
        : {}),
      ...(autoTaggedCriteriaCount !== undefined ? { autoTaggedCriteriaCount } : {}),
    });
  } catch (err: any) {
    logger.error("AI scheme generation failed", { jobId, error: err?.message });
    updateJob(jobId, {
      status: "error",
      message: "Generation failed",
      error: err?.message || "AI scheme generation failed",
    });
  }
};

/**
 * Detects the Learning Outcome sections in an uploaded curriculum document (fast, regex-only —
 * no AI call) and, if an academic_term_id is supplied, auto-suggests which LO(s) the selected
 * term should cover based on the term's ordinal position among its sibling terms in the same
 * academic year. Used by the frontend to show a confirmation checklist before generation.
 */
export const getCurriculumStructure = asyncHandler(
  async (req: any, res: any) => {
    if (!req.file) {
      throw new ValidationError("No file uploaded");
    }

    const { academic_term_id } = req.body;

    const rawText = await extractTextFromFile(req.file);
    const structure = extractCurriculumStructure(rawText);

    let autoSelectedLoNumbers: number[] = [];
    let termOrdinal: number | null = null;
    let totalTermsInYear: number | null = null;

    if (structure.hasStructure && academic_term_id) {
      const termId = parseInt(academic_term_id, 10);
      const term = Number.isInteger(termId)
        ? await db
            .select()
            .from(AcademicTerm)
            .where(eq(AcademicTerm.academic_term_id, termId))
            .limit(1)
        : [];

      if (term.length > 0) {
        const siblings = await db
          .select()
          .from(AcademicTerm)
          .where(
            eq(AcademicTerm.academic_year_id, term[0].academic_year_id),
          )
          .orderBy(AcademicTerm.start_date);

        totalTermsInYear = siblings.length;
        const idx = siblings.findIndex(
          (t) => t.academic_term_id === term[0].academic_term_id,
        );
        termOrdinal = idx + 1;

        if (termOrdinal > 0) {
          autoSelectedLoNumbers = mapTermToLearningOutcome(
            structure.los,
            termOrdinal,
            totalTermsInYear,
          ).autoSelectedLoNumbers;
        } else {
          termOrdinal = null;
        }
      }
    }

    successResponse(res, "Curriculum structure extracted", {
      hasStructure: structure.hasStructure,
      los: structure.los.map((lo) => ({
        loNumber: lo.loNumber,
        title: lo.title,
        hours: lo.hours,
        contentItems: extractLoContentItems(rawText, lo).map((item) => ({
          index: item.index,
          text: item.text,
        })),
      })),
      autoSelectedLoNumbers,
      termOrdinal,
      totalTermsInYear,
    });
  },
);

export const startAIGeneration = asyncHandler(async (req: any, res: any) => {
  if (!req.file) {
    throw new ValidationError("No file uploaded");
  }

  if (!isGeminiConfigured()) {
    throw new ValidationError(
      "AI scheme generation is not configured. Add a GEMINI_API_KEY to the backend environment (get a free key at https://aistudio.google.com/apikey).",
    );
  }

  const {
    subject_id,
    class_group_id,
    academic_term_id,
    subject_name,
    num_weeks,
    start_date,
    skip_weeks,
    selected_content_refs,
    additional_instructions,
    generate_curriculum,
  } = req.body;

  if (!subject_id || !class_group_id || !academic_term_id) {
    throw new ValidationError(
      "Subject, Class Group, and Academic Term are required",
    );
  }

  const userId = req.user.userId;
  const subjectId = parseInt(subject_id);

  await assertTeacherOwnsScheme(
    userId,
    subjectId,
    parseInt(class_group_id),
    parseInt(academic_term_id),
  );

  // Only offer to also generate Curriculum when: the caller asked for it, the user holds
  // MANAGE_CURRICULUM (writing Curriculum data requires this permission everywhere else in the
  // app — Scheme of Work generation alone does not, so this must not become a side door around
  // that gate), and the subject genuinely has no Curriculum yet (never re-generate/overwrite
  // existing Curriculum data from this flow). See
  // CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md §5.5.
  let shouldGenerateCurriculum = false;
  if (
    (generate_curriculum === "true" || generate_curriculum === true) &&
    (req.user.permissions || []).includes(Permissions.MANAGE_CURRICULUM)
  ) {
    const [existingCompetency] = await db
      .select({ competency_id: SubjectCompetency.competency_id })
      .from(SubjectCompetency)
      .where(eq(SubjectCompetency.subject_id, subjectId))
      .limit(1);
    shouldGenerateCurriculum = !existingCompetency;
  }

  const jobId = randomUUID();

  createJob(jobId, userId);

  successResponse(res, "AI scheme generation started", { jobId }, 202);

  const numWeeksOverride = num_weeks ? parseInt(num_weeks, 10) : undefined;

  // Fire-and-forget: progress is tracked via the job store and polled by the client.
  processJob(jobId, req.file, {
    userId,
    subjectId,
    classGroupId: parseInt(class_group_id),
    academicTermId: parseInt(academic_term_id),
    subjectName: subject_name || "this subject",
    numWeeksOverride:
      numWeeksOverride && numWeeksOverride > 0 ? numWeeksOverride : undefined,
    startDateOverride: start_date || undefined,
    skipWeeks: parseSkipWeeks(skip_weeks),
    selectedContentRefs: parseContentRefs(selected_content_refs),
    additionalInstructions:
      typeof additional_instructions === "string"
        ? additional_instructions.trim().slice(0, MAX_ADDITIONAL_INSTRUCTIONS_CHARS)
        : undefined,
    shouldGenerateCurriculum,
  });
});

export const getAIGenerationStatus = asyncHandler(
  async (req: any, res: any) => {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job || job.userId !== req.user.userId) {
      throw new NotFoundError("Generation job not found");
    }

    successResponse(res, "Job status", {
      status: job.status,
      stepIndex: job.stepIndex,
      totalSteps: job.totalSteps,
      message: job.message,
      schemeId: job.schemeId,
      entriesCount: job.entriesCount,
      error: job.error,
      proposedCurriculum: job.proposedCurriculum,
      curriculumSubjectHadNone: job.curriculumSubjectHadNone,
      entryCriteriaNumbers: job.entryCriteriaNumbers,
      autoTaggedCriteriaCount: job.autoTaggedCriteriaCount,
    });
  },
);

const singleEntrySchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    sub_topic: { type: Type.STRING },
    objective: { type: Type.STRING },
    methodology: { type: Type.STRING },
    resources: { type: Type.STRING },
    evaluation: { type: Type.STRING },
    learning_place: { type: Type.STRING },
    observation: { type: Type.STRING },
    duration: { type: Type.STRING },
  },
  required: ["topic", "objective", "methodology", "resources", "evaluation"],
};

export const DEFAULT_ENTRY_PROMPT_TEMPLATE =
  "Act as an experienced teacher of this subject. Generate a professional scheme of work entry for this week " +
  "covering: [describe the topic/focus for this week here].\n\n" +
  "Make sure to cover: the indicative content, a clear learning objective, the teaching methodology/activities, " +
  "resources needed, and how you'll evaluate understanding.";

/**
 * Synchronously generates content for a single scheme-of-work entry using the
 * teacher's own custom prompt. Used by the "Generate with AI" action inside
 * the single-entry create/edit modal — fast enough (one entry) that no
 * job-polling is needed; the result just populates the form for review.
 */
export const suggestEntryContent = asyncHandler(async (req: any, res: any) => {
  if (!isGeminiConfigured()) {
    throw new ValidationError(
      "AI suggestions are not configured. Add a GEMINI_API_KEY to the backend environment (get a free key at https://aistudio.google.com/apikey).",
    );
  }

  const { subject_name, week_label, prompt } = req.body;
  if (!prompt || !String(prompt).trim()) {
    throw new ValidationError("A prompt is required");
  }

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await genAI.models.generateContent({
    model,
    contents: `You are an experienced, subject-matter-expert teacher of "${subject_name || "this subject"}",
personally planning a single week (${week_label || "this week"}) of your Scheme of Work.

The teacher's instructions for this week:
"""
${prompt}
"""

Follow those instructions to produce this week's entry. Provide: the topic (indicative content), an optional
sub-topic, a clear learning objective, the teaching methodology/activities, resources needed, the evaluation /
evidence of formative assessment, the learning place, and any observation notes. Keep each field concise (1-3
sentences) and write it the way a teacher who actually teaches this subject would — specific, not generic filler.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: singleEntrySchema,
    },
  });

  const text = response.text || "{}";
  const parsed = JSON.parse(text);

  if (!parsed.topic) {
    throw new ValidationError(
      "The AI could not generate content from this prompt. Try adding more detail.",
    );
  }

  successResponse(res, "Entry content generated", parsed);
});
