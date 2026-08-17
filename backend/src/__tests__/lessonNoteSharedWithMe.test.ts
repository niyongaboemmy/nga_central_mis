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
    const teacherId = await createUser({ userType: "TEACHER" });
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

  it("hides a note shared only with a different student", async () => {
    const otherStudentId = await createUser({ userType: "STUDENT" });
    const noteId = await publishNote("Someone else's note");
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
