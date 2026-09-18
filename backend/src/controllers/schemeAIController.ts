import { randomUUID } from "crypto";
import {
  extractTextFromFile,
  extractCurriculumStructure,
  extractLoContentItems,
  mapTermToLearningOutcome,
} from "../utils/docExtract";
import { generateCurriculumWithAI } from "../services/curriculumExtraction";
import { computeWeekDates } from "../utils/weekDates";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  AcademicTerm,
  SchemeOfWork,
  SchemeOfWorkEntry,
  SubjectCompetency,
  CompetencyPerformanceCriteria,
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
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

const MAX_CURRICULUM_CHARS = 60000;
const MAX_ADDITIONAL_INSTRUCTIONS_CHARS = 2000;

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
  /** Which Learning Outcome (element_number) this week belongs to, when a real LO structure was
   * detected/available at generation time — resolved into SchemeOfWorkEntry.competency_id so the
   * PDF/UI can group consecutive weeks under one "Competence code and name" header, matching the
   * correct Scheme of Work template. */
  lo_number?: number;
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

/**
 * Parses a comma-separated list of "competencyId:criteriaId" refs (e.g. "4:10,4:12,5:0") into a
 * Map<competencyId, Set<criteriaId>>, representing exactly which Performance Criteria of the
 * subject's existing Curriculum were selected to be covered this term. An empty set for a
 * competency means "the whole element" (all of its criteria). Ignores malformed tokens.
 */
const parseCriteriaRefs = (raw: unknown): Map<number, Set<number>> => {
  const refs = new Map<number, Set<number>>();
  if (typeof raw !== "string" || !raw.trim()) return refs;

  for (const token of raw.split(",")) {
    const [compRaw, critRaw] = token.trim().split(":");
    const competencyId = parseInt(compRaw, 10);
    if (!Number.isInteger(competencyId) || competencyId <= 0) continue;
    if (!refs.has(competencyId)) refs.set(competencyId, new Set());
    const criteriaId = parseInt(critRaw, 10);
    if (Number.isInteger(criteriaId) && criteriaId > 0) {
      refs.get(competencyId)!.add(criteriaId);
    }
  }
  return refs;
};

/**
 * Builds curriculum text (and the flat criteria list fed to the AI prompt) from a subject's
 * already-saved Curriculum, scoped to the Elements/Performance Criteria the teacher selected in
 * the "use existing curriculum" step — used instead of extracting text from an uploaded document
 * when the subject already has Curriculum defined.
 */
const buildTextFromExistingCurriculum = async (
  subjectId: number,
  refs: Map<number, Set<number>>,
): Promise<{
  rawText: string;
  criteriaForPrompt: { criteria_number: string; description: string }[];
  loList: { loNumber: number; title: string }[];
  competencyIdByElement: Map<number, number>;
}> => {
  const elements = await db
    .select()
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.subject_id, subjectId))
    .orderBy(SubjectCompetency.sort_order);

  const selectedElements =
    refs.size > 0 ? elements.filter((el) => refs.has(el.competency_id)) : elements;

  const blocks: string[] = [];
  const criteriaForPrompt: { criteria_number: string; description: string }[] = [];

  for (const el of selectedElements) {
    const allCriteria = await db
      .select()
      .from(CompetencyPerformanceCriteria)
      .where(eq(CompetencyPerformanceCriteria.competency_id, el.competency_id))
      .orderBy(CompetencyPerformanceCriteria.sort_order);

    const criteriaIds = refs.get(el.competency_id);
    const criteria =
      criteriaIds && criteriaIds.size > 0
        ? allCriteria.filter((c) => criteriaIds.has(c.criteria_id))
        : allCriteria;

    const lines = [
      `Element ${el.element_number}: ${el.title}${el.learning_hours ? ` (${el.learning_hours} learning hrs)` : ""}`,
      el.description ? `Description: ${el.description}` : "",
      el.indicative_content ? `Indicative content: ${el.indicative_content}` : "",
      criteria.length > 0
        ? `Performance Criteria:\n${criteria.map((c) => `${c.criteria_number}: ${c.description}`).join("\n")}`
        : "",
    ].filter(Boolean);

    blocks.push(lines.join("\n"));
    for (const c of criteria) {
      criteriaForPrompt.push({ criteria_number: c.criteria_number, description: c.description });
    }
  }

  const loList = selectedElements.map((el) => ({
    loNumber: el.element_number,
    title: el.title,
  }));
  const competencyIdByElement = new Map(
    selectedElements.map((el) => [el.element_number, el.competency_id]),
  );

  return { rawText: blocks.join("\n\n"), criteriaForPrompt, loList, competencyIdByElement };
};

const weekSchema: JSONSchema = {
  type: "object",
  properties: {
    week_number: { type: "number" },
    topic: { type: "string" },
    sub_topic: { type: "string" },
    objective: { type: "string" },
    methodology: { type: "string" },
    resources: { type: "string" },
    evaluation: { type: "string" },
    learning_place: { type: "string" },
    observation: { type: "string" },
    duration: { type: "string" },
    criteria_numbers: { type: "array", items: { type: "string" } },
    lo_number: { type: "number" },
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

const generateWeeks = async (
  curriculumText: string,
  maxWeeks: number,
  subjectName: string,
  additionalInstructions?: string,
  criteriaList?: string[],
  loList?: { loNumber: number; title: string }[],
): Promise<GeneratedWeek[]> => {
  const { data: parsed } = await generateStructuredContent<{ weeks?: GeneratedWeek[] }>({
    schemaName: "scheme_weeks",
    schema: {
      type: "object",
      properties: {
        weeks: { type: "array", items: weekSchema },
      },
      required: ["weeks"],
    },
    prompt: `You are a highly experienced, subject-matter-expert teacher of "${subjectName}", with years of
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
}${
  loList && loList.length > 0
    ? `
This term's curriculum is organized into the following Learning Outcomes (number: title). Every week you plan
belongs to exactly one of them — set "lo_number" to that Learning Outcome's number for every week. Group weeks
so that all weeks covering the same Learning Outcome are planned consecutively (do not interleave them), the way
a real Scheme of Work is laid out. Do NOT invent a Learning Outcome number that isn't in this list.
"""
${loList.map((lo) => `${lo.loNumber}: ${lo.title}`).join("\n")}
"""
`
    : ""
}
CURRICULUM CONTENT:
"""
${curriculumText}
"""`,
  });

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

export interface BuiltWeekEntry {
  week_number: string;
  start_date: string;
  end_date: string;
  topic: string;
  sub_topic: string;
  objective: string;
  methodology: string;
  resources: string;
  evaluation: string;
  duration: string;
  learning_place: string;
  observation: string;
  competency_id: number | null;
  entry_status: "PLANNED" | "SKIPPED" | "COMPLETED";
}

const EMPTY_WEEK_FIELDS = {
  topic: "",
  sub_topic: "",
  objective: "",
  methodology: "",
  resources: "",
  evaluation: "",
  duration: "",
  learning_place: "",
  observation: "",
  competency_id: null as number | null,
};

/**
 * Lays generated week content onto the full 1..totalWeeks timeline, one row per slot, with no
 * omissions. This is the fix for the bug where skip weeks (and any shortfall in what the AI
 * returned) used to be `continue`-d past entirely, leaving no database row at all for that week
 * — which is why the calendar/timeline/PDF showed a blank, unlabeled gap instead of a visible
 * placeholder (RealCalendarView.tsx can only render what exists in `entries`). Pulled out as a
 * pure function (no I/O) so this exact layout logic is unit-testable without mocking the AI
 * provider or the database.
 */
export const buildWeekEntries = (params: {
  totalWeeks: number;
  skipWeeks: Set<number>;
  generatedWeeks: GeneratedWeek[];
  weekDates: { start_date: string; end_date: string }[];
  competencyIdByElement: Map<number, number>;
}): {
  entries: BuiltWeekEntry[];
  entryCriteriaNumbers: Record<string, string[]>;
  entryLoNumbers: Record<string, number>;
} => {
  const { totalWeeks, skipWeeks, generatedWeeks, weekDates, competencyIdByElement } = params;
  const entries: BuiltWeekEntry[] = [];
  const entryCriteriaNumbers: Record<string, string[]> = {};
  const entryLoNumbers: Record<string, number> = {};
  let contentIdx = 0;

  for (let slot = 1; slot <= totalWeeks; slot++) {
    const weekNumber = `Week ${slot}`;
    const dates = weekDates[slot - 1];

    if (skipWeeks.has(slot)) {
      entries.push({
        week_number: weekNumber,
        start_date: dates.start_date,
        end_date: dates.end_date,
        ...EMPTY_WEEK_FIELDS,
        entry_status: "SKIPPED",
      });
      continue;
    }

    if (contentIdx >= generatedWeeks.length) {
      // AI returned fewer weeks than requested -- leave the remaining slots as empty, clearly
      // PLANNED (not SKIPPED) rows for manual fill-in rather than truncating the timeline.
      entries.push({
        week_number: weekNumber,
        start_date: dates.start_date,
        end_date: dates.end_date,
        ...EMPTY_WEEK_FIELDS,
        entry_status: "PLANNED",
      });
      continue;
    }

    const w = generatedWeeks[contentIdx++];
    const competencyId =
      typeof w.lo_number === "number" ? competencyIdByElement.get(w.lo_number) ?? null : null;

    entries.push({
      week_number: weekNumber,
      start_date: dates.start_date,
      end_date: dates.end_date,
      topic: w.topic || "",
      sub_topic: w.sub_topic || "",
      objective: w.objective || "",
      methodology: w.methodology || "",
      resources: w.resources || "",
      evaluation: w.evaluation || "",
      duration: w.duration || "",
      learning_place: w.learning_place || "",
      observation: w.observation || "",
      competency_id: competencyId,
      entry_status: "PLANNED",
    });
    if (Array.isArray(w.criteria_numbers) && w.criteria_numbers.length > 0) {
      entryCriteriaNumbers[weekNumber] = w.criteria_numbers;
    }
    // Track the raw lo_number too (even when already resolved) so the deferred
    // curriculum-confirmation path (proposedCurriculum, not yet persisted) can re-resolve it once
    // real competency_ids exist, via /schemes/:schemeId/link-criteria.
    if (typeof w.lo_number === "number") {
      entryLoNumbers[weekNumber] = w.lo_number;
    }
  }

  return { entries, entryCriteriaNumbers, entryLoNumbers };
};

const processJob = async (
  jobId: string,
  file: Express.Multer.File | null,
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
    /** Set only when generating from the subject's already-saved Curriculum instead of an
     * uploaded document — which Elements/Performance Criteria were selected to be covered. */
    existingCurriculumRefs?: Map<number, Set<number>>;
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

    let rawText: string;
    let proposedCurriculum: ImportedElement[] | undefined;
    let criteriaForPrompt: { criteria_number: string; description: string }[] = [];
    let loListForPrompt: { loNumber: number; title: string }[] = [];
    let competencyIdByElement = new Map<number, number>();

    if (file) {
      const fullText = await extractTextFromFile(file);
      rawText = fullText;

      if (params.selectedContentRefs.size > 0) {
        const structure = extractCurriculumStructure(fullText);
        const blocks: string[] = [];
        loListForPrompt = structure.los
          .filter((lo) => params.selectedContentRefs.get(lo.loNumber)?.size)
          .map((lo) => ({ loNumber: lo.loNumber, title: lo.title }));

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
      if (params.shouldGenerateCurriculum) {
        updateJob(jobId, {
          status: "extracting_curriculum",
          message: "Extracting curriculum structure...",
          stepIndex: stepFor.extracting_curriculum,
          totalSteps,
        });
        proposedCurriculum = await generateCurriculumWithAI(
          rawText,
          params.subjectName,
        );
        criteriaForPrompt = proposedCurriculum.flatMap((el) =>
          el.criteria.map((c) => ({
            criteria_number: c.criteria_number,
            description: c.description,
          })),
        );
        // Curriculum isn't persisted yet — no real competency_id to resolve against. Still tag the
        // AI's lo_number using the proposal's own numbering so entryLoNumbers can be resolved once
        // the user confirms/saves the curriculum (see the "done" handler below).
        if (loListForPrompt.length === 0) {
          loListForPrompt = proposedCurriculum.map((el) => ({
            loNumber: el.element_number,
            title: el.title,
          }));
        }
      } else {
        const existingCriteria = await getSubjectCriteria(params.subjectId);
        criteriaForPrompt = existingCriteria.map((c) => ({
          criteria_number: c.criteria_number,
          description: c.description,
        }));
        // Subject already has real Curriculum — resolve lo_number -> competency_id immediately
        // once the AI responds, same as criteria_numbers below.
        const existingCompetencies = await db
          .select({
            competency_id: SubjectCompetency.competency_id,
            element_number: SubjectCompetency.element_number,
            title: SubjectCompetency.title,
          })
          .from(SubjectCompetency)
          .where(eq(SubjectCompetency.subject_id, params.subjectId));
        competencyIdByElement = new Map(
          existingCompetencies.map((c) => [c.element_number, c.competency_id]),
        );
        if (loListForPrompt.length === 0) {
          loListForPrompt = existingCompetencies.map((c) => ({
            loNumber: c.element_number,
            title: c.title,
          }));
        }
      }
    } else {
      // No file — generating from the subject's already-saved Curriculum, scoped to whichever
      // Elements/Performance Criteria the teacher selected in the "use existing curriculum" step.
      const built = await buildTextFromExistingCurriculum(
        params.subjectId,
        params.existingCurriculumRefs || new Map(),
      );
      rawText = built.rawText.slice(0, MAX_CURRICULUM_CHARS);
      criteriaForPrompt = built.criteriaForPrompt;
      loListForPrompt = built.loList;
      competencyIdByElement = built.competencyIdByElement;

      if (!rawText.trim()) {
        throw new ValidationError(
          "No Curriculum content found for the selected Elements/Performance Criteria.",
        );
      }
    }

    updateJob(jobId, {
      status: "analyzing",
      message: "Analyzing curriculum with AI...",
      stepIndex: stepFor.analyzing,
      totalSteps,
    });

    const generatedWeeks = await generateWeeks(
      rawText,
      contentCount,
      params.subjectName,
      params.additionalInstructions,
      criteriaForPrompt.length > 0
        ? criteriaForPrompt.map((c) => `${c.criteria_number}: ${c.description}`)
        : undefined,
      loListForPrompt.length > 0 ? loListForPrompt : undefined,
    );

    updateJob(jobId, {
      status: "structuring",
      message: "Structuring weekly plan...",
      stepIndex: stepFor.structuring,
      totalSteps,
    });

    const weekDates = computeWeekDates(termStart, totalWeeks);
    const { entries, entryCriteriaNumbers, entryLoNumbers } = buildWeekEntries({
      totalWeeks,
      skipWeeks,
      generatedWeeks,
      weekDates,
      competencyIdByElement,
    });

    updateJob(jobId, {
      status: "saving",
      message: "Saving to database...",
      stepIndex: stepFor.saving,
      totalSteps,
    });

    const sourceLabel = file ? file.originalname : "Existing Curriculum";

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
          ai_source_filename: sourceLabel,
        })
        .where(eq(SchemeOfWork.scheme_id, schemeId));
    } else {
      const schemeResult = await db.insert(SchemeOfWork).values({
        user_id: params.userId,
        subject_id: params.subjectId,
        class_group_id: params.classGroupId,
        academic_term_id: params.academicTermId,
        source: "AI_GENERATED",
        ai_source_filename: sourceLabel,
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
        ...(entry as any),
      });
    }

    await recordActivity(
      params.userId,
      "SCHEME_AI_GENERATE",
      `AI-generated scheme of work for subject ID ${params.subjectId} from "${sourceLabel}"`,
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
            entryLoNumbers,
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
    use_existing_curriculum,
    selected_criteria_refs,
  } = req.body;

  const usingExistingCurriculum =
    use_existing_curriculum === "true" || use_existing_curriculum === true;

  if (!req.file && !usingExistingCurriculum) {
    throw new ValidationError("No file uploaded");
  }

  const criteriaRefs = parseCriteriaRefs(selected_criteria_refs);
  if (usingExistingCurriculum && criteriaRefs.size === 0) {
    throw new ValidationError(
      "Select at least one Element or Performance Criteria to generate from",
    );
  }

  if (!isAnyProviderConfigured()) {
    throw new ValidationError(
      "AI scheme generation is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }

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
  // CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md §5.5. Never applies when
  // generating from an already-existing Curriculum — there's nothing left to extract.
  let shouldGenerateCurriculum = false;
  if (
    !usingExistingCurriculum &&
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
  processJob(jobId, usingExistingCurriculum ? null : req.file, {
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
    existingCurriculumRefs: usingExistingCurriculum ? criteriaRefs : undefined,
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
      entryLoNumbers: job.entryLoNumbers,
    });
  },
);

const singleEntrySchema: JSONSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    sub_topic: { type: "string" },
    objective: { type: "string" },
    methodology: { type: "string" },
    resources: { type: "string" },
    evaluation: { type: "string" },
    learning_place: { type: "string" },
    observation: { type: "string" },
    duration: { type: "string" },
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
  if (!isAnyProviderConfigured()) {
    throw new ValidationError(
      "AI suggestions are not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }

  const { subject_name, week_label, prompt } = req.body;
  if (!prompt || !String(prompt).trim()) {
    throw new ValidationError("A prompt is required");
  }

  const { data: parsed } = await generateStructuredContent<any>({
    schemaName: "scheme_entry",
    schema: singleEntrySchema,
    prompt: `You are an experienced, subject-matter-expert teacher of "${subject_name || "this subject"}",
personally planning a single week (${week_label || "this week"}) of your Scheme of Work.

The teacher's instructions for this week:
"""
${prompt}
"""

Follow those instructions to produce this week's entry. Provide: the topic (indicative content), an optional
sub-topic, a clear learning objective, the teaching methodology/activities, resources needed, the evaluation /
evidence of formative assessment, the learning place, and any observation notes. Keep each field concise (1-3
sentences) and write it the way a teacher who actually teaches this subject would — specific, not generic filler.`,
  });

  if (!parsed.topic) {
    throw new ValidationError(
      "The AI could not generate content from this prompt. Try adding more detail.",
    );
  }

  successResponse(res, "Entry content generated", parsed);
});
