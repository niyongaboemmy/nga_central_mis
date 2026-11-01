import { sql } from "drizzle-orm";
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
  /** Which app's feature asked (migration 122). */
  app?: string | null;
  /** Whose key answered: the school's env keys, or a user's own (migration 122). */
  route?: "school" | "personal";
  credential_id?: number | null;
  occurred_at: Date;
}

let disabled = false;
// Migration 122 not applied yet: write the original columns only.
let legacyColumns = false;

/**
 * One row per provider attempt (LESSON_STUDIO plan §7.4). Fire-and-forget: logging must
 * never slow down or fail a generation. If the table is missing (migration 096 not yet
 * applied) logging switches itself off for the life of the process.
 */
export function logAIUsage(row: AIUsageRow): void {
  if (disabled) return;
  if (legacyColumns) return void writeLegacy(row).catch(onWriteError);
  db.insert(AIUsageLog)
    .values({
      feature: row.feature.slice(0, 60),
      app: row.app ?? null,
      route: row.route ?? "school",
      credential_id: row.credential_id ?? null,
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
      if (error?.code === "ER_BAD_FIELD_ERROR") {
        legacyColumns = true;
        logger.warn("[ai] AIUsageLog has no app/route columns — apply migration 122; logging without them meanwhile");
        return writeLegacy(row).catch(onWriteError);
      }
      onWriteError(error);
    });
}

function onWriteError(error: any): void {
  if (error?.code === "ER_NO_SUCH_TABLE") {
    disabled = true;
    logger.warn("[ai] AIUsageLog table missing — usage logging disabled until migration 096 is applied");
    return;
  }
  logger.warn("[ai] usage log write failed", { error: error?.message });
}

function writeLegacy(row: AIUsageRow) {
  // Personal-key calls are left out: before migration 122 they would count against the
  // school's own daily quota (limiter.ts counts every row per provider).
  if (row.route === "personal") return Promise.resolve();
  const n = (v: number | null | undefined) => (Number.isFinite(v) ? v! : null);
  return db.execute(sql`
    INSERT INTO AIUsageLog (feature, role, bulk, provider, model, ok, error_class, latency_ms, input_tokens, output_tokens, actor_user_id, course_id, run_id, occurred_at)
    VALUES (${row.feature.slice(0, 60)}, ${row.role ?? null}, ${row.bulk ? 1 : 0}, ${row.provider}, ${row.model?.slice(0, 80) ?? null}, ${row.ok ? 1 : 0},
            ${row.error_class ?? null}, ${row.latency_ms ?? null}, ${n(row.input_tokens)}, ${n(row.output_tokens)},
            ${row.actor_user_id ?? null}, ${row.course_id ?? null}, ${row.run_id ?? null}, ${row.occurred_at})`);
}

export function isUsageLogDisabled(): boolean {
  return disabled;
}
