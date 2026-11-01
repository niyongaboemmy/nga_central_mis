import { CustomError, ValidationError } from "../../errors/CustomError";
import type { JSONSchema } from "../aiProviders/types";
import { matchesSchema } from "../aiProviders/schemaValidator";

/**
 * "Open in Claude / ChatGPT" + "Paste the answer" (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.2).
 *
 * A person's own Claude Pro / ChatGPT Plus may never be called by the NGA apps (vendor
 * terms), but the person may take NGA's prompt to their own chat and bring the answer back.
 * Any AI call can do this without per-feature code: the request carries `aiHandoff`, and
 *   - mode "prompt": instead of calling a provider, the exact prompt is returned (HTTP 200
 *     `{ success, handoff: { prompt, expects, schemaName } }`, see errorHandler);
 *   - mode "import": the pasted answer is validated against the same schema and used as if
 *     a provider had returned it, so the feature's normal post-processing runs unchanged.
 */

export type AiHandoff =
  | { mode: "prompt"; /** The person ticked "include pupil names" for this request. */ pupilConsent?: boolean }
  | { mode: "import"; text: string };

export interface HandoffPayload {
  prompt: string;
  /** "json": the answer must be one JSON object (fenced); "text": any text. */
  expects: "json" | "text";
  schemaName?: string;
}

/** Not a failure: the way a prompt-mode request stops before any provider is called. */
export class HandoffPrompt extends Error {
  readonly code = "AI_HANDOFF_PROMPT";
  constructor(readonly payload: HandoffPayload) {
    super("AI hand-off prompt");
  }
}

export const isHandoffPrompt = (e: unknown): e is HandoffPrompt => (e as any)?.code === "AI_HANDOFF_PROMPT" && !!(e as any)?.payload;

export class HandoffForbiddenError extends CustomError {
  constructor(message: string, readonly code: string) {
    super(message, 403);
  }
}

const MAX_PASTE = 200_000;

/** `aiHandoff` from a request body. Anything malformed is ignored (normal AI call). */
export function parseHandoff(raw: unknown): AiHandoff | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.mode === "prompt") return { mode: "prompt", pupilConsent: r.pupilConsent === true };
  if (r.mode === "import") {
    const text = typeof r.text === "string" ? r.text : "";
    if (!text.trim()) throw new ValidationError("Paste the answer from your AI first.");
    if (text.length > MAX_PASTE) throw new ValidationError("That answer is too long to import.");
    return { mode: "import", text };
  }
  return undefined;
}

/** The provider prompt plus an instruction any chat model follows: one fenced JSON object. */
export function jsonHandoffPrompt(prompt: string, schema: JSONSchema): string {
  return [
    prompt.trim(),
    "",
    "Answer with ONLY one JSON object that matches this JSON Schema, inside a ```json code block, with no other text:",
    JSON.stringify(schema),
  ].join("\n");
}

/**
 * The JSON object in a pasted answer: the last ```json block, else the outermost {...}.
 * Throws a ValidationError a person can act on.
 */
export function readPastedJson<T>(text: string, schema: JSONSchema): T {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim()).filter((s) => s.startsWith("{"));
  const candidates = fenced.length ? fenced.reverse() : [];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (matchesSchema(parsed, schema)) return parsed as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new ValidationError(
    "The pasted answer isn't in the expected format. Paste the whole reply, including the ```json block, or ask your AI to answer again in that format.",
  );
}

/** A conversation as one prompt to paste into another chat. */
export function chatHandoffPrompt(system: string, messages: { role: "user" | "assistant"; content: string }[]): string {
  const turns = messages.map((m) => `${m.role === "user" ? "Me" : "You"}: ${m.content.trim()}`).join("\n\n");
  return `${system.trim()}\n\n${turns}\n\nYou:`;
}
