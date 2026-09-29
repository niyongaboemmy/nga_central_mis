import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { and, eq, inArray, like } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, CalendarSlot, IntegrationToken, Notification, Subject } from "../db/schema";
import { PushSubscription, ReminderJob, ReminderPreference } from "../db/reminderSchema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createCalendarSlot,
  signToken,
} from "../test/fixtures";
import { collectOccurrences } from "../services/reminders/occurrences";
import { expandForUser } from "../services/reminders/expander";
import { dispatchDue, sendTestReminder } from "../services/reminders/dispatcher";
import { savePreferences } from "../services/reminders/preferences";
import { kigaliInstant } from "../services/reminders/time";
import { signAction, type PushSender } from "../services/reminders/webPush";

// Wednesday 30 Sep 2026 -- the fixtures' term is stretched to cover it.
const WED = "2026-09-30";
const WED_0800 = kigaliInstant(WED, 8 * 60);
const FCM = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

const recordingSender = () => {
  const calls: Array<{ endpoint: string; payload: any; ttl: number; urgency?: string }> = [];
  const send: PushSender = async (sub, payload, options) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), ttl: options.ttl, urgency: options.urgency });
    if (sub.endpoint.includes("gone")) return { ok: false, gone: true, statusCode: 410, error: "gone" };
    return { ok: true, statusCode: 201 };
  };
  return { calls, send };
};

const addSubscription = (userId: number, endpoint: string) =>
  db.insert(PushSubscription).values({
    user_id: userId,
    endpoint_hash: crypto.createHash("sha256").update(endpoint).digest("hex"),
    endpoint,
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
    platform: "android",
    browser: "chrome",
  });

const jobsFor = (userId: number) => db.select().from(ReminderJob).where(eq(ReminderJob.user_id, userId));

describe("Reminder Hub", () => {
  let yearId: number;
  let termId: number;
  let classGroupId: number;
  let subjectId: number;
  let teacherId: number;
  let studentId: number;
  let slotId: number;
  let previouslyCurrent: number[] = [];

  beforeAll(async () => {
    // One current term only: other suites leave theirs flagged current. The
    // flags are put back in afterAll -- the test schema is shared.
    previouslyCurrent = (
      await db.select({ id: AcademicTerm.academic_term_id }).from(AcademicTerm).where(eq(AcademicTerm.is_current, 1))
    ).map((r) => r.id);
    await db.update(AcademicTerm).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termId = period.academicTermId;
    await db
      .update(AcademicTerm)
      .set({ start_date: "2026-01-01", end_date: "2026-12-31" } as any)
      .where(eq(AcademicTerm.academic_term_id, termId));

    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await db.update(Subject).set({ name: "Physics", status: "ACTIVE" }).where(eq(Subject.subject_id, subjectId));

    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: yearId });

    studentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId: yearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: yearId });

    // Wednesdays (3) 10:20-11:10.
    slotId = await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termId,
      dayOfWeek: 3,
      startTime: "10:20",
      endTime: "11:10",
    });
  });

  afterAll(async () => {
    await db.update(AcademicTerm).set({ is_current: 0 }).where(eq(AcademicTerm.academic_term_id, termId));
    if (previouslyCurrent.length > 0) {
      await db.update(AcademicTerm).set({ is_current: 1 }).where(inArray(AcademicTerm.academic_term_id, previouslyCurrent));
    }
  });

  beforeEach(async () => {
    await db.update(Subject).set({ status: "ACTIVE" }).where(eq(Subject.subject_id, subjectId));
    await db.update(CalendarSlot).set({ start_time: "10:20", is_active: 1 }).where(eq(CalendarSlot.slot_id, slotId));
  });

  describe("occurrences", () => {
    it("expands the weekly timetable into dated lessons for teacher and student", async () => {
      const to = kigaliInstant("2026-10-08", 0);
      const teacher = await collectOccurrences(teacherId, WED_0800, to);
      const student = await collectOccurrences(studentId, WED_0800, to);
      const teacherLessons = teacher.filter((o) => o.kind === "lesson");
      expect(teacherLessons.map((o) => o.key)).toEqual([`lesson:${slotId}:2026-09-30`, `lesson:${slotId}:2026-10-07`]);
      expect(teacherLessons[0].role).toBe("teaching");
      expect(teacherLessons[0].start.toISOString()).toBe(kigaliInstant(WED, 10 * 60 + 20).toISOString());
      expect(student.filter((o) => o.kind === "lesson")[0].role).toBe("attending");
    });

    it("follows the live-lesson rule: a disabled subject produces nothing", async () => {
      await db.update(Subject).set({ status: "DISABLED" }).where(eq(Subject.subject_id, subjectId));
      const occ = await collectOccurrences(teacherId, WED_0800, kigaliInstant("2026-10-01", 0));
      expect(occ.filter((o) => o.kind === "lesson")).toEqual([]);
    });

    it("stays quiet outside the term dates", async () => {
      const occ = await collectOccurrences(teacherId, kigaliInstant("2027-01-06", 0), kigaliInstant("2027-01-08", 0));
      expect(occ).toEqual([]);
    });
  });

  describe("planning and delivery", () => {
    beforeEach(async () => {
      await db.delete(ReminderJob).where(eq(ReminderJob.user_id, teacherId));
      await db.delete(PushSubscription).where(eq(PushSubscription.user_id, teacherId));
      await savePreferences(teacherId, { enabled: true, morningBriefing: false });
    });

    it("plans the teacher's lesson 15 minutes ahead, idempotently", async () => {
      await expandForUser(teacherId, WED_0800);
      await expandForUser(teacherId, WED_0800);
      const jobs = (await jobsFor(teacherId)).filter((j) => j.status === "pending");
      const lesson = jobs.find((j) => j.dedupe_key === `lesson:${slotId}:${WED}:15`)!;
      expect(lesson).toBeDefined();
      expect(new Date(lesson.fire_at as any).toISOString()).toBe(kigaliInstant(WED, 10 * 60 + 5).toISOString());
      expect(jobs.filter((j) => j.dedupe_key === lesson.dedupe_key)).toHaveLength(1);
    });

    it("moves a pending reminder when the lesson moves, and cancels it when the subject is disabled", async () => {
      await expandForUser(teacherId, WED_0800);
      await db.update(CalendarSlot).set({ start_time: "11:00" }).where(eq(CalendarSlot.slot_id, slotId));
      await expandForUser(teacherId, WED_0800);
      let [job] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, teacherId), eq(ReminderJob.dedupe_key, `lesson:${slotId}:${WED}:15`)));
      expect(new Date(job.fire_at as any).toISOString()).toBe(kigaliInstant(WED, 10 * 60 + 45).toISOString());

      await db.update(Subject).set({ status: "DISABLED" }).where(eq(Subject.subject_id, subjectId));
      await expandForUser(teacherId, WED_0800);
      [job] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, job.job_id));
      expect(job.status).toBe("cancelled");
    });

    it("turning reminders off cancels everything still pending", async () => {
      await expandForUser(teacherId, WED_0800);
      await savePreferences(teacherId, { enabled: false });
      await expandForUser(teacherId, WED_0800);
      const jobs = await jobsFor(teacherId);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every((j) => j.status === "cancelled")).toBe(true);
    });

    it("delivers once, in-app and by push, with a Declarative Web Push payload", async () => {
      await addSubscription(teacherId, FCM(`t-${Date.now()}`));
      await expandForUser(teacherId, WED_0800);
      const { calls, send } = recordingSender();
      const fireTime = kigaliInstant(WED, 10 * 60 + 5);

      const first = await dispatchDue({ now: fireTime, send });
      const second = await dispatchDue({ now: fireTime, send });
      expect(first.sent).toBeGreaterThanOrEqual(1);
      expect(second.sent).toBe(0);

      const mine = calls.filter((c) => c.payload.notification.data.kind === "lesson");
      expect(mine).toHaveLength(1);
      const { payload, ttl, urgency } = mine[0];
      expect(payload.web_push).toBe(8030);
      expect(payload.notification.title).toBe("Physics in 15 min");
      expect(payload.notification.navigate).toMatch(/\/dashboard$/);
      expect(payload.notification.data.ackUrl).toMatch(/\/reminders\/actions\/\d+\/ack\?sig=/);
      expect(urgency).toBe("high");
      expect(ttl).toBe(15 * 60);

      const [job] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, teacherId), eq(ReminderJob.dedupe_key, `lesson:${slotId}:${WED}:15`)));
      expect(job.status).toBe("sent");
      expect(job.channels).toBe("in_app,push");

      const bell = await db
        .select()
        .from(Notification)
        .where(and(eq(Notification.user_id, teacherId), eq(Notification.kind, "reminder")));
      expect(bell.some((n) => n.title === "Physics in 15 min")).toBe(true);
    });

    it("never sends a reminder before its time (UTC-bound claim)", async () => {
      await expandForUser(teacherId, WED_0800);
      const { calls, send } = recordingSender();
      // 30 minutes before the 10:05 fire time: nothing may go out, whatever the host's zone.
      await dispatchDue({ now: kigaliInstant(WED, 9 * 60 + 35), send });
      const [job] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, teacherId), eq(ReminderJob.dedupe_key, `lesson:${slotId}:${WED}:15`)));
      expect(job.status).toBe("pending");
      expect(calls.filter((c) => c.payload.notification.data.kind === "lesson")).toHaveLength(0);
    });

    it("expires a reminder whose event already started instead of sending it late", async () => {
      await expandForUser(teacherId, WED_0800);
      const { calls, send } = recordingSender();
      await dispatchDue({ now: kigaliInstant(WED, 10 * 60 + 30), send });
      const [job] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, teacherId), eq(ReminderJob.dedupe_key, `lesson:${slotId}:${WED}:15`)));
      expect(job.status).toBe("expired");
      expect(calls.filter((c) => c.payload.notification.data.kind === "lesson")).toHaveLength(0);
    });

    it("drops a subscription the push service says is gone", async () => {
      await addSubscription(teacherId, FCM(`gone-${Date.now()}`));
      const { send } = recordingSender();
      const report = await sendTestReminder(teacherId, { send });
      expect(report.pushAttempted).toBe(1);
      expect(report.pushDelivered).toBe(0);
      expect(await db.select().from(PushSubscription).where(eq(PushSubscription.user_id, teacherId))).toHaveLength(0);
    });
  });

  describe("HTTP API", () => {
    let token: string;
    let userId: number;

    beforeAll(async () => {
      userId = studentId;
      token = signToken(userId);
    });

    it("serves config with the VAPID public key", async () => {
      const res = await request(app).get("/reminders/config").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.push.enabled).toBe(true);
      expect(res.body.data.push.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    });

    it("requires a session", async () => {
      expect((await request(app).get("/reminders/me")).status).toBe(401);
    });

    it("validates preferences", async () => {
      const bad = await request(app)
        .put("/reminders/preferences")
        .set("Authorization", `Bearer ${token}`)
        .send({ quietStart: "late" });
      expect(bad.status).toBe(400);
      const ok = await request(app)
        .put("/reminders/preferences")
        .set("Authorization", `Bearer ${token}`)
        .send({ quietStart: "22:00", settings: { lesson: { offsets: [20, 5] } } });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data.quietStart).toBe("22:00");
      expect(ok.body.data.settings.lesson.offsets).toEqual([20, 5]);
    });

    it("refuses push endpoints outside the real push services (SSRF guard)", async () => {
      const res = await request(app)
        .post("/reminders/push/subscriptions")
        .set("Authorization", `Bearer ${token}`)
        .send({ subscription: { endpoint: "https://169.254.169.254/latest/meta-data", keys: { p256dh: "abc", auth: "def" } } });
      expect(res.status).toBe(400);
    });

    it("subscribes a device, switches reminders on, and knows it on heartbeat", async () => {
      await db.delete(ReminderPreference).where(eq(ReminderPreference.user_id, userId));
      const endpoint = FCM(`s-${Date.now()}`);
      const res = await request(app)
        .post("/reminders/push/subscriptions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          subscription: { endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ", auth: "tBHItJI5svbpez7KI4CCXg" } },
          platform: "android",
          browser: "chrome",
          installed: true,
        });
      expect(res.status).toBe(201);

      const me = await request(app).get("/reminders/me").set("Authorization", `Bearer ${token}`);
      expect(me.body.data.preferences.enabled).toBe(true);
      expect(me.body.data.devices).toHaveLength(1);
      expect(me.body.data.devices[0]).toMatchObject({ platform: "android", browser: "chrome", installed: 1 });

      const beat = await request(app)
        .post("/reminders/push/heartbeat")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint, installed: true });
      expect(beat.body.data.known).toBe(true);

      const gone = await request(app)
        .post("/reminders/push/heartbeat")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint: FCM("never-seen") });
      expect(gone.body.data.known).toBe(false);

      const del = await request(app)
        .delete("/reminders/push/subscriptions")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint });
      expect(del.body.data.removed).toBe(1);
    });

    it("returns today's agenda", async () => {
      const res = await request(app).get("/reminders/agenda").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("issues, serves and revokes a personal calendar feed", async () => {
      const created = await request(app).post("/reminders/feed").set("Authorization", `Bearer ${token}`);
      expect(created.status).toBe(201);
      expect(created.body.data.webcal).toMatch(/^webcal:\/\//);
      const path = new URL(created.body.data.https).pathname;

      const feed = await request(app).get(path);
      expect(feed.status).toBe(200);
      expect(feed.headers["content-type"]).toMatch(/text\/calendar/);
      expect(feed.text).toContain("BEGIN:VCALENDAR");
      expect(feed.text).toContain("X-WR-TIMEZONE:Africa/Kigali");

      await request(app).delete("/reminders/feed").set("Authorization", `Bearer ${token}`);
      expect((await request(app).get(path)).status).toBe(404);
      expect((await request(app).get("/reminders/feed/short.ics")).status).toBe(404);
    });

    it("accepts notification-button actions only with the right signature", async () => {
      const { send } = recordingSender();
      await sendTestReminder(userId, { send });
      const [job] = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, userId), like(ReminderJob.dedupe_key, "test:%")));

      const forged = await request(app).post(`/reminders/actions/${job.job_id}/ack?sig=${signAction(job.job_id, userId + 1)}`);
      expect(forged.status).toBe(403);
      const ok = await request(app).post(`/reminders/actions/${job.job_id}/ack?sig=${signAction(job.job_id, userId)}`);
      expect(ok.status).toBe(200);
      const [after] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, job.job_id));
      expect(after.acked_at).not.toBeNull();
      expect(after.status).toBe("acked");

      const snooze = await request(app).post(`/reminders/actions/${job.job_id}/snooze?sig=${signAction(job.job_id, userId)}`);
      expect(snooze.status).toBe(200);
      const copies = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, userId), like(ReminderJob.dedupe_key, `${job.dedupe_key}:snooze:%`)));
      expect(copies).toHaveLength(1);
      expect(copies[0].status).toBe("pending");
    });
  });

  describe("Source API (other NGA apps)", () => {
    let serviceToken: string;

    beforeAll(async () => {
      serviceToken = `ngat_${crypto.randomBytes(16).toString("hex")}`;
      await db.insert(IntegrationToken).values({
        name: "Task Mentor reminders (test)",
        token_hash: crypto.createHash("sha256").update(serviceToken).digest("hex"),
        token_prefix: serviceToken.slice(0, 12),
        scopes: "reminders:write",
      });
    });

    it("rejects calls without a service credential", async () => {
      const res = await request(app).put("/reminders/sources").send({});
      expect(res.status).toBe(401);
    });

    it("rejects a user session on the service route", async () => {
      const res = await request(app).put("/reminders/sources").set("Authorization", `Bearer ${signToken(studentId)}`).send({});
      expect(res.status).toBe(401);
    });

    it("registers a quiz closing time for its students and plans their reminders; cancelling withdraws them", async () => {
      await savePreferences(studentId, { enabled: true, morningBriefing: false });
      const closesAt = new Date(Date.now() + 3 * 3_600_000);
      const externalId = `quiz-${Date.now()}`;
      const put = await request(app)
        .put("/reminders/sources")
        .set("Authorization", `Bearer ${serviceToken}`)
        .send({
          source_app: "taskmentor",
          source_type: "quiz_close",
          external_id: externalId,
          title: "Algebra quiz",
          starts_at: closesAt.toISOString(),
          link: "https://taskmentor.example/quizzes/1",
          critical: true,
          audience_user_ids: [studentId],
        });
      expect(put.status).toBe(200);
      const sourceId = put.body.data.source_id;

      await expandForUser(studentId);
      const planned = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `src:${sourceId}:%`)));
      expect(planned.map((j) => j.offset_min).sort((a, b) => a - b)).toEqual([15, 60]);
      expect(planned.every((j) => j.critical === 1)).toBe(true);

      const bad = await request(app)
        .put("/reminders/sources")
        .set("Authorization", `Bearer ${serviceToken}`)
        .send({ source_app: "taskmentor", source_type: "birthday", external_id: "x", title: "x", starts_at: closesAt, audience_user_ids: [1] });
      expect(bad.status).toBe(400);

      const del = await request(app)
        .delete(`/reminders/sources/taskmentor/quiz_close/${externalId}`)
        .set("Authorization", `Bearer ${serviceToken}`);
      expect(del.status).toBe(200);
      const after = await db
        .select()
        .from(ReminderJob)
        .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `src:${sourceId}:%`)));
      expect(after.every((j) => j.status === "cancelled")).toBe(true);
    });
  });
});
