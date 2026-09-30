import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { and, eq, inArray, like } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, System } from "../db/schema";
import {
  GoogleCalendarEvent,
  GoogleCalendarLink,
  ReminderJob,
  ReminderSource,
  TelegramLink,
  TelegramLinkCode,
} from "../db/reminderSchema";
import {
  createUser,
  createAcademicPeriod,
  createSubject,
  createStudentSubjectEnrollment,
  signToken,
} from "../test/fixtures";
import { collectOccurrences } from "../services/reminders/occurrences";
import { expandForUser } from "../services/reminders/expander";
import { deliverJob, describeJob, dispatchDue } from "../services/reminders/dispatcher";
import { getPreferences, savePreferences } from "../services/reminders/preferences";
import { cancelSourceItem, describeWhen, parseSourceItem, saveSource } from "../services/reminders/sources";
import { escalateUnacked, escalationEmail, setEmailSender } from "../services/reminders/channels";
import { handleTelegramUpdate, setTelegramTransport, createLinkCode, sendTelegramReminder } from "../services/reminders/telegram";
import { eventBody, setGoogleTransport, syncGoogleCalendar, buildAuthUrl } from "../services/reminders/googleCalendar";
import { seal, signState, verifyState } from "../services/reminders/secretBox";
import { kigaliInstant } from "../services/reminders/time";
import type { PushSender } from "../services/reminders/webPush";

/**
 * Reminder Hub, part two: the other NGA apps feeding it (batch Source API,
 * subject audiences, change notices) and the optional channels (Telegram,
 * email escalation, Google Calendar). Real test database; every outside
 * service (Telegram, Google, SMTP, push) is a recorded fake.
 */

const noPush: PushSender = async () => ({ ok: true, statusCode: 201 });
const HOUR = 3_600_000;

describe("Reminder Hub: integrations and channels", () => {
  let subjectId: number;
  let studentId: number;
  let otherStudentId: number;
  let termId: number;
  let previouslyCurrent: number[] = [];
  const clientId = `rem_${crypto.randomBytes(4).toString("hex")}`;
  const clientSecret = crypto.randomBytes(16).toString("hex");
  const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  const env = { ...process.env, REMINDERS_SOURCE_CLIENTS: `taskmentor_app,tupo,${clientId}` };
  process.env.REMINDERS_SOURCE_CLIENTS = env.REMINDERS_SOURCE_CLIENTS;

  beforeAll(async () => {
    previouslyCurrent = (
      await db.select({ id: AcademicTerm.academic_term_id }).from(AcademicTerm).where(eq(AcademicTerm.is_current, 1))
    ).map((r) => r.id);
    await db.update(AcademicTerm).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    termId = period.academicTermId;
    await db
      .update(AcademicTerm)
      .set({ start_date: "2026-01-01", end_date: "2027-12-31" } as any)
      .where(eq(AcademicTerm.academic_term_id, termId));
    subjectId = await createSubject();
    studentId = await createUser({ userType: "STUDENT" });
    otherStudentId = await createUser({ userType: "STUDENT" });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: period.academicYearId });
    await savePreferences(studentId, { enabled: true, morningBriefing: false });
    await savePreferences(otherStudentId, { enabled: true, morningBriefing: false });
    await db.insert(System).values({
      name: clientId,
      client_id: clientId,
      client_secret: clientSecret,
      status: "ACTIVE",
      icon_url: "https://example.test/i.png",
      home_url: "https://example.test",
    } as any);
  });

  afterAll(async () => {
    await db.update(System).set({ status: "DISABLED" }).where(eq(System.client_id, clientId));
    await db.update(AcademicTerm).set({ is_current: 0 }).where(eq(AcademicTerm.academic_term_id, termId));
    if (previouslyCurrent.length) {
      await db.update(AcademicTerm).set({ is_current: 1 }).where(inArray(AcademicTerm.academic_term_id, previouslyCurrent));
    }
  });

  afterEach(() => {
    process.env = { ...env };
    setTelegramTransport(null);
    setGoogleTransport(null);
    setEmailSender(null);
  });

  const item = (over: Record<string, unknown> = {}) => ({
    source_app: "taskmentor",
    source_type: "quiz_close",
    external_id: `quiz-${crypto.randomBytes(4).toString("hex")}-close`,
    title: "Algebra quiz",
    starts_at: new Date(Date.now() + 5 * HOUR).toISOString(),
    link: "https://taskmentor.example/quizzes/9/take",
    critical: true,
    audience_subject_id: subjectId,
    ...over,
  });

  // ─── Source API ────────────────────────────────────────────────────────────

  describe("Source API", () => {
    it("accepts a batch with the app's own client credentials; bad items fail on their own", async () => {
      const good = item();
      const res = await request(app)
        .put("/reminders/sources/batch")
        .set("Authorization", basic)
        .send({ items: [good, { ...item(), source_type: "birthday" }, { ...item(), audience_subject_id: null }] });
      expect(res.status).toBe(200);
      expect(res.body.data.saved).toBe(1);
      expect(res.body.data.failed).toBe(2);
      expect(res.body.data.results[0]).toMatchObject({ external_id: good.external_id, ok: true, changed: true });
      expect(res.body.data.results[1].error).toMatch(/source_type/);

      // Re-sending the same item is a no-op, so apps can sweep freely.
      const again = await request(app).put("/reminders/sources/batch").set("Authorization", basic).send({ items: [good] });
      expect(again.body.data.results[0]).toMatchObject({ ok: true, changed: false });
    });

    it("only the NGA apps may write with client credentials", async () => {
      process.env.REMINDERS_SOURCE_CLIENTS = "taskmentor_app,tupo";
      const res = await request(app).put("/reminders/sources/batch").set("Authorization", basic).send({ items: [item()] });
      expect(res.status).toBe(403);
    });

    it("refuses a wrong secret and oversized batches", async () => {
      const wrong = `Basic ${Buffer.from(`${clientId}:nope`).toString("base64")}`;
      expect((await request(app).put("/reminders/sources/batch").set("Authorization", wrong).send({ items: [item()] })).status).toBe(401);
      const big = Array.from({ length: 201 }, () => item());
      expect((await request(app).put("/reminders/sources/batch").set("Authorization", basic).send({ items: big })).status).toBe(400);
    });

    it("a subject audience reaches its enrolled students only, and plans their reminders", async () => {
      const saved = await saveSource(parseSourceItem(item()));
      const from = new Date();
      const to = new Date(Date.now() + 24 * HOUR);
      const mine = (await collectOccurrences(studentId, from, to)).filter((o) => o.key === `src:${saved.source_id}`);
      const theirs = (await collectOccurrences(otherStudentId, from, to)).filter((o) => o.key === `src:${saved.source_id}`);
      expect(mine).toHaveLength(1);
      expect(theirs).toHaveLength(0);

      await expandForUser(studentId);
      const jobs = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `src:${saved.source_id}:%`)));
      expect(jobs.map((j) => j.offset_min).sort((a, b) => a - b)).toEqual([15, 60]);
    });
  });

  // ─── Change notices ───────────────────────────────────────────────────────

  describe("change notices", () => {
    const markSent = (sourceId: number) =>
      db
        .update(ReminderJob)
        .set({ status: "sent", sent_at: new Date() })
        .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `src:${sourceId}:60`)));

    it("tells people who were reminded when the time moves, once", async () => {
      const base = item({ starts_at: new Date(Date.now() + 3 * HOUR).toISOString(), audience_user_ids: [studentId], audience_subject_id: null });
      const saved = await saveSource(parseSourceItem(base));
      await expandForUser(studentId);
      await markSent(saved.source_id);

      const later = new Date(Date.now() + 26 * HOUR);
      const moved = await saveSource(parseSourceItem({ ...base, starts_at: later.toISOString() }));
      expect(moved.noticed).toBe(1);
      const notices = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `chg:${saved.source_id}:%`)));
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ source_type: "change", status: "pending", critical: 1 });
      expect(notices[0].title).toBe("Quiz deadline moved: Algebra quiz");
      expect(notices[0].body).toMatch(/^Now (tomorrow|today|\w{3} \d+ \w{3}) at \d\d:\d\d \(was today at \d\d:\d\d\)$/);

      // The same move again (a re-sync) doesn't notify twice.
      const same = await saveSource(parseSourceItem({ ...base, starts_at: later.toISOString() }));
      expect(same.changed).toBe(false);

      // The planner leaves the notice alone.
      await expandForUser(studentId);
      const [still] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, notices[0].job_id));
      expect(still.status).toBe("pending");

      // And it is worded as-is.
      expect(describeJob(still, new Date()).title).toBe("Quiz deadline moved: Algebra quiz");
    });

    it("stays quiet about far-away moves and about people never reminded", async () => {
      const base = item({ starts_at: new Date(Date.now() + 5 * 24 * HOUR).toISOString(), audience_user_ids: [studentId], audience_subject_id: null });
      await saveSource(parseSourceItem(base));
      const moved = await saveSource(parseSourceItem({ ...base, starts_at: new Date(Date.now() + 6 * 24 * HOUR).toISOString() }));
      expect(moved.noticed).toBe(0);
    });

    it("announces a cancellation close to the time and withdraws pending reminders", async () => {
      const base = item({ starts_at: new Date(Date.now() + 4 * HOUR).toISOString(), audience_user_ids: [studentId], audience_subject_id: null });
      const saved = await saveSource(parseSourceItem(base));
      await expandForUser(studentId);
      await markSent(saved.source_id);

      const result = await cancelSourceItem("taskmentor", "quiz_close", base.external_id as string);
      expect(result).toMatchObject({ noticed: 1 });
      expect(result!.cancelledJobs).toBeGreaterThanOrEqual(1);
      const [notice] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, studentId), eq(ReminderJob.dedupe_key, `chg:${saved.source_id}:cancelled`)));
      expect(notice.title).toBe("Quiz deadline cancelled: Algebra quiz");
      // Cancelling twice is harmless.
      expect(await cancelSourceItem("taskmentor", "quiz_close", base.external_id as string)).toMatchObject({ noticed: 0 });
      const [src] = await db.select().from(ReminderSource).where(eq(ReminderSource.source_id, saved.source_id));
      expect(src.cancelled_at).not.toBeNull();
    });

    it("words dates in Kigali time", () => {
      const now = kigaliInstant("2026-09-30", 9 * 60);
      expect(describeWhen(kigaliInstant("2026-09-30", 14 * 60), now)).toBe("today at 14:00");
      expect(describeWhen(kigaliInstant("2026-10-01", 8 * 60 + 5), now)).toBe("tomorrow at 08:05");
      expect(describeWhen(kigaliInstant("2026-10-05", 10 * 60), now)).toBe("Mon 5 Oct at 10:00");
    });
  });

  // ─── Telegram ─────────────────────────────────────────────────────────────

  describe("Telegram", () => {
    const configure = () => {
      process.env.TELEGRAM_BOT_TOKEN = "123:abc";
      process.env.TELEGRAM_BOT_USERNAME = "nga_reminders_bot";
      process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret";
    };
    const recorder = () => {
      const calls: Array<{ method: string; body: any }> = [];
      setTelegramTransport(async (method, body) => {
        calls.push({ method, body });
        if (method === "sendMessage" && body.chat_id === 403) {
          const err: any = new Error("Forbidden: bot was blocked by the user");
          err.code = 403;
          throw err;
        }
        return { message_id: 1 };
      });
      return calls;
    };

    it("is reported unavailable until the bot is configured", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const res = await request(app).post("/reminders/telegram/link").set("Authorization", `Bearer ${signToken(studentId)}`);
      expect(res.status).toBe(503);
      const cfg = await request(app).get("/reminders/config").set("Authorization", `Bearer ${signToken(studentId)}`);
      expect(cfg.body.data.telegram).toEqual({ enabled: false, bot: null });
    });

    it("links a chat through /start <code>, delivers with buttons, and acks from the button", async () => {
      configure();
      const calls = recorder();
      const link = await request(app).post("/reminders/telegram/link").set("Authorization", `Bearer ${signToken(studentId)}`);
      expect(link.status).toBe(201);
      expect(link.body.data.url).toMatch(/^https:\/\/t\.me\/nga_reminders_bot\?start=[\w-]{20,64}$/);
      const code = new URL(link.body.data.url).searchParams.get("start")!;

      // Telegram calls the webhook; a wrong secret is refused.
      const update = { message: { chat: { id: 777001 }, from: { username: "aline" }, text: `/start ${code}` } };
      expect((await request(app).post("/reminders/telegram/webhook").set("X-Telegram-Bot-Api-Secret-Token", "x").send(update)).status).toBe(401);
      const hook = await request(app).post("/reminders/telegram/webhook").set("X-Telegram-Bot-Api-Secret-Token", "hook-secret").send(update);
      expect(hook.status).toBe(200);
      const [row] = await db.select().from(TelegramLink).where(eq(TelegramLink.user_id, studentId));
      expect(Number(row.chat_id)).toBe(777001);
      expect(await db.select().from(TelegramLinkCode).where(eq(TelegramLinkCode.code, code))).toHaveLength(0);

      // A reminder goes to the chat too.
      const [ins] = (await db.insert(ReminderJob).values({
        user_id: studentId,
        dedupe_key: `tg-test:${Date.now()}`,
        source_type: "quiz_close",
        title: "Algebra quiz",
        link: "https://taskmentor.example/quizzes/9/take",
        event_start: new Date(Date.now() + HOUR),
        fire_at: new Date(),
        status: "sending",
      })) as any;
      const [job] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, ins.insertId));
      const report = await deliverJob(job, { send: noPush });
      expect(report.channels).toContain("telegram");
      const sent = calls.find((c) => c.method === "sendMessage" && c.body.chat_id === 777001 && c.body.reply_markup);
      expect(sent!.body.text).toContain("<b>Quiz closes in 1 h: Algebra quiz</b>");
      // Current Bot API field, not the deprecated disable_web_page_preview.
      expect(sent!.body.link_preview_options).toEqual({ is_disabled: true });
      expect(sent!.body.disable_web_page_preview).toBeUndefined();
      expect(sent!.body.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([`ack:${job.job_id}`, `snooze:${job.job_id}`]);
      expect(sent!.body.reply_markup.inline_keyboard[1][0].url).toBe("https://taskmentor.example/quizzes/9/take");

      // "Got it" from the linked chat acks; from another chat it's refused.
      const actions = {
        ack: async () => {
          await db.update(ReminderJob).set({ acked_at: new Date() }).where(eq(ReminderJob.job_id, job.job_id));
          return true;
        },
        snooze: async () => ({ ok: true }),
      };
      expect(await handleTelegramUpdate({ callback_query: { id: "q1", data: `ack:${job.job_id}`, message: { chat: { id: 999 } } } }, actions)).toBe("rejected");
      expect(await handleTelegramUpdate({ callback_query: { id: "q2", data: `ack:${job.job_id}`, message: { chat: { id: 777001 }, message_id: 5 } } }, actions)).toBe("ack");
      const [acked] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, job.job_id));
      expect(acked.acked_at).not.toBeNull();
    });

    it("respects the Telegram switch and unlinks a chat that blocked the bot", async () => {
      configure();
      recorder();
      await db.delete(TelegramLink).where(eq(TelegramLink.user_id, otherStudentId));
      await db.insert(TelegramLink).values({ user_id: otherStudentId, chat_id: 403, username: null });
      const job = {
        job_id: 1, user_id: otherStudentId, dedupe_key: "x", source_type: "meeting", title: "Staff meeting", body: null,
        link: null, event_start: new Date(Date.now() + HOUR), critical: 0, attempts: 0,
      } as any;

      await savePreferences(otherStudentId, { channels: { telegram: false } });
      expect((await deliverJob(job, { send: noPush })).channels).not.toContain("telegram");

      await savePreferences(otherStudentId, { channels: { telegram: true } });
      const report = await deliverJob(job, { send: noPush });
      expect(report.errors.join()).toMatch(/blocked/);
      expect(await db.select().from(TelegramLink).where(eq(TelegramLink.user_id, otherStudentId))).toHaveLength(0);
    });

    it("waits out a 429 once, and keeps one message per second per chat", async () => {
      configure();
      const times: number[] = [];
      let limited = false;
      setTelegramTransport(async (method, body) => {
        if (method !== "sendMessage") return {};
        times.push(Date.now());
        if (!limited) {
          limited = true;
          const err: any = new Error("Too Many Requests: retry after 1");
          err.code = 429;
          err.retryAfter = 1;
          throw err;
        }
        return { message_id: 2, chat: body.chat_id };
      });
      const job = { job_id: 7, link: null, source_type: "meeting" };
      const first = await sendTelegramReminder(555001, job, { title: "A", body: "" });
      expect(first.ok).toBe(true);
      expect(times).toHaveLength(2);
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(990);

      // A second reminder to the same chat right away is spaced ≥ 1 s.
      const before = Date.now();
      await sendTelegramReminder(555001, job, { title: "B", body: "" });
      expect(times[2] - times[1]).toBeGreaterThanOrEqual(1000);
      expect(Date.now() - before).toBeLessThan(2500);

      // A long back-off is not waited for inline.
      setTelegramTransport(async () => {
        const err: any = new Error("Too Many Requests: retry after 120");
        err.code = 429;
        err.retryAfter = 120;
        throw err;
      });
      const late = await sendTelegramReminder(555002, job, { title: "C", body: "" });
      expect(late).toMatchObject({ ok: false, gone: false });
    }, 15_000);

    it("an expired or unknown link code is answered politely", async () => {
      configure();
      const calls = recorder();
      await createLinkCode(studentId);
      expect(await handleTelegramUpdate({ message: { chat: { id: 5 }, text: "/start not-a-code" } }, { ack: async () => true, snooze: async () => ({ ok: true }) })).toBe("expired");
      expect(calls.at(-1)!.body.text).toMatch(/expired/);
    });
  });

  // ─── Email escalation ─────────────────────────────────────────────────────

  describe("email escalation", () => {
    const criticalSent = async (userId: number, minutesAgo: number) => {
      const [ins] = (await db.insert(ReminderJob).values({
        user_id: userId,
        dedupe_key: `esc:${crypto.randomUUID()}`,
        source_type: "assignment_due",
        title: "Essay",
        link: "https://taskmentor.example/assignments/4",
        event_start: new Date(Date.now() + 2 * HOUR),
        fire_at: new Date(Date.now() - minutesAgo * 60_000),
        sent_at: new Date(Date.now() - minutesAgo * 60_000),
        critical: 1,
        status: "sent",
        channels: "in_app,push",
      })) as any;
      return Number(ins.insertId);
    };

    it("emails an unacknowledged critical reminder once, only to people who opted in", async () => {
      const mails: Array<{ to: string; subject: string; html: string }> = [];
      setEmailSender(async (to, subject, html) => {
        mails.push({ to, subject, html });
        return true;
      });
      await savePreferences(studentId, { channels: { email: true } });
      await savePreferences(otherStudentId, { channels: { email: false } });
      const mine = await criticalSent(studentId, 11);
      const fresh = await criticalSent(studentId, 2);
      const optedOut = await criticalSent(otherStudentId, 11);

      await escalateUnacked(describeJob);
      await escalateUnacked(describeJob);
      const toMine = mails.filter((m) => m.subject === "Reminder: Due in 2 h: Essay");
      expect(toMine).toHaveLength(1);
      expect(toMine[0].html).toContain("https://taskmentor.example/assignments/4");

      const rows = await db.select().from(ReminderJob).where(inArray(ReminderJob.job_id, [mine, fresh, optedOut]));
      const byId = new Map(rows.map((r) => [r.job_id, r]));
      expect(byId.get(mine)!.channels).toBe("in_app,push,email");
      expect(byId.get(fresh)!.escalated_at).toBeNull();
      expect(byId.get(optedOut)!.escalated_at).not.toBeNull();
      expect(byId.get(optedOut)!.channels).toBe("in_app,push");
    });

    it("escapes the reminder text in the email", () => {
      const mail = escalationEmail({ title: "x", body: null, link: null }, { title: "<script>", body: 'a "b"' });
      expect(mail.html).toContain("&lt;script&gt;");
      expect(mail.html).not.toContain("<script>");
    });

    it("runs from the dispatcher tick", async () => {
      setEmailSender(async () => true);
      const res = await dispatchDue({ send: noPush });
      expect(typeof res.escalated).toBe("number");
    });
  });

  // ─── Google Calendar ──────────────────────────────────────────────────────

  describe("Google Calendar", () => {
    const configure = () => {
      process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
      process.env.GOOGLE_CLIENT_SECRET = "shh";
    };

    it("builds a least-privilege consent URL with a signed state", () => {
      configure();
      const url = new URL(buildAuthUrl(studentId)!);
      expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.app.created");
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(verifyState<{ uid: number }>(url.searchParams.get("state")!)!.uid).toBe(studentId);
      expect(verifyState(signState({ uid: 1 }, -1))).toBeNull();
      expect(verifyState(`${url.searchParams.get("state")}x`)).toBeNull();
    });

    it("the callback rejects a forged state and sends the browser back to /reminders", async () => {
      configure();
      const res = await request(app).get("/reminders/google/callback").query({ code: "c", state: "forged.state" });
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/reminders\?google=error$/);
      const denied = await request(app).get("/reminders/google/callback").query({ error: "access_denied" });
      expect(denied.headers.location).toMatch(/google=denied$/);
    });

    it("mirrors the plan: creates the NGA calendar, inserts, skips unchanged, deletes what disappeared", async () => {
      configure();
      const calls: Array<{ method: string; url: string; body: any }> = [];
      let n = 0;
      setGoogleTransport(async (url, init) => {
        const body = init.body ? (init.body.startsWith("{") ? JSON.parse(init.body) : init.body) : null;
        calls.push({ method: init.method ?? "GET", url, body });
        if (url.includes("oauth2.googleapis.com/token")) return { status: 200, json: { access_token: "at", expires_in: 3600 } };
        if (url.endsWith("/calendars") && init.method === "POST") return { status: 200, json: { id: "cal-1" } };
        if (init.method === "POST") return { status: 200, json: { id: `ev-${++n}` } };
        if (init.method === "DELETE") return { status: 204, json: null };
        return { status: 200, json: {} };
      });
      await db.delete(GoogleCalendarEvent).where(eq(GoogleCalendarEvent.user_id, studentId));
      await db.delete(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, studentId));
      await db.insert(GoogleCalendarLink).values({ user_id: studentId, refresh_token_enc: seal("rt"), status: "active" });
      await savePreferences(studentId, { channels: { googleCalendar: true } });

      const src = item({ external_id: `g-${Date.now()}`, starts_at: new Date(Date.now() + 30 * HOUR).toISOString() });
      const saved = await saveSource(parseSourceItem(src));

      const first = await syncGoogleCalendar(studentId);
      expect(first!.created).toBeGreaterThanOrEqual(1);
      expect(calls.some((c) => c.url.endsWith("/calendars") && c.body.summary === "NGA · My Timetable")).toBe(true);
      const inserted = calls.find((c) => c.method === "POST" && c.body?.extendedProperties?.private?.ngaKey === `src:${saved.source_id}`);
      expect(inserted!.body.reminders.overrides).toEqual([{ method: "popup", minutes: 60 }, { method: "popup", minutes: 15 }]);

      calls.length = 0;
      const second = await syncGoogleCalendar(studentId);
      expect(second).toEqual({ created: 0, updated: 0, removed: 0 });

      await cancelSourceItem("taskmentor", "quiz_close", src.external_id as string);
      const third = await syncGoogleCalendar(studentId);
      expect(third!.removed).toBeGreaterThanOrEqual(1);
      expect(calls.some((c) => c.method === "DELETE")).toBe(true);

      const [link] = await db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, studentId));
      expect(link.calendar_id).toBe("cal-1");
      expect(link.last_error).toBeNull();
    });

    it("marks the link revoked when Google says invalid_grant", async () => {
      configure();
      setGoogleTransport(async () => ({ status: 400, json: { error: "invalid_grant", error_description: "Token has been revoked." } }));
      await db.update(GoogleCalendarLink).set({ status: "active" }).where(eq(GoogleCalendarLink.user_id, studentId));
      expect(await syncGoogleCalendar(studentId)).toBeNull();
      const [link] = await db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, studentId));
      expect(link.status).toBe("revoked");
      await db.delete(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, studentId));
    });

    it("event bodies carry Kigali time, the link and at most 5 alarms", async () => {
      const prefs = await getPreferences(studentId);
      const body = eventBody(
        { key: "src:1", kind: "assignment_due", title: "Essay", start: new Date("2026-10-02T08:00:00Z"), end: null, link: "https://x.test/a", location: null } as any,
        prefs,
      );
      expect(body.start).toEqual({ dateTime: "2026-10-02T08:00:00.000Z", timeZone: "Africa/Kigali" });
      expect(body.description).toContain("https://x.test/a");
      expect(body.reminders.overrides.length).toBeLessThanOrEqual(5);
    });
  });
});
