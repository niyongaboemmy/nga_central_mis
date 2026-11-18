import { fail, LINK_KINDS, LinkKind, limits } from "./core";

/** Input checks with field-level errors (the forms highlight `field`). */

export const GITHUB_RE = /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}\/?$/;

export function text(v: unknown, field: string, opts: { min?: number; max: number; required?: boolean; label: string }): string | null {
  const s = String(v ?? "").trim().replace(/\r\n/g, "\n");
  if (!s) {
    if (opts.required) fail(400, "VALIDATION", `${opts.label} is required`, field);
    return null;
  }
  if (opts.min && s.length < opts.min) fail(400, "VALIDATION", `${opts.label}: at least ${opts.min} characters`, field);
  if (s.length > opts.max) fail(400, "VALIDATION", `${opts.label}: at most ${opts.max} characters`, field);
  return s;
}

export function githubUrl(v: unknown): string | null {
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/\/+$/, "").replace(/\.git$/i, "");
  if (/^github\.com\//i.test(s)) s = `https://${s}`;
  if (!GITHUB_RE.test(s)) fail(400, "VALIDATION", "Use a GitHub repository link: https://github.com/owner/repo", "githubUrl");
  return s;
}

export function httpsUrl(v: unknown, field: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > 500) fail(400, "VALIDATION", "That link is too long", field);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(400, "VALIDATION", "That isn't a valid link", field);
  }
  if (u.protocol !== "https:") fail(400, "VALIDATION", "Links must start with https://", field);
  if (!u.hostname.includes(".") || u.username || u.password) fail(400, "VALIDATION", "That isn't a valid public link", field);
  return u.toString();
}

export function date(v: unknown, field: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(400, "VALIDATION", "Use a valid date", field);
  return s;
}

export function tags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" && v.trim().startsWith("[") ? safeJson(v) : String(v ?? "").split(",");
  const out: string[] = [];
  for (const t of arr as unknown[]) {
    const s = String(t ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  if (out.length > limits().maxTags) fail(400, "VALIDATION", `At most ${limits().maxTags} technologies`, "techTags");
  return out;
}

export function links(v: unknown): Array<{ kind: LinkKind; label: string; url: string }> {
  const arr = Array.isArray(v) ? v : typeof v === "string" && v ? safeJson(v) : [];
  if (!Array.isArray(arr)) fail(400, "VALIDATION", "Links are invalid", "links");
  if (arr.length > limits().maxLinks) fail(400, "VALIDATION", `At most ${limits().maxLinks} links`, "links");
  return arr.map((l: any, i: number) => {
    const kind = (LINK_KINDS as readonly string[]).includes(l?.kind) ? (l.kind as LinkKind) : "OTHER";
    const url = httpsUrl(l?.url, `links.${i}.url`);
    if (!url) fail(400, "VALIDATION", "Each link needs an address", `links.${i}.url`);
    const label = String(l?.label ?? "").trim().slice(0, 80) || kind.charAt(0) + kind.slice(1).toLowerCase();
    return { kind, label, url: url as string };
  });
}

export function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return fail(400, "VALIDATION", "Malformed data");
  }
}

export function intIn(v: unknown, field: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, "VALIDATION", `Must be between ${min} and ${max}`, field);
  return n;
}
