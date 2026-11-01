import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { User } from "../db/schema";
import { requireServiceToken } from "../middleware/serviceAuth";
import { appForClient } from "../access/apps";
import { assertAiAppEnabled, AiDisabledError, aiDisabledBody } from "../services/ai/policy";
import { generateStructuredContent } from "../services/aiProviders/generate";
import { completeChat, streamChat, trimConversation } from "../services/aiProviders/chat";
import { PersonalAIError } from "../services/aiProviders/errors";
import { noteCredentialFailure, touchCredential } from "../services/ai/personal/credentials";
import { parseOverride, personalWhoFromUserId, resolvePersonal, resolvedRouteMap } from "../services/ai/personal/routes";
import { AI_TASKS, type AiPersonalApp, type AiTask } from "../vendor/nga-access";
import logger from "../utils/logger";

/**
 * My AI gateway for Task Mentor, Tupo and Tendo (PERSONAL_AI_PROVIDERS_PLAN.md §10.1).
 *
 * The other apps keep their own school AI. When a person has chosen their own key for a
 * task, the app sends the call here, on that person's behalf, and MIS decrypts the key and
 * calls the provider. Keys never leave the MIS.
 *
 * Auth: the app's SSO client id/secret (HTTP Basic), scope ai-gateway:invoke. The calling
 * app comes from the client id (access/apps.ts), never from the body. The person is
 * `X-Nga-On-Behalf-Of: <MIS user id>`; they must be ACTIVE, and their key must allow the app.
 *
 * Answers:
 *   200  { data, ai }                       the person's own key answered
 *   409  { code: "AI_USE_SCHOOL", reason }  use your own school AI (no personal route now)
 *   503  { code: "AI_KEY_*", fallbackAllowed } the key failed; fall back only if allowed
 *   403  { code: "AI_DISABLED" }            the school policy is off for this app
 */
const router = Router();
const invoke = requireServiceToken("ai-gateway:invoke");

const PERSONAL_APPS: AiPersonalApp[] = ["tm", "tupo", "da"];

async function caller(req: any, res: any): Promise<{ app: AiPersonalApp; userId: number } | null> {
  const app = appForClient(req.service?.clientId) as AiPersonalApp | null;
  if (!app || !PERSONAL_APPS.includes(app)) {
    res.status(403).json({ success: false, code: "AI_GATEWAY_UNKNOWN_APP", message: "This client is not one of the NGA apps." });
    return null;
  }
  const userId = Number(req.header("X-Nga-On-Behalf-Of") ?? req.query.user);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ success: false, message: "X-Nga-On-Behalf-Of must be the MIS user id." });
    return null;
  }
  const [u] = await db.select({ status: User.status }).from(User).where(eq(User.user_id, userId)).limit(1);
  if (!u || u.status !== "ACTIVE") {
    res.status(403).json({ success: false, code: "AI_GATEWAY_USER_INACTIVE", message: "That account is not active." });
    return null;
  }
  return { app, userId };
}

/** The person's resolved route map for this app (no secrets), so the app can show "Answers with ▾". */
router.get("/routes", invoke, async (req: any, res: any, next: any) => {
  try {
    const c = await caller(req, res);
    if (!c) return;
    const data = await resolvedRouteMap(await personalWhoFromUserId(c.userId), c.app);
    res.set("Cache-Control", "no-store");
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

function parseCtx(body: any) {
  const task = (AI_TASKS as readonly string[]).includes(body?.task) ? (body.task as AiTask) : null;
  return {
    task,
    inAssessment: body?.inAssessment === true,
    override: parseOverride(body?.aiRoute),
    feature: String(body?.feature ?? "gateway").slice(0, 50),
  };
}

/** Resolve, or answer 409/403 and return null. */
async function personalOrSchool(req: any, res: any) {
  const c = await caller(req, res);
  if (!c) return null;
  const ctx = parseCtx(req.body);
  if (!ctx.task) {
    res.status(400).json({ success: false, message: `task must be one of: ${AI_TASKS.join(", ")}` });
    return null;
  }
  try {
    await assertAiAppEnabled(c.app);
  } catch (e) {
    if (e instanceof AiDisabledError) {
      res.status(403).json(aiDisabledBody(e.reason));
      return null;
    }
    throw e;
  }
  const who = await personalWhoFromUserId(c.userId);
  const resolved = await resolvePersonal(who, { app: c.app, task: ctx.task, inAssessment: ctx.inAssessment, override: ctx.override });
  if (!resolved.credential) {
    res.status(409).json({ success: false, code: "AI_USE_SCHOOL", reason: resolved.decision.reason, skipped: resolved.skipped ?? null });
    return null;
  }
  const cred = resolved.credential;
  return {
    app: c.app,
    who,
    ctx,
    cred,
    fallbackAllowed: resolved.decision.fallbackToSchool,
    credential: { provider: cred.provider, apiKey: cred.apiKey, baseUrl: cred.baseUrl ?? undefined, model: cred.model, freeOnly: cred.freeOnly, credentialId: cred.id },
    ai: { route: "personal" as const, reason: "PERSONAL" as const, credentialId: cred.id, label: cred.label, provider: cred.provider, model: cred.model },
  };
}

async function keyFailed(res: any, r: NonNullable<Awaited<ReturnType<typeof personalOrSchool>>>, e: unknown) {
  if (!(e instanceof PersonalAIError)) throw e;
  await noteCredentialFailure(r.cred.id, e.code);
  res.status(503).json({ success: false, code: e.code, message: e.message, fallbackAllowed: r.fallbackAllowed, credentialId: r.cred.id, label: r.cred.label });
}

router.post("/gateway/json", invoke, async (req: any, res: any, next: any) => {
  try {
    const r = await personalOrSchool(req, res);
    if (!r) return;
    const b = req.body ?? {};
    if (typeof b.prompt !== "string" || !b.prompt || !b.schema || typeof b.schema !== "object") {
      return res.status(400).json({ success: false, message: "prompt and schema are required" });
    }
    try {
      const out = await generateStructuredContent(
        { prompt: b.prompt.slice(0, 400_000), schema: b.schema, schemaName: typeof b.schemaName === "string" ? b.schemaName.slice(0, 60) : undefined, maxOutputTokens: Number(b.maxOutputTokens) || undefined, disableThinking: b.disableThinking === true },
        { credential: r.credential, feature: r.ctx.feature, actorUserId: r.who.userId, app: r.app },
      );
      touchCredential(r.cred.id);
      res.json({ success: true, data: out.data, ai: { ...r.ai, model: out.model ?? r.ai.model }, usage: out.usage ?? null });
    } catch (e) {
      await keyFailed(res, r, e);
    }
  } catch (e) {
    next(e);
  }
});

router.post("/gateway/text", invoke, async (req: any, res: any, next: any) => {
  try {
    const r = await personalOrSchool(req, res);
    if (!r) return;
    const b = req.body ?? {};
    if (typeof b.prompt !== "string" || !b.prompt) return res.status(400).json({ success: false, message: "prompt is required" });
    try {
      const out = await completeChat({
        system: typeof b.system === "string" ? b.system.slice(0, 20_000) : "You are a helpful assistant.",
        messages: [{ role: "user", content: b.prompt.slice(0, 100_000) }],
        audience: r.who.isStudent ? "minor" : "adult",
        actorUserId: r.who.userId,
        feature: r.ctx.feature,
        app: r.app,
        credential: r.credential,
      });
      touchCredential(r.cred.id);
      res.json({ success: true, data: out.text, ai: { ...r.ai, model: out.model } });
    } catch (e) {
      await keyFailed(res, r, e);
    }
  } catch (e) {
    next(e);
  }
});

/** Server-sent events: `delta` {text}… then `done` {ai} or `error` {code, fallbackAllowed}. */
router.post("/gateway/chat", invoke, async (req: any, res: any, next: any) => {
  let r: Awaited<ReturnType<typeof personalOrSchool>> = null;
  try {
    r = await personalOrSchool(req, res);
    if (!r) return;
    const b = req.body ?? {};
    let messages;
    try {
      messages = trimConversation(b.messages);
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message ?? "Bad messages" });
    }
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const abort = new AbortController();
    req.on("close", () => abort.abort());
    let sent = false;
    try {
      const out = await streamChat({
        system: typeof b.system === "string" ? b.system.slice(0, 20_000) : "You are a helpful assistant.",
        messages,
        audience: r.who.isStudent ? "minor" : "adult",
        actorUserId: r.who.userId,
        feature: r.ctx.feature,
        app: r.app,
        signal: abort.signal,
        credential: r.credential,
        onText: (text) => {
          sent = true;
          send("delta", { text });
        },
      });
      touchCredential(r.cred.id);
      send("done", { ai: { ...r.ai, model: out.model } });
    } catch (e: any) {
      if (e instanceof PersonalAIError) {
        await noteCredentialFailure(r.cred.id, e.code);
        send("error", { code: e.code, message: e.message, fallbackAllowed: r.fallbackAllowed && !sent });
      } else if (!abort.signal.aborted) {
        logger.warn("[ai-gateway] chat failed", { error: e?.message });
        send("error", { code: "AI_PERSONAL_FAILED", message: "The answer was cut off. Please try again.", fallbackAllowed: false });
      }
    }
    res.end();
  } catch (e) {
    if (res.headersSent) return res.end();
    next(e);
  }
});

export default router;
