import type { AiRouteMeta } from "./ai/personal/run";
import { scopeTid } from "../tenancy/scoped";

export type AILessonJobStatus =
  | "loading"
  | "analyzing"
  | "structuring"
  | "saving"
  | "done"
  | "error";

export interface AILessonJobState {
  userId: number;
  /** The school that created the job (MIS-ISO-7): user ids repeat across schools. */
  tid?: number;
  status: AILessonJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  lessonId?: number;
  error?: string;
  /** Which AI wrote the plan (school or the teacher's own key), for the "via …" chip. */
  ai?: AiRouteMeta | null;
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
    tid: scopeTid("AI job"),
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

export const getJob = (jobId: string): AILessonJobState | undefined => {
  // Another school's job with a colliding id is not this person's (MIS-ISO-7).
  const job = jobs.get(jobId);
  return job && job.tid === scopeTid("AI job") ? job : undefined;
};

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();
