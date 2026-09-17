// Lesson note images are streamed through an authenticated endpoint that only
// browsers' <img> tags can't attach an Authorization header to, so the URL carries
// the JWT as a query param instead (see api/lessonNotes.ts `lessonNoteImageUrl`).
// That token must never be baked into persisted content — it can expire or be
// rotated — so we always strip whatever's stored and re-attach a fresh one at
// render time, in both the editor (Tiptap JSON) and the read-only student view (HTML).
import { API_BASE_URL } from "../services/api";

const IMAGE_PATH = "/lesson-notes/images/";

const freshTokenUrl = (src: string): string => {
  if (!src.includes(IMAGE_PATH)) return src;
  const [base] = src.split("?");
  const token = localStorage.getItem("token");
  return `${base}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
};

export const attachImageTokenToJson = (node: any): any => {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(attachImageTokenToJson);

  const next: any = { ...node };
  if (next.type === "image" && next.attrs?.src) {
    next.attrs = { ...next.attrs, src: freshTokenUrl(next.attrs.src) };
  }
  if (Array.isArray(next.content)) {
    next.content = next.content.map(attachImageTokenToJson);
  }
  return next;
};

export const attachImageTokenToHtml = (html: string): string =>
  html.replace(
    new RegExp(`(${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${IMAGE_PATH.replace(/\//g, "\\/")}\\d+\\/raw)(\\?[^"'\\s]*)?`, "g"),
    (_match, base) => freshTokenUrl(base),
  );
