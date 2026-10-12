// Competency map (services/competencyMap.ts, routes/competency.ts) against the test
// database (migration 116). Auth, permissions and the app's client credentials are
// injected, so the rules and the data flow are what's tested.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { CompetencyPerformanceCriteria, SubjectCompetency } from "../db/schema";
import {
  createUser,
  createSubject,
  createProgramGradeClassGroup,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
} from "../test/fixtures";
import { competencyRouter } from "../routes/competency";
import { COMPETENT_PCT, evidenceState, stronger } from "../services/competencyMap";
import { getCurrentAcademicYearId } from "../utils/academicYear";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

let client: string | undefined = "taskmentor_app";
const app = express();
app.use(express.json());
app.use(
  "/competency",
  competencyRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id, permissions: String(req.get("X-Test-Perms") || "").split(",").filter(Boolean) };
      next();
    },
    (_req, _res, next) => next(),
    (req: any, _res, next) => {
      req.service = { clientId: client };
      next();
    },
  ),
);
const as = (id: number, perms = "") => ({ "X-Test-User": String(id), "X-Test-Perms": perms });

let yearId: number;
let subject: number, otherSubject: number, classA: number, classB: number;
let teacher: number, teacherB: number, leader: number, s1: number, s2: number, s3: number;
let lo1: number, lo2: number, c11: number, c12: number, c21: number, foreign: number;

beforeAll(async () => {
  yearId = (await getCurrentAcademicYearId())!;
  [teacher, teacherB, leader] = [await createUser(), await createUser(), await createUser()];
  [s1, s2, s3] = [await createUser({ userType: "STUDENT" }), await createUser({ userType: "STUDENT" }), await createUser({ userType: "STUDENT" })];
  subject = await createSubject();
  otherSubject = await createSubject();
  classA = await createProgramGradeClassGroup();
  classB = await createProgramGradeClassGroup();
  await createTeacherSubjectAssignment({ userId: teacher, subjectId: subject, classGroupId: classA, academicYearId: yearId });
  await createTeacherSubjectAssignment({ userId: teacherB, subjectId: subject, classGroupId: classB, academicYearId: yearId });
  for (const [s, c] of [[s1, classA], [s2, classA], [s3, classB]]) {
    await createStudentClassGroup({ userId: s, classGroupId: c, academicYearId: yearId });
    await createStudentSubjectEnrollment({ userId: s, subjectId: subject, academicYearId: yearId });
  }
  const lo = async (subjectId: number, n: number, title: string) =>
    ((await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacher, element_number: n, title, sort_order: n })) as any)[0].insertId as number;
  const pc = async (competencyId: number, num: string, order: number) =>
    ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: competencyId, criteria_number: num, description: `Criterion ${num}`, sort_order: order })) as any)[0].insertId as number;
  lo1 = await lo(subject, 1, "Apply networking basics");
  lo2 = await lo(subject, 2, "Configure a router");
  c11 = await pc(lo1, "1.1", 1);
  c12 = await pc(lo1, "1.2", 2);
  c21 = await pc(lo2, "2.1", 1);
  foreign = await pc(await lo(otherSubject, 1, "Other subject"), "1.1", 1);
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM CompetencyEvidence WHERE subject_id IN (${subject}, ${otherSubject})`);
  await db.execute(sql`DELETE FROM SubjectCompetency WHERE subject_id IN (${subject}, ${otherSubject})`);
});

const quiz = (ref: number, criteria: number[], results: [number, number][], extra: Record<string, unknown> = {}) => ({
  source_type: "quiz", source_ref: ref, subject_id: subject, title: `Quiz ${ref}`, criteria_ids: criteria,
  results: results.map(([student_id, score_pct]) => ({ student_id, score_pct, assessed_at: "2026-10-06T09:00:00Z" })), ...extra,
});
const put = (tasks: unknown[]) => request(app).put("/competency/evidence").send({ tasks });

describe("competency rules", () => {
  it("a competent score demonstrates a criterion; a lower one shows it was assessed", () => {
    expect(COMPETENT_PCT).toBe(70);
    expect(evidenceState(null)).toBe("NOT_COVERED");
    expect(evidenceState(69.99)).toBe("COVERED");
    expect(evidenceState(70)).toBe("DEMONSTRATED");
    expect(stronger("COVERED", "NOT_COVERED")).toBe("COVERED");
    expect(stronger("COVERED", "DEMONSTRATED")).toBe("DEMONSTRATED");
  });
});

describe("app endpoints", () => {
  it("gives the learning outcomes of a subject in curriculum order, for tagging", async () => {
    const r = await request(app).get(`/competency/curriculum/${subject}`);
    expect(r.status).toBe(200);
    expect(r.body.data.outcomes.map((o: any) => [o.title, o.criteria.map((c: any) => c.criteria_number)])).toEqual([
      ["Apply networking basics", ["1.1", "1.2"]],
      ["Configure a router", ["2.1"]],
    ]);
  });

  it("stores a task's results × its criteria, ignoring criteria of another subject", async () => {
    const r = await put([quiz(9101, [c11, c12, foreign], [[s1, 85], [s2, 50], [s3, 90]])]);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ tasks: 1, rows: 6, ignored_criteria: 1 });
  });

  it("a resend replaces the task (regrade, untagged criterion, removed student); no criteria clears it", async () => {
    await put([quiz(9102, [c21], [[s1, 40]])]);
    await put([quiz(9102, [c21], [[s1, 75], [s2, 30]])]);
    let n = rows(await db.execute(sql`SELECT student_id, score_pct FROM CompetencyEvidence WHERE source_ref = 9102 ORDER BY student_id`));
    expect(n.map((x) => [Number(x.student_id), Number(x.score_pct)])).toEqual([[s1, 75], [s2, 30]]);
    await put([quiz(9103, [c21], [[s2, 20]])]);
    await put([quiz(9103, [], [[s2, 20]])]);
    n = rows(await db.execute(sql`SELECT * FROM CompetencyEvidence WHERE source_ref = 9103`));
    expect(n).toHaveLength(0);
  });

  it("only Task Mentor may send evidence; bad tasks are refused", async () => {
    client = "discipline_attendance";
    expect((await put([quiz(9104, [c11], [[s1, 90]])])).status).toBe(403);
    client = "taskmentor_app";
    expect((await put([{ source_type: "essay", source_ref: 1, subject_id: subject }])).status).toBe(400);
    expect((await put([])).status).toBe(400);
  });
});

describe("the class map", () => {
  it("shows the teacher their class: states per criterion, outcome summaries and class figures", async () => {
    const r = await request(app).get(`/competency/map?subjectId=${subject}&classGroupId=${classA}`).set(as(teacher));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.students.map((s: any) => s.user_id).sort()).toEqual([s1, s2].sort());
    const one = d.students.find((s: any) => s.user_id === s1);
    const two = d.students.find((s: any) => s.user_id === s2);
    expect(one.states).toEqual({ [c11]: "DEMONSTRATED", [c12]: "DEMONSTRATED", [c21]: "DEMONSTRATED" });
    expect(two.states).toEqual({ [c11]: "COVERED", [c12]: "COVERED", [c21]: "COVERED" });
    expect(one.outcomes[lo1]).toEqual({ demonstrated: 2, assessed: 2, total: 2 });
    expect(two.best[c21]).toBe(30);
    const crit = d.outcomes.flatMap((o: any) => o.criteria);
    expect(crit.find((c: any) => c.criteria_id === c11)).toMatchObject({ tasks: 1, assessed_pct: 100, demonstrated_pct: 50 });
    expect(d).toMatchObject({ criteria_total: 3, criteria_without_evidence: 0, competent_pct: 70 });
  });

  it("refuses a class the teacher doesn't teach; e-learning oversight opens any class", async () => {
    expect((await request(app).get(`/competency/map?subjectId=${subject}&classGroupId=${classB}`).set(as(teacher))).status).toBe(403);
    const r = await request(app).get(`/competency/map?subjectId=${subject}&classGroupId=${classB}`).set(as(leader, "VIEW_ALL_COURSES"));
    expect(r.status).toBe(200);
    expect(r.body.data.students.map((s: any) => s.user_id)).toEqual([s3]);
    expect((await request(app).get(`/competency/map?subjectId=${subject}`).set(as(teacher))).status).toBe(400);
  });

  it("lists the pairs each viewer may open", async () => {
    const mine = (await request(app).get("/competency/options").set(as(teacher))).body.data;
    expect(mine.oversight).toBe(false);
    expect(mine.subjects).toEqual([expect.objectContaining({ subject_id: subject, criteria: 3, classes: [expect.objectContaining({ class_group_id: classA })] })]);
    const all = (await request(app).get("/competency/options").set(as(leader, "VIEW_ALL_COURSES"))).body.data;
    expect(all.subjects.find((s: any) => s.subject_id === subject).classes.map((c: any) => c.class_group_id).sort()).toEqual([classA, classB].sort());
  });

  it("drills into one student's evidence, only for students of that class", async () => {
    const r = await request(app).get(`/competency/map/students/${s2}?subjectId=${subject}&classGroupId=${classA}`).set(as(teacher));
    expect(r.status).toBe(200);
    const c = r.body.data.outcomes[1].criteria[0];
    expect(c).toMatchObject({ criteria_id: c21, state: "COVERED" });
    expect(c.evidence).toEqual([expect.objectContaining({ kind: "quiz", source: "taskmentor", ref: 9102, title: "Quiz 9102", score_pct: 30 })]);
    expect((await request(app).get(`/competency/map/students/${s3}?subjectId=${subject}&classGroupId=${classA}`).set(as(teacher))).status).toBe(404);
  });
});

describe("a student's own map", () => {
  it("lists the subjects they take with outcomes, states and the work behind them", async () => {
    const r = await request(app).get("/competency/me").set(as(s1));
    expect(r.status).toBe(200);
    const mine = r.body.data.subjects.find((s: any) => s.subject_id === subject);
    expect(mine).toMatchObject({ total: 3, demonstrated: 3, assessed: 3 });
    expect(mine.outcomes.map((o: any) => o.title)).toEqual(["Apply networking basics", "Configure a router"]);
    const c = mine.outcomes[0].criteria[0];
    expect(c).toMatchObject({ criteria_id: c11, state: "DEMONSTRATED" });
    expect(c.evidence).toEqual([expect.objectContaining({ title: "Quiz 9101", score_pct: 85 })]);
    expect(r.body.data.subjects.some((s: any) => s.subject_id === otherSubject)).toBe(false); // not enrolled
  });

  it("is empty for someone who takes no subjects", async () => {
    const r = await request(app).get("/competency/me").set(as(teacher));
    expect(r.body.data).toEqual({ competent_pct: 70, subjects: [] });
  });
});
