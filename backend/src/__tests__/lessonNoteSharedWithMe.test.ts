import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
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
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();

    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
  });

  it("shows a published note to its class group with no share row at all", async () => {
    await publishNote("Just published");
    expect(await sharedTitles()).toContain("Just published");
  });

  it("shows a published note to a student enrolled in the subject but not in its class group", async () => {
    const outsiderId = await createUser({ userType: "STUDENT" });
    const outsiderToken = signToken(outsiderId);
    const studentRole = await createRoleWithPermissions("notes_student_enrolled", [
      "VIEW_SHARED_LESSON_NOTES",
    ]);
    await assignRole(outsiderId, studentRole);
    await createStudentSubjectEnrollment({ userId: outsiderId, subjectId, academicYearId });

    await publishNote("Enrolled-only note");
    const res = await request(app)
      .get("/lesson-notes/shared-with-me")
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: any) => n.title)).toContain("Enrolled-only note");
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
