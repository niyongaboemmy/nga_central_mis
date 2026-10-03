export type AINotesJobStatus =
  | "loading"
  | "analyzing"
  | "structuring"
  | "saving"
  | "done"
  | "error";

export interface AINotesJobState {
  userId: number;
  status: AINotesJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  noteId?: number;
  error?: string;
  /** Which AI provider actually answered (gemini/groq/deepseek/openrouter/glm) — set once known, mainly for
   * debugging fallback behavior; omitted from the message text on the common path (gemini). */
  providerUsed?: string;
  updatedAt: number;
}

const STEP_INDEX: Record<AINotesJobStatus, number> = {
  loading: 1,
  analyzing: 2,
  structuring: 3,
  saving: 4,
  done: 4,
  error: 0,
};

const TOTAL_STEPS = 4;
const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map<string, AINotesJobState>();

export const createJob = (jobId: string, userId: number): void => {
  jobs.set(jobId, {
    userId,
    status: "loading",
    stepIndex: STEP_INDEX.loading,
    totalSteps: TOTAL_STEPS,
    message: "Loading curriculum context...",
    updatedAt: Date.now(),
  });
};

export const updateJob = (
  jobId: string,
  update: Partial<Omit<AINotesJobState, "userId" | "updatedAt">>,
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

export const getJob = (jobId: string): AINotesJobState | undefined =>
  jobs.get(jobId);

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(jobId);
  }
}, 5 * 60 * 1000).unref();
