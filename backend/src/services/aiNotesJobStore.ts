import type { AiRouteMeta } from "./ai/personal/run";
import { scopeTid } from "../tenancy/scoped";

export type AINotesJobStatus =
  | "loading"
  | "analyzing"
  | "structuring"
  | "saving"
  | "done"
  | "error";

export interface AINotesJobState {
  userId: number;
  /** The school that created the job (MIS-ISO-7): user ids repeat across schools. */
  tid?: number;
  status: AINotesJobStatus;
  stepIndex: number;
  totalSteps: number;
  message: string;
  noteId?: number;
  error?: string;
  /** Which AI provider actually answered (gemini/groq/deepseek/openrouter/glm) — set once known, mainly for
   * debugging fallback behavior; omitted from the message text on the common path (gemini). */
  providerUsed?: string;
  /** Which AI wrote the note (school or the teacher's own key), for the "via …" chip. */
  ai?: AiRouteMeta | null;
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
    tid: scopeTid("AI job"),
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

export const getJob = (jobId: string): AINotesJobState | undefined => {
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
