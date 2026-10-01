import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import JSZip = require("jszip");
import { and, eq } from "drizzle-orm";
import { installFakeFileServer } from "../test/fakeFileServer";

const { store } = installFakeFileServer();

import app from "../app";
import { db } from "../db";
import { BackgroundJob, FileAsset, FileDerivative, SchemeOfWorkEntry } from "../db/schema";
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
import { buildPdf } from "../test/pdfFixture";
import { classifyUpload } from "../services/files/fileKinds";
import { runJobsOnce } from "../services/jobs/backgroundJobs";
import { setConverterForTests, Converter } from "../services/files/preview/converter";
import { buildWeekContextPack } from "../services/elearning/generation/contextPack";

/**
 * Files on e-learning weeks + previews (LESSON_STUDIO plan §10, Phase B1–B2): what may be
 * uploaded, the office → PDF pipeline (with a fake converter — LibreOffice isn't needed for
 * the test), the content-hash cache, Range streaming and learner access.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function buildPptx(slides: { text: string; notes?: string }[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld><p:txBody><a:p><a:r><a:t>${s.text}</a:t></a:r></a:p></p:txBody></p:sld>`);
    if (s.notes) zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<p:notes><a:p><a:r><a:t>${s.notes}</a:t></a:r></a:p></p:notes>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

async function tmpFile(name: string, data: Buffer | string) {
  const p = path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  await fsp.writeFile(p, data);
  return p;
}

describe("Files on e-learning weeks: allowlist, sniffing, previews, streaming", () => {
  let teacherToken: string;
  let studentToken: string;
  let outsiderToken: string;
  let courseId: number;
  let sectionId: number;
  let teacherId: number;
  let subjectId: number;
  let classGroupId: number;
  let conversions = 0;
  // Built once: JSZip stamps the current time into a zip, so two builds differ byte-wise.
  let deckBytes: Buffer;

  const fakeConverter: Converter = {
    name: "fake",
    async convertToPdf(input, outDir) {
      conversions += 1;
      const out = path.join(outDir, `${path.basename(input, path.extname(input))}.pdf`);
      await fsp.writeFile(out, buildPdf("Converted slides about colour theory"));
      return out;
    },
  };

  beforeAll(async () => {
    setConverterForTests(fakeConverter);
    teacherId = await createUser({ userType: "TEACHER" });
    const studentId = await createUser({ userType: "STUDENT" });
    const outsiderId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    outsiderToken = signToken(outsiderId);
    await assignRole(teacherId, await createRoleWithPermissions("files_teacher", ["MANAGE_COURSE_CONTENT"]));
    const learnerRole = await createRoleWithPermissions("files_student", ["VIEW_MY_COURSES"]);
    await assignRole(studentId, learnerRole);
    await assignRole(outsiderId, learnerRole);
    const period = await createAcademicPeriod();
    ({ classGroupId } = await createProgramGradeClassGroupDetailed());
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: period.academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId: period.academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: period.academicYearId });
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 1", topic: "Colour theory", start_date: today, end_date: today } as any);
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    sectionId = created.body.data.sections[0].section_id;
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
    await request(app).patch(`/elearning/sections/${sectionId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });
  afterAll(() => setConverterForTests(undefined));

  it("classifies uploads by extension AND content: no videos, no programs, no fakes", async () => {
    const pdf = await tmpFile("a.pdf", buildPdf("hello"));
    expect(await classifyUpload("Lesson.pdf", pdf, 100)).toMatchObject({ ok: true, kind: "pdf" });
    const exe = await tmpFile("x.pdf", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]));
    expect(await classifyUpload("notes.pdf", exe, 102)).toMatchObject({ ok: false, reason: expect.stringContaining("program") });
    const mp4 = await tmpFile("v.mp4", Buffer.alloc(100));
    expect(await classifyUpload("class.mp4", mp4, 100)).toMatchObject({ ok: false, reason: expect.stringContaining("YouTube") });
    expect(await classifyUpload("macro.docm", pdf, 100)).toMatchObject({ ok: false });
    const fakeDocx = await tmpFile("f.docx", "just text, not a zip");
    expect(await classifyUpload("f.docx", fakeDocx, 20)).toMatchObject({ ok: false, reason: expect.stringContaining("doesn't look like") });
    const binaryTxt = await tmpFile("b.txt", Buffer.from([0x41, 0x00, 0x42]));
    expect(await classifyUpload("b.txt", binaryTxt, 3)).toMatchObject({ ok: false });
    expect(await classifyUpload("song.mp3", pdf, 100)).toMatchObject({ ok: false });
  });

  it("uploads several files to a week in one go, refusing the bad ones with a reason", async () => {
    deckBytes = await buildPptx([
      { text: "Colour wheel", notes: "Primary colours mix into secondary colours" },
      { text: "Warm and cool colours", notes: "2" },
    ]);
    const pptx = deckBytes;
    const r = await request(app)
      .post(`/elearning/sections/${sectionId}/files`)
      .set(auth(teacherToken))
      .attach("files", pptx, "Colour theory.pptx")
      .attach("files", buildPdf("Worksheet on colour harmony"), "worksheet.pdf")
      .attach("files", Buffer.alloc(64), "recording.mp4");
    expect(r.status).toBe(201);
    expect(r.body.data.created).toHaveLength(2);
    expect(r.body.data.rejected).toEqual([expect.objectContaining({ name: "recording.mp4", reason: expect.stringContaining("YouTube") })]);
    const items = r.body.data.sections.find((s: any) => s.section_id === sectionId).items.filter((i: any) => i.item_type === "FILE");
    expect(items.map((i: any) => i.title).sort()).toEqual(["Colour theory", "worksheet"]);
    expect(items[0].ref).toMatchObject({ preview_status: "PENDING" });
  });

  it("the preview job converts slides to PDF once, reads slide text + speaker notes, and marks the file READY", async () => {
    await runJobsOnce();
    const assets = await db.select().from(FileAsset).where(eq(FileAsset.course_id, courseId));
    const deck = assets.find((a) => a.extension === "pptx")!;
    const pdf = assets.find((a) => a.extension === "pdf")!;
    expect(deck.preview_status).toBe("READY");
    expect(pdf.preview_status).toBe("READY");
    expect(pdf.page_count).toBe(1);
    expect(conversions).toBe(1); // the PDF itself needs no conversion
    const derivs = await db.select().from(FileDerivative).where(eq(FileDerivative.sha256, deck.sha256));
    expect(derivs.map((d) => d.variant).sort()).toEqual(expect.arrayContaining(["PDF", "TEXT"]));
    const text = store.get(derivs.find((d) => d.variant === "TEXT")!.storage_path)!.toString("utf8");
    expect(text).toContain("Colour wheel");
    expect(text).toContain("Speaker notes: Primary colours mix into secondary colours");
    expect(text).not.toContain("Speaker notes: 2"); // a bare slide number is not a note
  });

  it("the same file uploaded again is never converted twice (content-hash cache)", async () => {
    const pptx = deckBytes;
    const r = await request(app).post(`/elearning/sections/${sectionId}/files`).set(auth(teacherToken)).attach("files", pptx, "copy.pptx");
    expect(r.status).toBe(201);
    await runJobsOnce();
    expect(conversions).toBe(1);
    const [copy] = await db.select().from(FileAsset).where(and(eq(FileAsset.original_name, "copy.pptx"), eq(FileAsset.course_id, courseId)));
    expect(copy.preview_status).toBe("READY");
  });

  it("students stream a file (and its PDF preview) with Range; non-members get 404", async () => {
    const course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(course.status).toBe(200);
    const fileItem = course.body.data.sections[0].items.find((i: any) => i.item_type === "FILE" && i.title === "Colour theory");
    const opened = await request(app).get(`/elearning/my/items/${fileItem.item_id}`).set(auth(studentToken));
    expect(opened.body.data.content.preview).toMatchObject({ kind: "slides", preview_status: "READY", variants: { pdf: true, text: true } });
    const ranged = await request(app).get(`/elearning/my/items/${fileItem.item_id}/file?variant=pdf`).set(auth(studentToken)).set("Range", "bytes=0-3");
    expect(ranged.status).toBe(206);
    expect(ranged.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.from(ranged.body).toString("latin1")).toBe("%PDF");
    const original = await request(app).get(`/elearning/my/items/${fileItem.item_id}/file?download=1`).set(auth(studentToken));
    expect(original.status).toBe(200);
    expect(original.headers["content-disposition"]).toContain("attachment");
    expect(original.headers["x-content-type-options"]).toBe("nosniff");
    expect((await request(app).get(`/elearning/my/items/${fileItem.item_id}/file`).set(auth(outsiderToken))).status).toBe(404);
  });

  it("offline: the week manifest lists light previews with sizes, and a prefetch is not a visit", async () => {
    const m = await request(app).get(`/elearning/my/sections/${sectionId}/offline-manifest`).set(auth(studentToken));
    expect(m.status).toBe(200);
    const deck = m.body.data.items.find((i: any) => i.title === "Colour theory");
    expect(deck.urls.map((u: any) => u.url)).toContain(`/elearning/my/items/${deck.item_id}/file?variant=pdf`);
    expect(m.body.data.total_bytes).toBeGreaterThan(0);
    expect((await request(app).get(`/elearning/my/sections/${sectionId}/offline-manifest`).set(auth(outsiderToken))).status).toBe(404);

    const ws = await request(app).get(`/elearning/my/items/${deck.item_id}`).set(auth(studentToken)).set("X-Prefetch", "1");
    expect(ws.status).toBe(200);
    // The earlier test opened this deck for real, so pick an untouched item to prove no view is recorded.
    const fresh = m.body.data.items.find((i: any) => i.title === "copy");
    const before = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    const stateBefore = before.body.data.sections[0].items.find((i: any) => i.item_id === fresh.item_id).state;
    await request(app).get(`/elearning/my/items/${fresh.item_id}`).set(auth(studentToken)).set("X-Prefetch", "1");
    const after = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(after.body.data.sections[0].items.find((i: any) => i.item_id === fresh.item_id).state).toBe(stateBefore);
    expect(stateBefore).toBe("NOT_STARTED");
  });

  it("a teacher's reference file feeds the Week Context Pack as a cited source", async () => {
    const [deck] = await db.select().from(FileAsset).where(and(eq(FileAsset.original_name, "Colour theory.pptx"), eq(FileAsset.course_id, courseId)));
    const pack = await buildWeekContextPack(sectionId, { teacherUserId: teacherId, subjectId, classGroupId, extraAssetIds: [deck.asset_id] });
    const file = pack!.sources.find((s) => s.kind === "COURSE_FILE");
    expect(file).toMatchObject({ title: 'File "Colour theory.pptx"' });
    expect(file!.text).toContain("Colour wheel");
  });

  it("without a converter, office files still get their text and are marked UNSUPPORTED for preview", async () => {
    setConverterForTests(null);
    const pptx = await buildPptx([{ text: "Typography basics" }]);
    await request(app).post(`/elearning/sections/${sectionId}/files`).set(auth(teacherToken)).attach("files", pptx, "type.pptx");
    await runJobsOnce();
    const [asset] = await db.select().from(FileAsset).where(and(eq(FileAsset.original_name, "type.pptx"), eq(FileAsset.course_id, courseId)));
    expect(asset.preview_status).toBe("UNSUPPORTED");
    expect(asset.text_chars).toBeGreaterThan(5);
    setConverterForTests(fakeConverter);
    const jobs = await db.select().from(BackgroundJob).where(eq(BackgroundJob.status, "FAILED"));
    expect(jobs.filter((j) => JSON.stringify(j.payload).includes(asset.sha256))).toHaveLength(0);
  });
});
