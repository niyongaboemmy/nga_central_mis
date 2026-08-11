import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createSubject,
  createRoleWithPermissions,
  assignRole,
  createTeacherSubjectAssignment,
  createProgramGradeClassGroup,
  createStudentSubjectEnrollment,
  createSubjectDocumentCategory,
  createSubjectDocument,
} from "../test/fixtures";

// Materials (SubjectDocument/SubjectDocumentCategory) previously had no
// subject-scoping at all on the read paths — any authenticated user could
// list or download any subject's documents. Students must now be tied to
// the subject via an active StudentSubjectEnrollment and hold the new
// VIEW_SUBJECT_DOCUMENTS / DOWNLOAD_SUBJECT_DOCUMENTS permissions.
describe("Subject materials — student enrollment-scoped access", () => {
  let enrolledStudentToken: string;
  let outsiderStudentToken: string;
  let noPermStudentToken: string;
  let teacherToken: string;
  let subjectId: number;
  let otherSubjectId: number;
  let categoryId: number;
  let documentId: number;

  beforeAll(async () => {
    const { academicYearId, academicTermId: _t } = await createAcademicPeriod();
    subjectId = await createSubject();
    otherSubjectId = await createSubject();

    const teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    const classGroupId = await createProgramGradeClassGroup();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId,
    });

    categoryId = await createSubjectDocumentCategory({
      subjectId,
      userId: teacherId,
    });
    documentId = await createSubjectDocument({
      categoryId,
      subjectId,
      userId: teacherId,
    });

    const studentRoleId = await createRoleWithPermissions("student", [
      "VIEW_SUBJECT_DOCUMENTS",
      "DOWNLOAD_SUBJECT_DOCUMENTS",
    ]);

    const enrolledStudentId = await createUser({ userType: "STUDENT" });
    enrolledStudentToken = signToken(enrolledStudentId);
    await assignRole(enrolledStudentId, studentRoleId);
    await createStudentSubjectEnrollment({
      userId: enrolledStudentId,
      subjectId,
      academicYearId,
    });

    // Same permissions, but enrolled in a *different* subject.
    const outsiderStudentId = await createUser({ userType: "STUDENT" });
    outsiderStudentToken = signToken(outsiderStudentId);
    await assignRole(outsiderStudentId, studentRoleId);
    await createStudentSubjectEnrollment({
      userId: outsiderStudentId,
      subjectId: otherSubjectId,
      academicYearId,
    });

    // Enrolled in the right subject, but role has no view/download permission.
    const noPermRoleId = await createRoleWithPermissions("student-no-perm", []);
    const noPermStudentId = await createUser({ userType: "STUDENT" });
    noPermStudentToken = signToken(noPermStudentId);
    await assignRole(noPermStudentId, noPermRoleId);
    await createStudentSubjectEnrollment({
      userId: noPermStudentId,
      subjectId,
      academicYearId,
    });
  });

  it("lets an enrolled student with the permission list document categories", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/document-categories`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(200);
  });

  it("lets an enrolled student with the permission list documents", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/documents`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: any) => d.document_id);
    expect(ids).toContain(documentId);
  });

  it("lets an enrolled student with the permission pass the download authorization check", async () => {
    // The fixture document has no real file on the local storage backend used by the
    // test suite, so a granted request surfaces as a 404 from the file
    // lookup rather than a 200 — what this asserts is that the request gets
    // past the 403 authorization gate at all.
    const res = await request(app)
      .get(`/curriculum/documents/${documentId}/download`)
      .set("Authorization", `Bearer ${enrolledStudentToken}`);
    expect(res.status).not.toBe(403);
  });

  it("blocks a student enrolled in a different subject from listing documents", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/documents`)
      .set("Authorization", `Bearer ${outsiderStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks a student enrolled in a different subject from downloading the document", async () => {
    const res = await request(app)
      .get(`/curriculum/documents/${documentId}/download`)
      .set("Authorization", `Bearer ${outsiderStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks an enrolled student whose role lacks VIEW_SUBJECT_DOCUMENTS", async () => {
    const res = await request(app)
      .get(`/curriculum/subjects/${subjectId}/documents`)
      .set("Authorization", `Bearer ${noPermStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks an enrolled student whose role lacks DOWNLOAD_SUBJECT_DOCUMENTS", async () => {
    const res = await request(app)
      .get(`/curriculum/documents/${documentId}/download`)
      .set("Authorization", `Bearer ${noPermStudentToken}`);
    expect(res.status).toBe(403);
  });

  it("still lets the assigned teacher list and download without the new student permissions", async () => {
    const listRes = await request(app)
      .get(`/curriculum/subjects/${subjectId}/documents`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(listRes.status).toBe(200);

    const downloadRes = await request(app)
      .get(`/curriculum/documents/${documentId}/download`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(downloadRes.status).not.toBe(403);
  });
});
