import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import sharp from "sharp";
import { db } from "../../db";
import storageService from "../../utils/fileServer";
import logger from "../../utils/logger";
import { storeAsset, AssetRow } from "../files/assets";
import { classifyUpload } from "../files/fileKinds";
import { parseVariant, previewManifest, streamStoredFile } from "../files/stream";
import { DocType, DOC_FILE_KINDS, fail, insertId, iso, limits, many, one, recordEvent } from "./core";

/**
 * Project files (plan §3.4-§3.5): documents (concept / SRS / plan, versioned) and the media
 * gallery. Everything goes through storeAsset (classifier, blocked types, per-owner quota,
 * dedupe, previews) with scope PROJECT; a project also has its own count and size budget.
 * Images get a 640 px PNG thumbnail at upload so boards and galleries stay light.
 */

export interface Upload {
  path: string;
  originalname: string;
  size: number;
}

async function usage(projectId: number): Promise<{ files: number; bytes: number }> {
  const r = await one(sql`
    SELECT COUNT(*) AS files, COALESCE(SUM(a.size_bytes), 0) AS bytes FROM (
      SELECT asset_id FROM SideProjectDocument WHERE project_id = ${projectId}
      UNION
      SELECT asset_id FROM SideProjectMedia WHERE project_id = ${projectId} AND deleted_at IS NULL
    ) x JOIN FileAsset a ON a.asset_id = x.asset_id AND a.deleted_at IS NULL`);
  return { files: Number(r?.files ?? 0), bytes: Number(r?.bytes ?? 0) };
}

const cleanup = (files: Upload[]) => Promise.all(files.map((f) => fsp.rm(f.path, { force: true }).catch(() => undefined)));

/** Stores uploads for a project after the budget check. Removes every temp file whatever happens. */
export async function storeProjectFiles(projectId: number | null, uploaderId: number, files: Upload[], allowedKinds?: string[]): Promise<AssetRow[]> {
  try {
    if (!files.length) fail(400, "VALIDATION", "Choose a file", "file");
    for (const f of files) {
      const verdict = await classifyUpload(f.originalname, f.path, f.size);
      if (!verdict.ok) fail(400, "FILE_REFUSED", `${f.originalname}: ${verdict.reason}`, "file");
      if (allowedKinds && verdict.ok && !allowedKinds.includes(verdict.kind)) {
        fail(400, "FILE_REFUSED", `${f.originalname}: upload a PDF, Word or Markdown document`, "file");
      }
    }
    if (projectId) {
      const u = await usage(projectId);
      const lim = limits();
      const adding = files.reduce((s, f) => s + f.size, 0);
      if (u.files + files.length > lim.maxFiles) fail(400, "PROJECT_FULL", `A project holds at most ${lim.maxFiles} files`, "file");
      if (u.bytes + adding > lim.maxBytes) fail(400, "PROJECT_FULL", `A project holds at most ${Math.round(lim.maxBytes / 1048576)} MB`, "file");
    }
    const out: AssetRow[] = [];
    for (const f of files) {
      const a = await storeAsset({ tmpPath: f.path, originalName: f.originalname, size: f.size, ownerUserId: uploaderId, scope: "PROJECT" });
      out.push(a);
    }
    return out;
  } finally {
    await cleanup(files);
  }
}

/** Thumbnail for an image asset (best effort, cached by content hash). */
export async function ensureImageThumb(a: AssetRow, localCopy?: Buffer): Promise<void> {
  if (a.kind !== "image" || a.extension === "svg") return;
  try {
    const have = await one(sql`SELECT 1 AS x FROM FileDerivative WHERE sha256 = ${a.sha256} AND variant = 'THUMB'`);
    if (have) return;
    const buf = localCopy ?? (await storageService.downloadToBuffer(a.storage_path));
    const png = await sharp(buf, { animated: false }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 8 }).toBuffer();
    const tmp = path.join(os.tmpdir(), `sp-thumb-${a.asset_id}-${Date.now()}.png`);
    await fsp.writeFile(tmp, png);
    const remote = `elearning/derivatives/${a.sha256}/thumb.png`;
    try {
      await storageService.uploadFile(tmp, remote);
    } finally {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
    }
    await db.execute(sql`
      INSERT INTO FileDerivative (sha256, variant, storage_path, size_bytes, meta)
      VALUES (${a.sha256}, 'THUMB', ${remote}, ${png.length}, NULL)
      ON DUPLICATE KEY UPDATE storage_path = VALUES(storage_path), size_bytes = VALUES(size_bytes)`);
  } catch (error) {
    logger.warn("[side-projects] thumbnail failed", { error, assetId: a.asset_id });
  }
}

/** Adds a new version of a document; the previous one stays downloadable. */
export async function addDocument(projectId: number, type: DocType, asset: AssetRow, by: number, source: "UPLOAD" | "WRITTEN" = "UPLOAD") {
  const v = await one(sql`SELECT COALESCE(MAX(version), 0) AS v FROM SideProjectDocument WHERE project_id = ${projectId} AND doc_type = ${type}`);
  const version = Number(v?.v ?? 0) + 1;
  await db.execute(sql`UPDATE SideProjectDocument SET is_current = 0 WHERE project_id = ${projectId} AND doc_type = ${type}`);
  await db.execute(sql`
    INSERT INTO SideProjectDocument (project_id, doc_type, version, asset_id, is_current, source, uploaded_by, created_at)
    VALUES (${projectId}, ${type}, ${version}, ${asset.asset_id}, 1, ${source}, ${by}, UTC_TIMESTAMP())`);
  if (type === "CONCEPT") await db.execute(sql`UPDATE SideProject SET concept_pending = 0 WHERE project_id = ${projectId}`);
  await recordEvent(projectId, by, "DOC", type, String(version), asset.original_name);
  return version;
}

export const docKindsFor = (type: DocType) => DOC_FILE_KINDS[type];

/** "Write it here": the concept form becomes a Markdown document. */
export async function writtenConceptFile(title: string, c: { problem: string; users: string; solution: string; impact: string }): Promise<Upload> {
  const body = [
    `# ${title}`,
    "",
    "## Problem",
    c.problem,
    "",
    "## Who it helps",
    c.users,
    "",
    "## Proposed solution",
    c.solution,
    "",
    "## Expected impact",
    c.impact,
    "",
  ].join("\n");
  const p = path.join(os.tmpdir(), `sp-concept-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  await fsp.writeFile(p, body, "utf8");
  const safe = title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 60) || "concept";
  return { path: p, originalname: `${safe} - concept.md`, size: Buffer.byteLength(body) };
}

export async function documentsOf(projectId: number) {
  const docs = await many(sql`
    SELECT d.document_id AS id, d.doc_type AS type, d.version, d.is_current AS isCurrent, d.source,
           d.asset_id AS assetId, a.original_name AS name, a.extension AS ext, a.kind, a.size_bytes AS size,
           a.preview_status AS previewStatus, ${iso("d.created_at")} AS createdAt,
           TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS uploadedBy
    FROM SideProjectDocument d
    JOIN FileAsset a ON a.asset_id = d.asset_id
    LEFT JOIN UserProfile p ON p.user_id = d.uploaded_by
    WHERE d.project_id = ${projectId}
    ORDER BY d.doc_type, d.version DESC`);
  const out: Record<string, { current: any | null; versions: any[] }> = {
    CONCEPT: { current: null, versions: [] },
    SRS: { current: null, versions: [] },
    IMPLEMENTATION_PLAN: { current: null, versions: [] },
  };
  for (const d of docs) {
    const row = { ...d, isCurrent: Number(d.isCurrent) === 1, size: Number(d.size), version: Number(d.version) };
    out[d.type].versions.push(row);
    if (row.isCurrent) out[d.type].current = row;
  }
  return out;
}

export async function mediaOf(projectId: number) {
  const r = await many(sql`
    SELECT m.media_id AS id, m.asset_id AS assetId, m.caption, m.sort, a.original_name AS name, a.extension AS ext,
           a.kind, a.size_bytes AS size, ${iso("m.created_at")} AS createdAt,
           EXISTS(SELECT 1 FROM FileDerivative fd WHERE fd.sha256 = a.sha256 AND fd.variant = 'THUMB') AS hasThumb
    FROM SideProjectMedia m JOIN FileAsset a ON a.asset_id = m.asset_id
    WHERE m.project_id = ${projectId} AND m.deleted_at IS NULL
    ORDER BY m.sort, m.media_id`);
  return r.map((m) => ({ ...m, size: Number(m.size), hasThumb: Number(m.hasThumb) === 1 }));
}

export async function addMedia(projectId: number, assets: AssetRow[], by: number, captions: string[] = []) {
  const s = await one(sql`SELECT COALESCE(MAX(sort), 0) AS s FROM SideProjectMedia WHERE project_id = ${projectId}`);
  let sort = Number(s?.s ?? 0);
  const ids: number[] = [];
  for (const [i, a] of assets.entries()) {
    sort += 1;
    const caption = String(captions[i] ?? "").trim().slice(0, 200) || null;
    const r = await db.execute(sql`
      INSERT INTO SideProjectMedia (project_id, asset_id, caption, sort, created_by, created_at)
      VALUES (${projectId}, ${a.asset_id}, ${caption}, ${sort}, ${by}, UTC_TIMESTAMP())`);
    ids.push(insertId(r));
    await ensureImageThumb(a);
  }
  // The first image becomes the cover when there is none yet.
  const firstImage = assets.find((a) => a.kind === "image");
  if (firstImage) {
    await db.execute(sql`UPDATE SideProject SET cover_asset_id = ${firstImage.asset_id} WHERE project_id = ${projectId} AND cover_asset_id IS NULL`);
  }
  await recordEvent(projectId, by, "MEDIA", null, String(assets.length), assets.map((a) => a.original_name).join(", "));
  return ids;
}

export async function updateMedia(projectId: number, mediaId: number, patch: { caption?: unknown; cover?: unknown }) {
  const m = await one(sql`
    SELECT m.media_id, m.asset_id, a.kind FROM SideProjectMedia m JOIN FileAsset a ON a.asset_id = m.asset_id
    WHERE m.media_id = ${mediaId} AND m.project_id = ${projectId} AND m.deleted_at IS NULL`);
  if (!m) fail(404, "NOT_FOUND", "File not found");
  if (patch.caption !== undefined) {
    const caption = String(patch.caption ?? "").trim().slice(0, 200) || null;
    await db.execute(sql`UPDATE SideProjectMedia SET caption = ${caption} WHERE media_id = ${mediaId}`);
  }
  if (patch.cover === true) {
    if (m.kind !== "image") fail(400, "VALIDATION", "Only an image can be the cover", "cover");
    await db.execute(sql`UPDATE SideProject SET cover_asset_id = ${m.asset_id} WHERE project_id = ${projectId}`);
  }
}

export async function reorderMedia(projectId: number, ids: number[]) {
  for (const [i, id] of ids.entries()) {
    await db.execute(sql`UPDATE SideProjectMedia SET sort = ${i + 1} WHERE media_id = ${Number(id)} AND project_id = ${projectId}`);
  }
}

export async function removeMedia(projectId: number, mediaId: number, by: number) {
  const m = await one(sql`SELECT asset_id FROM SideProjectMedia WHERE media_id = ${mediaId} AND project_id = ${projectId} AND deleted_at IS NULL`);
  if (!m) fail(404, "NOT_FOUND", "File not found");
  await db.execute(sql`UPDATE SideProjectMedia SET deleted_at = UTC_TIMESTAMP() WHERE media_id = ${mediaId}`);
  await db.execute(sql`UPDATE FileAsset SET deleted_at = UTC_TIMESTAMP() WHERE asset_id = ${m.asset_id}`);
  // Next image (if any) becomes the cover.
  await db.execute(sql`
    UPDATE SideProject sp SET cover_asset_id = (
      SELECT x.asset_id FROM (
        SELECT mm.asset_id FROM SideProjectMedia mm JOIN FileAsset a ON a.asset_id = mm.asset_id
        WHERE mm.project_id = ${projectId} AND mm.deleted_at IS NULL AND a.kind = 'image' ORDER BY mm.sort LIMIT 1
      ) x)
    WHERE sp.project_id = ${projectId} AND sp.cover_asset_id = ${m.asset_id}`);
  await recordEvent(projectId, by, "MEDIA_REMOVED", null, null, null);
}

/** Every asset of a project (documents of any version + live media). */
export async function assetOfProject(projectId: number, assetId: number) {
  return one(sql`
    SELECT a.* FROM FileAsset a
    WHERE a.asset_id = ${assetId} AND a.deleted_at IS NULL AND a.scope = 'PROJECT' AND (
      EXISTS (SELECT 1 FROM SideProjectDocument d WHERE d.project_id = ${projectId} AND d.asset_id = a.asset_id)
      OR EXISTS (SELECT 1 FROM SideProjectMedia m WHERE m.project_id = ${projectId} AND m.asset_id = a.asset_id AND m.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM SideProjectUpdateFile uf JOIN SideProjectUpdate u ON u.update_id = uf.update_id WHERE u.project_id = ${projectId} AND uf.asset_id = a.asset_id)
      OR EXISTS (SELECT 1 FROM SideProject sl WHERE sl.project_id = ${projectId} AND sl.logo_asset_id = a.asset_id)
    )`);
}

/** Which project an asset belongs to (for the file stream). */
export async function projectOfAsset(assetId: number): Promise<number | null> {
  const r = await one(sql`
    SELECT project_id FROM SideProjectDocument WHERE asset_id = ${assetId}
    UNION SELECT project_id FROM SideProjectMedia WHERE asset_id = ${assetId} AND deleted_at IS NULL
    UNION SELECT u.project_id FROM SideProjectUpdateFile uf JOIN SideProjectUpdate u ON u.update_id = uf.update_id WHERE uf.asset_id = ${assetId}
    UNION SELECT project_id FROM SideProject WHERE logo_asset_id = ${assetId}
    LIMIT 1`);
  return r ? Number(r.project_id) : null;
}

export async function streamAsset(res: Response, a: any, variantRaw: unknown, opts: { range?: string; download?: boolean }) {
  const variant = parseVariant(variantRaw);
  const f = { name: a.original_name, storage_path: a.storage_path, sha256: a.sha256, size: a.size_bytes, preview_status: a.preview_status };
  if (variant === "thumb" && a.kind === "image" && a.extension === "svg") {
    return streamStoredFile(res, f, "original", opts);
  }
  return streamStoredFile(res, f, variant, opts);
}

export async function manifestOf(a: any) {
  return previewManifest({ name: a.original_name, storage_path: a.storage_path, sha256: a.sha256, size: a.size_bytes, preview_status: a.preview_status, preview_error: a.preview_error, page_count: a.page_count });
}

/**
 * Project branding (migration 133): an optional logo and cover image (PNG/JPG/WebP; no SVG).
 * The cover joins the gallery and becomes its cover; the logo is the project's own mark.
 */
export async function setBranding(projectId: number, by: number, which: "cover" | "logo", file: Upload | null | undefined) {
  if (!file) fail(400, "VALIDATION", "Choose an image", "file");
  if (/\.svg$/i.test(file!.originalname)) {
    await cleanup([file!]);
    fail(400, "FILE_REFUSED", "Use a PNG, JPG or WebP image", "file");
  }
  const [asset] = await storeProjectFiles(projectId, by, [file!], ["image"]);
  await ensureImageThumb(asset);
  if (which === "cover") {
    await addMedia(projectId, [asset], by, ["Cover"]);
    await db.execute(sql`UPDATE SideProject SET cover_asset_id = ${asset.asset_id}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
  } else {
    const old = await one(sql`SELECT logo_asset_id FROM SideProject WHERE project_id = ${projectId}`);
    await db.execute(sql`UPDATE SideProject SET logo_asset_id = ${asset.asset_id}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
    if (old?.logo_asset_id) await db.execute(sql`UPDATE FileAsset SET deleted_at = UTC_TIMESTAMP() WHERE asset_id = ${old.logo_asset_id}`);
  }
  await recordEvent(projectId, by, which === "cover" ? "COVER" : "LOGO", null, String(asset.asset_id));
  return { assetId: Number(asset.asset_id) };
}

export async function clearBranding(projectId: number, by: number, which: "cover" | "logo") {
  if (which === "cover") {
    await db.execute(sql`UPDATE SideProject SET cover_asset_id = NULL, updated_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
  } else {
    const old = await one(sql`SELECT logo_asset_id FROM SideProject WHERE project_id = ${projectId}`);
    await db.execute(sql`UPDATE SideProject SET logo_asset_id = NULL, updated_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
    if (old?.logo_asset_id) await db.execute(sql`UPDATE FileAsset SET deleted_at = UTC_TIMESTAMP() WHERE asset_id = ${old.logo_asset_id}`);
  }
  await recordEvent(projectId, by, which === "cover" ? "COVER" : "LOGO", "removed", null);
}
