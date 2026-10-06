import express, { type RequestHandler } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ChatUnavailableError, streamChat, trimConversation } from "../services/aiProviders/chat";
import { FEATURE, blockedReason, burst, dailyLimit, loadPersona, systemPrompt, usedToday } from "../services/desktop/assistant";
import { collectOccurrences } from "../services/reminders/occurrences";
import { addDaysYmd, kigaliInstant, kigaliParts } from "../services/reminders/time";
import { buildPolicy, policyRange } from "../services/desktop/policy";
import { loadTeacherClasses } from "../services/desktop/classes";
import { applySettingsUpdate, cleanUsage, GAME_IDS, gamesBlock, IGISORO_VARIANTS, loadGameSettings, playedToday, recordUsage, saveGameSettings, usageSummary } from "../services/desktop/games";
import { ControlError, activeOverrides, createOverride, endClassGameTime, findStudents, revokeOverride, startClassGameTime, studentClassGameTime, studentOverride, teacherClassGameTimes } from "../services/desktop/gameControls";
import { TrError, isLang, latest, listEntries, publish, releases, revert, rollback, saveEdit, suggest, validKey } from "../services/desktop/translations";
import { ChatUnavailableError as TrChatUnavailable } from "../services/aiProviders/chat";
import { DEFAULT_TUTOR, activeLock, conversation as tutorConversation, conversations as tutorConversations, loadTutorSettings, logExchange, mergeTutor, questionsToday, report as reportTutor, runTutor, saveTutorSettings } from "../services/desktop/tutor";
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
 *   GET  /desktop/tools/class-game-time            running class game time in my classes (teachers)
 *   POST /desktop/tools/class-game-time            open games for one of my classes, 5–30 min
 *   POST /desktop/tools/class-game-time/:id/end    end it early
 *   GET  /desktop/tools/settings/games/overrides   active student exceptions (DESKTOP_TOOLS_CONFIGURE)
 *   GET  /desktop/tools/settings/games/students    find students by name (same)
 *   POST /desktop/tools/settings/games/overrides   block or extend one student (same)
 *   POST /desktop/tools/settings/games/overrides/:id/revoke
 *   GET  /desktop/tools/i18n/:lang?since=  the latest published translations (every desktop)
 *   GET  /desktop/tools/i18n/workspace/:lang      edits + releases (TOOLS_TRANSLATIONS_MANAGE)
 *   POST /desktop/tools/i18n/edit | revert | publish | rollback | suggest   (same)
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
    const student = persona === "student";
    const [cgt, override] = student ? await Promise.all([studentClassGameTime(userId), studentOverride(userId)]) : [null, null];
    const extras = {
      classGameTime: cgt ? { until: cgt.endsAt, games: cgt.games, by: cgt.by, className: cgt.className } : null,
      override: override ? { kind: override.kind, until: override.endsAt, reason: override.reason, extraMin: override.extraMin } : null,
    };
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { ...policy, games: gamesBlock(settings, persona, played, extras) } });
  }),
);

router.get(
  "/ai/status",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    const { persona } = await loadPersona(userId);
    if (persona === "student") {
      const settings = await loadTutorSettings();
      const used = await questionsToday(userId);
      return res.json({
        success: true,
        data: { available: settings.enabled, reason: settings.enabled ? null : "TUTOR_OFF", persona, mode: "tutor", limit: settings.dailyCap, used, remaining: Math.max(0, settings.dailyCap - used) },
      });
    }
    const limit = dailyLimit(persona);
    const used = await usedToday(userId);
    const blocked = blockedReason(persona);
    res.json({
      success: true,
      data: { available: !blocked, reason: blocked, persona, mode: "assistant", limit, used, remaining: Math.max(0, limit - used) },
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
    if (blocked) return res.status(403).json({ success: false, code: blocked, message: "Ask AI isn't available for parents yet." });
    let messages;
    try {
      messages = trimConversation(req.body?.messages);
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Bad request" });
    }
    if (!burst.take(String(userId))) return res.status(429).json({ success: false, code: "SLOW_DOWN", message: "Too many messages in a minute. Please wait a moment." });
    if (persona === "student") return tutorTurn(req, res, userId, firstName, messages);
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

const controlError = (res: any, e: unknown) => {
  if (e instanceof ControlError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
  throw e;
};

router.get(
  "/class-game-time",
  authenticate,
  asyncHandler(async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { active: await teacherClassGameTimes(Number(req.user.userId), deps.classes) } });
  }),
);

router.post(
  "/class-game-time",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    try {
      const t = await startClassGameTime(userId, req.body ?? {}, deps.classes);
      await recordActivity(userId, "DESKTOP_CLASS_GAME_TIME", `Opened games for ${t.className} until ${t.endsAt}`, "ClassGroup", t.classGroupId, { games: t.games, endsAt: t.endsAt }, userId);
      res.json({ success: true, data: t });
    } catch (e) {
      controlError(res, e);
    }
  }),
);

router.post(
  "/class-game-time/:id/end",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const userId = Number(req.user.userId);
    try {
      await endClassGameTime(userId, Number(req.params.id), deps.classes);
      await recordActivity(userId, "DESKTOP_CLASS_GAME_TIME_END", "Ended class game time", "DesktopClassGameTime", Number(req.params.id), undefined, userId);
      res.json({ success: true, data: { ended: true } });
    } catch (e) {
      controlError(res, e);
    }
  }),
);

router.get(
  "/settings/games/overrides",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { overrides: await activeOverrides() } });
  }),
);

router.get(
  "/settings/games/students",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    res.json({ success: true, data: { students: await findStudents(String(req.query.q ?? "")) } });
  }),
);

router.post(
  "/settings/games/overrides",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const userId = Number(req.user.userId);
    try {
      const o = await createOverride(userId, req.body ?? {});
      await recordActivity(userId, o.kind === "block" ? "DESKTOP_GAMES_BLOCK" : "DESKTOP_GAMES_EXTEND", `${o.kind === "block" ? "Blocked games for" : "Extended game time for"} ${o.name} until ${o.endsAt}: ${o.reason}`, "User", o.userId, { overrideId: o.id, extraMin: o.extraMin }, userId);
      res.json({ success: true, data: o });
    } catch (e) {
      controlError(res, e);
    }
  }),
);

router.post(
  "/settings/games/overrides/:id/revoke",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const userId = Number(req.user.userId);
    const ok = await revokeOverride(userId, Number(req.params.id));
    if (!ok) return res.status(404).json({ success: false, message: "Not found or already ended." });
    await recordActivity(userId, "DESKTOP_GAMES_OVERRIDE_REVOKE", "Ended a games exception early", "DesktopGameOverride", Number(req.params.id), undefined, userId);
    res.json({ success: true, data: { revoked: true } });
  }),
);

const TRANSLATE = "TOOLS_TRANSLATIONS_MANAGE";
const canTranslate = (req: any) => Array.isArray(req.user?.permissions) && req.user.permissions.includes(TRANSLATE);
const trError = (res: any, e: unknown) => {
  if (e instanceof TrError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
  if (e instanceof TrChatUnavailable) return res.status(503).json({ success: false, code: `AI_${e.reason}`, message: "AI suggestions aren't available right now." });
  throw e;
};

router.get(
  "/i18n/workspace/:lang",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canTranslate(req)) return res.status(403).json({ success: false, code: "NO_PERMISSION", message: "Ask an admin for the translations permission." });
    const lang = req.params.lang;
    if (!isLang(lang)) return res.status(400).json({ success: false, message: "Unknown language" });
    const [entries, rel] = await Promise.all([listEntries(lang), releases(lang)]);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { entries, releases: rel } });
  }),
);

router.get(
  "/i18n/:lang",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const lang = req.params.lang;
    if (!isLang(lang)) return res.status(400).json({ success: false, message: "Unknown language" });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await latest(lang, Number(req.query.since) || 0) });
  }),
);

router.post(
  "/i18n/:action(edit|revert|publish|rollback|suggest)",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canTranslate(req)) return res.status(403).json({ success: false, code: "NO_PERMISSION", message: "Ask an admin for the translations permission." });
    const userId = Number(req.user.userId);
    const b = req.body ?? {};
    try {
      switch (req.params.action) {
        case "edit": {
          const e = await saveEdit(userId, b);
          await recordActivity(userId, e.status === "approved" ? "DESKTOP_TRANSLATION_APPROVE" : "DESKTOP_TRANSLATION_EDIT", `${b.lang}: ${e.key}`, "DesktopToolTranslation", undefined, { lang: b.lang, key: e.key, text: e.text, status: e.status, previous: b.previous ?? null }, userId);
          return res.json({ success: true, data: e });
        }
        case "revert": {
          if (!isLang(b.lang) || !validKey(b.key)) return res.status(400).json({ success: false, message: "Bad request" });
          const done = await revert(b.lang, b.key);
          if (done) await recordActivity(userId, "DESKTOP_TRANSLATION_REVERT", `${b.lang}: ${b.key}`, "DesktopToolTranslation", undefined, { lang: b.lang, key: b.key }, userId);
          return res.json({ success: true, data: { reverted: done } });
        }
        case "publish": {
          if (!isLang(b.lang)) return res.status(400).json({ success: false, message: "Bad request" });
          const r = await publish(userId, b.lang, typeof b.note === "string" ? b.note : undefined);
          await recordActivity(userId, "DESKTOP_TRANSLATION_PUBLISH", `Published ${b.lang} release #${r.id} (${r.count} strings)`, "DesktopToolTranslationRelease", r.id, { lang: b.lang }, userId);
          return res.json({ success: true, data: r });
        }
        case "rollback": {
          if (!isLang(b.lang)) return res.status(400).json({ success: false, message: "Bad request" });
          const r = await rollback(userId, b.lang, Number(b.release));
          await recordActivity(userId, "DESKTOP_TRANSLATION_ROLLBACK", `Rolled ${b.lang} back to release #${b.release} (new #${r.id})`, "DesktopToolTranslationRelease", r.id, { lang: b.lang, from: Number(b.release) }, userId);
          return res.json({ success: true, data: r });
        }
        case "suggest":
          return res.json({ success: true, data: { text: await suggest(userId, b) } });
      }
    } catch (e) {
      trError(res, e);
    }
  }),
);

/** A student's question: settings, lesson/exam lock, daily cap, then the tutor pipeline (whole reply, NDJSON). */
async function tutorTurn(req: any, res: any, userId: number, firstName: string, messages: any[]) {
  const settings = await loadTutorSettings();
  if (!settings.enabled) return res.status(403).json({ success: false, code: "TUTOR_OFF", message: "Your school has switched the AI Tutor off for now." });
  const conversationId = String(req.body?.conversationId ?? "");
  if (!/^[a-z0-9]{6,40}$/.test(conversationId)) return res.status(400).json({ success: false, message: "Bad conversation" });
  const now = new Date();
  const { from, to } = policyRange(now);
  const lock = activeLock(buildPolicy(await deps.collect(userId, from, to), now).windows as any[], now);
  if (lock) return res.status(423).json({ success: false, code: lock.kind === "exam" ? "LOCKED_EXAM" : "LOCKED_LESSON", label: lock.label, until: lock.until, message: lock.kind === "exam" ? "The AI Tutor pauses during exams." : "The AI Tutor pauses during your lessons." });
  const used = await questionsToday(userId);
  if (used >= settings.dailyCap)
    return res.status(429).json({ success: false, code: "DAILY_LIMIT", message: `You've asked today's ${settings.dailyCap} questions. They refill tomorrow.` });

  res.status(200);
  res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  const line = (o: unknown) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
  line({ status: "thinking" });
  const question = messages[messages.length - 1].content;
  try {
    const reply = await runTutor({ userId, firstName, messages, signal: abort.signal, now });
    const messageId = await logExchange(userId, conversationId, question, reply);
    line({ t: reply.text });
    line({ done: true, mode: "tutor", provider: reply.provider, model: reply.model, messageId, remaining: Math.max(0, settings.dailyCap - used - 1) });
  } catch (e: any) {
    if (!abort.signal.aborted)
      line({ error: e instanceof ChatUnavailableError ? e.message : "The tutor couldn't answer right now. Please try again.", code: e instanceof ChatUnavailableError ? e.reason : "FAILED" });
  }
  res.end();
}

router.post(
  "/ai/report",
  authenticate,
  asyncHandler(async (req: any, res) => {
    const ok = await reportTutor(Number(req.user.userId), Number(req.body?.messageId), String(req.body?.reason ?? "").trim() || "no reason given");
    if (!ok) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: { reported: true } });
  }),
);

router.get(
  "/settings/tutor",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 14));
    const [settings, list] = await Promise.all([loadTutorSettings(), tutorConversations({ flaggedOnly: req.query.flagged === "1", days })]);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { settings, defaults: DEFAULT_TUTOR, conversations: list } });
  }),
);

router.put(
  "/settings/tutor",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const userId = Number(req.user.userId);
    const before = await loadTutorSettings();
    const after = mergeTutor(req.body);
    await saveTutorSettings(after, userId);
    await recordActivity(userId, "DESKTOP_TUTOR_SETTINGS", "Changed the AI Tutor settings", "DesktopToolSetting", undefined, { before, after }, userId);
    res.json({ success: true, data: { settings: after } });
  }),
);

router.get(
  "/settings/tutor/conversations/:id",
  authenticate,
  asyncHandler(async (req: any, res) => {
    if (!canConfigure(req)) return res.status(403).json({ success: false, message: "Forbidden" });
    const id = String(req.params.id);
    if (!/^[a-z0-9]{6,40}$/.test(id)) return res.status(400).json({ success: false, message: "Bad conversation" });
    const messages = await tutorConversation(id);
    // Reading a student's conversation is itself recorded.
    await recordActivity(Number(req.user.userId), "DESKTOP_TUTOR_VIEW", `Viewed AI Tutor conversation ${id}`, "DesktopTutorMessage", undefined, { conversationId: id }, Number(req.user.userId));
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { messages } });
  }),
);

return router;
}
