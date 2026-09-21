import { db } from "../db";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  CompetencyPerformanceCriteria,
  LessonNoteCriteria,
  Subject,
  SubjectCompetency,
} from "../db/schema";
import { ValidationError } from "../errors/CustomError";

// A note's curriculum coverage: the performance criteria it addresses, grouped under
// their Learning Outcome ("element"/competency). A whole outcome selected in the picker
// is simply every criterion under it -- nothing is stored at the outcome level, so the
// coverage stays exact when criteria are later added to or removed from an outcome.
export interface CurriculumCriterion {
  criteria_id: number;
  criteria_number: string;
  description: string;
}

export interface CurriculumOutcome {
  competency_id: number;
  element_number: number;
  title: string;
  description: string | null;
  indicative_content: string | null;
  learning_hours: number | null;
  /** Total criteria under this outcome -- lets the UI say "3 of 5" / "whole outcome". */
  total_criteria: number;
  criteria: CurriculumCriterion[];
}

export interface CurriculumSelection {
  subjectId: number;
  subjectName: string;
  outcomes: CurriculumOutcome[];
  criteriaIds: number[];
}

/** Parses the `criteria_ids` a client sends: a real array (JSON body) or, from a
 *  multipart form, a JSON-encoded array / comma-separated string / repeated field. */
export const parseCriteriaIds = (raw: unknown): number[] => {
  if (raw == null || raw === "") return [];
  let values: unknown[] = [];
  if (Array.isArray(raw)) values = raw;
  else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        values = JSON.parse(trimmed);
      } catch {
        throw new ValidationError("criteria_ids must be a JSON array of ids");
      }
    } else values = trimmed.split(",");
  } else values = [raw];
  const ids = values.map((v) => parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
};

/** Loads and validates a set of criteria for one subject, grouped by outcome in curriculum
 *  order. Every id must exist and belong to `subjectId` -- a note can't quietly claim to
 *  cover another subject's curriculum. */
export async function loadCurriculumSelection(
  subjectId: number,
  criteriaIds: number[],
): Promise<CurriculumSelection> {
  const [subject] = await db
    .select({ subject_id: Subject.subject_id, name: Subject.name })
    .from(Subject)
    .where(eq(Subject.subject_id, subjectId))
    .limit(1);
  if (!subject) throw new ValidationError("Subject not found");

  if (criteriaIds.length === 0) {
    return { subjectId, subjectName: subject.name, outcomes: [], criteriaIds: [] };
  }

  const rows = await db
    .select({
      criteria_id: CompetencyPerformanceCriteria.criteria_id,
      criteria_number: CompetencyPerformanceCriteria.criteria_number,
      description: CompetencyPerformanceCriteria.description,
      competency: SubjectCompetency,
    })
    .from(CompetencyPerformanceCriteria)
    .innerJoin(SubjectCompetency, eq(CompetencyPerformanceCriteria.competency_id, SubjectCompetency.competency_id))
    .where(
      and(
        inArray(CompetencyPerformanceCriteria.criteria_id, criteriaIds),
        eq(SubjectCompetency.subject_id, subjectId),
      ),
    )
    .orderBy(
      asc(SubjectCompetency.sort_order),
      asc(SubjectCompetency.element_number),
      asc(CompetencyPerformanceCriteria.sort_order),
      asc(CompetencyPerformanceCriteria.criteria_number),
    );

  if (rows.length !== criteriaIds.length) {
    throw new ValidationError("One or more selected performance criteria don't belong to this subject's curriculum");
  }

  const competencyIds = [...new Set(rows.map((r) => r.competency.competency_id))];
  const totals = await db
    .select({
      competency_id: CompetencyPerformanceCriteria.competency_id,
      criteria_id: CompetencyPerformanceCriteria.criteria_id,
    })
    .from(CompetencyPerformanceCriteria)
    .where(inArray(CompetencyPerformanceCriteria.competency_id, competencyIds));
  const totalByCompetency = new Map<number, number>();
  for (const t of totals) totalByCompetency.set(t.competency_id, (totalByCompetency.get(t.competency_id) || 0) + 1);

  const outcomes: CurriculumOutcome[] = [];
  const byCompetency = new Map<number, CurriculumOutcome>();
  for (const r of rows) {
    let outcome = byCompetency.get(r.competency.competency_id);
    if (!outcome) {
      outcome = {
        competency_id: r.competency.competency_id,
        element_number: r.competency.element_number,
        title: r.competency.title,
        description: r.competency.description,
        indicative_content: r.competency.indicative_content,
        learning_hours: r.competency.learning_hours,
        total_criteria: totalByCompetency.get(r.competency.competency_id) || 0,
        criteria: [],
      };
      byCompetency.set(r.competency.competency_id, outcome);
      outcomes.push(outcome);
    }
    outcome.criteria.push({ criteria_id: r.criteria_id, criteria_number: r.criteria_number, description: r.description });
  }

  return { subjectId, subjectName: subject.name, outcomes, criteriaIds: rows.map((r) => r.criteria_id) };
}

/** Replaces a note's coverage with exactly these criteria. */
export async function setNoteCriteria(noteId: number, criteriaIds: number[]): Promise<void> {
  await db.delete(LessonNoteCriteria).where(eq(LessonNoteCriteria.note_id, noteId));
  if (criteriaIds.length === 0) return;
  await db.insert(LessonNoteCriteria).values(criteriaIds.map((criteria_id) => ({ note_id: noteId, criteria_id })));
}

export async function loadNoteCriteriaIds(noteId: number): Promise<number[]> {
  const rows = await db
    .select({ criteria_id: LessonNoteCriteria.criteria_id })
    .from(LessonNoteCriteria)
    .where(eq(LessonNoteCriteria.note_id, noteId));
  return rows.map((r) => r.criteria_id);
}

/** The grouped coverage of an existing note, for the editor banner and AI grounding. */
export async function loadNoteCurriculumContext(
  noteId: number,
  subjectId: number,
): Promise<CurriculumSelection | null> {
  const ids = await loadNoteCriteriaIds(noteId);
  if (ids.length === 0) return null;
  // Criteria may have been deleted from the curriculum since; ignore them rather than
  // failing the whole note load.
  try {
    return await loadCurriculumSelection(subjectId, ids);
  } catch {
    const rows = await db
      .select({ criteria_id: CompetencyPerformanceCriteria.criteria_id })
      .from(CompetencyPerformanceCriteria)
      .innerJoin(SubjectCompetency, eq(CompetencyPerformanceCriteria.competency_id, SubjectCompetency.competency_id))
      .where(and(inArray(CompetencyPerformanceCriteria.criteria_id, ids), eq(SubjectCompetency.subject_id, subjectId)));
    const valid = rows.map((r) => r.criteria_id);
    return valid.length ? loadCurriculumSelection(subjectId, valid) : null;
  }
}

/** The prompt block the AI is grounded in -- one section per outcome, criteria listed
 *  underneath, and whether the whole outcome or only part of it is in scope. */
export const buildCurriculumBlockFromSelection = (selection: CurriculumSelection): string =>
  [
    `Subject: ${selection.subjectName}`,
    ...selection.outcomes.map((o) => {
      const whole = o.criteria.length >= o.total_criteria;
      return [
        `Learning Outcome ${o.element_number}: ${o.title}${whole ? " (whole outcome)" : ` (${o.criteria.length} of ${o.total_criteria} performance criteria)`}`,
        o.description ? `Description: ${o.description}` : "",
        o.indicative_content ? `Indicative content: ${o.indicative_content}` : "",
        "Performance criteria to prepare notes for:",
        ...o.criteria.map((c) => `- ${c.criteria_number}: ${c.description}`),
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n\n");
