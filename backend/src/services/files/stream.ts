import type { Response } from "express";
import { NotFoundError } from "../../errors/CustomError";
import storageService from "../../utils/fileServer";
import { CONVERTS_TO_PDF, FileKind, KIND_BY_EXT, extensionOf, mimeFor } from "./fileKinds";
import { derivativesOf } from "./assets";

/**
 * One way to describe and stream any stored file — a FILE item's asset, a subject material, a
 * Documents file — in its original form or as a preview derivative (§10.4, §10.6).
 */

export type FileVariant = "original" | "pdf" | "thumb" | "text";

export interface PreviewManifest {
  name: string;
  ext: string;
  kind: FileKind | "other";
  size: number | null;
  preview_status: string;
  preview_error: string | null;
  page_count: number | null;
  variants: { pdf: boolean; thumb: boolean; text: boolean };
}

export interface StoredFile {
  name: string;
  storage_path: string;
  sha256: string | null;
  size?: number | null;
  preview_status?: string | null;
  preview_error?: string | null;
  page_count?: number | null;
}

export async function previewManifest(f: StoredFile): Promise<PreviewManifest> {
  const ext = extensionOf(f.name);
  const known: FileKind | undefined = KIND_BY_EXT[ext];
  const kind: FileKind | "other" = known ?? "other";
  const d = f.sha256 ? await derivativesOf(f.sha256) : {};
  const needsServerPreview = !!known && (CONVERTS_TO_PDF.has(known) || known === "pdf");
  const status = f.preview_status ?? (d.TEXT || d.PDF ? "READY" : needsServerPreview ? "PENDING" : "NOT_NEEDED");
  return {
    name: f.name,
    ext,
    kind,
    size: f.size ?? null,
    preview_status: status,
    preview_error: f.preview_error ?? null,
    page_count: f.page_count ?? ((d.PDF?.meta as any)?.pages ?? (d.TEXT?.meta as any)?.pages ?? null),
    variants: { pdf: kind === "pdf" || !!d.PDF, thumb: !!d.THUMB, text: !!d.TEXT },
  };
}

const safeName = (name: string) => name.replace(/[\r\n"]/g, "").slice(0, 150) || "file";

export async function streamStoredFile(res: Response, f: StoredFile, variant: FileVariant, opts: { range?: string; download?: boolean } = {}) {
  const ext = extensionOf(f.name);
  const kind = KIND_BY_EXT[ext];
  if (variant === "original" || (variant === "pdf" && kind === "pdf")) {
    return storageService.streamTo(res, f.storage_path, {
      range: opts.range,
      contentType: mimeFor(ext),
      filename: safeName(f.name),
      disposition: opts.download ? "attachment" : "inline",
      cacheSeconds: 3600,
    });
  }
  const d = f.sha256 ? await derivativesOf(f.sha256) : {};
  const row = variant === "pdf" ? d.PDF : variant === "thumb" ? d.THUMB : d.TEXT;
  if (!row) throw new NotFoundError("This preview isn't ready yet");
  const type = variant === "pdf" ? "application/pdf" : variant === "thumb" ? "image/png" : "text/plain; charset=utf-8";
  const base = safeName(f.name).replace(/\.[a-z0-9]+$/i, "");
  // Derivatives are immutable per content hash, so they can be cached for longer.
  return storageService.streamTo(res, row.storage_path, {
    range: opts.range,
    contentType: type,
    filename: variant === "pdf" ? `${base}.pdf` : variant === "thumb" ? `${base}.png` : `${base}.txt`,
    disposition: "inline",
    cacheSeconds: 86400,
  });
}

export const parseVariant = (v: unknown): FileVariant => (v === "pdf" || v === "thumb" || v === "text" ? v : "original");
