import { AIProvider, GenerateJSONParams, ProviderCredential, ProviderResult } from "./types";
import { toStrictJsonSchema } from "./strictJsonSchema";

/**
 * Anthropic (Claude), on its native Messages API. Structured output is a forced tool call:
 * the tool's input_schema is the caller's schema, and Claude must call that tool, so the
 * reply arrives as an already-parsed object. Used for users' own keys (My AI) and, if
 * ANTHROPIC_API_KEY is set and listed in an order, by the school.
 */
const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";
const TIMEOUT_MS = 150_000;

const isConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export const anthropicProvider: AIProvider = {
  name: "anthropic",
  isConfigured,
  supportsStrictSchema: true,

  async generateJSON<T = any>(params: GenerateJSONParams, credential?: ProviderCredential): Promise<ProviderResult<T>> {
    const model = credential?.model || process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    const tool = params.schemaName || "respond";
    const res = await fetch(`${credential?.baseUrl || API}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": credential?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxOutputTokens ?? 4096,
        messages: [{ role: "user", content: params.prompt }],
        tools: [{ name: tool, description: "Return the answer in exactly this shape.", input_schema: toStrictJsonSchema(params.schema) }],
        tool_choice: { type: "tool", name: tool },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(`Anthropic: ${body?.error?.message || res.statusText}`), { status: res.status, code: body?.error?.type });
    }
    const call = (body.content ?? []).find((c: any) => c?.type === "tool_use");
    if (!call || typeof call.input !== "object") throw new Error("Anthropic response did not match the expected schema");
    return {
      data: call.input as T,
      model: body.model || model,
      usage: { input_tokens: body.usage?.input_tokens, output_tokens: body.usage?.output_tokens },
    };
  },
};
