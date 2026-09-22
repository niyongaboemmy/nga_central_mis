import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { CompetencyPerformanceCriteria, SchemeOfWorkEntry, SubjectCompetency } from "../db/schema";
import { deriveMastery } from "../services/elearning/courseMastery";
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
  createProgramLead,
} from "../test/fixtures";

describe("E-learning Phase 4: mastery derivation", () => {
  const item = (id: number, rule: string, type = "LINK") => ({ item_id: id, completion_rule: rule, item_type: type } as any);
  const prog = (entries: [number, string, number | null][]) => new Map(entries.map(([id, state, best]) => [id, { state, best_score_pct: best }]));

  it("NOT_COVERED when nothing aligned or nothing done", () => {
    expect(deriveMastery(undefined, new Map(), new Map())).toBe("NOT_COVERED");
    expect(deriveMastery([item(1, "VIEW")], prog([[1, "IN_PROGRESS", null]]), new Map())).toBe("NOT_COVERED");
  });
  it("COVERED when an aligned VIEW/MARK_DONE item is completed", () => {
    expect(deriveMastery([item(1, "VIEW")], prog([[1, "COMPLETED", null]]), new Map())).toBe("COVERED");
  });
  it("DEMONSTRATED for a passed MIN_SCORE/SUBMIT item or a knowledge check ≥ 80 %", () => {
    expect(deriveMastery([item(1, "MIN_SCORE")], prog([[1, "COMPLETED", 75]]), new Map())).toBe("DEMONSTRATED");
    expect(deriveMastery([item(2, "VIEW", "KNOWLEDGE_CHECK")], prog([[2, "COMPLETED", 60]]), new Map([[2, 60]]))).toBe("COVERED");
    expect(deriveMastery([item(2, "VIEW", "KNOWLEDGE_CHECK")], prog([[2, "COMPLETED", 60]]), new Map([[2, 85]]))).toBe("DEMONSTRATED");
  });
});

describe("E-learning Phase 4: class matrix, student mastery, admin scoping, export", () => {
  let teacherToken: string;
  let studentToken: string;
  let studentId: number;
  let adminToken: string;
  let leadInToken: string;
  let leadOutToken: string;
  let courseId: number;
  let sectionId: number;
  let subjectId: number;
  let c11: number;
  let c12: number;
  let academicYearId: number;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    const adminId = await createUser({ userType: "ADMIN" });
    const leadIn = await createUser({ userType: "TEACHER" });
    const leadOut = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    adminToken = signToken(adminId);
    leadInToken = signToken(leadIn);
    leadOutToken = signToken(leadOut);
    await assignRole(teacherId, await createRoleWithPermissions("el4_teacher", ["MANAGE_COURSE_CONTENT"]));
    await assignRole(studentId, await createRoleWithPermissions("el4_student", ["VIEW_MY_COURSES"]));
    const oversight = await createRoleWithPermissions("el4_oversight", ["VIEW_ALL_COURSES"]);
    await assignRole(adminId, oversight);
    await assignRole(leadIn, oversight);
    await assignRole(leadOut, oversight);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    const { programId, classGroupId } = await createProgramGradeClassGroupDetailed();
    const other = await createProgramGradeClassGroupDetailed();
    await createProgramLead({ userId: leadIn, programId, academicYearId });
    await createProgramLead({ userId: leadOut, programId: other.programId, academicYearId });

    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });

    // Curriculum: Element 1 with criteria 1.1 and 1.2.
    const [comp] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 1, title: "Apply CSS layout" })) as any;
    const [r1] = (await db.insert(CompetencyPerformanceCriteria).values({ competency_id: comp.insertId, criteria_number: "1.1", description: "Selectors are used correctly" })) as any;
    const [r2] = (await db.insert(CompetencyPerformanceCriteria).values({ competency_id: comp.insertId, criteria_number: "1.2", description: "Box model is applied" })) as any;
    c11 = r1.insertId;
    c12 = r2.insertId;

    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 1", topic: "Layout", start_date: today, end_date: today } as any);
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    sectionId = created.body.data.sections[0].section_id;
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("aligns items to criteria and derives the class matrix and the student's own view", async () => {
    const link = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({ item_type: "LINK", title: "Selectors guide", url: "https://example.com/sel", completion_rule: "MARK_DONE", criteria_ids: [c11] });
    expect(link.status).toBe(201);
    const check = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({
      item_type: "KNOWLEDGE_CHECK",
      title: "Box model check",
      completion_rule: "MIN_SCORE",
      min_score_pct: 50,
      criteria_ids: [c12],
      content_json: { questions: [{ id: "q1", type: "TRUE_FALSE", prompt: "Padding is inside the border", correct_index: 0 }, { id: "q2", type: "TRUE_FALSE", prompt: "Margin is inside the border", correct_index: 1 }] },
    });
    expect(check.status).toBe(201);
    const wrongSubject = await request(app).put(`/elearning/items/${link.body.data.item_id}/criteria`).set(auth(teacherToken)).send({ criteria_ids: [999999] });
    expect(wrongSubject.status).toBe(400);

    let matrix = await request(app).get(`/elearning/courses/${courseId}/mastery`).set(auth(teacherToken));
    expect(matrix.status).toBe(200);
    expect(matrix.body.data.criteria_total).toBe(2);
    expect(matrix.body.data.unaligned_criteria).toBe(0);
    let me = matrix.body.data.students.find((s: any) => s.user_id === studentId);
    expect(me.states[c11]).toBe("NOT_COVERED");

    await request(app).post(`/elearning/my/items/${link.body.data.item_id}/done`).set(auth(studentToken));
    // 1 of 2 = 50 % → passes the 50 % bar (DEMONSTRATED via MIN_SCORE) even though below 80.
    await request(app).post(`/elearning/my/items/${check.body.data.item_id}/knowledge-check`).set(auth(studentToken)).send({ answers: { q1: 0, q2: 0 } });

    matrix = await request(app).get(`/elearning/courses/${courseId}/mastery`).set(auth(teacherToken));
    me = matrix.body.data.students.find((s: any) => s.user_id === studentId);
    expect(me.states[c11]).toBe("COVERED");
    expect(me.states[c12]).toBe("DEMONSTRATED");
    expect(matrix.body.data.columns.find((c: any) => c.criteria_id === c11).covered_pct).toBe(100);

    const mine = await request(app).get("/elearning/my/mastery").set(auth(studentToken));
    expect(mine.status).toBe(200);
    const subject = mine.body.data.find((s: any) => s.subject_id === subjectId);
    expect(subject.elements[0]).toMatchObject({ element_number: 1, covered: 1, demonstrated: 1, total: 2 });
  });

  it("admin register: super admin sees the course; a programme lead only within their programme", async () => {
    const all = await request(app).get("/elearning/admin/courses").set(auth(adminToken)).query({ academic_year_id: academicYearId });
    expect(all.status).toBe(200);
    expect(all.body.data.rows.map((r: any) => r.course_id)).toContain(courseId);
    expect(all.body.data.kpis.courses_live).toBeGreaterThanOrEqual(1);

    const inScope = await request(app).get("/elearning/admin/courses").set(auth(leadInToken)).query({ academic_year_id: academicYearId });
    expect(inScope.body.data.scoped).toBe(true);
    expect(inScope.body.data.rows.map((r: any) => r.course_id)).toContain(courseId);

    const outScope = await request(app).get("/elearning/admin/courses").set(auth(leadOutToken)).query({ academic_year_id: academicYearId });
    expect(outScope.body.data.rows.map((r: any) => r.course_id)).not.toContain(courseId);
    const forbidden = await request(app).get(`/elearning/admin/courses/${courseId}/analytics`).set(auth(leadOutToken));
    expect(forbidden.status).toBe(403);
    const allowed = await request(app).get(`/elearning/admin/courses/${courseId}/mastery`).set(auth(leadInToken));
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.criteria_total).toBe(2);

    const student = await request(app).get("/elearning/admin/courses").set(auth(studentToken));
    expect(student.status).toBe(403);
  });

  it("exports the register as CSV with one row per scheme", async () => {
    const csv = await request(app).get("/elearning/admin/courses/export.csv").set(auth(adminToken)).query({ academic_year_id: academicYearId });
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    const lines = csv.text.trim().split("\n");
    expect(lines[0]).toContain('"Program","Grade","Class group","Subject"');
    expect(lines.some((l) => l.includes('"PUBLISHED"'))).toBe(true);
  });

  it("streak counts consecutive active weeks", async () => {
    const r = await request(app).get("/elearning/my/streak").set(auth(studentToken));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ weeks: 1, this_week: true });
  });
});
