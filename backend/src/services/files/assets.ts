import { createHash } from "crypto";
import { createReadStream, promises as fsp } from "fs";
import os from "os";
import path from "path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { BackgroundJob, FileAsset, FileDerivative, SubjectDocument } from "../../db/schema";
import { ValidationError } from "../../errors/CustomError";
import storageService from "../../utils/fileServer";
import logger from "../../utils/logger";
import { enqueueJob, registerJobHandler } from "../jobs/backgroundJobs";
import { registerMaterialTextLoader } from "../elearning/generation/contextPack";
import { classifyUpload, CONVERTS_TO_PDF, extensionOf, FileKind, KIND_BY_EXT } from "./fileKinds";
import { extractText, MIN_USEFUL_CHARS } from "./extractText";
import { ConversionError, getConverter, pdfThumbnail } from "./preview/converter";

/**
 * Files as learning resources (LESSON_STUDIO plan §10): storing an upload, and the preview
 * pipeline that turns it into a PDF / thumbnail / text — cached by content hash so the same
 * file is only ever processed once, whoever uploaded it and wherever it is used.
 */

export const PREVIEW_JOB = "file.preview";
export const DOCUMENT_PREVIEW_JOB = "file.preview.document";

export type AssetRow = typeof FileAsset.$inferSelect;
export type Variant = "PDF" | "THUMB" | "TEXT";

const sha256File = (p: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });

const quotaBytes = () => (Number(process.env.ELEARNING_STORAGE_QUOTA_MB) || 5000) * 1024 * 1024;

/** What happens after upload, per kind. */
const previewPlan = (kind: FileKind): "FULL" | "TEXT_ONLY" | "NONE" =>
  CONVERTS_TO_PDF.has(kind) || kind === "pdf" ? "FULL" : kind === "text" || kind === "markdown" || kind === "code" || kind === "csv" ? "TEXT_ONLY" : "NONE";

/**
 * Validates and stores one upload, then queues its preview. `tmpPath` is multer's disk file;
 * it is removed whatever happens.
 */
export async function storeAsset(input: {
  tmpPath: string;
  originalName: string;
  size: number;
  ownerUserId: number;
  scope: "COURSE" | "RUN_REFERENCE" | "SUBJECT" | "SUBMISSION";
  courseId?: number | null;
  subjectId?: number | null;
}): Promise<AssetRow> {
  try {
    const verdict = await classifyUpload(input.originalName, input.tmpPath, input.size);
    if (!verdict.ok) throw new ValidationError(verdict.reason);
    const [{ used }] = await db
      .select({ used: sql<number>`COALESCE(SUM(${FileAsset.size_bytes}), 0)` })
      .from(FileAsset)
      .where(and(eq(FileAsset.owner_user_id, input.ownerUserId), isNull(FileAsset.deleted_at)));
    if (Number(used) + input.size > quotaBytes()) {
      throw new ValidationError(`Your file storage is full (${Math.round(quotaBytes() / 1024 / 1024)} MB). Remove files you no longer use and try again.`);
    }
    const sha = await sha256File(input.tmpPath);
    const plan = previewPlan(verdict.kind);
    const [ins] = (await db.insert(FileAsset).values({
      owner_user_id: input.ownerUserId,
      scope: input.scope,
      course_id: input.courseId ?? null,
      subject_id: input.subjectId ?? null,
      original_name: input.originalName.slice(0, 255),
      storage_path: "pending",
      mime_type: verdict.mime,
      extension: verdict.ext,
      kind: verdict.kind,
      size_bytes: input.size,
      sha256: sha,
      preview_status: plan === "NONE" ? "NOT_NEEDED" : "PENDING",
    })) as any;
    const assetId = ins.insertId as number;
    const storagePath = `elearning/assets/${assetId}/original.${verdict.ext}`;
    try {
      await storageService.uploadFile(input.tmpPath, storagePath);
    } catch (error) {
      await db.delete(FileAsset).where(eq(FileAsset.asset_id, assetId));
      throw error;
    }
    await db.update(FileAsset).set({ storage_path: storagePath }).where(eq(FileAsset.asset_id, assetId));
    if (plan !== "NONE") await enqueueJob(PREVIEW_JOB, { sha256: sha, storage_path: storagePath, ext: verdict.ext, kind: verdict.kind });
    const [row] = await db.select().from(FileAsset).where(eq(FileAsset.asset_id, assetId)).limit(1);
    return row;
  } finally {
    await fsp.rm(input.tmpPath, { force: true }).catch(() => undefined);
  }
}

export async function derivativesOf(sha: string): Promise<Partial<Record<Variant, typeof FileDerivative.$inferSelect>>> {
  const rows = await db.select().from(FileDerivative).where(eq(FileDerivative.sha256, sha));
  return Object.fromEntries(rows.map((r) => [r.variant, r]));
}

async function saveDerivative(sha: string, variant: Variant, localPath: string, ext: string, meta?: Record<string, unknown>) {
  const remote = `elearning/derivatives/${sha}/${variant.toLowerCase()}.${ext}`;
  await storageService.uploadFile(localPath, remote);
  const size = (await fsp.stat(localPath)).size;
  await db
    .insert(FileDerivative)
    .values({ sha256: sha, variant, storage_path: remote, size_bytes: size, meta: meta ?? null })
    .onDuplicateKeyUpdate({ set: { storage_path: remote, size_bytes: size, meta: meta ?? null } });
}

const setAssetsStatus = (sha: string, patch: Partial<typeof FileAsset.$inferInsert>) =>
  db.update(FileAsset).set(patch).where(eq(FileAsset.sha256, sha));

/**
 * The preview pipeline (§10.3), run by the job queue: cached → done; otherwise download the
 * original to a temp dir, convert office files to PDF, take a first-page thumbnail, extract
 * the text, store the derivatives, and mark every asset with this content as READY.
 */
export async function processPreview(p: { sha256: string; storage_path: string; ext: string; kind: FileKind }): Promise<void> {
  const plan = previewPlan(p.kind);
  const have = await derivativesOf(p.sha256);
  const done = plan === "TEXT_ONLY" ? !!have.TEXT : !!have.TEXT && (!!have.PDF || p.kind === "pdf");
  if (done) {
    await setAssetsStatus(p.sha256, { preview_status: "READY", preview_error: null, page_count: (have.PDF?.meta as any)?.pages ?? (have.TEXT?.meta as any)?.pages ?? null, text_chars: (have.TEXT?.meta as any)?.chars ?? null });
    return;
  }
  await setAssetsStatus(p.sha256, { preview_status: "PROCESSING" });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "nga-preview-"));
  try {
    const original = path.join(dir, `original.${p.ext}`);
    await storageService.downloadToFile(p.storage_path, original);
    let pdfPath: string | null = p.kind === "pdf" ? original : null;
    let previewError: string | null = null;
    let unsupported = false;

    if (CONVERTS_TO_PDF.has(p.kind)) {
      const converter = getConverter();
      if (!converter) unsupported = true;
      else if ((await fsp.stat(original)).size > 50 * 1024 * 1024) previewError = "This file is too large to convert for preview. Students can still download it.";
      else {
        try {
          pdfPath = await converter.convertToPdf(original, dir);
        } catch (error) {
          previewError = error instanceof ConversionError ? error.userMessage : "This file couldn't be converted for preview.";
          logger.warn("[files] conversion failed", { sha: p.sha256, error: (error as Error).message });
        }
      }
    }

    let pages: number | null = null;
    if (pdfPath && pdfPath !== original) {
      await saveDerivative(p.sha256, "PDF", pdfPath, "pdf");
    }
    if (pdfPath) {
      const thumb = await pdfThumbnail(pdfPath, dir).catch(() => null);
      if (thumb) await saveDerivative(p.sha256, "THUMB", thumb, "png");
    }

    const extracted = await extractText(original, p.kind, p.ext, pdfPath).catch((error) => {
      logger.warn("[files] text extraction failed", { sha: p.sha256, error: (error as Error).message });
      return { text: "", method: "none" as const, pages: undefined };
    });
    pages = extracted.pages ?? null;
    const textPath = path.join(dir, "text.txt");
    await fsp.writeFile(textPath, extracted.text, "utf8");
    await saveDerivative(p.sha256, "TEXT", textPath, "txt", { method: extracted.method, chars: extracted.text.length, pages, scanned: extracted.text.length < MIN_USEFUL_CHARS });
    if (pdfPath && pdfPath !== original) {
      await db.update(FileDerivative).set({ meta: { pages } }).where(and(eq(FileDerivative.sha256, p.sha256), eq(FileDerivative.variant, "PDF")));
    }

    await setAssetsStatus(p.sha256, {
      preview_status: previewError ? "FAILED" : unsupported ? "UNSUPPORTED" : "READY",
      preview_error: previewError,
      page_count: pages,
      text_chars: extracted.text.length,
    });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** A subject material joins the derivative cache: hash it once (download), then preview it. */
export async function processDocumentPreview(p: { document_id: number }): Promise<void> {
  const [doc] = await db.select().from(SubjectDocument).where(eq(SubjectDocument.document_id, p.document_id)).limit(1);
  if (!doc) return;
  const ext = extensionOf(doc.original_name || doc.file_name || "");
  const kind = KIND_BY_EXT[ext];
  if (!kind || previewPlan(kind) === "NONE") return;
  let sha = doc.sha256;
  if (!sha) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "nga-doc-"));
    try {
      const local = path.join(dir, `doc.${ext}`);
      await storageService.downloadToFile(doc.file_path, local);
      sha = await sha256File(local);
      await db.update(SubjectDocument).set({ sha256: sha }).where(eq(SubjectDocument.document_id, doc.document_id));
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  await processPreview({ sha256: sha!, storage_path: doc.file_path, ext, kind });
}

/** Queues a subject material for preview once (no duplicate jobs). */
export async function ensureDocumentPreviewQueued(documentId: number): Promise<void> {
  const [existing] = await db
    .select({ job_id: BackgroundJob.job_id })
    .from(BackgroundJob)
    .where(
      and(
        eq(BackgroundJob.kind, DOCUMENT_PREVIEW_JOB),
        inArray(BackgroundJob.status, ["QUEUED", "RUNNING", "SUCCEEDED"]),
        sql`JSON_EXTRACT(${BackgroundJob.payload}, '$.document_id') = ${documentId}`,
      ),
    )
    .limit(1);
  if (!existing) await enqueueJob(DOCUMENT_PREVIEW_JOB, { document_id: documentId });
}

async function readTextDerivative(sha: string | null): Promise<string | null> {
  if (!sha) return null;
  const [d] = await db.select().from(FileDerivative).where(and(eq(FileDerivative.sha256, sha), eq(FileDerivative.variant, "TEXT"))).limit(1);
  if (!d || ((d.meta as any)?.chars ?? 0) < MIN_USEFUL_CHARS) return null;
  try {
    return (await storageService.downloadToBuffer(d.storage_path)).toString("utf8");
  } catch {
    return null;
  }
}

let wired = false;
/** Registers the job handlers and the Week Context Pack's file-text source. Idempotent. */
export function wireFilesModule(): void {
  if (wired) return;
  wired = true;
  registerJobHandler(PREVIEW_JOB, processPreview as any);
  registerJobHandler(DOCUMENT_PREVIEW_JOB, processDocumentPreview as any);
  registerMaterialTextLoader(async ({ subjectId, competencyId, assetIds }) => {
    const out: { kind: "SUBJECT_DOCUMENT" | "COURSE_FILE"; id: number; title: string; text: string }[] = [];
    if (assetIds.length) {
      const assets = await db.select().from(FileAsset).where(and(inArray(FileAsset.asset_id, assetIds), isNull(FileAsset.deleted_at)));
      for (const a of assets) {
        const text = await readTextDerivative(a.sha256);
        if (text) out.push({ kind: "COURSE_FILE", id: a.asset_id, title: `File "${a.original_name}"`, text });
      }
    }
    if (competencyId) {
      const docs = await db
        .select()
        .from(SubjectDocument)
        .where(and(eq(SubjectDocument.subject_id, subjectId), eq(SubjectDocument.competency_id, competencyId)))
        .limit(6);
      for (const d of docs) {
        const text = await readTextDerivative(d.sha256);
        if (text) out.push({ kind: "SUBJECT_DOCUMENT", id: d.document_id, title: `Material "${d.original_name}"`, text });
        else await ensureDocumentPreviewQueued(d.document_id).catch(() => undefined); // ready for the next run
      }
    }
    return out;
  });
}
