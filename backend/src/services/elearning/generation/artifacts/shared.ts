import type { Blueprint } from "../blueprint";
import type { WeekContextPack } from "../contextPack";

export const escapeHtml = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Escape a short model-written string (a heading, summary, key term, step) but keep the
 *  bare inline tags the model is told it may use — <code>, <strong>, <em>, <b>, <i> with
 *  no attributes. Plain escapeHtml showed students a literal "<code>let</code>" in the
 *  heading, the contents list and the summary. Only balanced, attribute-free pairs are
 *  restored, so nothing else the model writes can become markup. */
export const inlineHtml = (s: string): string =>
  escapeHtml(s).replace(
    /&lt;(code|strong|em|b|i)&gt;([\s\S]*?)&lt;\/\1&gt;/g,
    (_m, tag: string, inner: string) => `<${tag}>${inner}</${tag}>`,
  );

/** The source refs a pack actually contains — anything else the model cites is dropped. */
export const validRefs = (pack: WeekContextPack): Set<string> => new Set(pack.sources.map((s) => s.ref));

export function styleRules(bp: Blueprint): string[] {
  const level: Record<Blueprint["style"]["reading_level"], string> = {
    L3: "RQF Level 3: very plain English, short sentences, one idea at a time",
    L4: "RQF Level 4: plain English, short sentences, technical terms explained",
    L5: "RQF Level 5: clear professional English, technical depth is fine",
  };
  return [
    `- Write in ${bp.style.language === "fr" ? "French" : "English"}. Reading level: ${level[bp.style.reading_level]}.`,
    `- Tone: ${bp.style.tone === "FORMAL" ? "formal and precise" : "warm, encouraging and direct (talk to the student as \"you\")"}.`,
    bp.style.local_examples
      ? "- Use examples from Rwandan workplaces and daily life (local businesses, cooperatives, garages, clinics, offices, mobile money) where they fit."
      : "- Use neutral, international examples.",
  ];
}

export interface InteractionSpec {
  type?: string;
  prompt?: string;
  answer_html?: string;
  options?: string[];
  correct_index?: number;
  explanation?: string;
  text_with_blanks?: string;
  steps?: string[];
  pairs?: { left?: string; right?: string }[];
}

const attrJson = (data: unknown) => escapeHtml(JSON.stringify(data));

/**
 * One interactive break as the HTML the editor and the student reader already understand:
 * `<details data-type="reveal">` and `<div data-type="inline-check" data-check="…">` (see
 * frontend interactive/nodes.tsx), plus `<div data-type="activity" data-activity="…">` for
 * fill-in-the-blank / order-the-steps / match-pairs. Every block carries a readable static
 * fallback, so PDF export and old clients still show something sensible. Returns null for an
 * interaction that doesn't validate.
 */
export function interactionToHtml(spec: InteractionSpec): string | null {
  const type = String(spec?.type || "").toLowerCase();
  if (type === "reveal") {
    const prompt = String(spec.prompt || "").trim();
    const answer = String(spec.answer_html || "").trim();
    if (!prompt || !answer) return null;
    return `<details data-type="reveal" class="note-reveal"><summary>${escapeHtml(prompt.slice(0, 200))}</summary><div>${answer.startsWith("<") ? answer : `<p>${escapeHtml(answer)}</p>`}</div></details>`;
  }
  if (type === "inline_check") {
    const options = (spec.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    const correct = Number(spec.correct_index);
    if (!spec.prompt || options.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
    const data = { prompt: String(spec.prompt).slice(0, 500), options, correct, explanation: String(spec.explanation || "").slice(0, 500) };
    return `<div data-type="inline-check" data-check="${attrJson(data)}" class="note-inline-check"><p><strong>Quick check:</strong> ${escapeHtml(data.prompt)}</p></div>`;
  }
  if (type === "fill_blank") {
    const text = String(spec.text_with_blanks || "").trim();
    const answers = [...text.matchAll(/\[\[([^\]]{1,60})\]\]/g)].map((m) => m[1].trim());
    if (!text || answers.length === 0 || answers.length > 4) return null;
    const data = { kind: "fill_blank", text: text.slice(0, 600), explanation: String(spec.explanation || "").slice(0, 400) };
    return `<div data-type="activity" data-activity="${attrJson(data)}" class="note-activity"><p><strong>Fill in the blanks:</strong> ${escapeHtml(text.replace(/\[\[[^\]]+\]\]/g, "_____"))}</p></div>`;
  }
  if (type === "order_steps") {
    const steps = (spec.steps ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 7);
    if (steps.length < 3) return null;
    const data = { kind: "order_steps", prompt: String(spec.prompt || "Put the steps in the right order").slice(0, 200), steps };
    return `<div data-type="activity" data-activity="${attrJson(data)}" class="note-activity"><p><strong>${escapeHtml(data.prompt)}</strong></p><ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol></div>`;
  }
  if (type === "match_pairs") {
    const pairs = (spec.pairs ?? [])
      .map((p) => ({ left: String(p?.left ?? "").trim().slice(0, 120), right: String(p?.right ?? "").trim().slice(0, 200) }))
      .filter((p) => p.left && p.right)
      .slice(0, 6);
    if (pairs.length < 3) return null;
    const data = { kind: "match_pairs", prompt: String(spec.prompt || "Match each term to its meaning").slice(0, 200), pairs };
    return `<div data-type="activity" data-activity="${attrJson(data)}" class="note-activity"><p><strong>${escapeHtml(data.prompt)}</strong></p><ul>${pairs.map((p) => `<li>${escapeHtml(p.left)} — ${escapeHtml(p.right)}</li>`).join("")}</ul></div>`;
  }
  return null;
}
