import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

import { installFakeFileServer } from "../test/fakeFileServer";

// The file-server isn't running under test — an in-memory fake hands back exactly what
// was uploaded (see test/fakeFileServer.ts).
const { store: memoryStore } = installFakeFileServer();

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

/** A minimal but valid single-page PDF with one line of real text, built by hand so the
 *  test doesn't depend on any PDF-writing library. */
function buildPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    body += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

describe("Lesson notes created from an uploaded PDF", () => {
  let teacherToken: string;
  let studentToken: string;
  let subjectId: number;
  let classGroupId: number;

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    const studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);

    const teacherRole = await createRoleWithPermissions("pdf_notes_teacher", ["MANAGE_LESSON_NOTES"]);
    await assignRole(teacherId, teacherRole);
    const studentRole = await createRoleWithPermissions("pdf_notes_student", ["VIEW_SHARED_LESSON_NOTES"]);
    await assignRole(studentId, studentRole);

    const { academicYearId } = await createAcademicPeriod();
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
  });

  const uploadPdf = (title: string, pdf: Buffer, filename = "week-3-photosynthesis.pdf") =>
    request(app)
      .post("/lesson-notes/upload-pdf")
      .set("Authorization", `Bearer ${teacherToken}`)
      .field("subject_id", String(subjectId))
      .field("class_group_id", String(classGroupId))
      .field("title", title)
      .attach("file", pdf, { filename, contentType: "application/pdf" });

  it("creates a DRAFT, read-only note with the PDF's text extracted for the AI tutor", async () => {
    const res = await uploadPdf("Photosynthesis", buildPdf("Photosynthesis turns light into sugar"));
    expect(res.status).toBe(201);
    expect(res.body.data.page_count).toBe(1);
    expect(res.body.data.is_textless).toBe(false);
    const noteId = res.body.data.note_id;

    const detail = await request(app).get(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("DRAFT");
    expect(detail.body.data.source).toBe("PDF_UPLOAD");
    expect(detail.body.data.file_name).toBe("week-3-photosynthesis.pdf");
    expect(detail.body.data.content_html).toContain("Photosynthesis turns light into sugar");

    const list = await request(app).get("/lesson-notes").set("Authorization", `Bearer ${teacherToken}`);
    const row = list.body.data.find((n: any) => n.note_id === noteId);
    expect(row.source).toBe("PDF_UPLOAD");
    expect(row.page_count).toBe(1);
  });

  it("refuses content edits and AI edits but allows title + publish", async () => {
    const created = await uploadPdf("Read only", buildPdf("Some text"));
    const noteId = created.body.data.note_id;

    const edit = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ content_html: "<p>hacked</p>" });
    expect(edit.status).toBe(400);
    expect(edit.body.message).toMatch(/read-only/i);

    const aiEdit = await request(app)
      .post(`/lesson-notes/${noteId}/ai-edit`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ instruction: "make it shorter" });
    expect(aiEdit.status).toBe(400);

    const rename = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ title: "Renamed", status: "PUBLISHED" });
    expect(rename.status).toBe(200);

    const detail = await request(app).get(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(detail.body.data.title).toBe("Renamed");
    expect(detail.body.data.status).toBe("PUBLISHED");
  });

  it("streams the PDF to the owner, and to a student only once published", async () => {
    const pdf = buildPdf("Shared file");
    const created = await uploadPdf("Streaming", pdf);
    const noteId = created.body.data.note_id;

    const ownerRaw = await request(app)
      .get(`/lesson-notes/${noteId}/pdf/raw`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(ownerRaw.status).toBe(200);
    expect(ownerRaw.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.compare(ownerRaw.body as Buffer, pdf)).toBe(0);

    // Draft: the class can't see it yet.
    const draftStudent = await request(app)
      .get(`/lesson-notes/${noteId}/pdf/raw`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(draftStudent.status).toBe(403);

    await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ status: "PUBLISHED" });

    const studentRaw = await request(app)
      .get(`/lesson-notes/${noteId}/pdf/raw`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentRaw.status).toBe(200);

    const shared = await request(app)
      .get(`/lesson-notes/shared-with-me/${noteId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(shared.status).toBe(200);
    expect(shared.body.data.source).toBe("PDF_UPLOAD");
    expect(shared.body.data.page_count).toBe(1);

    const library = await request(app).get("/lesson-notes/shared-with-me").set("Authorization", `Bearer ${studentToken}`);
    const row = library.body.data.find((n: any) => n.note_id === noteId);
    expect(row.source).toBe("PDF_UPLOAD");
    expect(row.excerpt).toContain("Shared file");
  });

  it("rejects a non-PDF disguised with a .pdf name", async () => {
    const res = await uploadPdf("Fake", Buffer.from("this is not a pdf"), "fake.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PDF/);
  });

  it("removes the stored file when the note is deleted", async () => {
    const created = await uploadPdf("To delete", buildPdf("bye"));
    const noteId = created.body.data.note_id;
    const detail = await request(app).get(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    const filePath = detail.body.data.file_path as string;
    expect(memoryStore.has(filePath)).toBe(true);

    const del = await request(app).delete(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(del.status).toBe(200);
    expect(memoryStore.has(filePath)).toBe(false);
  });
});
