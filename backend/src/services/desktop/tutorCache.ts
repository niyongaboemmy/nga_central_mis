import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { ChatMessage } from "../aiProviders/chat";

/**
 * The tutor's answer cache (TOOLS_HUB plan §5.7.4): concept questions ("what is
 * photosynthesis?") aren't personal work, so their answers are kept 7 days per
 * normalised question and language and served without using a daily question.
 * Homework-shaped questions (numbers, equations, "solve", "my essay"…) never are.
 */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const missing = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

export const CACHE_DAYS = 7;

/** Lower case, accents and punctuation gone, single spaces. Pure. */
export const normalise = (q: string) =>
  q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const CONCEPT_START = /^(what (is|are|was|were|does)|what's|explain|define|describe|why (is|are|do|does)|how (does|do|is|are)|who (is|was)|qu ?est ?ce qu|c est quoi|explique|definis|pourquoi|comment (fonctionne|marche)|ni iki|ni ubuhe|sobanura|kuki)\b/;
const HOMEWORK = /\b(homework|assignment|exercise|exam|test|quiz|solve|calculate|compute|find the|work out|answer|essay|paragraph|write|my teacher|devoir|exercice|resou|calcule|redige|ecris|umukoro|imyitozo|kubara|bara|andika)\b/;

/** A first question about a concept, safe to share between students. Pure. */
export function isConceptQuestion(messages: ChatMessage[]): boolean {
  if (messages.length !== 1 || messages[0].role !== "user") return false;
  const raw = messages[0].content.trim();
  if (raw.length < 8 || raw.length > 160) return false;
  if (/[0-9=+×÷^√<>]|\s[-*/]\s/.test(raw)) return false;
  const q = normalise(raw);
  return CONCEPT_START.test(q) && !HOMEWORK.test(q);
}

/** French and Kinyarwanda questions get their own entries. Pure, rough. */
export function languageOf(q: string): "fr" | "rw" | "en" {
  const n = normalise(q);
  if (/\b(ni iki|ni ubuhe|sobanura|kuki|ubwoko|iki)\b/.test(n)) return "rw";
  if (/\b(qu est|c est|explique|pourquoi|comment|le|la|les|des|une|est)\b/.test(n)) return "fr";
  return "en";
}

export const cacheKey = (q: string) => createHash("sha1").update(`${languageOf(q)}:${normalise(q)}`).digest("hex");

export async function cached(question: string): Promise<{ reply: string; provider: string | null } | null> {
  try {
    const [r] = rows(await db.execute(sql`SELECT reply, provider FROM DesktopTutorCache WHERE cache_key = ${cacheKey(question)} AND expires_at > UTC_TIMESTAMP() LIMIT 1`));
    if (!r) return null;
    await db.execute(sql`UPDATE DesktopTutorCache SET hits = hits + 1 WHERE cache_key = ${cacheKey(question)}`);
    return { reply: String(r.reply), provider: r.provider ?? null };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function remember(question: string, reply: string, provider: string | null): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO DesktopTutorCache (cache_key, lang, question, reply, provider, hits, created_at, expires_at)
      VALUES (${cacheKey(question)}, ${languageOf(question)}, ${question.slice(0, 500)}, ${reply}, ${provider}, 0, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${CACHE_DAYS} DAY))
      ON DUPLICATE KEY UPDATE reply = VALUES(reply), provider = VALUES(provider), created_at = VALUES(created_at), expires_at = VALUES(expires_at)`);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}

export async function cacheStats(): Promise<{ entries: number; hits: number }> {
  try {
    const [r] = rows(await db.execute(sql`SELECT COUNT(*) AS n, COALESCE(SUM(hits), 0) AS h FROM DesktopTutorCache WHERE expires_at > UTC_TIMESTAMP()`));
    return { entries: Number(r?.n ?? 0), hits: Number(r?.h ?? 0) };
  } catch (e) {
    if (missing(e)) return { entries: 0, hits: 0 };
    throw e;
  }
}

/** Forget a cached answer (e.g. after a student reports it). */
export async function forget(question: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM DesktopTutorCache WHERE cache_key = ${cacheKey(question)}`);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}
