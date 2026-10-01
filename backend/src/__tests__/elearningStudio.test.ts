import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  AIUsageLog,
  CompetencyPerformanceCriteria,
  Course,
  CourseGenerationRun,
  CourseGenerationTask,
  CourseItem,
  LessonNote,
  LO_LessonSection,
  SchemeEntryCriteria,
  SchemeOfWorkEntry,
  SubjectCompetency,
} from "../db/schema";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  createSchemeOfWork,
  createLoLesson,
} from "../test/fixtures";
import { installFakeAI, uninstallFakeAI, FakeAICall } from "../test/fakeAI";
import { claim, drainWorker } from "../services/elearning/generation/worker";

/**
 * Lesson Studio, Phases A1–A2 (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md): the
 * curriculum chain, the context pack, and the durable generation engine end to end, with a
 * deterministic fake AI. Nothing reaches a real provider.
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const iso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

let quotaOut = false;
function lessonFor(prompt: string) {
  const topic = /Topic: (.+)/.exec(prompt)?.[1] ?? "Topic";
  return {
    title: `${topic} — your lesson`,
    summary: `After this lesson you can work with ${topic}.`,
    sections: [
      { heading: "What it is", html: `<p>${topic} explained step by step for the class. `.repeat(6) + "</p>", source_refs: ["S1", "S2", "S99"], criteria: ["1.1"] },
      {
        heading: "Try it",
        html: `<p>Practise ${topic} with a real example from a Kigali office. `.repeat(6) + "</p>",
        source_refs: ["S1"],
        criteria: ["1.2"],
        interaction: { type: "inline_check", prompt: "Which tag makes a list?", options: ["<ul>", "<p>", "<br>"], correct_index: 0, explanation: "ul is an unordered list." },
      },
      {
        heading: "Order it",
        html: "<p>Steps to build the page, in order, each explained in detail for students. </p>".repeat(4),
        source_refs: [],
        criteria: [],
        interaction: { type: "order_steps", steps: ["Open the editor", "Write the HTML", "Save the file", "Open it in a browser"] },
      },
    ],
    worked_example: { title: "Worked example", html: "<p>A full worked example with every step shown.</p>", source_refs: ["S1"] },
    key_terms: [{ term: "Element", definition: "A part of an HTML page." }],
    check_yourself: ["What is an element?"],
    covered_criteria: ["1.1", "1.2"],
  };
}
const questions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: i % 3 === 2 ? "TRUE_FALSE" : "MCQ",
    prompt: `Question ${i + 1} about the topic?`,
    options: i % 3 === 2 ? ["True", "False"] : ["Right answer", "Wrong one", "Another wrong one"],
    correct_index: 0,
    explanation: "Because the lesson says so.",
    criteria: i % 2 ? "1.2" : "1.1",
    source_refs: ["S1"],
  }));

function fakeHandler(params: { schemaName?: string; prompt: string }) {
  if (quotaOut) throw Object.assign(new Error("429 RESOURCE_EXHAUSTED quota"), { status: 429 });
  if (params.schemaName === "elearning_core_lesson") return lessonFor(params.prompt);
  if (params.schemaName === "elearning_assessment_pack") {
    const n = Number(/exactly (\d+) questions/.exec(params.prompt)?.[1] ?? 5);
    return { knowledge_check: questions(n), video_watch_for: ["Watch the tags"], video_search_terms: "html lists" };
  }
  if (params.schemaName === "elearning_verify_questions") {
    // The second opinion: question 2's key is wrong (it says index 1 is right).
    return { issues: [{ question_id: "q2", kind: "WRONG_KEY", note: "Option 2 is correct.", correct_index: 1 }] };
  }
  throw new Error(`unexpected schema ${params.schemaName}`);
}

describe("Lesson Studio A1–A2: chain, context pack, durable generation, review", () => {
  let teacherId: number;
  let teacherToken: string;
  let otherToken: string;
  let studentToken: string;
  let schemeId: number;
  let courseId: number;
  let w1: number; // week with a lesson plan and the teacher's own note for 1.1
  let w2: number; // week with no note → full generation
  let w3: number; // week with no topic and no criteria → skipped
  let entry1: number;
  let entry2: number;
  let c11: number;
  let c12: number;
  let c21: number;
  let calls: FakeAICall[];

  const blueprint = {
    lesson: { enabled: true, length: "SHORT", interactive_breaks: 2, worked_example: true },
    knowledge_check: { enabled: true, questions: 5 },
    video_slot: { enabled: true },
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    const otherId = await createUser({ userType: "TEACHER" });
    const studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    otherToken = signToken(otherId);
    studentToken = signToken(studentId);
    const role = await createRoleWithPermissions("studio_teacher", ["MANAGE_COURSE_CONTENT", "MANAGE_LESSON_NOTES"]);
    await assignRole(teacherId, role);
    await assignRole(otherId, role);
    await assignRole(studentId, await createRoleWithPermissions("studio_student", ["VIEW_MY_COURSES", "VIEW_SHARED_LESSON_NOTES"]));

    const period = await createAcademicPeriod();
    const { classGroupId } = await createProgramGradeClassGroupDetailed();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: period.academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId: period.academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: period.academicYearId });

    const [e1] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 1, title: "Structure a web page" })) as any;
    const [e2] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 2, title: "Style a web page" })) as any;
    c11 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e1.insertId, criteria_number: "1.1", description: "HTML elements are properly used" })) as any)[0].insertId;
    c12 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e1.insertId, criteria_number: "1.2", description: "Lists and links are applied" })) as any)[0].insertId;
    c21 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e2.insertId, criteria_number: "2.1", description: "CSS selectors are used" })) as any)[0].insertId;

    schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    const [r1] = (await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, competency_id: e1.insertId, week_number: "Week 1", topic: "HTML elements", objective: "Use HTML elements", start_date: iso(-9), end_date: iso(-5) } as any)) as any;
    const [r2] = (await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, competency_id: e1.insertId, week_number: "Week 2", topic: "Lists and links", start_date: iso(-2), end_date: iso(2) } as any)) as any;
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 3", topic: null, start_date: iso(5), end_date: iso(9) } as any);
    entry1 = r1.insertId;
    entry2 = r2.insertId;
    await db.insert(SchemeEntryCriteria).values([{ entry_id: entry1, criteria_id: c11 }, { entry_id: entry2, criteria_id: c11 }, { entry_id: entry2, criteria_id: c12 }]);

    // A lesson plan for week 1 (the context pack must read it).
    const lessonId = await createLoLesson({ userId: teacherId, entryId: entry1, lessonDate: iso(-8) });
    await db.insert(LO_LessonSection).values({ lesson_id: lessonId, section_type: "Development", trainer_activities: "Demonstrate headings, paragraphs and HTML elements on the projector with a cooperative website.", learner_activities: "Learners build a page with HTML elements for a local cooperative.", duration_minutes: 60 } as any);

    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    expect(created.status).toBeLessThan(300);
    courseId = created.body.data.course.course_id;
    [w1, w2, w3] = created.body.data.sections.map((s: any) => s.section_id);

    // The teacher's own (published) note for criterion 1.1 — reuse must place it in week 1.
    const n = await request(app).post("/lesson-notes").set(auth(teacherToken)).send({ subject_id: subjectId, class_group_id: classGroupId, title: "My HTML elements note", criteria_ids: [c11] });
    await request(app).patch(`/lesson-notes/${n.body.data.note_id}`).set(auth(teacherToken)).send({ content_html: "<h2>HTML elements</h2><p>Every page is made of HTML elements such as headings and paragraphs, explained for the class.</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    // Placed by seeding? Remove it from the course so the Studio's reuse step has to find it.
    await db.delete(CourseItem).where(and(eq(CourseItem.item_type, "LESSON_NOTE"), eq(CourseItem.ref_id, n.body.data.note_id)));
  });

  beforeEach(() => {
    quotaOut = false;
    calls = installFakeAI(fakeHandler as any).calls;
  });
  afterAll(() => uninstallFakeAI());

  it("G4: lesson plans are readable by the scheme owner only (404 for other teachers), and plans can't be added to others' weeks", async () => {
    const mine = await request(app).get(`/lesson-plans/entry/${entry1}`).set(auth(teacherToken));
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].sections[0].trainer_activities).toContain("Demonstrate");
    const theirs = await request(app).get(`/lesson-plans/entry/${entry1}`).set(auth(otherToken));
    expect(theirs.status).toBe(404);
    const write = await request(app).post("/lesson-plans").set(auth(otherToken)).send({ entry_id: entry1, module_name: "x" });
    expect(write.status).toBe(404);
  });

  it("week bundles show each week's plan, notes and e-learning state; other teachers get 404", async () => {
    const r = await request(app).get(`/scheme-of-work/schemes/${schemeId}/week-bundles`).set(auth(teacherToken));
    expect(r.status).toBe(200);
    const [b1, b2, b3] = r.body.data.weeks;
    expect(b1.readiness).toMatchObject({ has_plan: true, has_note: true, has_criteria: true });
    expect(b1.lesson_plans).toHaveLength(1);
    // Week 2 also targets 1.1, which the teacher's note covers, so it already has material.
    expect(b2.readiness).toMatchObject({ has_plan: false, has_criteria: true, has_note: true, state: "DRAFTED" });
    expect(b3.readiness.state).toBe("EMPTY");
    expect(r.body.data.course_id).toBe(courseId);
    expect((await request(app).get(`/scheme-of-work/schemes/${schemeId}/week-bundles`).set(auth(otherToken))).status).toBe(404);
  });

  it("the context pack puts the scheme contract first, then the lesson plan and the teacher's note — without text bodies", async () => {
    const r = await request(app).get(`/elearning/sections/${w1}/context-pack`).set(auth(teacherToken));
    expect(r.status).toBe(200);
    const kinds = r.body.data.sources.map((s: any) => s.kind);
    expect(kinds[0]).toBe("SCHEME_ENTRY");
    expect(kinds).toContain("LESSON_PLAN");
    expect(kinds).toContain("LESSON_NOTE");
    expect(r.body.data.sources[0].text).toBeUndefined();
    expect(r.body.data.criteria.map((c: any) => c.criteria_number)).toEqual(["1.1"]);
    const noPlans = await request(app).get(`/elearning/sections/${w1}/context-pack?lesson_plans=0`).set(auth(teacherToken));
    expect(noPlans.body.data.sources.map((s: any) => s.kind)).not.toContain("LESSON_PLAN");
  });

  it("estimates calls and fit-in-quota, and skips a week with no curriculum", async () => {
    const r = await request(app).post(`/elearning/courses/${courseId}/generation/estimate`).set(auth(teacherToken)).send({ blueprint, section_ids: [w1, w2, w3] });
    expect(r.status).toBe(200);
    expect(r.body.data.weeks).toBe(2);
    expect(r.body.data.skipped).toEqual([expect.objectContaining({ section_id: w3, reason: "NO_CURRICULUM" })]);
    // 2 weeks × (lesson + assessment + verify).
    expect(r.body.data.calls).toBe(6);
    expect(r.body.data.fits_today).toBe(true);
  });

  it("a full run drafts every week durably; students see nothing until approval; the verifier is a different provider", async () => {
    const start = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint, section_ids: [w1, w2, w3], mode: "FULL" });
    expect(start.status).toBe(202);
    const runId = start.body.data.run_id;
    // A second full run while this one is active → 409 with the active run's id.
    const again = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint, section_ids: [w2], mode: "FULL" });
    expect(again.status).toBe(409);
    expect(again.body.errors[0].run_id).toBe(runId);

    await drainWorker();
    const run = await request(app).get(`/elearning/generation/runs/${runId}`).set(auth(teacherToken));
    expect(run.status).toBe(200);
    expect(run.body.data.run.status).toBe("READY_FOR_REVIEW");
    const week1 = run.body.data.weeks.find((w: any) => w.section_id === w1);
    const week2 = run.body.data.weeks.find((w: any) => w.section_id === w2);
    expect(run.body.data.weeks.map((w: any) => w.section_id)).not.toContain(w3);

    // Week 1: the teacher's own note was placed (reuse), so no AI lesson was written for it.
    const t1 = Object.fromEntries(week1.tasks.map((t: any) => [t.kind, t]));
    expect(t1.REUSE_PLACEMENT.status).toBe("SUCCEEDED");
    expect(t1.CORE_LESSON).toMatchObject({ status: "SKIPPED", skip_reason: "COVERED_BY_EXISTING" });
    expect(week1.drafts.some((d: any) => d.item_type === "LESSON_NOTE" && d.ai_origin === "NONE")).toBe(true);

    // Week 2: a full AI lesson (DRAFT note) + video slot + knowledge check, all pending review.
    const t2 = Object.fromEntries(week2.tasks.map((t: any) => [t.kind, t]));
    expect(t2.CORE_LESSON.status).toBe("SUCCEEDED");
    expect(t2.CORE_LESSON.provider_used).toBe("glm"); // draft role → GLM first
    expect(t2.ASSESSMENT_PACK.provider_used).toBe("groq"); // assess role → Groq first
    expect(t2.ASSESSMENT_PACK.output_digest.verified_by).not.toBe("groq");
    const types = week2.drafts.map((d: any) => d.item_type).sort();
    expect(types).toEqual(["KNOWLEDGE_CHECK", "LESSON_NOTE", "VIDEO"]);
    const lessonItem = week2.drafts.find((d: any) => d.item_type === "LESSON_NOTE");
    const [note] = await db.select().from(LessonNote).where(eq(LessonNote.note_id, lessonItem.ref_id));
    expect(note).toMatchObject({ status: "DRAFT", source: "AI_GENERATED", scheme_entry_id: entry2 });
    expect(note.content_html).toContain('data-type="inline-check"');
    expect(note.content_html).toContain('data-type="activity"');
    // Unknown source S99 is dropped; the uncited section is flagged for the teacher.
    expect(JSON.stringify(lessonItem.source_refs)).not.toContain("S99");
    expect(lessonItem.review_flags.map((f: any) => f.kind)).toContain("UNCITED");
    const kc = week2.drafts.find((d: any) => d.item_type === "KNOWLEDGE_CHECK");
    expect(kc.content_json.questions).toHaveLength(5);
    // The verifier's WRONG_KEY was applied and flagged for confirmation.
    expect(kc.content_json.questions.find((q: any) => q.id === "q2").correct_index).toBe(1);
    expect(kc.review_flags.map((f: any) => f.kind)).toContain("KEY_CORRECTED");
    expect(kc.criteria.map((c: any) => c.criteria_number).sort()).toEqual(["1.1", "1.2"]);

    // Students: the week shows nothing yet.
    const learner = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    const allItems = (learner.body.data?.sections ?? []).flatMap((s: any) => s.items ?? []);
    expect(allItems.filter((i: any) => i.item_type === "KNOWLEDGE_CHECK")).toHaveLength(0);

    // Usage was logged per attempt with the run id.
    // Usage rows are written fire-and-forget: poll briefly instead of a fixed sleep.
    let usage: (typeof AIUsageLog.$inferSelect)[] = [];
    for (let i = 0; i < 40 && usage.length < calls.length; i++) {
      await new Promise((r) => setTimeout(r, 50));
      usage = await db.select().from(AIUsageLog).where(eq(AIUsageLog.run_id, runId));
    }
    expect(usage.length).toBe(calls.length);
  });

  it("re-running with unchanged inputs makes no AI call", async () => {
    const before = calls.length;
    const start = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint, section_ids: [w2], mode: "FULL" });
    expect(start.status).toBe(202);
    await drainWorker();
    expect(calls.length).toBe(before);
    const tasks = await db.select().from(CourseGenerationTask).where(eq(CourseGenerationTask.run_id, start.body.data.run_id));
    expect(tasks.filter((t) => t.kind !== "REUSE_PLACEMENT").every((t) => t.skip_reason === "UNCHANGED")).toBe(true);
  });

  it("approving a week publishes its drafts and note (video placeholder needs a link first); coverage counts them", async () => {
    // Make the course itself visible to students.
    await db.update(Course).set({ status: "PUBLISHED" }).where(eq(Course.course_id, courseId));
    const r = await request(app).post(`/elearning/sections/${w2}/drafts/approve`).set(auth(teacherToken)).send({ publish_section: true });
    expect(r.status).toBe(200);
    expect(r.body.data.approved).toHaveLength(2);
    expect(r.body.data.needs_attention).toEqual([expect.objectContaining({ reason: expect.stringContaining("link") })]);
    expect(r.body.data.section_status).toBe("PUBLISHED");

    const learner = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    const week = learner.body.data.sections.find((s: any) => s.section_id === w2);
    expect(week.items.map((i: any) => i.item_type).sort()).toEqual(["KNOWLEDGE_CHECK", "LESSON_NOTE"]);
    const cov = await request(app).get(`/elearning/courses/${courseId}/coverage`).set(auth(teacherToken));
    const sec = cov.body.data.sections.find((s: any) => s.section_id === w2);
    expect(sec.gaps).toHaveLength(0);
  });

  it("regenerate replaces an untouched draft but never an edited one", async () => {
    // A fresh draft in week 1 (assessment only), then the teacher edits it.
    const start = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint: { ...blueprint, lesson: { enabled: false }, video_slot: { enabled: false } }, section_ids: [w1], mode: "SINGLE_WEEK" });
    expect(start.status).toBe(202);
    await drainWorker();
    const [kc] = await db.select().from(CourseItem).where(and(eq(CourseItem.section_id, w1), eq(CourseItem.item_type, "KNOWLEDGE_CHECK")));
    expect(kc.review_state).toBe("PENDING_REVIEW");
    const patched = await request(app).patch(`/elearning/items/${kc.item_id}`).set(auth(teacherToken)).send({ title: "My own title" });
    expect(patched.status).toBe(200);
    const redo = await request(app).post(`/elearning/items/${kc.item_id}/regenerate`).set(auth(teacherToken)).send({ instruction: "Harder questions" });
    expect(redo.status).toBe(202);
    await drainWorker();
    expect(calls.some((c) => c.prompt.includes("Harder questions"))).toBe(true);
    const checks = await db.select().from(CourseItem).where(and(eq(CourseItem.section_id, w1), eq(CourseItem.item_type, "KNOWLEDGE_CHECK")));
    expect(checks).toHaveLength(2);
    expect(checks.find((c) => c.item_id === kc.item_id)!.review_state).toBe("EDITED");

    // Dismissing the new (untouched) draft removes it.
    const fresh = checks.find((c) => c.item_id !== kc.item_id)!;
    expect((await request(app).post(`/elearning/items/${fresh.item_id}/dismiss-draft`).set(auth(teacherToken))).status).toBe(200);
    expect((await db.select().from(CourseItem).where(eq(CourseItem.item_id, fresh.item_id))).length).toBe(0);
  });

  it("when every free quota is used up the run pauses (attempt given back) and resumes by itself later", async () => {
    // Fresh week-3-like target: give week 3 a topic so it can be generated.
    await db.update(SchemeOfWorkEntry).set({ topic: "Styling with CSS" }).where(eq(SchemeOfWorkEntry.scheme_id, schemeId));
    quotaOut = true;
    const start = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint: { ...blueprint, video_slot: { enabled: false } }, section_ids: [w3], mode: "FULL" });
    expect(start.status).toBe(202);
    const runId = start.body.data.run_id;
    await drainWorker();
    let [run] = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, runId));
    expect(run.status).toBe("PAUSED_QUOTA");
    const [core] = await db.select().from(CourseGenerationTask).where(and(eq(CourseGenerationTask.run_id, runId), eq(CourseGenerationTask.kind, "CORE_LESSON")));
    expect(core).toMatchObject({ status: "QUEUED", attempts: 0 });

    // Quota is back and the resume time has passed.
    quotaOut = false;
    uninstallFakeAI();
    calls = installFakeAI(fakeHandler as any).calls;
    const later = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
    await drainWorker(50, later);
    [run] = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, runId));
    expect(run.status).toBe("READY_FOR_REVIEW");
  });

  it("restart recovery: a task left RUNNING with a stale heartbeat is re-queued and finished; claims are atomic", async () => {
    const start = await request(app).post(`/elearning/courses/${courseId}/generation/runs`).set(auth(teacherToken)).send({ blueprint: { ...blueprint, lesson: { enabled: false }, video_slot: { enabled: false }, reuse_existing_notes: false, knowledge_check: { enabled: true, questions: 4 } }, section_ids: [w3], mode: "FULL" });
    const runId = start.body.data.run_id;
    const [task] = await db.select().from(CourseGenerationTask).where(eq(CourseGenerationTask.run_id, runId));
    // Two claimers race for the same task: exactly one wins.
    const wins = await Promise.all([claim(task), claim(task)]);
    expect(wins.filter(Boolean)).toHaveLength(1);
    // Simulate the process dying mid-task.
    await db.update(CourseGenerationTask).set({ heartbeat_at: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(CourseGenerationTask.task_id, task.task_id));
    await drainWorker();
    const [after] = await db.select().from(CourseGenerationTask).where(eq(CourseGenerationTask.task_id, task.task_id));
    expect(after.status).toBe("SUCCEEDED");
  });

  it("other teachers can't see or drive this course's Studio", async () => {
    expect((await request(app).get(`/elearning/courses/${courseId}/studio`).set(auth(otherToken))).status).toBe(403);
    const runs = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.course_id, courseId));
    expect((await request(app).get(`/elearning/generation/runs/${runs[0].run_id}`).set(auth(otherToken))).status).toBe(403);
    const mine = await request(app).get(`/elearning/courses/${courseId}/studio`).set(auth(teacherToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.weeks).toHaveLength(3);
    expect(mine.body.data.presets.map((p: any) => p.id)).toContain("practical_tvet");
  });

  afterAll(async () => {
    await db.delete(AIUsageLog).where(inArray(AIUsageLog.course_id, [courseId]));
  });
});
