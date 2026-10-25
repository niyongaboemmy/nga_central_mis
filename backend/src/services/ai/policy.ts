import { sql } from "drizzle-orm";
import { db } from "../../db";
import { CustomError, ValidationError } from "../../errors/CustomError";
import { recordActivity } from "../../utils/activityLogger";
import logger from "../../utils/logger";
import {
  AI_APPS,
  AI_POLICY_DEFAULT,
  AI_REASON_MESSAGES,
  aiAppEnabled,
  normalizeAiPolicy,
  type AiApp,
  type AiPolicy,
  type AiReason,
} from "../../vendor/nga-access";

/**
 * The school-wide AI policy (AI_USAGE_CONTROL_PLAN.md §4): PlatformSetting row
 * 'ai_policy' (migration 121), owned by the MIS and read by every other app
 * through GET /integrations/ai-policy.
 *
 * Cached for 30 s like the analytics settings. Everything fails closed: no row,
 * no table or an unreadable value all mean "AI off".
 *
 * Kept free of route/persona logic on purpose -- the AI provider chokepoints
 * import this file, and services/ai/gate.ts (route guards) builds on it.
 */

const KEY = "ai_policy";
const TTL_MS = 30_000;

let cache: { at: number; value: AiPolicy } | null = null;
/** Tests pin a policy instead of writing the shared table. */
let override: AiPolicy | null = null;

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const missingTable = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";
const parse = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Fail-closed default (master switch off), with v 0 meaning "never saved". */
const closed = (): AiPolicy => normalizeAiPolicy(AI_POLICY_DEFAULT);

async function readStored(): Promise<AiPolicy> {
  try {
    const [r] = rows(
      await db.execute(
        sql`SELECT value, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at FROM PlatformSetting WHERE setting_key = ${KEY} LIMIT 1`,
      ),
    );
    if (!r) return closed();
    const value = parse(r.value);
    const p = normalizeAiPolicy(value);
    // The row's columns are the source of truth for who/when.
    p.updated_by = r.updated_by == null ? null : Number(r.updated_by);
    p.updated_at = r.updated_at ? String(r.updated_at) : null;
    return p;
  } catch (e) {
    if (!missingTable(e)) logger.error(`[ai-policy] read failed: ${(e as any)?.message ?? e}`);
    return closed();
  }
}

/** The current policy (30 s cache). Never throws; an unreadable store means off. */
export async function getAiPolicy(): Promise<AiPolicy> {
  if (override) return override;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await readStored();
  cache = { at: Date.now(), value };
  return value;
}

/** Synchronous read of the last cached value (hot paths that cannot await). */
export const cachedAiPolicy = (): AiPolicy => override ?? cache?.value ?? closed();

export const invalidateAiPolicy = () => {
  cache = null;
};

/** For tests: pin the policy (null = read the database again). */
export function setAiPolicyForTests(p: Partial<AiPolicy> | null) {
  override = p ? normalizeAiPolicy({ ...AI_POLICY_DEFAULT, v: 1, ...p }) : null;
  cache = null;
}

/** Shorthand for tests: everything on. */
export const AI_POLICY_ALL_ON: Partial<AiPolicy> = { enabled: true, features: { grading: true } };

/**
 * Apply a partial update from Settings -> AI. Unknown keys are ignored; a known
 * key with the wrong type is a 400 (never silently coerced: this is a kill
 * switch). Bumps v, stamps who/when and writes the audit log.
 */
export async function setAiPolicy(patch: unknown, actorId: number): Promise<AiPolicy> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new ValidationError("Send the policy fields to change");
  const p = patch as Record<string, any>;
  const errors: string[] = [];
  const bool = (k: string, v: unknown) => {
    if (typeof v !== "boolean") errors.push(`${k} must be true or false`);
  };

  const before = await readStored();
  const after: AiPolicy = {
    ...before,
    apps: { ...before.apps },
    features: { ...before.features },
  };

  if ("enabled" in p) {
    bool("enabled", p.enabled);
    after.enabled = p.enabled === true;
  }
  if ("apps" in p) {
    if (!p.apps || typeof p.apps !== "object" || Array.isArray(p.apps)) errors.push("apps must be an object");
    else
      for (const [app, v] of Object.entries(p.apps)) {
        if (!AI_APPS.includes(app as AiApp)) errors.push(`Unknown app "${app}"`);
        else {
          bool(`apps.${app}`, v);
          after.apps[app as AiApp] = v === true;
        }
      }
  }
  if ("features" in p) {
    if (!p.features || typeof p.features !== "object" || Array.isArray(p.features)) errors.push("features must be an object");
    else if ("grading" in p.features) {
      bool("features.grading", p.features.grading);
      after.features.grading = p.features.grading === true;
    }
  }
  if ("assessments" in p) {
    if (p.assessments !== "teacher" && p.assessments !== "always_off") errors.push('assessments must be "teacher" or "always_off"');
    else after.assessments = p.assessments;
  }
  if ("thirdPartyExtensions" in p) {
    bool("thirdPartyExtensions", p.thirdPartyExtensions);
    after.thirdPartyExtensions = p.thirdPartyExtensions === true;
  }
  if (errors.length) throw new ValidationError(errors.join("; "), errors);

  after.v = Math.max(1, before.v) + 1;
  const stored = {
    v: after.v,
    enabled: after.enabled,
    apps: after.apps,
    features: after.features,
    assessments: after.assessments,
    thirdPartyExtensions: after.thirdPartyExtensions,
  };
  await db.execute(sql`
    INSERT INTO PlatformSetting (setting_key, value, updated_by, updated_at)
    VALUES (${KEY}, CAST(${JSON.stringify(stored)} AS JSON), ${actorId}, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)
  `);
  invalidateAiPolicy();

  const diff = policyDiff(before, after);
  await recordActivity(
    actorId,
    "AI_POLICY_UPDATE",
    after.enabled !== before.enabled
      ? `Turned AI ${after.enabled ? "on" : "off"} for the school (policy v${after.v})`
      : `Changed the school AI policy (v${after.v}): ${diff.map((d) => d.field).join(", ") || "no change"}`,
    "PlatformSetting",
    undefined,
    { v: after.v, diff, before: { ...before, updated_at: undefined, updated_by: undefined }, after: stored },
    actorId,
  );
  return readStored();
}

/** Field-level differences, for the audit log. */
export function policyDiff(a: AiPolicy, b: AiPolicy): { field: string; from: unknown; to: unknown }[] {
  const out: { field: string; from: unknown; to: unknown }[] = [];
  const cmp = (field: string, x: unknown, y: unknown) => {
    if (x !== y) out.push({ field, from: x, to: y });
  };
  cmp("enabled", a.enabled, b.enabled);
  for (const app of AI_APPS) cmp(`apps.${app}`, a.apps[app] !== false, b.apps[app] !== false);
  cmp("features.grading", a.features.grading, b.features.grading);
  cmp("assessments", a.assessments, b.assessments);
  cmp("thirdPartyExtensions", a.thirdPartyExtensions, b.thirdPartyExtensions);
  return out;
}

/**
 * AI refused by the policy. A 403 with the shared envelope
 * `{ success:false, code:"AI_DISABLED", reason, message }` (middleware/errorHandler.ts
 * and aiDisabledBody below), so a refusal never surfaces as a 500.
 */
export class AiDisabledError extends CustomError {
  readonly code = "AI_DISABLED";
  constructor(readonly reason: AiReason) {
    super(AI_REASON_MESSAGES[reason] ?? AI_REASON_MESSAGES.GLOBAL_OFF, 403);
  }
}

export const aiDisabledBody = (reason: AiReason) => ({
  success: false as const,
  code: "AI_DISABLED" as const,
  reason,
  message: AI_REASON_MESSAGES[reason] ?? AI_REASON_MESSAGES.GLOBAL_OFF,
});

/**
 * Provider chokepoint (plan §4.4): refuse any AI call while the master switch or
 * this app's switch is off. Defence in depth behind the route guards -- it needs
 * no user, so background jobs are stopped too.
 */
export async function assertAiAppEnabled(app: AiApp = "mis"): Promise<void> {
  const policy = await getAiPolicy();
  if (!aiAppEnabled(policy, app)) throw new AiDisabledError(policy.enabled ? "APP_OFF" : "GLOBAL_OFF");
}
