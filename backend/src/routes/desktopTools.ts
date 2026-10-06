import express, { type RequestHandler } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ChatUnavailableError, streamChat, trimConversation } from "../services/aiProviders/chat";
import { FEATURE, blockedReason, burst, dailyLimit, loadPersona, systemPrompt, usedToday } from "../services/desktop/assistant";
import { collectOccurrences } from "../services/reminders/occurrences";
import { addDaysYmd, kigaliInstant, kigaliParts } from "../services/reminders/time";
import { buildPolicy, policyRange } from "../services/desktop/policy";
import { loadTeacherClasses } from "../services/desktop/classes";
import { applySettingsUpdate, cleanUsage, GAME_IDS, gamesBlock, IGISORO_VARIANTS, loadGameSettings, playedToday, recordUsage, saveGameSettings, usageSummary } from "../services/desktop/games";
import { getUserRoleNames } from "../utils/auth";
import { recordActivity } from "../utils/activityLogger";

/**
 * NGA Tools (NGA Desktop), signed in. Called from the MIS page inside NGA Desktop,
 * with that page's own session (the desktop never holds the token):
 *   GET  /desktop/tools/ai/status   may this person use Ask AI, and how many messages are left today
 *   POST /desktop/tools/ai/chat     stream an answer (NDJSON: {"t":text}… then {"done":…} or {"error":…})
 *   GET  /desktop/tools/agenda      My Day: lessons, activities, office hours, quizzes, meetings (days=1..7)
 *   GET  /desktop/tools/policy      today's lesson and exam windows (games and the student AI pause in them)
 *   GET  /desktop/tools/classes     the class lists of the classes this person teaches (name picker, groups)
 *   POST /desktop/tools/games/usage play time (cumulative per device and day; the largest total is kept)
 *   GET  /desktop/tools/settings/games   the school's game settings + 7-day totals (DESKTOP_TOOLS_CONFIGURE)
 *   PUT  /desktop/tools/settings/games   change them (Igisoro approval: super admin only)
 * Kept apart from routes/desktop.ts (public distribution routes). `authenticate` is
 * passed in by app.ts, so tests can mount this router with their own sign-in without
 * touching the shared auth module (the suite shares one module registry).
 */
export interface ToolsDeps {
  /** The person's occurrences (lessons, activities, office hours, Reminder Hub sources). */
  collect: typeof collectOccurrences;
  classes?: typeof loadTeacherClasses;
  /** Is this person a super admin? (Only they approve Igisoro.) */
  superAdmin?: (userId: number) => Promise<boolean>;
}

const CONFIGURE = "DESKTOP_TOOLS_CONFIGURE";
const canConfigure = (req: any) => Array.isArray(req.user?.permissions) && req.user.permissions.includes(CONFIGURE);
const isSuperAdmin = async (userId: number) => (await getUserRoleNames(userId)).includes("SUPER_ADMIN");

export function desktopToolsRouter(authenticate: RequestHandler, deps: ToolsDeps = { collect: collectOccurrences }) {
const router = express.Router();

router.get(
  "/agenda",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    const days = Math.min(7, Math.max(1, Math.trunc(Number(req.query?.days)) || 1));
    const now = new Date();
    const today = kigaliParts(now).ymd;
    const occ = await deps.collect(userId, kigaliInstant(today, 0), kigaliInstant(addDaysYmd(today, days), 0));
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      data: {
        now: now.toISOString(),
        today,
        days,
        items: occ.map((o) => ({
          key: o.key,
          kind: o.kind,
          title: o.title,
          detail: o.detail,
          location: o.location,
          link: o.link,
          color: o.color,
          role: o.role,
          critical: o.critical,
          start: o.start.toISOString(),
          end: o.end ? o.end.toISOString() : null,
        })),
      },
    });
  }),
);

router.get(
  "/classes",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const classes = await (deps.classes ?? loadTeacherClasses)(Number(req.user.userId));
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { classes } });
  }),
);

router.post(
  "/games/usage",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const device = String(req.body?.device ?? "");
    if (!/^[a-z0-9]{8,16}$/.test(device)) return res.status(400).json({ success: false, message: "Bad device" });
    const entries = cleanUsage(req.body?.entries);
    const saved = await recordUsage(Number(req.user.userId), device, entries);
    res.json({ success: true, data: { saved } });
  }),
);

router.get(
  "/policy",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    const now = new Date();
    const { from, to } = policyRange(now);
    const policy = buildPolicy(await deps.collect(userId, from, to), now);
    const [{ persona }, settings, played] = await Promise.all([loadPersona(userId), loadGameSettings(), playedToday(userId, now)]);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { ...policy, games: gamesBlock(settings, persona, played) } });
  }),
);

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
    const used = await usedToday(userId);
    if (used >= limit)
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
      // From the count taken before this answer: the usage row is written in the background.
      line({ done: true, provider: run.provider, model: run.model, remaining: Math.max(0, limit - used - 1) });
    } catch (e: any) {
      flush();
      if (!abort.signal.aborted)
        line({ error: e instanceof ChatUnavailableError ? e.message : "The AI couldn't answer right now. Please try again.", code: e instanceof ChatUnavailableError ? e.reason : "FAILED" });
    }
    res.end();
  }),
);

router.get(
  "/settings/games",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const userId = Number(req.user.userId);
    const [settings, usage, superAdmin] = await Promise.all([loadGameSettings(), usageSummary(7), (deps.superAdmin ?? isSuperAdmin)(userId)]);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { settings, usage, games: GAME_IDS, igisoroVariants: IGISORO_VARIANTS, canApproveIgisoro: superAdmin } });
  }),
);

router.put(
  "/settings/games",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const userId = Number(req.user.userId);
    const superAdmin = await (deps.superAdmin ?? isSuperAdmin)(userId);
    const before = await loadGameSettings();
    const want = req.body?.igisoro;
    const changesIgisoro = !!want && (Boolean(want.approved) !== before.igisoro.approved || (want.approved && (want.variant ?? "standard") !== before.igisoro.variant));
    if (changesIgisoro && !superAdmin) return res.status(403).json({ success: false, code: "SUPER_ADMIN_ONLY", message: "Only a super admin can approve Igisoro." });
    const after = applySettingsUpdate(before, req.body, { userId, superAdmin });
    await saveGameSettings(after, userId);
    await recordActivity(userId, "DESKTOP_GAMES_SETTINGS", "Changed NGA Desktop game settings", "DesktopToolSetting", undefined, { before, after }, userId);
    if (before.igisoro.approved !== after.igisoro.approved) {
      await recordActivity(
        userId,
        after.igisoro.approved ? "DESKTOP_IGISORO_APPROVE" : "DESKTOP_IGISORO_REVOKE",
        after.igisoro.approved ? `Approved Igisoro (${after.igisoro.variant} rules)` : "Switched Igisoro off",
        "DesktopToolSetting", undefined, { variant: after.igisoro.variant }, userId,
      );
    }
    res.json({ success: true, data: { settings: after } });
  }),
);

return router;
}
