import { ImportedElement } from "./curriculumImportJobStore";

export type AISchemeJobStatus =
  | "parsing"
  | "extracting_curriculum"
  | "analyzing"
  | "structuring"
  | "saving"
  | "done"
  | "error";

export interface AISchemeJobState {
  userId: number;
  status: AISchemeJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  schemeId?: number;
  entriesCount?: number;
  error?: string;
  updatedAt: number;
  /** Set when curriculum generation was requested and ran (subject had none) — awaiting the
   * user's confirm/skip decision, reusing the "Import from Curriculum" preview+confirm flow. */
  proposedCurriculum?: ImportedElement[];
  curriculumSubjectHadNone?: boolean;
  /** Criteria numbers the AI attached to each generated week, keyed by week_number. Only present
   * when proposedCurriculum also is — resolved into real SchemeEntryCriteria links by the
   * frontend via /schemes/:schemeId/link-criteria once the curriculum proposal is confirmed. */
  entryCriteriaNumbers?: Record<string, string[]>;
  /** Set when the subject already had Curriculum at generation time — criteria links were
   * resolved and saved immediately, no confirmation step needed. */
  autoTaggedCriteriaCount?: number;
}

// Step numbering is intentionally NOT derived from this static map when curriculum generation is
// involved — processJob passes explicit stepIndex/totalSteps in that case, since the step count
// is conditional (4 steps normally, 5 when the "extracting_curriculum" step runs).
const STEP_INDEX: Record<AISchemeJobStatus, number> = {
  parsing: 1,
  extracting_curriculum: 2,
  analyzing: 2,
  structuring: 3,
  saving: 4,
  done: 4,
  error: 0,
};

const TOTAL_STEPS = 4;
const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map<string, AISchemeJobState>();

export const createJob = (jobId: string, userId: number): void => {
  jobs.set(jobId, {
    userId,
    status: "parsing",
    stepIndex: STEP_INDEX.parsing,
    totalSteps: TOTAL_STEPS,
    message: "Reading document...",
    updatedAt: Date.now(),
  });
};

export const updateJob = (
  jobId: string,
  update: Partial<Omit<AISchemeJobState, "userId" | "updatedAt">>,
): void => {
  const existing = jobs.get(jobId);
  if (!existing) return;
  const status = update.status ?? existing.status;
  jobs.set(jobId, {
    ...existing,
    ...update,
    stepIndex: update.stepIndex ?? STEP_INDEX[status],
    updatedAt: Date.now(),
  });
};

export const getJob = (jobId: string): AISchemeJobState | undefined =>
  jobs.get(jobId);

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();
