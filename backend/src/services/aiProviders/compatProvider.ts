import OpenAI from "openai";
import { AIProvider, GenerateJSONParams, ProviderCredential, ProviderResult } from "./types";
import { matchesSchema } from "./schemaValidator";
import { safeFetch } from "../ai/personal/safeFetch";

/**
 * Any OpenAI-compatible chat API (Mistral, Cerebras, or a custom endpoint a staff member
 * adds in My AI). json_object mode guarantees JSON but not its shape, so the reply is
 * checked with matchesSchema, like GLM and DeepSeek.
 */
export function makeCompatProvider(opts: {
  name: string;
  baseUrl: string;
  envKey?: string;
  envModel?: string;
  defaultModel?: string;
  /** Custom endpoints go through the SSRF-guarded fetch (safeFetch.ts). */
  fetch?: typeof safeFetch;
}): AIProvider {
  let client: OpenAI | null = null;
  const getClient = (credential?: ProviderCredential) => {
    if (credential) {
      return new OpenAI({ apiKey: credential.apiKey, baseURL: credential.baseUrl || opts.baseUrl, timeout: 150_000, maxRetries: 1, ...(opts.fetch ? { fetch: opts.fetch as any } : {}) });
    }
    if (!client) client = new OpenAI({ apiKey: opts.envKey ? process.env[opts.envKey] : undefined, baseURL: opts.baseUrl, timeout: 150_000, maxRetries: 1 });
    return client;
  };
  return {
    name: opts.name,
    isConfigured: () => !!(opts.envKey && process.env[opts.envKey]),
    supportsStrictSchema: false,
    async generateJSON<T = any>(params: GenerateJSONParams, credential?: ProviderCredential): Promise<ProviderResult<T>> {
      const model = credential?.model || (opts.envModel && process.env[opts.envModel]) || opts.defaultModel;
      if (!model) throw new Error(`${opts.name}: no model chosen`);
      if (!credential?.baseUrl && !opts.baseUrl) throw new Error(`${opts.name}: no endpoint`);
      const completion: any = await getClient(credential).chat.completions.create({
        model,
        ...(params.maxOutputTokens ? { max_tokens: params.maxOutputTokens } : {}),
        messages: [
          {
            role: "system",
            content: `Respond with ONLY a single JSON object matching this JSON Schema — no markdown fences, no commentary, no explanation:\n${JSON.stringify(params.schema)}`,
          },
          { role: "user", content: params.prompt },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}") as T;
      if (!matchesSchema(parsed, params.schema)) throw new Error(`${opts.name} response did not match the expected schema`);
      return {
        data: parsed,
        model: completion.model || model,
        usage: { input_tokens: completion.usage?.prompt_tokens, output_tokens: completion.usage?.completion_tokens },
      };
    },
  };
}

export const mistralProvider = makeCompatProvider({ name: "mistral", baseUrl: "https://api.mistral.ai/v1", envKey: "MISTRAL_API_KEY", envModel: "MISTRAL_MODEL", defaultModel: "mistral-small-latest" });
export const cerebrasProvider = makeCompatProvider({ name: "cerebras", baseUrl: "https://api.cerebras.ai/v1", envKey: "CEREBRAS_API_KEY", envModel: "CEREBRAS_MODEL", defaultModel: "gpt-oss-120b" });
/** Only ever used with a credential that carries its own base URL (My AI, staff). */
export const customProvider = makeCompatProvider({ name: "custom", baseUrl: "", fetch: safeFetch });
