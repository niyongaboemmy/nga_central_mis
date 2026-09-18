import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  SchemeOfWork,
  SchemeOfWorkEntry,
  SchemeEntryCriteria,
  SubjectCompetency,
  CompetencyPerformanceCriteria,
} from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { assertTeacherOwnsScheme } from "../utils/schemeAuthorization";
import logger from "../utils/logger";
import {
  generateStructuredContent,
  isAnyProviderConfigured,
  JSONSchema,
} from "../services/aiProviders";

/** Fetches a subject's Performance Criteria (number + description), joined through its Elements. */
export const getSubjectCriteria = async (subjectId: number) => {
  return db
    .select({
      criteria_id: CompetencyPerformanceCriteria.criteria_id,
      criteria_number: CompetencyPerformanceCriteria.criteria_number,
      description: CompetencyPerformanceCriteria.description,
    })
    .from(CompetencyPerformanceCriteria)
    .innerJoin(
      SubjectCompetency,
      eq(CompetencyPerformanceCriteria.competency_id, SubjectCompetency.competency_id),
    )
    .where(eq(SubjectCompetency.subject_id, subjectId));
};

const fetchSchemeForEntry = async (entryId: number) => {
  const [entry] = await db
    .select({
      entry_id: SchemeOfWorkEntry.entry_id,
      scheme_id: SchemeOfWorkEntry.scheme_id,
    })
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.entry_id, entryId))
    .limit(1);

  if (!entry) {
    throw new NotFoundError("Scheme entry not found");
  }

  const [scheme] = await db
    .select()
    .from(SchemeOfWork)
    .where(eq(SchemeOfWork.scheme_id, entry.scheme_id))
    .limit(1);

  if (!scheme) {
    throw new NotFoundError("Scheme of work not found");
  }

  return { entry, scheme };
};

/**
 * Replaces the full set of Performance Criteria linked to a scheme entry — the save action behind
 * the manual multi-select in the entry modal (also used to persist AI "Suggest Criteria" results
 * once the teacher confirms them).
 */
export const replaceEntryCriteria = asyncHandler(async (req: any, res: any) => {
  const entryId = parseInt(req.params.id);
  const { criteria_ids } = req.body;

  if (!Array.isArray(criteria_ids)) {
    throw new ValidationError("criteria_ids must be an array (can be empty)");
  }

  const { entry, scheme } = await fetchSchemeForEntry(entryId);

  await assertTeacherOwnsScheme(
    req.user.userId,
    scheme.subject_id,
    scheme.class_group_id,
    scheme.academic_term_id,
  );

  const ids = criteria_ids.map((c: any) => parseInt(c)).filter((n: number) => !isNaN(n));

  if (ids.length > 0) {
    // Validate every ID actually belongs to this entry's subject, so an entry can't be tagged
    // with another subject's criteria by a malformed/tampered request.
    const validCriteria = await getSubjectCriteria(scheme.subject_id);
    const validIds = new Set(validCriteria.map((c) => c.criteria_id));
    if (ids.some((id) => !validIds.has(id))) {
      throw new ValidationError(
        "One or more criteria do not belong to this entry's subject",
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(SchemeEntryCriteria)
      .where(eq(SchemeEntryCriteria.entry_id, entry.entry_id));

    for (const criteriaId of ids) {
      await tx.insert(SchemeEntryCriteria).values({
        entry_id: entry.entry_id,
        criteria_id: criteriaId,
      });
    }
  });

  successResponse(res, "Entry criteria updated", { criteria_ids: ids });
});

const suggestionSchema: JSONSchema = {
  type: "object",
  properties: {
    criteria_numbers: { type: "array", items: { type: "string" } },
  },
  required: ["criteria_numbers"],
};

/**
 * AI-powered matching (stateless — doesn't persist) for a single scheme entry's free-text content
 * against the subject's Curriculum Performance Criteria. Used by the entry modal's "Suggest
 * Criteria" action for manually-authored/edited entries — the primary mechanism from
 * CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md §4, since exact/keyword matching between
 * independently-authored texts does not work reliably.
 */
export const suggestEntryCriteria = asyncHandler(async (req: any, res: any) => {
  const { subject_id, topic, sub_topic, objective, methodology } = req.body;
  const subjectId = parseInt(subject_id);

  if (!subjectId) {
    throw new ValidationError("subject_id is required");
  }
  if (!topic?.trim() && !objective?.trim()) {
    throw new ValidationError("At least a topic or objective is required to suggest criteria");
  }

  const criteria = await getSubjectCriteria(subjectId);
  if (criteria.length === 0) {
    return successResponse(res, "No curriculum criteria to match against", {
      criteria: [],
    });
  }

  if (!isAnyProviderConfigured()) {
    throw new ValidationError(
      "AI matching is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }

  const criteriaList = criteria
    .map((c) => `${c.criteria_number}: ${c.description}`)
    .join("\n");

  let matchedNumbers: string[] = [];
  try {
    const { data: parsed } = await generateStructuredContent<{ criteria_numbers?: any[] }>({
      schemaName: "criteria_suggestion",
      schema: suggestionSchema,
      prompt: `A teacher wrote the following Scheme of Work entry for one week of a subject:

Topic: ${topic || "(none)"}
Sub-topic: ${sub_topic || "(none)"}
Objective: ${objective || "(none)"}
Methodology: ${methodology || "(none)"}

Here is the subject's official list of Curriculum Performance Criteria (number: description):
"""
${criteriaList}
"""

Judge which of these Performance Criteria (if any) this week's entry genuinely addresses, based on
meaning — the entry's wording will NOT match the criteria's wording exactly (they were written
independently), so use your understanding of the subject matter, not text similarity. It is
completely fine to return an empty list if nothing genuinely corresponds — do not force a match.
Return only the criteria_number values (e.g. "1.1", "2.3") of genuine matches.`,
    });
    matchedNumbers = Array.isArray(parsed.criteria_numbers)
      ? parsed.criteria_numbers.map((n: any) => String(n).trim())
      : [];
  } catch (err) {
    logger.warn("Failed to parse AI criteria suggestion response", {
      error: (err as Error).message,
    });
  }

  const matched = criteria.filter((c) => matchedNumbers.includes(c.criteria_number));

  successResponse(res, "Criteria suggested", { criteria: matched });
});

/**
 * Bulk-resolves criteria_numbers (keyed by week_number) into real criteria_id links for every
 * entry in a scheme, against whatever Performance Criteria the subject currently has. Shared by:
 *  - `linkSchemeCriteria` below (HTTP endpoint, called once the subject's Curriculum has been
 *    confirmed/saved after being proposed alongside AI generation), and
 *  - `schemeAIController.ts`'s `processJob` (called immediately, in-process, when the subject
 *    already had Curriculum at generation time — no confirmation step needed).
 * Silently skips any week/criteria_number combination that can't be resolved (e.g. the teacher
 * edited a criteria number during the curriculum preview) rather than failing the whole batch.
 */
export const resolveAndLinkCriteria = async (
  schemeId: number,
  subjectId: number,
  entryCriteriaNumbers: Record<string, string[]>,
): Promise<number> => {
  const entries = await db
    .select({
      entry_id: SchemeOfWorkEntry.entry_id,
      week_number: SchemeOfWorkEntry.week_number,
    })
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));

  const entryIdByWeek = new Map(entries.map((e) => [e.week_number, e.entry_id]));

  const criteria = await getSubjectCriteria(subjectId);
  const criteriaIdByNumber = new Map(criteria.map((c) => [c.criteria_number, c.criteria_id]));

  let linkedCount = 0;
  await db.transaction(async (tx) => {
    for (const [weekNumber, criteriaNumbers] of Object.entries(entryCriteriaNumbers)) {
      const entryId = entryIdByWeek.get(weekNumber);
      if (!entryId || !Array.isArray(criteriaNumbers)) continue;

      for (const num of criteriaNumbers) {
        const criteriaId = criteriaIdByNumber.get(String(num).trim());
        if (!criteriaId) continue;

        await tx
          .insert(SchemeEntryCriteria)
          .ignore()
          .values({ entry_id: entryId, criteria_id: criteriaId });
        linkedCount++;
      }
    }
  });

  return linkedCount;
};

/**
 * Resolves lo_number (Learning Outcome ordinal, e.g. "Learning Outcome 2") tags the AI attached to
 * each generated week into real SchemeOfWorkEntry.competency_id links, keyed by week_number.
 * Mirrors `resolveAndLinkCriteria` above, one grain up: an LO number maps to SubjectCompetency via
 * its element_number, matching how `extractCurriculumStructure`/curriculum generation number LOs.
 * Silently skips any week/lo_number combination that can't be resolved rather than failing the
 * whole batch (e.g. the teacher edited the curriculum preview and an LO number no longer exists).
 */
export const resolveAndLinkCompetencies = async (
  schemeId: number,
  subjectId: number,
  entryLoNumbers: Record<string, number>,
): Promise<number> => {
  const entries = await db
    .select({
      entry_id: SchemeOfWorkEntry.entry_id,
      week_number: SchemeOfWorkEntry.week_number,
    })
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));

  const entryIdByWeek = new Map(entries.map((e) => [e.week_number, e.entry_id]));

  const competencies = await db
    .select({
      competency_id: SubjectCompetency.competency_id,
      element_number: SubjectCompetency.element_number,
    })
    .from(SubjectCompetency)
    .where(eq(SubjectCompetency.subject_id, subjectId));

  const competencyIdByElement = new Map(
    competencies.map((c) => [c.element_number, c.competency_id]),
  );

  let linkedCount = 0;
  await db.transaction(async (tx) => {
    for (const [weekNumber, loNumber] of Object.entries(entryLoNumbers)) {
      const entryId = entryIdByWeek.get(weekNumber);
      const competencyId = competencyIdByElement.get(Number(loNumber));
      if (!entryId || !competencyId) continue;

      await tx
        .update(SchemeOfWorkEntry)
        .set({ competency_id: competencyId })
        .where(eq(SchemeOfWorkEntry.entry_id, entryId));
      linkedCount++;
    }
  });

  return linkedCount;
};

/**
 * HTTP entry point for `resolveAndLinkCriteria`/`resolveAndLinkCompetencies`, used by the frontend
 * once the subject's Curriculum has been confirmed/saved after being proposed alongside AI
 * generation (see CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md §4.1/§5.1).
 */
export const linkSchemeCriteria = asyncHandler(async (req: any, res: any) => {
  const schemeId = parseInt(req.params.schemeId);
  const { subjectId, entryCriteriaNumbers, entryLoNumbers } = req.body;

  if (
    !subjectId ||
    ((!entryCriteriaNumbers || typeof entryCriteriaNumbers !== "object") &&
      (!entryLoNumbers || typeof entryLoNumbers !== "object"))
  ) {
    throw new ValidationError(
      "subjectId and at least one of entryCriteriaNumbers/entryLoNumbers are required",
    );
  }

  const [scheme] = await db
    .select()
    .from(SchemeOfWork)
    .where(eq(SchemeOfWork.scheme_id, schemeId))
    .limit(1);

  if (!scheme) {
    throw new NotFoundError("Scheme of work not found");
  }
  if (scheme.subject_id !== parseInt(subjectId)) {
    throw new ValidationError("subjectId does not match this scheme");
  }

  await assertTeacherOwnsScheme(
    req.user.userId,
    scheme.subject_id,
    scheme.class_group_id,
    scheme.academic_term_id,
  );

  const linkedCount =
    entryCriteriaNumbers && typeof entryCriteriaNumbers === "object"
      ? await resolveAndLinkCriteria(schemeId, scheme.subject_id, entryCriteriaNumbers)
      : 0;

  const linkedCompetencyCount =
    entryLoNumbers && typeof entryLoNumbers === "object"
      ? await resolveAndLinkCompetencies(schemeId, scheme.subject_id, entryLoNumbers)
      : 0;

  successResponse(res, "Criteria linked to scheme entries", {
    linkedCount,
    linkedCompetencyCount,
  });
});

const MAX_BULK_ENTRIES = 60;

const bulkSuggestionSchema: JSONSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week_number: { type: "string" },
          criteria_numbers: { type: "array", items: { type: "string" } },
        },
        required: ["week_number", "criteria_numbers"],
      },
    },
  },
  required: ["matches"],
};

/**
 * Bulk AI-powered criteria matching for an ALREADY-EXISTING Scheme of Work — the missing piece
 * flagged after shipping generation-time auto-tagging: matching should also be available on
 * demand for content and curriculum that already existed before this feature, not only at the
 * moment a scheme is first AI-generated. One Gemini call covers every target entry (cheaper/
 * faster than looping `suggestEntryCriteria` per entry). By default only tags entries that have
 * no criteria links yet; pass `overwrite: true` to re-match everything.
 */
export const bulkSuggestCriteria = asyncHandler(async (req: any, res: any) => {
  const schemeId = parseInt(req.params.schemeId);
  const overwrite = req.body?.overwrite === true;

  const [scheme] = await db
    .select()
    .from(SchemeOfWork)
    .where(eq(SchemeOfWork.scheme_id, schemeId))
    .limit(1);

  if (!scheme) {
    throw new NotFoundError("Scheme of work not found");
  }

  await assertTeacherOwnsScheme(
    req.user.userId,
    scheme.subject_id,
    scheme.class_group_id,
    scheme.academic_term_id,
  );

  const criteria = await getSubjectCriteria(scheme.subject_id);
  if (criteria.length === 0) {
    throw new ValidationError(
      "This subject has no Curriculum Performance Criteria to match against yet.",
    );
  }

  if (!isAnyProviderConfigured()) {
    throw new ValidationError(
      "AI matching is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }

  const entries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, schemeId))
    .orderBy(SchemeOfWorkEntry.start_date);

  if (entries.length === 0) {
    return successResponse(res, "No entries to match", {
      taggedCount: 0,
      entriesProcessed: 0,
    });
  }

  const existingLinks = await db
    .select({ entry_id: SchemeEntryCriteria.entry_id })
    .from(SchemeEntryCriteria)
    .where(
      inArray(
        SchemeEntryCriteria.entry_id,
        entries.map((e) => e.entry_id),
      ),
    );
  const alreadyTagged = new Set(existingLinks.map((l) => l.entry_id));

  const targets = (overwrite ? entries : entries.filter((e) => !alreadyTagged.has(e.entry_id)))
    .slice(0, MAX_BULK_ENTRIES);

  if (targets.length === 0) {
    return successResponse(res, "All entries already have criteria linked", {
      taggedCount: 0,
      entriesProcessed: 0,
    });
  }

  const entriesText = targets
    .map(
      (e) =>
        `week_number="${e.week_number}"\nTopic: ${e.topic || ""}\nSub-topic: ${e.sub_topic || ""}\nObjective: ${e.objective || ""}\nMethodology: ${e.methodology || ""}`,
    )
    .join("\n\n");

  const criteriaList = criteria
    .map((c) => `${c.criteria_number}: ${c.description}`)
    .join("\n");

  const entryCriteriaNumbers: Record<string, string[]> = {};
  try {
    const { data: parsed } = await generateStructuredContent<{ matches?: any[] }>({
      schemaName: "bulk_criteria_suggestion",
      schema: bulkSuggestionSchema,
      prompt: `A teacher's existing Scheme of Work has the following weekly entries:
"""
${entriesText}
"""

Here is the subject's official list of Curriculum Performance Criteria (number: description):
"""
${criteriaList}
"""

For EACH entry above, judge which Performance Criteria (if any) it genuinely addresses, based on
meaning — the entry's wording will NOT match the criteria's wording exactly (they were written
independently), so use your understanding of the subject matter, not text similarity. It's normal
and expected for an entry to match zero, one, or a few — never force a match that doesn't
genuinely fit. Return one result per entry, identified by its exact week_number, with the matching
criteria_number values (e.g. "1.1", "2.3").`,
    });
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
    for (const m of matches) {
      if (m?.week_number && Array.isArray(m.criteria_numbers)) {
        entryCriteriaNumbers[String(m.week_number)] = m.criteria_numbers.map((n: any) =>
          String(n).trim(),
        );
      }
    }
  } catch (err) {
    logger.warn("Failed to parse bulk AI criteria suggestion response", {
      error: (err as Error).message,
    });
  }

  if (overwrite) {
    const targetIds = targets.map((e) => e.entry_id);
    await db.delete(SchemeEntryCriteria).where(inArray(SchemeEntryCriteria.entry_id, targetIds));
  }

  const taggedCount = await resolveAndLinkCriteria(
    schemeId,
    scheme.subject_id,
    entryCriteriaNumbers,
  );

  successResponse(res, "Bulk criteria matching complete", {
    taggedCount,
    entriesProcessed: targets.length,
  });
});
