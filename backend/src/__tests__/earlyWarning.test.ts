// Early warning (services/earlyWarning.ts, routes/earlyWarning.ts) against the
// test database (migration 113). Auth, the viewer's scope and the app's client
// credentials are injected, so the rules and the data flow are what's tested.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { earlyWarningRouter } from "../routes/earlyWarning";
import { assess, cleanMetrics, refreshStates } from "../services/earlyWarning";
import { getCurrentAcademicYearId } from "../utils/academicYear";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

let s1: number, s2: number, s3: number, teacher: number, outsider: number;
let scope: any = { all: true };
let client: string | undefined = "discipline_attendance";

const app = express();
app.use(express.json());
app.use(
  "/early-warning",
  earlyWarningRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id };
      next();
    },
    (req: any, _res, next) => {
      req.access = { scopeFor: () => scope };
      next();
    },
    (req: any, _res, next) => {
      req.service = client ? { clientId: client } : { clientId: undefined };
      next();
    },
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

beforeAll(async () => {
  s1 = await createUser({ userType: "STUDENT" });
  s2 = await createUser({ userType: "STUDENT" });
  s3 = await createUser({ userType: "STUDENT" });
  teacher = await createUser({ userType: "TEACHER" });
  outsider = await createUser({ userType: "TEACHER" });
});

afterAll(async () => {
  const list = sql.join([s1, s2, s3, teacher, outsider].map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`DELETE FROM StudentSignal WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM StudentRiskState WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM EarlyWarningIntervention WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${list})`);
});

describe("early-warning rules", () => {
  it("keeps only known metrics, as bounded numbers", () => {
    expect(cleanMetrics("taskmentor", { missed_14d: "3", avg_pct_30d: 140, junk: 1 })).toEqual({
      due_14d: null, missed_14d: 3, avg_pct_30d: 100, avg_pct_prev_30d: null, failed_30d: null,
    });
  });

  it("explains every point and grades the level", () => {
    expect(assess({}).level).toBe("none");
    const watch = assess({ tendo: { absences_14d: 3, absences_prev_14d: 2, lates_14d: 0, incidents_30d: 0, discipline_points_30d: 0 } });
    expect(watch).toMatchObject({ level: "none", score: 2 });
    const risky = assess(
      {
        tendo: { absences_14d: 5, absences_prev_14d: 1, lates_14d: 4, incidents_30d: 2, discipline_points_30d: 3 },
        taskmentor: { due_14d: 6, missed_14d: 4, avg_pct_30d: 45, avg_pct_prev_30d: 68, failed_30d: 3 },
      },
      2,
    );
    expect(risky.level).toBe("at_risk");
    expect(risky.reasons[0].points).toBe(3);
    expect(risky.reasons.map((r) => r.text)).toEqual(
      expect.arrayContaining([
        "Missed 5 lessons in the last 2 weeks",
        "Absences are rising",
        "4 pieces of work missed in the last 2 weeks",
        "Marks dropped from 68% to 45%",
        "Missed 2 office-hours sessions this month",
      ]),
    );
    expect(assess({ taskmentor: { due_14d: 2, missed_14d: 2, avg_pct_30d: 62, avg_pct_prev_30d: 60, failed_30d: 0 } }).level).toBe("none");
    expect(assess({ taskmentor: { due_14d: 2, missed_14d: 2, avg_pct_30d: 48, avg_pct_prev_30d: 50, failed_30d: 0 } }).level).toBe("watch");
  });
});

describe("signals from the apps", () => {
  it("Tendo and Task Mentor push their metrics; other systems are refused", async () => {
    client = "discipline_attendance";
    const t = await request(app).put("/early-warning/signals").send({
      students: [
        { student_id: s1, metrics: { absences_14d: 6, absences_prev_14d: 1, lates_14d: 1, incidents_30d: 0 } },
        { student_id: s2, metrics: { absences_14d: 0 } },
        { student_id: "x" },
      ],
    });
    expect(t.status).toBe(200);
    expect(t.body.data).toMatchObject({ saved: 2, skipped: 1 });
    client = "taskmentor_app";
    expect((await request(app).put("/early-warning/signals").send({ students: [{ student_id: s1, metrics: { due_14d: 5, missed_14d: 3, avg_pct_30d: 51 } }] })).status).toBe(200);
    const [row] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM StudentSignal WHERE student_id = ${s1}`));
    expect(Number(row.n)).toBe(2);
    client = "tupo";
    expect((await request(app).put("/early-warning/signals").send({ students: [{ student_id: s1, metrics: {} }] })).status).toBe(403);
    client = "discipline_attendance";
    expect((await request(app).put("/early-warning/signals").send({ students: [] })).status).toBe(400);
  });

  it("tells the class teacher once when a student becomes at risk", async () => {
    // s1: 6 absences (3) + rising (1) + 3 missed (2) = 6 → at risk. Class teacher = UserGrade.
    const yearId = await getCurrentAcademicYearId();
    const cgRows = rows(await db.execute(sql`SELECT class_group_id AS id, grade_id AS gradeId FROM ClassGroup LIMIT 1`));
    expect(yearId).toBeTruthy();
    expect(cgRows.length).toBeGreaterThan(0);
    const cg = cgRows[0];
    await db.execute(sql`INSERT IGNORE INTO StudentClassGroup (user_id, class_group_id, academic_year_id) VALUES (${s1}, ${cg.id}, ${yearId})`);
    await db.execute(sql`INSERT IGNORE INTO UserGrade (user_id, grade_id, class_group_id, academic_year_id) VALUES (${teacher}, ${cg.gradeId}, ${cg.id}, ${yearId})`);
    try {
      await db.execute(sql`DELETE FROM StudentRiskState WHERE student_id = ${s1}`);
      await refreshStates([s1]);
      await refreshStates([s1]);
      const notes = rows(await db.execute(sql`SELECT title, body, link FROM Notification WHERE user_id = ${teacher} AND kind = 'early_warning'`));
      expect(notes.length).toBe(1);
      expect(notes[0].title).toMatch(/may need support$/);
      expect(notes[0].body).toContain("Missed 6 lessons");
      expect(notes[0].link).toBe(`/early-warning?student=${s1}`);
    } finally {
      await db.execute(sql`DELETE FROM StudentClassGroup WHERE user_id = ${s1} AND class_group_id = ${cg.id} AND academic_year_id = ${yearId}`);
      await db.execute(sql`DELETE FROM UserGrade WHERE user_id = ${teacher} AND class_group_id = ${cg.id} AND academic_year_id = ${yearId}`);
    }
  });
});

describe("staff view", () => {
  it("lists students in scope, worst first, with reasons", async () => {
    scope = { students: [s1, s2, s3] };
    const r = await request(app).get("/early-warning").set(as(teacher));
    expect(r.status).toBe(200);
    const ids = r.body.data.students.map((s: any) => s.studentId);
    expect(ids[0]).toBe(s1);
    expect(r.body.data.students[0]).toMatchObject({ level: "at_risk" });
    expect(r.body.data.students[0].reasons.length).toBeGreaterThan(1);
    expect(r.body.data.counts.at_risk).toBe(1);
    const atRisk = await request(app).get("/early-warning?level=at_risk").set(as(teacher));
    expect(atRisk.body.data.students.map((s: any) => s.studentId)).toEqual([s1]);
  });

  it("only shows and acts on students inside the viewer's scope", async () => {
    scope = { students: [s2] };
    expect((await request(app).get(`/early-warning/students/${s1}`).set(as(outsider))).status).toBe(404);
    expect((await request(app).post(`/early-warning/students/${s1}/interventions`).set(as(outsider)).send({ action: "call_parent" })).status).toBe(403);
    scope = { students: [s1] };
  });

  it("logs an intervention and closes it with an outcome", async () => {
    const add = await request(app).post(`/early-warning/students/${s1}/interventions`).set(as(teacher)).send({ action: "call_parent", notes: "Ask about the absences", reviewDate: "2026-10-20" });
    expect(add.status).toBe(201);
    expect(add.body.data.interventions[0]).toMatchObject({ action: "call_parent", status: "open", reviewDate: "2026-10-20", ownerId: teacher });
    expect((await request(app).post(`/early-warning/students/${s1}/interventions`).set(as(teacher)).send({ action: "nonsense" })).status).toBe(400);
    const list = await request(app).get("/early-warning").set(as(teacher));
    expect(list.body.data.students.find((s: any) => s.studentId === s1)).toMatchObject({ openInterventions: 1, nextReview: "2026-10-20" });
    const id = add.body.data.interventions[0].id;
    expect((await request(app).post(`/early-warning/interventions/${id}/close`).set(as(teacher)).send({ outcome: "" })).status).toBe(400);
    const done = await request(app).post(`/early-warning/interventions/${id}/close`).set(as(teacher)).send({ outcome: "Parent called; illness, now back" });
    expect(done.body.data.interventions[0]).toMatchObject({ status: "done", outcome: "Parent called; illness, now back" });
  });
});
