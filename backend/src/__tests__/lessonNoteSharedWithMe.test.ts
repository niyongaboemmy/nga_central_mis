import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
} from "../test/fixtures";

// End-to-end cover for the student-facing "Notes Shared With Me" list: a note the teacher
// published and shared must reach the enrolled student through each of the three share filters.
describe("GET /lesson-notes/shared-with-me", () => {
  let teacherToken: string;
  let studentToken: string;
  let teacherId: number;
  let studentId: number;
  let subjectId: number;
  let classGroupId: number;
  let gradeId: number;
  let academicYearId: number;

  const publishNote = async (title: string) => {
    const created = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, class_group_id: classGroupId, title });
    expect(created.status).toBe(201);
    const noteId = created.body.data.note_id;
    const published = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ content_html: "<p>body</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    expect(published.status).toBe(200);
    return noteId;
  };

  const share = async (noteId: number, filter_type: string, filter_ids: number[]) => {
    const res = await request(app)
      .post(`/lesson-notes/${noteId}/share`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ filter_type, filter_ids });
    expect(res.status).toBe(201);
  };

  const sharedTitles = async () => {
    const res = await request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    return res.body.data.map((n: any) => n.title);
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);

    const teacherRole = await createRoleWithPermissions("notes_teacher", ["MANAGE_LESSON_NOTES"]);
    await assignRole(teacherId, teacherRole);
    const studentRole = await createRoleWithPermissions("notes_student", ["VIEW_SHARED_LESSON_NOTES"]);
    await assignRole(studentId, studentRole);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    ({ classGroupId, gradeId } = await createProgramGradeClassGroupDetailed());
    subjectId = await createSubject();

    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
  });

  it("shows a published note to its class group with no share row at all", async () => {
    await publishNote("Just published");
    expect(await sharedTitles()).toContain("Just published");
  });

  // A student with the notes permission, signed in, and nothing else yet.
  const newStudent = async (label: string) => {
    const id = await createUser({ userType: "STUDENT" });
    await assignRole(id, await createRoleWithPermissions(label, ["VIEW_SHARED_LESSON_NOTES"]));
    return { id, token: signToken(id) };
  };

  const titlesFor = async (token: string) => {
    const res = await request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data.map((n: any) => n.title);
  };

  const openAs = (token: string, noteId: number) =>
    request(app).get(`/lesson-notes/shared-with-me/${noteId}`).set("Authorization", `Bearer ${token}`);

  it("shows a published note to a sibling class of the same year taking the subject", async () => {
    const sibling = await newStudent("notes_student_sibling");
    const { classGroupId: siblingClassId } = await createProgramGradeClassGroupDetailed({ gradeId });
    await createStudentClassGroup({ userId: sibling.id, classGroupId: siblingClassId, academicYearId });
    await createStudentSubjectEnrollment({ userId: sibling.id, subjectId, academicYearId });

    const noteId = await publishNote("Same-year note");
    expect(await titlesFor(sibling.token)).toContain("Same-year note");
    expect((await openAs(sibling.token, noteId)).status).toBe(200);
  });

  // The reported bug: one subject taught to Year 1 and Year 2 leaked each year's notes to the other.
  it("hides a class's note from another year taking the same subject", async () => {
    const otherYear = await newStudent("notes_student_other_year");
    const { classGroupId: otherYearClassId } = await createProgramGradeClassGroupDetailed();
    await createStudentClassGroup({ userId: otherYear.id, classGroupId: otherYearClassId, academicYearId });
    await createStudentSubjectEnrollment({ userId: otherYear.id, subjectId, academicYearId });

    const noteId = await publishNote("Not for the other year");
    expect(await titlesFor(otherYear.token)).not.toContain("Not for the other year");
    expect((await openAs(otherYear.token, noteId)).status).toBe(403);
  });

  it("keeps 'All enrolled' within the note's year", async () => {
    const otherYear = await newStudent("notes_student_other_year_shared");
    const { classGroupId: otherYearClassId } = await createProgramGradeClassGroupDetailed();
    await createStudentClassGroup({ userId: otherYear.id, classGroupId: otherYearClassId, academicYearId });
    await createStudentSubjectEnrollment({ userId: otherYear.id, subjectId, academicYearId });

    const noteId = await publishNote("All enrolled, one year");
    await share(noteId, "subject_enrolled", [subjectId]);
    expect(await titlesFor(otherYear.token)).not.toContain("All enrolled, one year");
  });

  it("stops showing last year's class notes once the student is promoted", async () => {
    // Promotion leaves last year's class row ACTIVE; only the newest year may count.
    const promoted = await newStudent("notes_student_promoted");
    await createStudentClassGroup({ userId: promoted.id, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: promoted.id, subjectId, academicYearId });
    const nextYear = await createAcademicPeriod();
    const { classGroupId: nextClassId } = await createProgramGradeClassGroupDetailed();
    await createStudentClassGroup({ userId: promoted.id, classGroupId: nextClassId, academicYearId: nextYear.academicYearId });

    const noteId = await publishNote("Previous year's note");
    expect(await titlesFor(promoted.token)).not.toContain("Previous year's note");
    expect((await openAs(promoted.token, noteId)).status).toBe(403);
  });

  it("still reaches a hand-picked student in another year", async () => {
    const otherYear = await newStudent("notes_student_other_year_picked");
    const { classGroupId: otherYearClassId } = await createProgramGradeClassGroupDetailed();
    await createStudentClassGroup({ userId: otherYear.id, classGroupId: otherYearClassId, academicYearId });

    const noteId = await publishNote("Picked across years");
    await share(noteId, "specific_students", [otherYear.id]);
    expect(await titlesFor(otherYear.token)).toContain("Picked across years");
  });

  it("hides a published note from a student in neither its class group nor its subject", async () => {
    const strangerId = await createUser({ userType: "STUDENT" });
    const strangerToken = signToken(strangerId);
    const role = await createRoleWithPermissions("notes_student_stranger", [
      "VIEW_SHARED_LESSON_NOTES",
    ]);
    await assignRole(strangerId, role);

    await publishNote("Not for strangers");
    const res = await request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: any) => n.title)).not.toContain("Not for strangers");
  });

  it("shows a note shared with the student's whole class group", async () => {
    const noteId = await publishNote("Class group note");
    await share(noteId, "class_group", [classGroupId]);
    expect(await sharedTitles()).toContain("Class group note");
  });

  it("shows a note shared with everyone enrolled in the subject", async () => {
    const noteId = await publishNote("Subject enrolled note");
    await share(noteId, "subject_enrolled", [subjectId]);
    expect(await sharedTitles()).toContain("Subject enrolled note");
  });

  it("shows a note shared with the student specifically", async () => {
    const noteId = await publishNote("Specific student note");
    await share(noteId, "specific_students", [studentId]);
    expect(await sharedTitles()).toContain("Specific student note");
  });

  it("hides another class's note that was shared only with a different student", async () => {
    // A note outside this student's class group and subject — the only thing that could
    // surface it is the share, and that share names someone else.
    const otherSubjectId = await createSubject();
    const otherClassGroupId = await createProgramGradeClassGroup();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: otherSubjectId,
      classGroupId: otherClassGroupId,
      academicYearId,
    });
    const otherStudentId = await createUser({ userType: "STUDENT" });

    const created = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: otherSubjectId, class_group_id: otherClassGroupId, title: "Someone else's note" });
    expect(created.status).toBe(201);
    const noteId = created.body.data.note_id;
    await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ content_html: "<p>body</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    await share(noteId, "specific_students", [otherStudentId]);

    expect(await sharedTitles()).not.toContain("Someone else's note");
  });

  it("reports share_count on the teacher's own notes list so unshared notes are visible as such", async () => {
    const noteId = await publishNote("Counted note");
    const before = await request(app)
      .get("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.find((n: any) => n.note_id === noteId).share_count).toBe(0);

    await share(noteId, "class_group", [classGroupId]);

    const after = await request(app)
      .get("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(after.body.data.find((n: any) => n.note_id === noteId).share_count).toBe(1);

    const detail = await request(app)
      .get(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.share_count).toBe(1);
  });

  it("carries a plain-text excerpt and reading estimate, but never the note body itself", async () => {
    // The reader's library cards show a preview line and an "x min read" badge. Both are
    // derived server-side so the list stays light — the full HTML must not ride along.
    const created = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, class_group_id: classGroupId, title: "Note with a body" });
    const noteId = created.body.data.note_id;
    await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        content_html: "<h2>Relational Algebra</h2><p>A relation is a set of tuples.</p>",
        content_json: { type: "doc" },
        status: "PUBLISHED",
      });

    const res = await request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const summary = res.body.data.find((n: any) => n.note_id === noteId);
    expect(summary.excerpt).toBe("Relational Algebra A relation is a set of tuples.");
    expect(summary.word_count).toBe(9);
    expect(summary.reading_minutes).toBeGreaterThanOrEqual(1);
    expect(summary.content_html).toBeUndefined();
  });

  it("refuses an AI question about a note the student cannot read", async () => {
    const strangerId = await createUser({ userType: "STUDENT" });
    const strangerToken = signToken(strangerId);
    const role = await createRoleWithPermissions("notes_student_ask_stranger", [
      "VIEW_SHARED_LESSON_NOTES",
    ]);
    await assignRole(strangerId, role);

    const noteId = await publishNote("Private to this class");
    const res = await request(app)
      .post(`/lesson-notes/shared-with-me/${noteId}/ask`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ question: "What is this note about?" });
    expect(res.status).toBe(403);
  });

  it("hides a note that is still a draft even though it was shared", async () => {
    const noteId = await publishNote("Unpublished again");
    await share(noteId, "class_group", [classGroupId]);
    const reverted = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "DRAFT" });
    expect(reverted.status).toBe(200);
    expect(await sharedTitles()).not.toContain("Unpublished again");
  });
});
