import { db } from "../../db";
import { AIUsageLog } from "../../db/schema";
import logger from "../../utils/logger";

export interface AIUsageRow {
  feature: string;
  role?: string | null;
  bulk?: boolean;
  provider: string;
  model?: string | null;
  ok: boolean;
  error_class?: string | null;
  latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  actor_user_id?: number | null;
  course_id?: number | null;
  run_id?: number | null;
  occurred_at: Date;
}

let disabled = false;

/**
 * One row per provider attempt (LESSON_STUDIO plan §7.4). Fire-and-forget: logging must
 * never slow down or fail a generation. If the table is missing (migration 096 not yet
 * applied) logging switches itself off for the life of the process.
 */
export function logAIUsage(row: AIUsageRow): void {
  if (disabled) return;
  db.insert(AIUsageLog)
    .values({
      feature: row.feature.slice(0, 60),
      role: row.role ?? null,
      bulk: row.bulk ? 1 : 0,
      provider: row.provider,
      model: row.model?.slice(0, 80) ?? null,
      ok: row.ok ? 1 : 0,
      error_class: row.error_class ?? null,
      latency_ms: row.latency_ms ?? null,
      input_tokens: Number.isFinite(row.input_tokens) ? row.input_tokens! : null,
      output_tokens: Number.isFinite(row.output_tokens) ? row.output_tokens! : null,
      actor_user_id: row.actor_user_id ?? null,
      course_id: row.course_id ?? null,
      run_id: row.run_id ?? null,
      occurred_at: row.occurred_at,
    })
    .catch((error: any) => {
      if (error?.code === "ER_NO_SUCH_TABLE") {
        disabled = true;
        logger.warn("[ai] AIUsageLog table missing — usage logging disabled until migration 096 is applied");
        return;
      }
      logger.warn("[ai] usage log write failed", { error: error?.message });
    });
}

export function isUsageLogDisabled(): boolean {
  return disabled;
}
