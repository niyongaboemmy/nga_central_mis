import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { installFakeFileServer } from "../test/fakeFileServer";

installFakeFileServer();

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
 * Exit tickets, flashcards and TVET practical tasks (LESSON_STUDIO plan §11, Phase B3).
 */
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
// A 1×1 PNG.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

describe("Interactive item types: exit tickets, flashcards, practical tasks", () => {
  let teacher: string;
  let alice: string;
  let ben: string;
  let aliceId: number;
  let sectionId: number;
  let courseId: number;
  let criterionId: number;

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    aliceId = await createUser({ userType: "STUDENT" });
    const benId = await createUser({ userType: "STUDENT" });
    teacher = signToken(teacherId);
    alice = signToken(aliceId);
    ben = signToken(benId);
    await assignRole(teacherId, await createRoleWithPermissions("it_teacher", ["MANAGE_COURSE_CONTENT"]));
    const learner = await createRoleWithPermissions("it_student", ["VIEW_MY_COURSES"]);
    await assignRole(aliceId, learner);
    await assignRole(benId, learner);
    const period = await createAcademicPeriod();
    const { classGroupId } = await createProgramGradeClassGroupDetailed();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: period.academicYearId });
    for (const id of [aliceId, benId]) {
      await createStudentClassGroup({ userId: id, classGroupId, academicYearId: period.academicYearId });
      await createStudentSubjectEnrollment({ userId: id, subjectId, academicYearId: period.academicYearId });
    }
    const [e] = (await db.insert(SubjectCompetency).values({ subject_id: subjectId, user_id: teacherId, element_number: 1, title: "Wire a circuit" })) as any;
    criterionId = ((await db.insert(CompetencyPerformanceCriteria).values({ competency_id: e.insertId, criteria_number: "1.1", description: "Circuit is wired safely" })) as any)[0].insertId;
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    const [w] = (await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, competency_id: e.insertId, week_number: "Week 1", topic: "Simple circuits", start_date: today, end_date: today } as any)) as any;
    await db.insert(SchemeEntryCriteria).values({ entry_id: w.insertId, criteria_id: criterionId });
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacher));
    courseId = created.body.data.course.course_id;
    sectionId = created.body.data.sections[0].section_id;
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacher)).send({ status: "PUBLISHED" });
    await request(app).patch(`/elearning/sections/${sectionId}`).set(auth(teacher)).send({ status: "PUBLISHED" });
  });

  const createItem = async (body: any) => {
    const r = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacher)).send(body);
    expect(r.status).toBe(201);
    return r.body.data.item_id as number;
  };

  it("validates bodies: exit tickets ≤ 3 questions, flashcards need fronts and backs, practicals need a checklist", async () => {
    const bad = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacher)).send({
      item_type: "EXIT_TICKET",
      title: "Too long",
      content_json: { questions: [1, 2, 3, 4].map((i) => ({ type: "TRUE_FALSE", prompt: `Q${i}`, correct_index: 0 })) },
    });
    expect(bad.status).toBe(400);
    expect((await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacher)).send({ item_type: "FLASHCARDS", title: "x", content_json: { cards: [{ front: "only" }] } })).status).toBe(400);
    expect((await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacher)).send({ item_type: "PRACTICAL_TASK", title: "x", content_json: { checklist: [] } })).status).toBe(400);
  });

  it("exit ticket: answered once, keys revealed only after, class pulse flags confident-but-wrong", async () => {
    const itemId = await createItem({
      item_type: "EXIT_TICKET",
      title: "Week 1 exit ticket",
      content_json: { questions: [{ type: "MCQ", prompt: "Which wire is live?", options: ["Brown", "Blue"], correct_index: 0, explanation: "Brown is live." }] },
    });
    const opened = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(alice));
    expect(opened.body.data.content.questions[0]).not.toHaveProperty("correct_index");
    expect(opened.body.data.content.submitted).toBeNull();

    const a = await request(app).post(`/elearning/my/items/${itemId}/exit-ticket`).set(auth(alice)).send({ answers: { q1: 1 }, confidence: 3 });
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({ correct: 0, total: 1, keys: [{ id: "q1", correct_index: 0 }] });
    expect((await request(app).post(`/elearning/my/items/${itemId}/exit-ticket`).set(auth(alice)).send({ answers: { q1: 0 }, confidence: 1 })).status).toBe(409);
    await request(app).post(`/elearning/my/items/${itemId}/exit-ticket`).set(auth(ben)).send({ answers: { q1: 0 }, confidence: 2 });

    const pulse = await request(app).get(`/elearning/items/${itemId}/exit-ticket/pulse`).set(auth(teacher));
    expect(pulse.body.data).toMatchObject({ responded: 2, class_size: 2, confidence: { sure: 1, okay: 1 } });
    expect(pulse.body.data.questions[0]).toMatchObject({ right: 1, answered: 2, choices: [1, 1] });
    expect(pulse.body.data.students[0]).toMatchObject({ user_id: aliceId, confident_but_wrong: true });
    expect((await request(app).get(`/elearning/items/${itemId}/exit-ticket/pulse`).set(auth(alice))).status).toBe(403);

    // Formative: done, but never counted as "demonstrated".
    const course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(alice));
    const item = course.body.data.sections[0].items.find((i: any) => i.item_id === itemId);
    expect(item.state).toBe("COMPLETED");
  });

  it("flashcards: device-computed schedules are stored, due cards come back, the deck completes once all are reviewed", async () => {
    const itemId = await createItem({ item_type: "FLASHCARDS", title: "Key terms", content_json: { cards: [{ id: "a", front: "Live", back: "Brown wire" }, { id: "b", front: "Neutral", back: "Blue wire" }] } });
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const r1 = await request(app).post(`/elearning/my/items/${itemId}/flashcards/review`).set(auth(alice)).send({ card_id: "a", rating: 1, due_at: past, fsrs_state: { stability: 0.4, difficulty: 6, reps: 1, state: 1 } });
    expect(r1.body.data).toMatchObject({ reviewed: 1, total: 2, just_completed: false });
    const r2 = await request(app).post(`/elearning/my/items/${itemId}/flashcards/review`).set(auth(alice)).send({ card_id: "b", rating: 3, due_at: future, fsrs_state: { stability: 3, difficulty: 5, reps: 1, state: 2 } });
    expect(r2.body.data).toMatchObject({ reviewed: 2, just_completed: true });
    expect((await request(app).post(`/elearning/my/items/${itemId}/flashcards/review`).set(auth(alice)).send({ card_id: "zzz", rating: 3, due_at: future, fsrs_state: {} })).status).toBe(400);

    const due = await request(app).get("/elearning/my/flashcards/due").set(auth(alice));
    expect(due.body.data.due.map((d: any) => d.card.id)).toEqual(["a"]);
    const opened = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(alice));
    expect(opened.body.data.content.reviews).toHaveLength(2);
  });

  it("practical task: photos only, teacher sees them, sign-off needs every line and makes the criterion DEMONSTRATED", async () => {
    const itemId = await createItem({
      item_type: "PRACTICAL_TASK",
      title: "Wire a lamp circuit",
      content_html: "<p>Wire a lamp with a switch.</p><script>alert(1)</script>",
      content_json: { checklist: [{ text: "Live goes through the switch", criteria_number: "1.1" }, { text: "Terminals are tight" }] },
      criteria_ids: [criterionId],
    });
    const opened = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(alice));
    expect(opened.body.data.content.brief_html).not.toContain("<script>");
    expect(opened.body.data.content.checklist).toHaveLength(2);

    const notPhoto = await request(app).post(`/elearning/my/items/${itemId}/practical`).set(auth(alice)).attach("photos", Buffer.from("%PDF-1.4"), "x.pdf");
    expect(notPhoto.status).toBe(400);
    const sent = await request(app).post(`/elearning/my/items/${itemId}/practical`).set(auth(alice)).attach("photos", PNG, "lamp.png").field("note", "Done in the lab");
    expect(sent.status).toBe(201);

    const list = await request(app).get(`/elearning/courses/${courseId}/practicals?status=SUBMITTED`).set(auth(teacher));
    const sub = list.body.data[0];
    expect(sub).toMatchObject({ item_id: itemId, student: { user_id: aliceId }, student_note: "Done in the lab" });
    const photo = await request(app).get(`/elearning/practicals/${sub.submission_id}/photos/${sub.photos[0]}`).set(auth(teacher));
    expect(photo.status).toBe(200);
    expect((await request(app).get(`/elearning/my/practical-photos/${sub.photos[0]}`).set(auth(ben))).status).toBe(404);

    const partial = await request(app).post(`/elearning/practicals/${sub.submission_id}/review`).set(auth(teacher)).send({ decision: "SIGN_OFF", checklist_result: { k1: true } });
    expect(partial.status).toBe(400);
    const ok = await request(app).post(`/elearning/practicals/${sub.submission_id}/review`).set(auth(teacher)).send({ decision: "SIGN_OFF", checklist_result: { k1: true, k2: true } });
    expect(ok.status).toBe(200);
    const mastery = await request(app).get("/elearning/my/mastery").set(auth(alice));
    const flat = JSON.stringify(mastery.body.data);
    expect(flat).toContain("DEMONSTRATED");
    expect((await request(app).post(`/elearning/my/items/${itemId}/practical`).set(auth(alice)).attach("photos", PNG, "again.png")).status).toBe(409);
  });
});
