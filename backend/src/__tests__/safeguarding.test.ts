// Safeguarding concerns and weekly wellbeing check-ins (services/safeguarding.ts,
// routes/safeguarding.ts), against the test database (migration 112).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { safeguardingRouter } from "../routes/safeguarding";
import { checkInConcerns, raiseConcern, severityFor, teamIds, weekStart } from "../services/safeguarding";
import { logExchange, SUPPORT_REPLY } from "../services/desktop/tutor";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

let student: number, student2: number, lead: number, teacher: number, roleId: number;
const allowed = new Set<number>();

const app = express();
app.use(express.json());
app.use(
  "/safeguarding",
  safeguardingRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id };
      next();
    },
    (req: any, res, next) => (allowed.has(Number(req.user.userId)) ? next() : res.status(403).json({ message: "Forbidden" })),
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

const concernsOf = async (id: number) =>
  rows(await db.execute(sql`SELECT concern_id AS id, source, category, severity, status, summary, detail FROM SafeguardingConcern WHERE student_id = ${id} ORDER BY concern_id`));
const alertsFor = async (id: number) =>
  rows(await db.execute(sql`SELECT title, body, link FROM Notification WHERE user_id = ${id} AND kind = 'safeguarding_concern' ORDER BY notification_id`));

beforeAll(async () => {
  student = await createUser({ userType: "STUDENT" });
  student2 = await createUser({ userType: "STUDENT" });
  lead = await createUser({ userType: "ADMIN" });
  teacher = await createUser({ userType: "TEACHER" });
  // The lead holds SAFEGUARDING_MANAGE through a legacy role (migration 112 grants it to SUPER_ADMIN).
  const [r] = rows(await db.execute(sql`
    SELECT rp.role_id AS id FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id
    WHERE p.name = 'SAFEGUARDING_MANAGE' LIMIT 1`));
  roleId = Number(r.id);
  await db.execute(sql`INSERT INTO UserRole (user_id, role_id) VALUES (${lead}, ${roleId})`);
  allowed.add(lead);
});

afterAll(async () => {
  const ids = [student, student2, lead, teacher];
  const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`DELETE n FROM SafeguardingNote n JOIN SafeguardingConcern c ON c.concern_id = n.concern_id WHERE c.student_id IN (${list})`);
  await db.execute(sql`DELETE FROM SafeguardingConcern WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM WellbeingCheckIn WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${list})`);
  await db.execute(sql`DELETE FROM DesktopTutorMessage WHERE conversation_id = 'sgtestconv1'`);
  await db.execute(sql`DELETE FROM UserRole WHERE user_id = ${lead} AND role_id = ${roleId}`);
});

describe("safeguarding rules", () => {
  it("rates categories", () => {
    expect(severityFor("self-harm")).toBe("high");
    expect(severityFor("unsafe")).toBe("high");
    expect(severityFor("bullying")).toBe("medium");
    expect(severityFor("low_mood")).toBe("low");
  });

  it("weeks start on Monday, Kigali time", () => {
    expect(weekStart(new Date("2026-10-07T10:00:00Z"))).toBe("2026-10-05"); // Wednesday
    expect(weekStart(new Date("2026-10-11T21:30:00Z"))).toBe("2026-10-05"); // Sunday 23:30 in Kigali
    expect(weekStart(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12"); // already Monday 00:30 in Kigali
  });

  it("turns check-in answers into concerns only when they matter", () => {
    expect(checkInConcerns({ mood: 4, safe: 5, wantsTalk: false }, false)).toEqual([]);
    expect(checkInConcerns({ mood: 2, safe: 4, wantsTalk: false }, false)).toEqual([]); // one low week
    expect(checkInConcerns({ mood: 2, safe: 4, wantsTalk: false }, true).map((c) => c.category)).toEqual(["low_mood"]);
    expect(checkInConcerns({ mood: 1, safe: 4, wantsTalk: false }, false).map((c) => c.category)).toEqual(["low_mood"]);
    const many = checkInConcerns({ mood: 3, safe: 1, wantsTalk: true, comment: "I want to die" }, false);
    expect(many.map((c) => [c.category, c.severity])).toEqual([["self-harm", "high"], ["wants_talk", "medium"], ["unsafe", "high"]]);
  });

  it("finds the team through the permission", async () => {
    const ids = await teamIds();
    expect(ids).toContain(lead);
    expect(ids).not.toContain(teacher);
  });
});

describe("concerns", () => {
  it("opens one concern per worry and alerts the team without the student's words", async () => {
    const id = await raiseConcern({ studentId: student, source: "staff", category: "bullying", summary: "Seen at break", detail: "Pushed by older boys", reportedBy: teacher });
    expect(id).toBeGreaterThan(0);
    // The same worry again within a day is added to it, not a second concern.
    expect(await raiseConcern({ studentId: student, source: "staff", category: "bullying", summary: "Again", detail: "Again at lunch" })).toBe(id);
    expect((await concernsOf(student)).length).toBe(1);
    const alerts = await alertsFor(lead);
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe("New safeguarding concern");
    expect(alerts[0].link).toBe(`/safeguarding?concern=${id}`);
    expect(JSON.stringify(alerts[0])).not.toContain("Pushed");
  });

  it("opens an urgent concern when a student writes worrying words to the AI Tutor", async () => {
    await logExchange(student2, "sgtestconv1", "sometimes i want to kill myself", { text: SUPPORT_REPLY, provider: null, model: null, verdict: null, flag: "self-harm" });
    let found: any[] = [];
    const urgent = async () => (await alertsFor(lead)).some((a) => a.title === "Urgent: new safeguarding concern");
    for (let i = 0; i < 40 && !(found.length && (await urgent())); i++) {
      await new Promise((r) => setTimeout(r, 50));
      found = await concernsOf(student2);
    }
    expect(found.map((c) => [c.source, c.category, c.severity])).toEqual([["ai_tutor", "self-harm", "high"]]);
    expect(found[0].detail).toBe("sometimes i want to kill myself");
    expect((await alertsFor(lead)).some((a) => a.title === "Urgent: new safeguarding concern")).toBe(true);
  });

  it("only the team can see and act; acting acknowledges, closing needs a note; every view is audited", async () => {
    const [c] = await concernsOf(student);
    expect((await request(app).get("/safeguarding/concerns").set(as(teacher))).status).toBe(403);
    expect((await request(app).get(`/safeguarding/concerns/${c.id}`).set(as(teacher))).status).toBe(403);

    const list = await request(app).get("/safeguarding/concerns").set(as(lead));
    expect(list.status).toBe(200);
    expect(list.body.data.some((x: any) => x.id === Number(c.id) && x.status === "new")).toBe(true);

    const one = await request(app).get(`/safeguarding/concerns/${c.id}`).set(as(lead));
    expect(one.body.data.detail).toBe("Pushed by older boys");
    expect(one.body.data.notes.map((n: any) => n.action)).toEqual(["again"]);
    const [audit] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM ActivityLog WHERE user_id = ${lead} AND action_type = 'SAFEGUARDING_VIEW'`));
    expect(Number(audit.n)).toBeGreaterThan(0);

    const noted = await request(app).post(`/safeguarding/concerns/${c.id}`).set(as(lead)).send({ text: "Spoke with the class teacher." });
    expect(noted.body.data.status).toBe("acknowledged");

    expect((await request(app).post(`/safeguarding/concerns/${c.id}`).set(as(lead)).send({ status: "closed" })).status).toBe(400);
    expect((await request(app).post(`/safeguarding/concerns/${c.id}`).set(as(lead)).send({ assignTo: teacher })).status).toBe(400); // not on the team
    const assigned = await request(app).post(`/safeguarding/concerns/${c.id}`).set(as(lead)).send({ assignTo: lead, status: "in_progress" });
    expect(assigned.body.data).toMatchObject({ status: "in_progress", assignedTo: lead });

    const closed = await request(app).post(`/safeguarding/concerns/${c.id}`).set(as(lead)).send({ status: "closed", text: "Resolved with parents; follow-up in 2 weeks." });
    expect(closed.body.data.status).toBe("closed");
    expect(closed.body.data.closedAt).toBeTruthy();
    expect(closed.body.data.notes.map((n: any) => n.action)).toEqual(["again", "note", "status", "assign", "note", "status"]);
    const open = await request(app).get("/safeguarding/concerns?status=open").set(as(lead));
    expect(open.body.data.some((x: any) => x.id === Number(c.id))).toBe(false);
  });
});

describe("students", () => {
  it("send a report of their own", async () => {
    const r = await request(app).post("/safeguarding/report").set(as(student)).send({ category: "home", text: "Things are hard at home" });
    expect(r.status).toBe(201);
    const mine = (await concernsOf(student)).find((c) => c.source === "student");
    expect(mine).toMatchObject({ category: "home", severity: "high", summary: "A student asked for help" });
    expect((await request(app).post("/safeguarding/report").set(as(student)).send({ category: "nope", text: "x x x" })).status).toBe(400);
    expect((await request(app).post("/safeguarding/report").set(as(student)).send({ category: "other", text: "" })).status).toBe(400);
  });

  it("do one check-in a week, and a worrying one reaches the team", async () => {
    expect((await request(app).get("/safeguarding/check-in").set(as(teacher))).body.data).toEqual({ applies: false });
    expect((await request(app).post("/safeguarding/check-in").set(as(teacher)).send({ mood: 3, safe: 3 })).status).toBe(403);

    const before = (await request(app).get("/safeguarding/check-in").set(as(student2))).body.data;
    expect(before).toMatchObject({ applies: true, done: false, week: weekStart() });
    expect((await request(app).post("/safeguarding/check-in").set(as(student2)).send({ mood: 9, safe: 3 })).status).toBe(400);

    const done = await request(app).post("/safeguarding/check-in").set(as(student2)).send({ mood: 3, safe: 2, wantsTalk: true, comment: "" });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ done: true, checkIn: { mood: 3, safe: 2, wantsTalk: true } });
    expect((await request(app).post("/safeguarding/check-in").set(as(student2)).send({ mood: 5, safe: 5 })).status).toBe(409);

    const cats = (await concernsOf(student2)).filter((c) => c.source === "check_in").map((c) => [c.category, c.severity]);
    expect(cats).toEqual([["wants_talk", "medium"], ["unsafe", "medium"]]);
  });

  it("the team sees the school picture without names", async () => {
    const s = await request(app).get("/safeguarding/summary").set(as(lead));
    expect(s.status).toBe(200);
    expect(s.body.data.week).toBe(weekStart());
    const thisWeek = s.body.data.weeks.find((w: any) => w.week === weekStart());
    expect(thisWeek.checkIns).toBeGreaterThan(0);
    expect(JSON.stringify(s.body.data)).not.toMatch(/Test user/i);
    expect((await request(app).get("/safeguarding/summary").set(as(student))).status).toBe(403);
  });
});
