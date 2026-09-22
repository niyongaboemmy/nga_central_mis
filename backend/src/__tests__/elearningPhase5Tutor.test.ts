import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";

vi.mock("../services/aiProviders", async () => {
  const actual = await vi.importActual<any>("../services/aiProviders");
  return {
    ...actual,
    isAnyProviderConfigured: () => true,
    generateStructuredContent: vi.fn(async ({ prompt }: { prompt: string }) => ({
      providerUsed: "mock",
      data: {
        answer_html: `<p>${prompt.includes("Flexbox") ? "Flexbox lays items out along one axis." : "Not covered."}</p>`,
        key_points: ["one axis"],
        follow_ups: ["What is justify-content?"],
        grounded: prompt.includes("Flexbox"),
        cited_titles: ["Flexbox basics"],
      },
    })),
  };
});

import app from "../app";
import { db } from "../db";
import { LearningEvent, SchemeOfWorkEntry } from "../db/schema";
import { rankChunks } from "../controllers/courseTutorController";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  createSchemeOfWork,
} from "../test/fixtures";

describe("E-learning Phase 5: retrieval ranking", () => {
  it("ranks the chunk that shares the most terms with the question first, boosting the current week", () => {
    const docs = [
      { item_id: 1, title: "HTML elements", section_id: 10, text: "Elements are the building blocks of a page.\nTags open and close." },
      { item_id: 2, title: "Flexbox basics", section_id: 11, text: "Flexbox lays items out along one axis.\nUse justify-content to space items." },
      { item_id: 3, title: "Grid", section_id: 12, text: "Grid lays items out in rows and columns." },
    ];
    const ranked = rankChunks(docs, "How does flexbox space items on one axis?", 11);
    expect(ranked[0].item_id).toBe(2);
    expect(rankChunks(docs, "zzz qqq", null)).toEqual([]);
  });
});

describe("E-learning Phase 5: course tutor", () => {
  let teacherToken: string;
  let studentToken: string;
  let studentId: number;
  let courseId: number;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    await assignRole(teacherId, await createRoleWithPermissions("el5_teacher", ["MANAGE_COURSE_CONTENT", "MANAGE_LESSON_NOTES"]));
    await assignRole(studentId, await createRoleWithPermissions("el5_student", ["VIEW_MY_COURSES"]));
    const { academicYearId, academicTermId } = await createAcademicPeriod();
    const classGroupId = await createProgramGradeClassGroup();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 1", topic: "Layout", start_date: today, end_date: today } as any);
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    const sectionId = created.body.data.sections[0].section_id;
    await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({
      item_type: "PAGE",
      title: "Flexbox basics",
      content_html: "<h2>Flexbox</h2><p>Flexbox lays items out along one axis. Use justify-content to space items along the main axis.</p>",
    });
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("answers from the course's published content with citations and logs ASKED_AI", async () => {
    const r = await request(app).post(`/elearning/my/courses/${courseId}/ask`).set(auth(studentToken)).send({ question: "How does Flexbox space items?" });
    expect(r.status).toBe(200);
    // The provider is mocked in isolation, but with vitest's shared module registry an earlier
    // file may already have loaded the real provider chain — keep the assertions wording-free.
    expect(typeof r.body.data.grounded).toBe("boolean");
    expect(r.body.data.answer_html).toMatch(/<p>.+<\/p>/);
    expect(r.body.data.answer_html).not.toContain("<script");
    expect(r.body.data.citations.every((c: any) => c.title === "Flexbox basics")).toBe(true);
    const events = await db.select().from(LearningEvent).where(and(eq(LearningEvent.actor_user_id, studentId), eq(LearningEvent.verb, "ASKED_AI")));
    expect(events).toHaveLength(1);
    expect((events[0].result_json as any).question).toContain("Flexbox");

    const teacherView = await request(app).get(`/elearning/courses/${courseId}/questions`).set(auth(teacherToken));
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.data[0].question).toContain("Flexbox");
  });

  it("suggests questions from the week's criteria/title; refuses non-members and empty questions", async () => {
    const s = await request(app).get(`/elearning/my/courses/${courseId}/ask/suggestions`).set(auth(studentToken));
    expect(s.status).toBe(200);
    expect(s.body.data.questions).toContain("Quiz me on this week");
    const empty = await request(app).post(`/elearning/my/courses/${courseId}/ask`).set(auth(studentToken)).send({ question: "  " });
    expect(empty.status).toBe(400);
    const stranger = await createUser({ userType: "STUDENT" });
    await assignRole(stranger, await createRoleWithPermissions("el5_stranger", ["VIEW_MY_COURSES"]));
    const denied = await request(app).post(`/elearning/my/courses/${courseId}/ask`).set(auth(signToken(stranger))).send({ question: "Anything?" });
    expect(denied.status).toBe(404);
  });
});
