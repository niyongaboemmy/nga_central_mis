import multer from "multer";
import os from "os";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { CourseItem, FileAsset, SubjectDocument } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { recordActivity } from "../utils/activityLogger";
import { assertCanBuildCourse, loadCourse } from "../services/elearning/courseMembership";
import { loadCourseHeader, loadCourseTree, loadItemWithCourse, loadSectionWithCourse } from "../services/elearning/courseTree";
import { storeAsset } from "../services/files/assets";
import { MAX_UPLOAD_BYTES } from "../services/files/fileKinds";
import { parseVariant, previewManifest, streamStoredFile } from "../services/files/stream";

/**
 * Files on e-learning weeks (LESSON_STUDIO plan §10.7). Uploads land on disk (never in memory),
 * are checked by extension AND content, stored on the file-server, and previewed in the
 * background. Builder routes only: MANAGE_COURSE_CONTENT at the router + course build rights.
 */

export const courseFileUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 },
});

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

const stripExt = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_-]+/g, " ").trim() || name;

/** `POST /sections/:id/files` (multipart `files[]`) — one FILE item per accepted file. */
export const uploadSectionFiles = asyncHandler(async (req: any, res: any) => {
  const row = await loadSectionWithCourse(parseId(req.params.id, "section id"));
  if (!row) throw new NotFoundError("Week not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const files: Express.Multer.File[] = req.files || [];
  if (files.length === 0) throw new ValidationError("Choose at least one file");
  const created: { item_id: number; asset_id: number; name: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseItem.position}), -1)` })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, row.section.section_id));
  let position = Number(max) + 1;
  for (const f of files) {
    try {
      const asset = await storeAsset({ tmpPath: f.path, originalName: f.originalname, size: f.size, ownerUserId: req.user.userId, scope: "COURSE", courseId: row.course.course_id, subjectId: row.course.subject_id });
      const [ins] = (await db.insert(CourseItem).values({
        section_id: row.section.section_id,
        item_type: "FILE",
        ref_id: asset.asset_id,
        title: stripExt(f.originalname).slice(0, 255),
        position: position++,
        completion_rule: asset.kind === "audio" ? "VIEW" : "VIEW",
        is_published: req.body?.is_published === "0" ? 0 : 1,
        created_by: req.user.userId,
      })) as any;
      created.push({ item_id: ins.insertId, asset_id: asset.asset_id, name: f.originalname });
    } catch (error: any) {
      rejected.push({ name: f.originalname, reason: error?.statusCode === 400 ? error.message : "Couldn't store this file — try again." });
    }
  }
  if (created.length) {
    await recordActivity(req.user.userId, "ELEARNING_FILE_UPLOAD", `Uploaded ${created.length} file(s) to "${row.section.title}"`, "CourseSection", row.section.section_id, { course_id: row.course.course_id });
  }
  const [header, sections] = await Promise.all([loadCourseHeader(row.course), loadCourseTree(row.course, { includeContent: true })]);
  successResponse(res, created.length ? `${created.length} file(s) added` : "No file was added", { created, rejected, ...header, sections }, created.length ? 201 : 400);
});

/** `POST /courses/:id/reference-files` — Lesson Studio reference files (not shown to students). */
export const uploadReferenceFiles = asyncHandler(async (req: any, res: any) => {
  const course = await loadCourse(parseId(req.params.id, "course id"));
  await assertCanBuildCourse(course, req.user.userId);
  const files: Express.Multer.File[] = req.files || [];
  if (files.length === 0) throw new ValidationError("Choose at least one file");
  const assets = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const f of files) {
    try {
      const a = await storeAsset({ tmpPath: f.path, originalName: f.originalname, size: f.size, ownerUserId: req.user.userId, scope: "RUN_REFERENCE", courseId: course.course_id, subjectId: course.subject_id });
      assets.push({ asset_id: a.asset_id, name: a.original_name, kind: a.kind, size: a.size_bytes, preview_status: a.preview_status });
    } catch (error: any) {
      rejected.push({ name: f.originalname, reason: error?.statusCode === 400 ? error.message : "Couldn't store this file — try again." });
    }
  }
  successResponse(res, `${assets.length} file(s) added`, { assets, rejected }, assets.length ? 201 : 400);
});

async function buildableAsset(assetId: number, userId: number) {
  const [asset] = await db.select().from(FileAsset).where(eq(FileAsset.asset_id, assetId)).limit(1);
  if (!asset || asset.deleted_at) throw new NotFoundError("File not found");
  if (asset.owner_user_id !== userId) {
    if (!asset.course_id) throw new NotFoundError("File not found");
    await assertCanBuildCourse(await loadCourse(asset.course_id), userId);
  }
  return asset;
}

const assetFile = (a: typeof FileAsset.$inferSelect) => ({
  name: a.original_name,
  storage_path: a.storage_path,
  sha256: a.sha256,
  size: a.size_bytes,
  preview_status: a.preview_status,
  preview_error: a.preview_error,
  page_count: a.page_count,
});

/** `GET /files/:assetId` — the preview manifest (status, page count, which variants exist). */
export const getAssetManifest = asyncHandler(async (req: any, res: any) => {
  const asset = await buildableAsset(parseId(req.params.assetId, "file id"), req.user.userId);
  successResponse(res, "File", { asset_id: asset.asset_id, ...(await previewManifest(assetFile(asset))) });
});

/** `GET /files/:assetId/raw?variant=` — builder-side stream (Range-aware). */
export const streamAsset = asyncHandler(async (req: any, res: any) => {
  const asset = await buildableAsset(parseId(req.params.assetId, "file id"), req.user.userId);
  await streamStoredFile(res, assetFile(asset), parseVariant(req.query.variant), { range: req.headers.range, download: !!req.query.download });
});

/** `GET /items/:id/file?variant=` — the builder's preview of a FILE or material item. */
export const streamBuilderItemFile = asyncHandler(async (req: any, res: any) => {
  const row = await loadItemWithCourse(parseId(req.params.id, "item id"));
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const opts = { range: req.headers.range as string | undefined, download: !!req.query.download };
  if (row.item.item_type === "FILE") {
    const [asset] = await db.select().from(FileAsset).where(and(eq(FileAsset.asset_id, row.item.ref_id!))).limit(1);
    if (!asset) throw new NotFoundError("File not found");
    return streamStoredFile(res, assetFile(asset), parseVariant(req.query.variant), opts);
  }
  if (row.item.item_type === "SUBJECT_DOCUMENT") {
    const [doc] = await db.select().from(SubjectDocument).where(eq(SubjectDocument.document_id, row.item.ref_id!)).limit(1);
    if (!doc) throw new NotFoundError("File not found");
    return streamStoredFile(res, { name: doc.original_name, storage_path: doc.file_path, sha256: doc.sha256 }, parseVariant(req.query.variant), opts);
  }
  throw new NotFoundError("This item has no file");
});

/** `GET /items/:id/preview` — manifest for a FILE / material item in the builder. */
export const getBuilderItemPreview = asyncHandler(async (req: any, res: any) => {
  const row = await loadItemWithCourse(parseId(req.params.id, "item id"));
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  if (row.item.item_type === "FILE") {
    const [asset] = await db.select().from(FileAsset).where(eq(FileAsset.asset_id, row.item.ref_id!)).limit(1);
    if (!asset) throw new NotFoundError("File not found");
    return successResponse(res, "Preview", await previewManifest(assetFile(asset)));
  }
  if (row.item.item_type === "SUBJECT_DOCUMENT") {
    const [doc] = await db.select().from(SubjectDocument).where(eq(SubjectDocument.document_id, row.item.ref_id!)).limit(1);
    if (!doc) throw new NotFoundError("File not found");
    return successResponse(res, "Preview", await previewManifest({ name: doc.original_name, storage_path: doc.file_path, sha256: doc.sha256, size: doc.file_size }));
  }
  throw new NotFoundError("This item has no file");
});
