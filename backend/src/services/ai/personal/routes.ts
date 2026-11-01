import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { ValidationError } from "../../../errors/CustomError";
import { recordActivity } from "../../../utils/activityLogger";
import { getEffectivePermissions } from "../../../utils/auth";
import logger from "../../../utils/logger";
import {
  AI_PERSONAL_APPS,
  AI_TASKS,
  decidePersonalRoute,
  personalProviderAllowed,
  type AiPersonalApp,
  type AiPersonalDecision,
  type AiPersonalRoute,
  type AiPolicy,
  type AiProviderId,
  type AiTask,
} from "../../../vendor/nga-access";
import { loadPersona } from "../../desktop/assistant";
import { decideAny, misAccessMode, requestSnapshot } from "../../access/policy";
import { getAiPolicy } from "../policy";
import { isVaultConfigured } from "../../secrets/vault";
import { loadSecret, usedToday, userPersonalUsedToday, type CredentialSecret } from "./credentials";
import { PROVIDERS } from "./providers";

/**
 * "What answers what" (PERSONAL_AI_PROVIDERS_PLAN.md §4.2, §5.2): a user's routes and the
 * decision, for one call, between their own key and the school's AI.
 */

export const CAP_STAFF = "AI_PERSONAL_PROVIDERS";
export const CAP_STUDENT = "AI_PERSONAL_PROVIDERS_STUDENT";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const missingTable = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

export interface PersonalWho {
  userId: number;
  isStudent: boolean;
  hasPersonalCap: boolean;
}

/** Who is asking, from a request (MIS routes). */
export async function personalWhoFromRequest(req: any): Promise<PersonalWho> {
  const userId = Number(req.user.userId);
  const { persona } = await loadPersona(userId);
  const isStudent = persona === "student";
  const cap = isStudent ? CAP_STUDENT : CAP_STAFF;
  let has = Array.isArray(req.user?.permissions) && req.user.permissions.includes(cap);
  if (misAccessMode() === "enforce") {
    try {
      has = decideAny(await requestSnapshot(req), [cap], null, null).allowed;
    } catch {
      /* keep the legacy answer */
    }
  }
  return { userId, isStudent, hasPersonalCap: has };
}

/** Who is asking, by id (the gateway calls on behalf of a user of another app). */
export async function personalWhoFromUserId(userId: number): Promise<PersonalWho> {
  const [{ persona }, perms] = await Promise.all([loadPersona(userId), getEffectivePermissions(userId).catch(() => [] as string[])]);
  const isStudent = persona === "student";
  return { userId, isStudent, hasPersonalCap: perms.includes(isStudent ? CAP_STUDENT : CAP_STAFF) };
}

export async function listRoutes(userId: number): Promise<AiPersonalRoute[]> {
  try {
    const r = rows(
      await db.execute(sql`
        SELECT r.app, r.task, r.credential_id, r.model, r.fallback, c.provider, c.label, c.status, c.allowed_apps
        FROM AiRoute r JOIN AiCredential c ON c.credential_id = r.credential_id AND c.owner_user_id = r.user_id
        WHERE r.user_id = ${userId}
        ORDER BY r.app, r.task`),
    );
    return r.map((x) => ({
      app: x.app,
      task: x.task,
      credentialId: Number(x.credential_id),
      provider: x.provider,
      model: x.model,
      label: x.label,
      fallback: x.fallback === "none" ? "none" : "school",
      status: x.status,
      allowedApps: (() => {
        const v = typeof x.allowed_apps === "string" ? JSON.parse(x.allowed_apps) : x.allowed_apps;
        return Array.isArray(v) ? v : [...AI_PERSONAL_APPS];
      })(),
    }));
  } catch (e) {
    if (missingTable(e)) return [];
    throw e;
  }
}

/** A version for the user's routes, so other apps know when to refetch (on /auth/verify). */
export async function routesVersion(userId: number): Promise<number> {
  try {
    const [r] = rows(
      await db.execute(sql`
        SELECT GREATEST(
          COALESCE((SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM AiRoute WHERE user_id = ${userId}), 0),
          COALESCE((SELECT UNIX_TIMESTAMP(MAX(updated_at)) FROM AiCredential WHERE owner_user_id = ${userId}), 0),
          COALESCE((SELECT COUNT(*) FROM AiCredential WHERE owner_user_id = ${userId}), 0)
        ) AS v`),
    );
    return Number(r?.v ?? 0);
  } catch {
    return 0;
  }
}

export interface RouteInput {
  app: unknown;
  task: unknown;
  credentialId: unknown;
  model: unknown;
  fallback?: unknown;
}

/** Replace the user's whole matrix. Each row must use one of their own keys. */
export async function replaceRoutes(userId: number, input: unknown): Promise<AiPersonalRoute[]> {
  if (!Array.isArray(input)) throw new ValidationError("Send the list of routes.");
  if (input.length > 40) throw new ValidationError("Too many routes.");
  const own = rows(await db.execute(sql`SELECT credential_id FROM AiCredential WHERE owner_user_id = ${userId}`)).map((r) => Number(r.credential_id));
  const errors: string[] = [];
  const seen = new Set<string>();
  const clean = (input as RouteInput[]).map((r, i) => {
    const app = String(r?.app ?? "");
    const task = String(r?.task ?? "");
    const credentialId = Number(r?.credentialId);
    const model = String(r?.model ?? "").trim();
    const fallback = r?.fallback === "none" ? "none" : "school";
    if (app !== "*" && !AI_PERSONAL_APPS.includes(app as AiPersonalApp)) errors.push(`Row ${i + 1}: unknown app`);
    if (task !== "*" && !AI_TASKS.includes(task as AiTask)) errors.push(`Row ${i + 1}: unknown task`);
    if (!own.includes(credentialId)) errors.push(`Row ${i + 1}: choose one of your own keys`);
    if (!model || model.length > 120) errors.push(`Row ${i + 1}: choose a model`);
    const k = `${app}|${task}`;
    if (seen.has(k)) errors.push(`Row ${i + 1}: this app and task already have a choice`);
    seen.add(k);
    return { app, task, credentialId, model, fallback };
  });
  if (errors.length) throw new ValidationError(errors.join("; "), errors);

  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM AiRoute WHERE user_id = ${userId}`);
    for (const r of clean) {
      await tx.execute(sql`
        INSERT INTO AiRoute (user_id, app, task, credential_id, model, fallback, updated_at)
        VALUES (${userId}, ${r.app}, ${r.task}, ${r.credentialId}, ${r.model}, ${r.fallback}, UTC_TIMESTAMP())`);
    }
  });
  await recordActivity(userId, "AI_ROUTES_UPDATE", `Changed which AI answers what (${clean.length} choice${clean.length === 1 ? "" : "s"})`, "AiRoute", undefined, { routes: clean }, userId);
  return listRoutes(userId);
}

/** A one-off choice for this request ("Answers with ▾" in an AI panel). */
export type RouteOverride = "school" | { credentialId: number; model?: string } | null | undefined;

export interface PersonalCallContext {
  app: AiPersonalApp;
  task: AiTask;
  inAssessment?: boolean;
  system?: boolean;
  override?: RouteOverride;
}

export interface ResolvedPersonal {
  decision: AiPersonalDecision;
  /** Set when the user's own key should answer. */
  credential: (CredentialSecret & { model: string }) | null;
  /** Why the user's key was not used, when it would have been (cap reached...). */
  skipped?: "DAILY_CAP" | "STUDENT_CAP";
}

/**
 * The full decision for one call: policy + who + routes (+ a per-request override), then the
 * key's own daily cap and, for students, the school's per-student cap. Never throws for a
 * missing table or a broken key: the answer is then "school".
 */
export async function resolvePersonal(who: PersonalWho, ctx: PersonalCallContext, policy?: AiPolicy): Promise<ResolvedPersonal> {
  const school = (decision: AiPersonalDecision, skipped?: ResolvedPersonal["skipped"]): ResolvedPersonal => ({ decision, credential: null, skipped });
  try {
    const p = policy ?? (await getAiPolicy());
    if (!isVaultConfigured()) return school({ route: null, reason: "PERSONAL_OFF", fallbackToSchool: true });
    if (ctx.override === "school") return school({ route: null, reason: "NO_ROUTE", fallbackToSchool: true });
    let routes = await listRoutes(who.userId);
    if (ctx.override && typeof ctx.override === "object") {
      const o = ctx.override;
      const base = routes.find((r) => r.credentialId === o.credentialId);
      const [c] = rows(
        await db.execute(sql`SELECT credential_id, provider, label, status, allowed_apps FROM AiCredential WHERE credential_id = ${o.credentialId} AND owner_user_id = ${who.userId} LIMIT 1`),
      );
      if (!c) throw new ValidationError("That AI key was not found.");
      const allowedApps = typeof c.allowed_apps === "string" ? JSON.parse(c.allowed_apps) : c.allowed_apps;
      routes = [
        {
          app: ctx.app,
          task: ctx.task,
          credentialId: Number(c.credential_id),
          provider: c.provider,
          model: o.model || base?.model || PROVIDERS[c.provider as AiProviderId]?.defaultModel || "",
          label: c.label,
          fallback: base?.fallback ?? "school",
          status: c.status,
          allowedApps: Array.isArray(allowedApps) ? allowedApps : undefined,
        },
      ];
    }
    const decision = decidePersonalRoute(p, { app: ctx.app, task: ctx.task, isStudent: who.isStudent, hasPersonalCap: who.hasPersonalCap, inAssessment: ctx.inAssessment, system: ctx.system }, routes);
    if (!decision.route) return school(decision);

    const secret = await loadSecret(decision.route.credentialId, who.userId);
    if (!personalProviderAllowed(p.personal, secret.provider, who.isStudent)) return school({ ...decision, route: null, reason: "PROVIDER_BLOCKED" });
    if (secret.dailyRequestCap != null && (await usedToday(secret.id)) >= secret.dailyRequestCap) {
      return school({ ...decision, route: null, reason: "KEY_NOT_ACTIVE" }, "DAILY_CAP");
    }
    if (who.isStudent && (await userPersonalUsedToday(who.userId)) >= p.personal.students.maxDailyRequests) {
      return school({ ...decision, route: null, reason: "KEY_NOT_ACTIVE" }, "STUDENT_CAP");
    }
    // Students' OpenRouter keys are always free-only, whatever the row says.
    const freeOnly = secret.provider === "openrouter" ? who.isStudent || secret.freeOnly : secret.freeOnly;
    return { decision, credential: { ...secret, freeOnly, model: decision.route.model } };
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    if (!missingTable(e)) logger.warn("[my-ai] route resolution failed; using the school's AI", { error: (e as any)?.message });
    return school({ route: null, reason: "NO_ROUTE", fallbackToSchool: true });
  }
}

/**
 * For MIS controllers: `personal: await personalFor(req, "author")`. Cheap when My AI is off
 * (undefined, no lookups), so it can sit on every interactive AI call.
 */
export async function personalFor(
  req: any,
  task: AiTask,
  extra: { inAssessment?: boolean; override?: RouteOverride } = {},
): Promise<(PersonalCallContext & { who: PersonalWho }) | undefined> {
  if (!req?.user?.userId) return undefined;
  const policy = await getAiPolicy();
  if (!policy.personal.enabled || policy.personal.apps.mis === false) return undefined;
  return { app: "mis", task, ...extra, override: extra.override ?? parseOverride(req.body?.aiRoute ?? req.query?.aiRoute), who: await personalWhoFromRequest(req) };
}

/** `aiRoute` from a request: "school" or "<credentialId>[:<model>]". Anything else: none. */
export function parseOverride(raw: unknown): RouteOverride {
  if (raw === "school") return "school";
  if (typeof raw !== "string") return undefined;
  const m = /^(\d{1,12})(?::(.{1,120}))?$/.exec(raw.trim());
  return m ? { credentialId: Number(m[1]), model: m[2] } : undefined;
}
