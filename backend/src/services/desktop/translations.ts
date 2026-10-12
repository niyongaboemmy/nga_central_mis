import { sql } from "drizzle-orm";
import { db } from "../../db";
import { streamChat } from "../aiProviders/chat";

/**
 * NGA Desktop tools: translation workspace (nga-desktop TOOLS_HUB plan §6.3.1).
 * The desktop holds the English source and the bundled French/Kinyarwanda texts;
 * MIS keeps people's edits and the published releases. A desktop applies the latest
 * release's strings over its bundled ones — only while the English text they
 * translate is unchanged (source hash), so a stale translation never shows.
 */

export const TR_LANGS = ["fr", "rw"] as const;
export type TrLang = (typeof TR_LANGS)[number];
export type TrStatus = "draft" | "ai_draft" | "approved";

export class TrError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const iso = (col: string) => sql.raw(`DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`);
const missing = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

export const isLang = (v: unknown): v is TrLang => typeof v === "string" && (TR_LANGS as readonly string[]).includes(v);
export const validKey = (k: unknown): k is string => typeof k === "string" && /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(k);

/** FNV-1a 32-bit as 8 hex chars — the same function as nga-desktop src/tools/i18n/overrides.ts. */
export function sourceHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The {placeholders} of a string, sorted (a translation must keep exactly the same ones). */
export const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

export interface Entry {
  text: string;
  status: TrStatus;
  sourceHash: string;
  updatedBy: string;
  updatedAt: string;
  approvedBy: string | null;
}

export async function listEntries(lang: TrLang): Promise<Record<string, Entry>> {
  try {
    const r = rows(await db.execute(sql`
      SELECT t.string_key AS k, t.text, t.status, t.source_hash AS h, ${iso("t.updated_at")} AS updatedAt,
             TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS updatedBy,
             NULLIF(TRIM(CONCAT(COALESCE(a.first_name, ''), ' ', COALESCE(a.last_name, ''))), '') AS approvedBy
      FROM DesktopToolTranslation t
      LEFT JOIN UserProfile u ON u.user_id = t.updated_by
      LEFT JOIN UserProfile a ON a.user_id = t.approved_by
      WHERE t.lang = ${lang}`));
    return Object.fromEntries(r.map((x: any) => [x.k, { text: String(x.text), status: x.status, sourceHash: x.h, updatedBy: String(x.updatedBy || ""), updatedAt: x.updatedAt, approvedBy: x.approvedBy ?? null }]));
  } catch (e) {
    if (missing(e)) return {};
    throw e;
  }
}

/** Save one string (draft, AI draft or approved). The English text comes from the desktop; checks placeholders. */
export async function saveEdit(actorId: number, input: { lang?: unknown; key?: unknown; en?: unknown; text?: unknown; status?: unknown }): Promise<Entry & { key: string }> {
  const { lang, key, en } = input;
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const status: TrStatus = input.status === "approved" ? "approved" : input.status === "ai_draft" ? "ai_draft" : "draft";
  if (!isLang(lang) || !validKey(key) || typeof en !== "string" || !en) throw new TrError("Bad request.", 400, "BAD_INPUT");
  if (!text) throw new TrError("The translation is empty.", 400, "EMPTY");
  if (text.length > 2000) throw new TrError("That translation is too long.", 400, "TOO_LONG");
  if (placeholders(text) !== placeholders(en)) throw new TrError(`Keep exactly these placeholders: ${placeholders(en) || "(none)"}.`, 400, "PLACEHOLDERS");
  const h = sourceHash(en);
  const approved = status === "approved";
  await db.execute(sql`
    INSERT INTO DesktopToolTranslation (lang, string_key, text, status, source_hash, updated_by, updated_at, approved_by, approved_at)
    VALUES (${lang}, ${key}, ${text}, ${status}, ${h}, ${actorId}, UTC_TIMESTAMP(), ${approved ? actorId : null}, ${approved ? sql`UTC_TIMESTAMP()` : null})
    ON DUPLICATE KEY UPDATE text = VALUES(text), status = VALUES(status), source_hash = VALUES(source_hash),
      updated_by = VALUES(updated_by), updated_at = VALUES(updated_at), approved_by = VALUES(approved_by), approved_at = VALUES(approved_at)`);
  return { key, ...(await listEntries(lang))[key] };
}

/** Forget an edit (back to the app's bundled text). */
export async function revert(lang: TrLang, key: string): Promise<boolean> {
  const res: any = await db.execute(sql`DELETE FROM DesktopToolTranslation WHERE lang = ${lang} AND string_key = ${key}`);
  return Number((Array.isArray(res) ? res[0] : res)?.affectedRows) > 0;
}

type Snapshot = Record<string, { t: string; h: string }>;

/** Publish: a numbered release of every approved string of one language. */
export async function publish(actorId: number, lang: TrLang, note?: string): Promise<{ id: number; count: number }> {
  const r = rows(await db.execute(sql`SELECT string_key AS k, text, source_hash AS h FROM DesktopToolTranslation WHERE lang = ${lang} AND status = 'approved'`));
  const snap: Snapshot = Object.fromEntries(r.map((x: any) => [x.k, { t: String(x.text), h: x.h }]));
  return insertRelease(actorId, lang, snap, note?.slice(0, 200) || null);
}

async function insertRelease(actorId: number, lang: TrLang, snap: Snapshot, note: string | null) {
  const count = Object.keys(snap).length;
  const res: any = await db.execute(sql`
    INSERT INTO DesktopToolTranslationRelease (lang, strings, count, note, published_by)
    VALUES (${lang}, ${JSON.stringify(snap)}, ${count}, ${note}, ${actorId})`);
  return { id: Number((Array.isArray(res) ? res[0] : res)?.insertId), count };
}

/** Roll back: publish an earlier release's strings again, as a new release. */
export async function rollback(actorId: number, lang: TrLang, releaseId: number): Promise<{ id: number; count: number }> {
  const [r] = rows(await db.execute(sql`SELECT strings FROM DesktopToolTranslationRelease WHERE id = ${releaseId} AND lang = ${lang}`));
  if (!r) throw new TrError("That release doesn't exist.", 404, "NOT_FOUND");
  return insertRelease(actorId, lang, JSON.parse(r.strings), `Back to release #${releaseId}`);
}

export async function releases(lang: TrLang) {
  try {
    const r = rows(await db.execute(sql`
      SELECT rl.id, rl.count, rl.note, ${iso("rl.published_at")} AS publishedAt,
             TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS publishedBy
      FROM DesktopToolTranslationRelease rl LEFT JOIN UserProfile u ON u.user_id = rl.published_by
      WHERE rl.lang = ${lang} ORDER BY rl.id DESC LIMIT 30`));
    return r.map((x: any) => ({ id: Number(x.id), count: Number(x.count), note: x.note ?? null, publishedAt: x.publishedAt, publishedBy: String(x.publishedBy || "") }));
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

/** What every desktop fetches: the latest release (or "unchanged" when it already has it). */
export async function latest(lang: TrLang, since: number): Promise<{ release: number; strings?: Snapshot; unchanged?: true }> {
  try {
    const [r] = rows(await db.execute(sql`SELECT id, strings FROM DesktopToolTranslationRelease WHERE lang = ${lang} ORDER BY id DESC LIMIT 1`));
    if (!r) return { release: 0, strings: {} };
    if (Number(r.id) === since) return { release: since, unchanged: true };
    return { release: Number(r.id), strings: JSON.parse(r.strings) };
  } catch (e) {
    if (missing(e)) return { release: 0, strings: {} };
    throw e;
  }
}

const LANG_NAME: Record<TrLang, string> = { fr: "French", rw: "Kinyarwanda" };

/** "Suggest with AI": a draft translation for one string (never published until a person approves it). */
export async function suggest(actorId: number, input: { lang?: unknown; en?: unknown; key?: unknown; glossary?: unknown }): Promise<string> {
  const { lang, en, key } = input;
  if (!isLang(lang) || typeof en !== "string" || !en || en.length > 2000) throw new TrError("Bad request.", 400, "BAD_INPUT");
  const glossary = Array.isArray(input.glossary) ? input.glossary.filter((g): g is string => typeof g === "string").slice(0, 30).join("; ") : "";
  let text = "";
  await streamChat({
    system:
      `You translate the interface of NGA Desktop, an app for a secondary school in Rwanda (students aged 12–19, teachers, staff), from English into ${LANG_NAME[lang]}. ` +
      "Reply with the translation only: no quotes, no notes, no alternatives. Keep every {placeholder} exactly as written. " +
      "Keep it short, clear and natural for school use; keep the tone of the English (buttons stay short). " +
      (lang === "rw" ? "Use standard Kinyarwanda as written in Rwandan schools. " : "Use the French used in Rwandan schools. ") +
      (glossary ? `Use these fixed terms: ${glossary}.` : ""),
    messages: [{ role: "user", content: `${typeof key === "string" ? `Key: ${key}\n` : ""}English: ${en}` }],
    audience: "adult",
    actorUserId: actorId,
    feature: "desktop-translate",
    onText: (t) => (text += t),
  });
  text = text.trim().replace(/^["“«]\s*|\s*["”»]$/g, "");
  if (placeholders(text) !== placeholders(en)) throw new TrError("The suggestion changed the placeholders; please translate this one by hand.", 422, "AI_PLACEHOLDERS");
  return text;
}
