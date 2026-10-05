import express, { type RequestHandler } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ChatUnavailableError, streamChat, trimConversation } from "../services/aiProviders/chat";
import { FEATURE, blockedReason, burst, dailyLimit, loadPersona, systemPrompt, usedToday } from "../services/desktop/assistant";

/**
 * NGA Tools (NGA Desktop), signed in. Called from the MIS page inside NGA Desktop,
 * with that page's own session (the desktop never holds the token):
 *   GET  /desktop/tools/ai/status   may this person use Ask AI, and how many messages are left today
 *   POST /desktop/tools/ai/chat     stream an answer (NDJSON: {"t":text}… then {"done":…} or {"error":…})
 * Kept apart from routes/desktop.ts (public distribution routes). `authenticate` is
 * passed in by app.ts, so tests can mount this router with their own sign-in without
 * touching the shared auth module (the suite shares one module registry).
 */
export function desktopToolsRouter(authenticate: RequestHandler) {
const router = express.Router();

router.get(
  "/ai/status",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    const { persona } = await loadPersona(userId);
    const limit = dailyLimit(persona);
    const used = await usedToday(userId);
    const blocked = blockedReason(persona);
    res.json({
      success: true,
      data: { available: !blocked, reason: blocked, persona, limit, used, remaining: Math.max(0, limit - used) },
    });
  }),
);

router.post(
  "/ai/chat",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    const { persona, firstName } = await loadPersona(userId);
    const blocked = blockedReason(persona);
    if (blocked) return res.status(403).json({ success: false, code: blocked, message: "Ask AI is for teachers and staff for now." });
    let messages;
    try {
      messages = trimConversation(req.body?.messages);
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Bad request" });
    }
    if (!burst.take(String(userId))) return res.status(429).json({ success: false, code: "SLOW_DOWN", message: "Too many messages in a minute. Please wait a moment." });
    const limit = dailyLimit(persona);
    if ((await usedToday(userId)) >= limit)
      return res.status(429).json({ success: false, code: "DAILY_LIMIT", message: `You've used today's ${limit} messages. They refill tomorrow.` });

    // Stream NDJSON. No proxy buffering (nginx), no caching.
    res.status(200);
    res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    res.flushHeaders?.();
    const abort = new AbortController();
    res.on("close", () => { if (!res.writableEnded) abort.abort(); });
    const line = (o: unknown) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
    // Providers send a token at a time; batch them (~40 ms) so the desktop gets fewer, larger pieces.
    let pending = "";
    let timer: NodeJS.Timeout | null = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending) line({ t: pending });
      pending = "";
    };
    try {
      const run = await streamChat({
        system: systemPrompt(persona, firstName),
        messages,
        audience: "adult",
        actorUserId: userId,
        feature: FEATURE,
        signal: abort.signal,
        onText: (t) => {
          pending += t;
          if (!timer) timer = setTimeout(flush, 40);
        },
      });
      flush();
      line({ done: true, provider: run.provider, model: run.model, remaining: Math.max(0, limit - (await usedToday(userId))) });
    } catch (e: any) {
      flush();
      if (!abort.signal.aborted)
        line({ error: e instanceof ChatUnavailableError ? e.message : "The AI couldn't answer right now. Please try again.", code: e instanceof ChatUnavailableError ? e.reason : "FAILED" });
    }
    res.end();
  }),
);

return router;
}
