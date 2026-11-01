import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { perMinute, rateLimitByIp } from "../middleware/rateLimit";
import { ValidationError } from "../errors/CustomError";
import { decideAny, requestSnapshot } from "../services/access/policy";
import { assertAi } from "../services/ai/gate";
import { getAiPolicy } from "../services/ai/policy";
import { completeChat } from "../services/aiProviders/chat";
import { PersonalAIError } from "../services/aiProviders/errors";
import { quotaSnapshot } from "../services/aiProviders/limiter";
import {
  PersonalAiForbiddenError,
  createCredential,
  deleteCredential,
  getCredential,
  listCredentials,
  loadSecret,
  testCredential,
  updateCredential,
} from "../services/ai/personal/credentials";
import { completeOpenRouterConnect, startOpenRouterConnect } from "../services/ai/personal/openrouterOAuth";
import { CATALOG_FETCHED_AT, HEAVY_MONTH, PROVIDERS, estimateCostUsd, modelsFor, monthlyCosts } from "../services/ai/personal/providers";
import { listRoutes, personalWhoFromRequest, replaceRoutes, resolvedRouteMap } from "../services/ai/personal/routes";
import { isVaultConfigured } from "../services/secrets/vault";
import {
  AI_PERSONAL_APPS,
  AI_PERSONAL_REASON_MESSAGES,
  AI_PROVIDER_IDS,
  AI_TASKS,
  personalProviderAllowed,
  type AiProviderId,
  type AiTask,
} from "../vendor/nga-access";
import logger from "../utils/logger";

/**
 * My AI (PERSONAL_AI_PROVIDERS_PLAN.md §9, §10.1): a person's own AI provider keys and which
 * of them answers what. Keys are typed here only and never returned.
 *
 *   GET    /my-ai                      eligibility, providers, my keys (no secrets), my routes
 *   POST   /my-ai/credentials          add a key (validated first; an invalid key is not stored)
 *   PATCH  /my-ai/credentials/:id      rename, allowed apps, daily limit, free-only, replace key
 *   DELETE /my-ai/credentials/:id      delete (hard); routes using it go too
 *   POST   /my-ai/credentials/:id/test check it again now
 *   GET    /my-ai/credentials/:id/models?task=   models to offer for that key
 *   PUT    /my-ai/routes               replace "what answers what"
 *   POST   /my-ai/playground           the same prompt to School AI and to one of my keys
 *   POST   /my-ai/oauth/openrouter/start | complete   one-click OpenRouter connect (PKCE)
 *   GET    /my-ai/admin/usage          AI_PROVIDERS_MANAGE: school-wide aggregates, never keys
 */
const router = Router();
router.use(authenticate);

const writeLimit = rateLimitByIp(perMinute(20));

async function context(req: any) {
  const [policy, who] = await Promise.all([getAiPolicy(), personalWhoFromRequest(req)]);
  return { policy, who };
}

/** Why this person can't use My AI right now, or null. */
function blockReason(policy: Awaited<ReturnType<typeof getAiPolicy>>, who: Awaited<ReturnType<typeof personalWhoFromRequest>>) {
  if (!isVaultConfigured()) return { code: "AI_VAULT_NOT_CONFIGURED", message: "My AI is not set up on this server yet." };
  if (!policy.enabled) return { code: "AI_DISABLED", message: "AI is turned off for the school." };
  if (!policy.personal.enabled) return { code: "PERSONAL_OFF", message: AI_PERSONAL_REASON_MESSAGES.PERSONAL_OFF };
  if (policy.personal.apps.mis === false) return { code: "APP_OFF", message: AI_PERSONAL_REASON_MESSAGES.APP_OFF };
  const groupAllowed = who.isStudent ? policy.personal.students.allowed : policy.personal.staff.allowed;
  if (!groupAllowed || !who.hasPersonalCap) return { code: "NOT_ALLOWED", message: AI_PERSONAL_REASON_MESSAGES.NOT_ALLOWED };
  return null;
}

function assertOpen(policy: any, who: any) {
  const b = blockReason(policy, who);
  if (b) throw new PersonalAiForbiddenError(b.message, b.code);
}

router.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    const [credentials, routes] = await Promise.all([listCredentials(who.userId).catch(() => []), listRoutes(who.userId)]);
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      data: {
        blocked: blockReason(policy, who),
        me: { isStudent: who.isStudent, hasPersonalCap: who.hasPersonalCap },
        policy: { fallbackToSchool: policy.personal.fallbackToSchool, inAssessments: policy.personal.inAssessments, studentDailyLimit: who.isStudent ? policy.personal.students.maxDailyRequests : null },
        apps: AI_PERSONAL_APPS.filter((a) => policy.personal.apps[a] !== false),
        tasks: AI_TASKS,
        providers: AI_PROVIDER_IDS.map((id) => {
          const p = PROVIDERS[id];
          const allowed = personalProviderAllowed(policy.personal, id, who.isStudent);
          return {
            id,
            label: p.label,
            keyUrl: p.keyUrl,
            keySteps: p.keySteps,
            freeTier: p.freeTier,
            oauth: p.oauth ?? null,
            privacyNote: p.privacyNote,
            defaultModel: p.defaultModel,
            allowed,
            blockedReason: allowed ? null : who.isStudent ? p.notForStudents ?? "Not allowed for students at this school." : id === "custom" ? "Custom endpoints are turned off." : "Not allowed at this school.",
          };
        }),
        credentials,
        routes,
        catalogDate: CATALOG_FETCHED_AT,
      },
    });
  }),
);

/** "What a key really costs": a heavy month on each headline model, from the shipped catalogue. */
router.get(
  "/costs",
  asyncHandler(async (_req: any, res: any) => {
    res.json({ success: true, data: { month: HEAVY_MONTH, catalogDate: CATALOG_FETCHED_AT, models: monthlyCosts() } });
  }),
);

/** What answers each task in the MIS for me, and the keys I may pick per request ("Answers with ▾"). */
router.get(
  "/resolved",
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await resolvedRouteMap(who, "mis", policy) });
  }),
);

router.post(
  "/credentials",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    assertOpen(policy, who);
    const credential = await createCredential({ userId: who.userId, isStudent: who.isStudent, policy }, req.body ?? {});
    res.status(201).json({ success: true, data: credential });
  }),
);

router.patch(
  "/credentials/:id",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    const credential = await updateCredential({ userId: who.userId, isStudent: who.isStudent, policy }, Number(req.params.id), req.body ?? {});
    res.json({ success: true, data: credential });
  }),
);

router.delete(
  "/credentials/:id",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    await deleteCredential(Number(req.user.userId), Number(req.params.id));
    res.json({ success: true });
  }),
);

router.post(
  "/credentials/:id/test",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    res.json({ success: true, data: await testCredential(Number(req.user.userId), Number(req.params.id)) });
  }),
);

router.get(
  "/credentials/:id/models",
  asyncHandler(async (req: any, res: any) => {
    const c = await getCredential(Number(req.user.userId), Number(req.params.id));
    const task = (AI_TASKS as readonly string[]).includes(String(req.query.task)) ? (req.query.task as AiTask) : "*";
    res.json({ success: true, data: modelsFor(c.provider, c.models, task, c.freeOnly) });
  }),
);

router.put(
  "/routes",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    if (Array.isArray(req.body?.routes) && req.body.routes.length) assertOpen(policy, who);
    res.json({ success: true, data: await replaceRoutes(who.userId, req.body?.routes) });
  }),
);

const PLAYGROUND_SYSTEM = "You are a helpful assistant for a teacher at a secondary school in Rwanda. Answer briefly.";

/** Same prompt, School AI vs one of my keys, side by side. Counts on my key only once. */
router.post(
  "/playground",
  rateLimitByIp(perMinute(6)),
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    assertOpen(policy, who);
    await assertAi(req, "assist");
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 2000);
    if (!prompt) throw new ValidationError("Type a prompt to try.");
    const credentialId = Number(req.body?.credentialId);
    const secret = await loadSecret(credentialId, who.userId);
    if (!personalProviderAllowed(policy.personal, secret.provider, who.isStudent)) throw new ValidationError("This provider is not allowed for your account.");
    const model = String(req.body?.model ?? "").trim() || PROVIDERS[secret.provider as AiProviderId].defaultModel;
    const messages = [{ role: "user" as const, content: prompt }];
    const timed = async <T>(f: () => Promise<T>) => {
      const t = Date.now();
      try {
        return { ok: true as const, value: await f(), ms: Date.now() - t };
      } catch (e: any) {
        return { ok: false as const, error: e instanceof PersonalAIError ? { code: e.code, message: e.message } : { code: "FAILED", message: e?.message ?? "Failed" }, ms: Date.now() - t };
      }
    };
    const base = { system: PLAYGROUND_SYSTEM, messages, audience: who.isStudent ? ("minor" as const) : ("adult" as const), actorUserId: who.userId, feature: "my-ai.playground", app: "mis" as const };
    const [school, mine] = await Promise.all([
      timed(() => completeChat(base)),
      timed(() =>
        completeChat({
          ...base,
          credential: { provider: secret.provider, apiKey: secret.apiKey, baseUrl: secret.baseUrl ?? undefined, model, freeOnly: secret.provider === "openrouter" ? who.isStudent || secret.freeOnly : false, credentialId: secret.id },
        }),
      ),
    ]);
    const view = (r: typeof school, provider?: string) =>
      r.ok
        ? {
            ok: true,
            text: r.value.text,
            provider: r.value.provider,
            model: r.value.model,
            ms: r.ms,
            estCostUsd: provider ? estimateCostUsd(provider as AiProviderId, r.value.model, Math.round((PLAYGROUND_SYSTEM.length + prompt.length) / 4), Math.round(r.value.text.length / 4)) : null,
          }
        : { ok: false, error: r.error, ms: r.ms };
    res.json({ success: true, data: { school: view(school), mine: view(mine, secret.provider) } });
  }),
);

router.post(
  "/oauth/openrouter/start",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    assertOpen(policy, who);
    if (!personalProviderAllowed(policy.personal, "openrouter", who.isStudent)) throw new ValidationError("OpenRouter is not allowed for your account.");
    res.json({ success: true, data: startOpenRouterConnect(who.userId, String(req.body?.callbackUrl ?? "")) });
  }),
);

router.post(
  "/oauth/openrouter/complete",
  writeLimit,
  asyncHandler(async (req: any, res: any) => {
    const { policy, who } = await context(req);
    assertOpen(policy, who);
    const key = await completeOpenRouterConnect(who.userId, String(req.body?.code ?? ""), String(req.body?.state ?? ""));
    const credential = await createCredential(
      { userId: who.userId, isStudent: who.isStudent, policy },
      { provider: "openrouter", apiKey: key, label: "OpenRouter (connected)", authType: "oauth_pkce", freeOnly: who.isStudent ? true : req.body?.freeOnly === true },
    );
    res.status(201).json({ success: true, data: credential });
  }),
);

async function canSeeProviders(req: any): Promise<boolean> {
  const cap = "AI_PROVIDERS_MANAGE";
  if (Array.isArray(req.user?.permissions) && req.user.permissions.includes(cap)) return true;
  try {
    return decideAny(await requestSnapshot(req), [cap], null, null).allowed;
  } catch {
    return false;
  }
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

/** Settings -> AI -> Providers: aggregates only. No keys, no prompts, no per-person rows. */
router.get(
  "/admin/usage",
  asyncHandler(async (req: any, res: any) => {
    if (!(await canSeeProviders(req))) return res.status(403).json({ success: false, message: "You cannot see AI provider usage." });
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const safe = async <T>(f: () => Promise<T>, fallback: T) => {
      try {
        return await f();
      } catch (e: any) {
        logger.warn("[my-ai] admin usage query failed", { error: e?.message });
        return fallback;
      }
    };
    const [byRoute, byProvider, keys, people, quotas] = await Promise.all([
      safe(async () => rows(await db.execute(sql`
        SELECT COALESCE(app, 'mis') AS app, route, COUNT(*) AS calls, SUM(ok = 0) AS failures
        FROM AIUsageLog WHERE occurred_at >= ${since} GROUP BY COALESCE(app, 'mis'), route ORDER BY calls DESC`)), [] as any[]),
      safe(async () => rows(await db.execute(sql`
        SELECT provider, route, COUNT(*) AS calls, SUM(ok = 0) AS failures,
               COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) AS tokens
        FROM AIUsageLog WHERE occurred_at >= ${since} GROUP BY provider, route ORDER BY calls DESC`)), [] as any[]),
      safe(async () => rows(await db.execute(sql`SELECT provider, status, COUNT(*) AS n FROM AiCredential WHERE owner_user_id IS NOT NULL GROUP BY provider, status`)), [] as any[]),
      safe(async () => rows(await db.execute(sql`SELECT COUNT(DISTINCT owner_user_id) AS n FROM AiCredential WHERE owner_user_id IS NOT NULL`)), [] as any[]),
      safe(() => quotaSnapshot(["gemini", "groq", "glm", "openrouter", "deepseek", "openai"]), []),
    ]);
    const num = (v: unknown) => Number(v ?? 0);
    res.json({
      success: true,
      data: {
        days,
        byRoute: byRoute.map((r) => ({ app: r.app, route: r.route, calls: num(r.calls), failures: num(r.failures) })),
        byProvider: byProvider.map((r) => ({ provider: r.provider, route: r.route, calls: num(r.calls), failures: num(r.failures), tokens: num(r.tokens) })),
        keys: keys.map((r) => ({ provider: r.provider, status: r.status, count: num(r.n) })),
        peopleWithKeys: num(people[0]?.n),
        schoolQuotas: quotas,
        vaultConfigured: isVaultConfigured(),
      },
    });
  }),
);

export default router;
