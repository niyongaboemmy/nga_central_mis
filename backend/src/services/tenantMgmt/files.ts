/**
 * Platform files (plan §10): school documents and payment proofs live under
 * `platform/…` in the primary tenant's storage, never in a school's tree.
 * Served only through routes that already checked who may read them.
 */
import crypto from "crypto";
import type { Response } from "express";
import storageService from "../../utils/fileServer";
import { PRIMARY_TENANT_ID, primaryTenantCtx, runWithTenant } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";

export const PLATFORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const PLATFORM_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

async function inPrimary<T>(fn: () => Promise<T>): Promise<T> {
  const primary = (await getTenant(PRIMARY_TENANT_ID).catch(() => null)) ?? primaryTenantCtx();
  return runWithTenant(primary, fn);
}

const safeName = (name: string) =>
  (name || "file")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);

/** Store `buffer` under platform/<folder>/<random>-<name>; returns the stored path. */
export async function storePlatformFile(folder: string, buffer: Buffer, originalName: string): Promise<string> {
  const path = `platform/${folder.replace(/^\/+|\/+$/g, "")}/${crypto.randomBytes(6).toString("hex")}-${safeName(originalName)}`;
  await inPrimary(() => storageService.uploadFile(buffer, path));
  return path;
}

export async function streamPlatformFile(res: Response, path: string, opts: { filename?: string; contentType?: string } = {}): Promise<void> {
  if (!path.startsWith("platform/")) throw new Error("not a platform file");
  await inPrimary(() => storageService.streamTo(res, path, { disposition: "inline", ...opts }));
}

export async function readPlatformFile(path: string): Promise<Buffer> {
  if (!path.startsWith("platform/")) throw new Error("not a platform file");
  return inPrimary(() => storageService.downloadToBuffer(path));
}

export async function deletePlatformFile(path: string): Promise<void> {
  if (!path.startsWith("platform/")) return;
  await inPrimary(() => storageService.deleteFile(path)).catch(() => undefined);
}

/** Multer-style file check shared by every upload route. */
export function checkUpload(file: { mimetype?: string; size?: number } | undefined, required = true): string | null {
  if (!file) return required ? "A file is required." : null;
  if (file.size !== undefined && file.size > PLATFORM_UPLOAD_MAX_BYTES) return "Files must be 10 MB or smaller.";
  if (!PLATFORM_UPLOAD_TYPES.includes(String(file.mimetype))) return "Use a PDF, PNG, JPEG or WebP file.";
  return null;
}
