import { detectFileKind, extensionOf, FileKind } from "./fileKinds";

/**
 * Chooses how to show a file (§10.6), from what the server has ready and what the device can
 * afford. The server's PDF is the faithful preview for office files (converted once with
 * LibreOffice); the browser renderers are fallbacks while that is pending or unavailable.
 */

export interface PreviewManifest {
  name: string;
  ext?: string;
  kind?: string;
  size: number | null;
  preview_status: string; // PENDING | PROCESSING | READY | FAILED | UNSUPPORTED | NOT_NEEDED
  preview_error?: string | null;
  page_count?: number | null;
  variants: { pdf: boolean; thumb: boolean; text: boolean };
}

export type Strategy =
  | "pdf" // the original is a PDF
  | "pdf-derivative" // the server's PDF of an office file
  | "docx-client" // render .docx in the browser
  | "sheet-client" // read the spreadsheet in the browser
  | "slides-outline" // slide text (the server's TEXT) while no PDF exists
  | "image"
  | "audio"
  | "text"
  | "csv"
  | "download-only";

export interface Plan {
  strategy: Strategy;
  /** Fetch which stored variant. */
  variant: "original" | "pdf" | "text";
  /** The server is still preparing a better preview: poll the manifest and upgrade. */
  upgrading: boolean;
  /** Ask before downloading a big preview on a slow or data-saving connection. */
  needsConfirm: boolean;
  /** A short note shown under the preview (e.g. why only the text is shown). */
  note?: string;
}

export interface NetworkHints {
  saveData?: boolean;
  /** navigator.connection.effectiveType */
  effectiveType?: string;
}

const SLOW = new Set(["slow-2g", "2g"]);
const CONFIRM_BYTES = 5 * 1024 * 1024;

export function planPreview(m: PreviewManifest, net: NetworkHints = {}): Plan {
  const kind: FileKind = (m.kind as FileKind) || detectFileKind({ name: m.name });
  const ext = m.ext || extensionOf(m.name);
  const pending = m.preview_status === "PENDING" || m.preview_status === "PROCESSING";
  const slow = !!net.saveData || SLOW.has(net.effectiveType || "");
  const big = (m.size ?? 0) > CONFIRM_BYTES;
  const base = { upgrading: false, needsConfirm: slow && big };

  if (kind === "pdf") return { ...base, strategy: "pdf", variant: "original" };
  if (kind === "image") return { ...base, strategy: "image", variant: "original" };
  if (kind === "audio") return { ...base, strategy: "audio", variant: "original", needsConfirm: false };
  if (kind === "text" || kind === "code" || kind === "markdown") return { ...base, strategy: "text", variant: "original" };
  if (kind === "csv") return { ...base, strategy: "csv", variant: "original" };

  if (kind === "word" || kind === "slides" || kind === "sheet") {
    if (m.variants.pdf) return { ...base, strategy: "pdf-derivative", variant: "pdf" };
    const failedNote = m.preview_status === "FAILED" ? m.preview_error || "The full preview couldn't be made." : undefined;
    if (ext === "docx") return { ...base, strategy: "docx-client", variant: "original", upgrading: pending, note: failedNote };
    if (kind === "sheet" && ext !== "ods") return { ...base, strategy: "sheet-client", variant: "original", upgrading: pending, note: failedNote };
    if (kind === "slides" && m.variants.text) {
      return { ...base, strategy: "slides-outline", variant: "text", upgrading: pending, needsConfirm: false, note: pending ? "Showing the slide text while the full preview is prepared." : failedNote ?? "Showing the slide text — download the file to see the slides." };
    }
    return { ...base, strategy: "download-only", variant: "original", upgrading: pending, needsConfirm: false, note: pending ? "Preparing a preview…" : failedNote };
  }
  return { ...base, strategy: "download-only", variant: "original", needsConfirm: false };
}

/** Reads navigator.connection where the browser has it (Chrome/Android). */
export function networkHints(): NetworkHints {
  const c = typeof navigator !== "undefined" ? (navigator as any).connection : null;
  return c ? { saveData: !!c.saveData, effectiveType: c.effectiveType } : {};
}
