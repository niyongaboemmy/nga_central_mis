import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, AcademicYear, CompetencyPerformanceCriteria, MentorAssignment, MentorshipSession, SchemeOfWork, SchemeOfWorkEntry, SubjectCompetency } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  assignRole,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createRoleWithPermissions,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "../test/fixtures";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import { setAiPolicyForTests } from "../services/ai/policy";
import { Permissions } from "../utils/permissions";
import type { AiPolicy } from "../vendor/nga-access";

/**
 * "Open in my AI" / "Paste the answer" on the job-based AI features (EXTERNAL_AI_CONTRACT.md §1):
 * prompt mode returns the prompt synchronously and starts no job; import mode runs the job with
 * the pasted answer, which finishes before the 202, so the first poll reads "done".
 * Plus the pupil-data rule on mentorship insights and the swallow-all criteria suggestion.
 */

const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });
const ON = { enabled: true, external: { connector: false, handoff: true, pupilNames: "with_consent" } } as unknown as Partial<AiPolicy>;
const fenced = (o: unknown) => `Here you go:\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

let teacherId: number;
let subjectId: number;
let classGroupId: number;
let academicTermId: number;
let entryId: number;

beforeAll(async () => {
  setAiPolicyForTests(ON);
  const period = await createAcademicPeriod();
  academicTermId = period.academicTermId;
  // LO_Lesson keeps term and school year in varchar(20); the fixture's unique names can be longer.
  const short = `T${Date.now() % 1_000_000}`;
  await db.update(AcademicTerm).set({ name: short }).where(eq(AcademicTerm.academic_term_id, academicTermId));
  await db.update(AcademicYear).set({ name: `Y${short}` }).where(eq(AcademicYear.academic_year_id, period.academicYearId));
  classGroupId = await createProgramGradeClassGroup();
  subjectId = await createSubject();
  teacherId = await createUser({ userType: "TEACHER" });
  await assignRole(
    teacherId,
    await createRoleWithPermissions("HANDOFF_JOBS", [
      "AI_USE",
      "AI_EXTERNAL_CONNECT",
      Permissions.MANAGE_LESSON_NOTES,
      Permissions.MANAGE_CURRICULUM,
      Permissions.TEACHER_DASHBOARD,
    ]),
  );
  await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: period.academicYearId });
  const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
  entryId = await createSchemeOfWorkEntry(schemeId);
});

afterAll(() => setAiPolicyForTests(null));

describe("hand-off on job-based AI features", () => {
  beforeEach(() => setAiPolicyForTests(ON));
  afterEach(() => uninstallFakeAI());

  it("lesson plan: prompt starts no job; a paste saves the plan", async () => {
    const { calls } = installFakeAI(() => ({}));
    const prompt = await request(app)
      .post("/lesson-plans/ai-generate")
      .set(auth(teacherId))
      .send({ entry_id: entryId, custom_prompt: "Lots of group work", aiHandoff: { mode: "prompt" } });
    expect(prompt.status, JSON.stringify(prompt.body)).toBe(200);
    expect(prompt.body.handoff).toMatchObject({ expects: "json", schemaName: "lesson_plan" });
    expect(prompt.body.handoff.prompt).toContain("Lots of group work");
    expect(prompt.body.data).toBeUndefined();

    const plan = {
      big_question: "How do variables hold data?",
      outcomes: [{ code: "LO1", title: "Variables", description: "Declare them", duration_minutes: 100 }],
      sections: [
        { section_type: "Introduction", trainer_activities: "Ask", learner_activities: "Answer", resources: "Board", duration_minutes: 10 },
        { section_type: "Development", trainer_activities: "Demo", learner_activities: "Code", resources: "PCs", duration_minutes: 80 },
        { section_type: "Conclusion", trainer_activities: "Recap", learner_activities: "Quiz", resources: "Board", duration_minutes: 10 },
      ],
      evaluation: { teacher_notes: "Exit ticket" },
    };
    const imported = await request(app)
      .post("/lesson-plans/ai-generate")
      .set(auth(teacherId))
      .send({ entry_id: entryId, aiHandoff: { mode: "import", text: fenced(plan) } });
    expect(imported.status, JSON.stringify(imported.body)).toBe(202);
    const status = await request(app).get(`/lesson-plans/ai-generate/${imported.body.data.jobId}/status`).set(auth(teacherId));
    expect(status.body.data).toMatchObject({ status: "done", ai: { route: "handoff" } });
    expect(status.body.data.lessonId).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it("lesson plan: a paste in the wrong shape is a 400 on the request, not a failed job", async () => {
    const res = await request(app)
      .post("/lesson-plans/ai-generate")
      .set(auth(teacherId))
      .send({ entry_id: entryId, aiHandoff: { mode: "import", text: "Sorry, I can't." } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expected format/);
  });

  it("lesson note: prompt starts no job; a paste saves the note", async () => {
    const { calls } = installFakeAI(() => ({}));
    const prompt = await request(app)
      .post("/lesson-notes/ai-generate")
      .set(auth(teacherId))
      .send({ entry_id: entryId, aiHandoff: { mode: "prompt" } });
    expect(prompt.status, JSON.stringify(prompt.body)).toBe(200);
    expect(prompt.body.handoff).toMatchObject({ expects: "json", schemaName: "lesson_note" });

    const imported = await request(app)
      .post("/lesson-notes/ai-generate")
      .set(auth(teacherId))
      .send({ entry_id: entryId, aiHandoff: { mode: "import", text: fenced({ title: "Variables", html: "<h2>Variables</h2><p>A variable holds a value.</p>" }) } });
    expect(imported.status, JSON.stringify(imported.body)).toBe(202);
    const status = await request(app).get(`/lesson-notes/ai-generate/${imported.body.data.jobId}/status`).set(auth(teacherId));
    expect(status.body.data).toMatchObject({ status: "done", ai: { route: "handoff" } });
    expect(status.body.data.noteId).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  const schemeForm = (aiHandoff: unknown) =>
    request(app)
      .post("/scheme-of-work/ai-generate")
      .set(auth(teacherId))
      .field("subject_id", String(subjectId))
      .field("class_group_id", String(classGroupId))
      .field("academic_term_id", String(academicTermId))
      .field("subject_name", "Programming")
      .field("num_weeks", "2")
      .field("aiHandoff", JSON.stringify(aiHandoff))
      .attach("file", Buffer.from("Learning Outcome 1: Use variables\nDeclare and assign variables in Python."), "curriculum.txt");

  it("scheme of work: prompt (multipart) starts no job; a paste saves the weeks", async () => {
    const { calls } = installFakeAI(() => ({}));
    const before = await db.select().from(SchemeOfWork).where(eq(SchemeOfWork.subject_id, subjectId));
    const prompt = await schemeForm({ mode: "prompt" });
    expect(prompt.status, JSON.stringify(prompt.body)).toBe(200);
    expect(prompt.body.handoff).toMatchObject({ expects: "json", schemaName: "scheme_weeks" });
    expect(prompt.body.handoff.prompt).toContain("Declare and assign variables");
    const entriesBefore = await db.select().from(SchemeOfWorkEntry).where(eq(SchemeOfWorkEntry.scheme_id, before[0].scheme_id));
    expect(entriesBefore).toHaveLength(1); // untouched

    const week = (n: number) => ({ week_number: n, topic: `Topic ${n}`, objective: "o", methodology: "m", resources: "r", evaluation: "e" });
    const imported = await schemeForm({ mode: "import", text: fenced({ weeks: [week(1), week(2)] }) });
    expect(imported.status, JSON.stringify(imported.body)).toBe(202);
    const status = await request(app).get(`/scheme-of-work/ai-generate/${imported.body.data.jobId}/status`).set(auth(teacherId));
    expect(status.body.data).toMatchObject({ status: "done", entriesCount: 2, ai: { route: "handoff" } });
    expect(calls).toHaveLength(0);
  });

  it("curriculum import: prompt (multipart) starts no job; a paste yields the elements to review", async () => {
    const { calls } = installFakeAI(() => ({}));
    const url = `/curriculum/subjects/${subjectId}/import/ai-generate`;
    const send = (aiHandoff: unknown) =>
      request(app)
        .post(url)
        .set(auth(teacherId))
        .field("aiHandoff", JSON.stringify(aiHandoff))
        .attach("file", Buffer.from("Element 1: Use variables. 1.1 Variables are declared correctly."), "curriculum.txt");

    const prompt = await send({ mode: "prompt" });
    expect(prompt.status, JSON.stringify(prompt.body)).toBe(200);
    expect(prompt.body.handoff).toMatchObject({ expects: "json", schemaName: "curriculum_elements" });

    const elements = { elements: [{ element_number: 1, title: "Use variables", criteria: [{ criteria_number: "1.1", description: "Variables are declared correctly" }] }] };
    const imported = await send({ mode: "import", text: fenced(elements) });
    expect(imported.status, JSON.stringify(imported.body)).toBe(202);
    const status = await request(app).get(`${url}/${imported.body.data.jobId}/status`).set(auth(teacherId));
    expect(status.body.data).toMatchObject({ status: "done", ai: { route: "handoff" } });
    expect(status.body.data.elements[0]).toMatchObject({ title: "Use variables" });
    expect(calls).toHaveLength(0);
  });

  it("criteria suggestion returns the prompt instead of swallowing it as 'no matches'", async () => {
    const { calls } = installFakeAI(() => ({ criteria_numbers: [] }));
    const subj = await createSubject();
    const [c] = (await db.insert(SubjectCompetency).values({ subject_id: subj, user_id: teacherId, title: "Use variables" })) as any;
    await db.insert(CompetencyPerformanceCriteria).values({ competency_id: c.insertId, criteria_number: "1.1", description: "Variables are declared" });
    const res = await request(app)
      .post("/scheme-of-work/entries/suggest-criteria")
      .set(auth(teacherId))
      .send({ subject_id: subj, topic: "Variables", aiHandoff: { mode: "prompt" } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.handoff).toMatchObject({ schemaName: "criteria_suggestion" });
    expect(res.body.handoff.prompt).toContain("1.1: Variables are declared");
    expect(calls).toHaveLength(0);
  });
});

describe("mentorship insights carry a named pupil's record", () => {
  let mentorId: number;
  let studentId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    mentorId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorId, await createRoleWithPermissions("HANDOFF_MENTOR", ["AI_USE", "AI_EXTERNAL_CONNECT", Permissions.TEACHER_DASHBOARD]));
    studentId = await createUser({ userType: "STUDENT" });
    await db.insert(MentorAssignment).values({ mentor_id: mentorId, student_id: studentId, academic_year_id: period.academicYearId, status: "ACTIVE", assigned_by: mentorId });
    await db.insert(MentorshipSession).values({ user_id: mentorId, student_id: studentId, topic: "Settling in", session_date: "2026-10-20" as any, wellbeing_status: "Good" });
  });
  afterEach(() => {
    uninstallFakeAI();
    setAiPolicyForTests(ON);
  });

  const insights = (aiHandoff: unknown) => request(app).post(`/mentorship/students/${studentId}/ai-insights`).set(auth(mentorId)).send({ aiHandoff });

  it("needs the mentor's consent for the prompt, and a paste works like an answer", async () => {
    installFakeAI(() => ({}));
    const refused = await insights({ mode: "prompt" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("AI_HANDOFF_PUPIL_CONSENT");

    const ok = await insights({ mode: "prompt", pupilConsent: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.handoff.schemaName).toBe("mentee_insights");
    expect(ok.body.handoff.prompt).toContain("Settling in");

    const pasted = await insights({ mode: "import", text: fenced({ summary: "Doing well.", strengths: ["Punctual"], concerns: [], recommended_focus: "Keep going" }) });
    expect(pasted.status, JSON.stringify(pasted.body)).toBe(200);
    expect(pasted.body.data).toMatchObject({ summary: "Doing well.", ai: { route: "handoff" } });

    const bad = await insights({ mode: "import", text: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/expected format/);
  });

  it("is refused even with consent when the school says never", async () => {
    setAiPolicyForTests({ ...ON, external: { connector: false, handoff: true, pupilNames: "never" } } as unknown as Partial<AiPolicy>);
    const res = await insights({ mode: "prompt", pupilConsent: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AI_HANDOFF_PUPIL_CONSENT");
  });
});

describe("GET /ai-policy tells the UI whether hand-off is available", () => {
  afterEach(() => setAiPolicyForTests(ON));

  it("on with the capability, off without it or when the school turns it off", async () => {
    setAiPolicyForTests(ON);
    const yes = await request(app).get("/ai-policy").set(auth(teacherId));
    expect(yes.body.data.me.external).toEqual({ handoff: true, pupilConsent: true });

    const noCap = await createUser({ userType: "TEACHER" });
    await assignRole(noCap, await createRoleWithPermissions("HANDOFF_NOCAP", ["AI_USE"]));
    const no = await request(app).get("/ai-policy").set(auth(noCap));
    expect(no.body.data.me.external).toEqual({ handoff: false, pupilConsent: false });

    setAiPolicyForTests({ enabled: true } as Partial<AiPolicy>);
    const off = await request(app).get("/ai-policy").set(auth(teacherId));
    expect(off.body.data.me.external.handoff).toBe(false);
  });
});

describe("GET /my-ai/costs", () => {
  it("prices a heavy month from the catalogue", async () => {
    const res = await request(app).get("/my-ai/costs").set(auth(teacherId));
    expect(res.status).toBe(200);
    const byModel = Object.fromEntries(res.body.data.models.map((m: any) => [m.model, m.monthlyUsd]));
    expect(byModel["claude-haiku-5-5"]).toBeCloseTo(0.2565, 3);
    expect(byModel["claude-sonnet-5-5"]).toBeCloseTo(5.13, 2);
    expect(byModel["claude-opus-5-5"]).toBeCloseTo(10.26, 2);
  });
});
