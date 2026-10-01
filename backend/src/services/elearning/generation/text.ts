import { createHash } from "crypto";

/**
 * HTML → plain text that keeps paragraph boundaries (block tags become blank lines, list
 * items become "- " lines), so text can still be split into meaningful chunks afterwards.
 */
export function htmlToPlainText(html: string): string {
  return (html || "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|table|ul|ol)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rough token count (≈ 4 characters per token), the same estimate the lesson-note AI uses. */
export const approxTokens = (text: string): number => Math.ceil((text || "").length / 4);

export const sha256 = (value: unknown): string =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

const STOP = new Set(
  "the a an and or of to in on for with by is are be as at from this that these those it its into using use used can will their they students student learner learners should must able".split(
    " ",
  ),
);

export function keywords(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Splits text into chunks of whole paragraphs, each at most ~maxChars long. */
export function chunkText(text: string, maxChars = 900): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (p.length > maxChars) {
      if (current) chunks.push(current);
      current = "";
      // A huge paragraph is cut at sentence boundaries.
      let rest = p;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(". ", maxChars);
        const at = cut > maxChars / 3 ? cut + 1 : maxChars;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) current = rest;
      continue;
    }
    if (current && current.length + p.length + 2 > maxChars) {
      chunks.push(current);
      current = p;
    } else current = current ? `${current}\n\n${p}` : p;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Keeps the chunks most relevant to `focus` (keyword overlap, BM25-lite, no vectors) that fit
 * in `budgetTokens`, returned in their original order so the text still reads naturally.
 */
export function selectRelevant(text: string, focus: Set<string>, budgetTokens: number): { text: string; truncated: boolean } {
  if (approxTokens(text) <= budgetTokens) return { text, truncated: false };
  const chunks = chunkText(text);
  const scored = chunks.map((c, index) => {
    const words = keywords(c);
    let hits = 0;
    for (const w of words) if (focus.has(w)) hits += 1;
    // Earlier chunks get a slight edge: introductions usually frame the topic.
    return { index, c, score: hits / Math.sqrt(words.size + 1) + (chunks.length - index) * 0.001 };
  });
  const chosen: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    const t = approxTokens(s.c);
    if (used + t > budgetTokens) continue;
    chosen.push(s);
    used += t;
  }
  chosen.sort((a, b) => a.index - b.index);
  return { text: chosen.map((s) => s.c).join("\n\n"), truncated: true };
}
