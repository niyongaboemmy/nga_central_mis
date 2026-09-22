import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { CompetencyPerformanceCriteria, SchemeEntryCriteria, SchemeOfWorkEntry, SubjectCompetency } from "../db/schema";
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
} from "../test/fixtures";

/**
 * End-to-end over the three roles: the instructor prepares a curriculum-aligned learning
 * journey, the student learns and is tracked against the criteria, the admin reads reports.
 */
describe("E-learning workflows: instructor → student → admin, aligned to the curriculum", () => {
  let teacherToken: string;
  let studentToken: string;
  let adminToken: string;
  let studentId: number;
  let subjectId: number;
  let courseId: number;
  let week1: number;
  let week2: number;
  let c11: number;
  let c12: number;
  let c21: number;
  let academicYearId: number;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const iso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    const adminId = await createUser({ userType: "ADMIN" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    adminToken = signToken(adminId);
    await assignRole(teacherId, await createRoleWithPermissions("wf_teacher", ["MANAGE_COURSE_CONTENT", "MANAGE_LESSON_NOTES"]));
    await assignRole(studentId, await createRoleWithPermissions("wf_student", ["VIEW_MY_COURSES", "VIEW_SHARED_LESSON_NOTES"]));
    await assignRole(adminId, await createRoleWithPermissions("wf_admin", ["VIEW_ALL_COURSES"]));

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    const { classGroupId } = await createProgramGradeClassGroupDetailed();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });

    // Curriculum: Element 1 (1.1, 1.2), Element 2 (2.1).
    const [e1] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 1, title: "Structure a web page" })) as any;
    const [e2] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 2, title: "Style a web page" })) as any;
    c11 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e1.insertId, criteria_number: "1.1", description: "HTML elements are properly used" })) as any)[0].insertId;
    c12 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e1.insertId, criteria_number: "1.2", description: "Semantic tags are applied" })) as any)[0].insertId;
    c21 = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e2.insertId, criteria_number: "2.1", description: "CSS selectors are used" })) as any)[0].insertId;

    // Scheme: week 1 targets 1.1 + 1.2 (element 1), week 2 targets 2.1 (element 2).
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    const [w1] = (await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, competency_id: e1.insertId, week_number: "Week 1", topic: "HTML", start_date: iso(-2), end_date: iso(2) } as any)) as any;
    const [w2] = (await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, competency_id: e2.insertId, week_number: "Week 2", topic: "CSS", start_date: iso(5), end_date: iso(9) } as any)) as any;
    await db.insert(SchemeEntryCriteria).values([{ entry_id: w1.insertId, criteria_id: c11 }, { entry_id: w1.insertId, criteria_id: c12 }, { entry_id: w2.insertId, criteria_id: c21 }]);

    // Two notes the teacher already wrote, aligned to 1.1 and 1.2 — the journey builder should find them.
    for (const [title, cid] of [["HTML elements", c11], ["Semantic HTML", c12]] as [string, number][]) {
      const n = await request(app).post("/lesson-notes").set(auth(teacherToken)).send({ subject_id: subjectId, class_group_id: classGroupId, title, criteria_ids: [cid] });
      expect(n.status).toBe(201);
      await request(app).patch(`/lesson-notes/${n.body.data.note_id}`).set(auth(teacherToken)).send({ content_html: `<h2>${title}</h2><p>${title} explained in detail for the class.</p>`, content_json: { type: "doc" }, status: "PUBLISHED" });
    }
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    [week1, week2] = created.body.data.sections.map((s: any) => s.section_id);
  });

  it("instructor: weeks carry their target criteria and element; seeding already placed the aligned notes", async () => {
    const b = await request(app).get(`/elearning/courses/${courseId}`).set(auth(teacherToken));
    const w1 = b.body.data.sections.find((s: any) => s.section_id === week1);
    expect(w1.element_number).toBe(1);
    expect(w1.competency_title).toBe("Structure a web page");
    expect(w1.criteria.map((c: any) => c.criteria_number).sort()).toEqual(["1.1", "1.2"]);
    // Seeding matched the notes to week 1 through their criteria.
    expect(w1.items.map((i: any) => i.title).sort()).toEqual(["HTML elements", "Semantic HTML"]);
  });

  it("instructor: coverage shows gaps per week and per element; the journey builder fills what it can", async () => {
    let cov = await request(app).get(`/elearning/courses/${courseId}/coverage`).set(auth(teacherToken));
    expect(cov.status).toBe(200);
    const w1 = cov.body.data.sections.find((s: any) => s.section_id === week1);
    expect(w1.gaps).toEqual([]);
    const w2 = cov.body.data.sections.find((s: any) => s.section_id === week2);
    expect(w2.gaps.map((c: any) => c.criteria_number)).toEqual(["2.1"]);
    expect(cov.body.data.coverage_pct).toBe(67); // 2 of 3 targets
    expect(cov.body.data.elements.find((e: any) => e.element_number === 2).covered).toBe(0);

    // Nothing aligned to 2.1 exists yet → journey reports it still missing.
    let built = await request(app).post(`/elearning/sections/${week2}/build-journey`).set(auth(teacherToken));
    expect(built.status).toBe(200);
    expect(built.body.data.added).toEqual([]);
    expect(built.body.data.still_missing.map((c: any) => c.criteria_number)).toEqual(["2.1"]);

    // The teacher writes the CSS note (draft), aligned to 2.1 → the builder places it.
    const n = await request(app).post("/lesson-notes").set(auth(teacherToken)).send({ subject_id: subjectId, title: "CSS selectors", criteria_ids: [c21] });
    built = await request(app).post(`/elearning/sections/${week2}/build-journey`).set(auth(teacherToken));
    expect(built.body.data.added.map((a: any) => a.title)).toEqual(["CSS selectors"]);
    expect(built.body.data.still_missing).toEqual([]);
    expect(built.body.data.has_check).toBe(false);
    // Idempotent.
    built = await request(app).post(`/elearning/sections/${week2}/build-journey`).set(auth(teacherToken));
    expect(built.body.data.added).toEqual([]);

    // A quick check aligned to 2.1 completes the week's journey; the note must be published too.
    await request(app).patch(`/lesson-notes/${n.body.data.note_id}`).set(auth(teacherToken)).send({ content_html: "<p>Selectors pick elements.</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    const check = await request(app).post(`/elearning/sections/${week2}/items`).set(auth(teacherToken)).send({
      item_type: "KNOWLEDGE_CHECK",
      title: "Selectors check",
      completion_rule: "MIN_SCORE",
      min_score_pct: 50,
      criteria_ids: [c21],
      content_json: { questions: [{ id: "q1", type: "TRUE_FALSE", prompt: ".card selects by class", correct_index: 0 }] },
    });
    expect(check.status).toBe(201);
    cov = await request(app).get(`/elearning/courses/${courseId}/coverage`).set(auth(teacherToken));
    expect(cov.body.data.coverage_pct).toBe(100);
    expect(cov.body.data.weeks_without_check).toBe(1); // week 1 has notes but no check yet

    // Publish the course and week 2 so the student can learn.
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
    await request(app).patch(`/elearning/sections/${week2}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("student: sees each week's target criteria and their own state move as they learn", async () => {
    let course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(course.status).toBe(200);
    let w1 = course.body.data.sections.find((s: any) => s.section_id === week1);
    expect(w1.criteria_progress.map((c: any) => [c.criteria_number, c.state, c.unplanned])).toEqual([["1.1", "NOT_STARTED", false], ["1.2", "NOT_STARTED", false]]);
    expect(course.body.data.summary.criteria_total).toBe(3);
    expect(course.body.data.summary.criteria_covered).toBe(0);

    // Reading the 1.1 note (VIEW rule) covers 1.1.
    const noteItem = w1.items.find((i: any) => i.title === "HTML elements");
    const opened = await request(app).get(`/elearning/my/items/${noteItem.item_id}`).set(auth(studentToken));
    expect(opened.body.data.item.state).toBe("COMPLETED");
    course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    w1 = course.body.data.sections.find((s: any) => s.section_id === week1);
    expect(w1.criteria_progress.find((c: any) => c.criteria_number === "1.1").state).toBe("COMPLETED");
    expect(w1.criteria_progress.find((c: any) => c.criteria_number === "1.2").state).toBe("NOT_STARTED");
    expect(course.body.data.summary.criteria_covered).toBe(1);

    // Week 2: passing the check demonstrates 2.1.
    const w2 = course.body.data.sections.find((s: any) => s.section_id === week2);
    const check = w2.items.find((i: any) => i.item_type === "KNOWLEDGE_CHECK");
    const attempt = await request(app).post(`/elearning/my/items/${check.item_id}/knowledge-check`).set(auth(studentToken)).send({ answers: { q1: 0 } });
    expect(attempt.body.data.passed).toBe(true);
    const mastery = await request(app).get("/elearning/my/mastery").set(auth(studentToken));
    const subject = mastery.body.data.find((s: any) => s.subject_id === subjectId);
    expect(subject.elements.find((e: any) => e.element_number === 2).demonstrated).toBe(1);
    expect(subject.elements.find((e: any) => e.element_number === 1).covered).toBe(1);
  });

  it("instructor: the item studio shows the week's curriculum brief and AI grounds on it", async () => {
    const created = await request(app).post(`/elearning/sections/${week1}/items`).set(auth(teacherToken)).send({ item_type: "PAGE", title: "New page" });
    expect(created.status).toBe(201);
    const itemId = created.body.data.item_id;

    const ctx = await request(app).get(`/elearning/items/${itemId}/context`).set(auth(teacherToken));
    expect(ctx.status).toBe(200);
    // The brief is the scheme's own plan for the week, not free text on the course.
    expect(ctx.body.data).toMatchObject({ week_number: "Week 1", topic: "HTML", element_number: 1, competency_title: "Structure a web page" });
    expect(ctx.body.data.criteria.map((c: any) => c.criteria_number).sort()).toEqual(["1.1", "1.2"]);
    // What is already in the week, so the teacher doesn't repeat it.
    expect(ctx.body.data.siblings.map((s: any) => s.title)).toEqual(expect.arrayContaining(["HTML elements", "Semantic HTML"]));

    // A student must never reach the studio's endpoints. (Generation itself calls a live
    // provider, so it is exercised in elearningPhase5Tutor.test.ts with the chain mocked.)
    expect((await request(app).get(`/elearning/items/${itemId}/context`).set(auth(studentToken))).status).toBe(403);
    expect((await request(app).post(`/elearning/items/${itemId}/generate-page`).set(auth(studentToken)).send({})).status).toBe(403);
    await request(app).delete(`/elearning/items/${itemId}`).set(auth(teacherToken));
  });

  it("admin: register carries curriculum coverage, drill-down has coverage + mastery, reports export", async () => {
    const reg = await request(app).get("/elearning/admin/courses").set(auth(adminToken)).query({ academic_year_id: academicYearId });
    expect(reg.status).toBe(200);
    const row = reg.body.data.rows.find((r: any) => r.course_id === courseId);
    expect(row.coverage_pct).toBe(100);
    expect(row.course_status).toBe("PUBLISHED");
    expect(reg.body.data.kpis.median_coverage_pct).toBeGreaterThanOrEqual(0);

    const cov = await request(app).get(`/elearning/admin/courses/${courseId}/coverage`).set(auth(adminToken));
    expect(cov.status).toBe(200);
    expect(cov.body.data.elements).toHaveLength(2);

    const report = await request(app).get(`/elearning/courses/${courseId}/report.csv`).set(auth(adminToken));
    expect(report.status).toBe(200);
    expect(report.headers["content-type"]).toContain("text/csv");
    const lines = report.text.trim().split("\n");
    expect(lines[0]).toContain("Criteria covered");
    expect(lines).toHaveLength(2); // header + one student
    expect(lines[1]).toContain('"1"'); // 1 criterion demonstrated

    // The teacher can pull the same report; a student cannot.
    expect((await request(app).get(`/elearning/courses/${courseId}/report.csv`).set(auth(teacherToken))).status).toBe(200);
    expect((await request(app).get(`/elearning/courses/${courseId}/report.csv`).set(auth(studentToken))).status).toBe(403);
    const registerCsv = await request(app).get("/elearning/admin/courses/export.csv").set(auth(adminToken)).query({ academic_year_id: academicYearId });
    expect(registerCsv.text.split("\n")[0]).toContain("Curriculum coverage %");
  });
});
