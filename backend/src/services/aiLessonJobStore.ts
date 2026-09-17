export type AILessonJobStatus =
  | "loading"
  | "analyzing"
  | "structuring"
  | "saving"
  | "done"
  | "error";

export interface AILessonJobState {
  userId: number;
  status: AILessonJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  lessonId?: number;
  error?: string;
  updatedAt: number;
}

const STEP_INDEX: Record<AILessonJobStatus, number> = {
  loading: 1,
  analyzing: 2,
  structuring: 3,
  saving: 4,
  done: 4,
  error: 0,
};

const TOTAL_STEPS = 4;
const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map<string, AILessonJobState>();

export const createJob = (jobId: string, userId: number): void => {
  jobs.set(jobId, {
    userId,
    status: "loading",
    stepIndex: STEP_INDEX.loading,
    totalSteps: TOTAL_STEPS,
    message: "Loading week context...",
    updatedAt: Date.now(),
  });
};

export const updateJob = (
  jobId: string,
  update: Partial<Omit<AILessonJobState, "userId" | "updatedAt">>,
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

export const getJob = (jobId: string): AILessonJobState | undefined =>
  jobs.get(jobId);

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();
