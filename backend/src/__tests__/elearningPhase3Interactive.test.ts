import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CourseItemProgress, KnowledgeCheckAttempt, SchemeOfWorkEntry } from "../db/schema";
import { resolveVideoEmbed } from "../controllers/courseController";
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

describe("E-learning Phase 3: video URL whitelist", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/abcdefghijk", "youtube", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://vimeo.com/123456789", "vimeo", "https://player.vimeo.com/video/123456789"],
  ])("%s → %s", (url, provider, embed) => {
    const r = resolveVideoEmbed(url);
    expect(r?.provider).toBe(provider);
    expect(r?.embed_url).toBe(embed);
  });
  it.each(["https://example.com/video.mp4", "javascript:alert(1)", "https://youtube.com/", "ftp://vimeo.com/1"])("rejects %s", (url) => {
    expect(resolveVideoEmbed(url)).toBeNull();
  });
});

describe("E-learning Phase 3: pages, videos, knowledge checks, prefs", () => {
  let teacherToken: string;
  let studentToken: string;
  let studentId: number;
  let courseId: number;
  let sectionId: number;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    await assignRole(teacherId, await createRoleWithPermissions("el3_teacher", ["MANAGE_COURSE_CONTENT"]));
    await assignRole(studentId, await createRoleWithPermissions("el3_student", ["VIEW_MY_COURSES"]));
    const { academicYearId, academicTermId } = await createAcademicPeriod();
    const classGroupId = await createProgramGradeClassGroup();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 1", topic: "T", start_date: today, end_date: today } as any);
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    sectionId = created.body.data.sections[0].section_id;
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("PAGE: content round-trips, HTML is sanitised, student gets the rendered body", async () => {
    const created = await request(app)
      .post(`/elearning/sections/${sectionId}/items`)
      .set(auth(teacherToken))
      .send({
        item_type: "PAGE",
        title: "Box model",
        content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Margin, border, padding." }] }] },
        content_html: '<p>Margin, border, padding.</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
      });
    expect(created.status).toBe(201);
    const itemId = created.body.data.item_id;
    const item = created.body.data.sections[0].items.find((i: any) => i.item_id === itemId);
    expect(item.content_json.type).toBe("doc");

    const opened = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(studentToken));
    expect(opened.status).toBe(200);
    expect(opened.body.data.content.content_html).toContain("Margin, border, padding.");
    expect(opened.body.data.content.content_html).not.toContain("<script");
    expect(opened.body.data.content.content_html).not.toContain("onerror");

    const patched = await request(app).patch(`/elearning/items/${itemId}`).set(auth(teacherToken)).send({ content_html: "<h2>v2</h2>", content_json: { type: "doc", v: 2 } });
    expect(patched.status).toBe(200);
    const again = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(studentToken));
    expect(again.body.data.content.content_html).toBe("<h2>v2</h2>");
  });

  it("VIDEO: only YouTube/Vimeo are accepted and the student receives an embed URL", async () => {
    const bad = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({ item_type: "VIDEO", title: "Bad", url: "https://example.com/v.mp4" });
    expect(bad.status).toBe(400);
    const good = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({ item_type: "VIDEO", title: "Flexbox in 10 min", url: "https://youtu.be/abcdefghijk" });
    expect(good.status).toBe(201);
    const opened = await request(app).get(`/elearning/my/items/${good.body.data.item_id}`).set(auth(studentToken));
    expect(opened.body.data.content.embed_url).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(opened.body.data.content.provider).toBe("youtube");
  });

  it("TASKMENTOR_QUIZ: launch card carries the URL and awaits a result", async () => {
    const r = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({ item_type: "TASKMENTOR_QUIZ", title: "Quiz", url: "https://tm.example/quiz/5", ref_id: 5, completion_rule: "SUBMIT" });
    expect(r.status).toBe(201);
    const opened = await request(app).get(`/elearning/my/items/${r.body.data.item_id}`).set(auth(studentToken));
    expect(opened.body.data.content.external_url).toBe("https://tm.example/quiz/5");
    expect(opened.body.data.item.state).toBe("IN_PROGRESS");
  });

  let checkId: number;

  it("KNOWLEDGE_CHECK: validated on save; answers never reach the student payload", async () => {
    const invalid = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({
      item_type: "KNOWLEDGE_CHECK",
      title: "Bad check",
      content_json: { questions: [{ prompt: "Q", options: ["only one"], correct_index: 0 }] },
    });
    expect(invalid.status).toBe(400);

    const created = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({
      item_type: "KNOWLEDGE_CHECK",
      title: "CSS check",
      completion_rule: "MIN_SCORE",
      min_score_pct: 60,
      content_json: {
        questions: [
          { id: "q1", type: "MCQ", prompt: "Which property sets the space inside a box?", options: ["margin", "padding", "gap"], correct_index: 1, explanation: "padding is inside the border." },
          { id: "q2", type: "TRUE_FALSE", prompt: "Margins are inside the border.", correct_index: 1, explanation: "margins are outside." },
          { id: "q3", type: "MCQ", prompt: "display: flex makes…", options: ["a grid", "a flex container"], correct_index: 1 },
        ],
      },
    });
    expect(created.status).toBe(201);
    checkId = created.body.data.item_id;

    const opened = await request(app).get(`/elearning/my/items/${checkId}`).set(auth(studentToken));
    expect(opened.status).toBe(200);
    expect(opened.body.data.content.questions).toHaveLength(3);
    expect(opened.body.data.content.questions[0].options).toEqual(["margin", "padding", "gap"]);
    expect(opened.body.data.content.questions[0].correct_index).toBeUndefined();
    expect(opened.body.data.content.questions[1].options).toEqual(["True", "False"]);
  });

  it("KNOWLEDGE_CHECK: instant feedback hides the right answer until earned; attempts score and project", async () => {
    let fb = await request(app).post(`/elearning/my/items/${checkId}/knowledge-check/check`).set(auth(studentToken)).send({ question_id: "q1", answer_index: 0 });
    expect(fb.status).toBe(200);
    expect(fb.body.data.correct).toBe(false);
    expect(fb.body.data.correct_index).toBeNull();
    expect(fb.body.data.explanation).toContain("inside the border");
    fb = await request(app).post(`/elearning/my/items/${checkId}/knowledge-check/check`).set(auth(studentToken)).send({ question_id: "q1", answer_index: 1 });
    expect(fb.body.data.correct).toBe(true);
    expect(fb.body.data.correct_index).toBe(1);

    // 1 of 3 → 33 %, below the 60 % bar: recorded, not complete.
    let attempt = await request(app).post(`/elearning/my/items/${checkId}/knowledge-check`).set(auth(studentToken)).send({ answers: { q1: 1, q2: 0, q3: 0 } });
    expect(attempt.status).toBe(200);
    expect(attempt.body.data).toMatchObject({ correct: 1, total: 3, score_pct: 33, passed: false, just_completed: false, state: "IN_PROGRESS" });

    // 3 of 3 → completes; best score kept; unlimited attempts recorded.
    attempt = await request(app).post(`/elearning/my/items/${checkId}/knowledge-check`).set(auth(studentToken)).send({ answers: { q1: 1, q2: 1, q3: 1 } });
    expect(attempt.body.data).toMatchObject({ correct: 3, score_pct: 100, passed: true, just_completed: true, state: "COMPLETED" });
    const [row] = await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.item_id, checkId), eq(CourseItemProgress.user_id, studentId)));
    expect(Number(row.best_score_pct)).toBe(100);
    const attempts = await db.select().from(KnowledgeCheckAttempt).where(eq(KnowledgeCheckAttempt.item_id, checkId));
    expect(attempts).toHaveLength(2);

    const stats = await request(app).get(`/elearning/items/${checkId}/knowledge-check/stats`).set(auth(teacherToken));
    expect(stats.status).toBe(200);
    expect(stats.body.data.attempts).toBe(2);
    expect(stats.body.data.average_pct).toBe(67);
    expect(["q2", "q3"]).toContain(stats.body.data.most_missed.id);
  });

  it("learning prefs are per account and survive reads", async () => {
    const before = await request(app).get("/elearning/my/prefs").set(auth(studentToken));
    expect(before.body.data).toEqual({ streak_enabled: false, celebrations_enabled: true, reduced_motion: null });
    const set = await request(app).patch("/elearning/my/prefs").set(auth(studentToken)).send({ streak_enabled: true, reduced_motion: true });
    expect(set.status).toBe(200);
    const after = await request(app).get("/elearning/my/prefs").set(auth(studentToken));
    expect(after.body.data).toEqual({ streak_enabled: true, celebrations_enabled: true, reduced_motion: true });
  });
});

describe("E-learning Phase 3: interactive note blocks survive the sanitiser", () => {
  it("keeps <details data-type=reveal> and <div data-type=inline-check data-check> but strips scripts", async () => {
    const { sanitizeNoteHtml } = await import("../utils/sanitizeNoteHtml");
    const html =
      '<details data-type="reveal" class="note-reveal"><summary>Show the answer</summary><div><p>42</p></div></details>' +
      '<div data-type="inline-check" data-check="{&quot;prompt&quot;:&quot;Q?&quot;,&quot;options&quot;:[&quot;a&quot;,&quot;b&quot;],&quot;correct&quot;:1,&quot;explanation&quot;:&quot;&quot;}"><p>Q?</p><ol><li>a</li><li>b</li></ol></div>' +
      "<script>alert(1)</script>";
    const out = sanitizeNoteHtml(html);
    expect(out).toContain('<details data-type="reveal"');
    expect(out).toContain("<summary>Show the answer</summary>");
    expect(out).toContain('data-type="inline-check"');
    expect(out).toContain("data-check=");
    expect(out).toContain("&quot;correct&quot;:1"); // entity-encoded in the attribute; the DOM decodes it
    expect(out).not.toContain("<script");
  });
});
