export type CurriculumImportJobStatus =
  | "parsing"
  | "analyzing"
  | "structuring"
  | "done"
  | "error";

export interface ImportedCriteria {
  criteria_number: string;
  description: string;
}

export interface ImportedElement {
  element_number: number;
  title: string;
  description: string;
  learning_hours: number | null;
  indicative_content: string;
  criteria: ImportedCriteria[];
}

export interface CurriculumImportJobState {
  userId: number;
  subjectId: number;
  status: CurriculumImportJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  sourceFilename?: string;
  elements?: ImportedElement[];
  error?: string;
  updatedAt: number;
}

const STEP_INDEX: Record<CurriculumImportJobStatus, number> = {
  parsing: 1,
  analyzing: 2,
  structuring: 3,
  done: 3,
  error: 0,
};

const TOTAL_STEPS = 3;
const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map<string, CurriculumImportJobState>();

export const createImportJob = (
  jobId: string,
  userId: number,
  subjectId: number,
): void => {
  jobs.set(jobId, {
    userId,
    subjectId,
    status: "parsing",
    stepIndex: STEP_INDEX.parsing,
    totalSteps: TOTAL_STEPS,
    message: "Reading document...",
    updatedAt: Date.now(),
  });
};

export const updateImportJob = (
  jobId: string,
  update: Partial<
    Omit<CurriculumImportJobState, "userId" | "subjectId" | "updatedAt">
  >,
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

export const getImportJob = (
  jobId: string,
): CurriculumImportJobState | undefined => jobs.get(jobId);

export const deleteImportJob = (jobId: string): void => {
  jobs.delete(jobId);
};

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();
