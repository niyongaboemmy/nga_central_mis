// Plain JSON-Schema (subset) shared across all AI providers, so callers describe the
// shape they want once and each provider adapter translates it into whatever request
// format that vendor needs (Gemini's Type.* enum schema, OpenAI-style json_schema, etc).
export type JSONSchemaType = "object" | "string" | "array" | "number" | "boolean";

export interface JSONSchema {
  type: JSONSchemaType;
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
}

export interface GenerateJSONParams {
  prompt: string;
  schema: JSONSchema;
  /** Short machine name for the schema (used by providers that require a json_schema "name", e.g. Groq). */
  schemaName?: string;
  /**
   * Output token budget hint. Providers default this low to stay inside free-tier rate
   * limits, which silently truncates output (and therefore the JSON) for anything larger
   * than a short snippet — callers revising or generating a full lesson note must raise
   * this to fit the actual content size.
   */
  maxOutputTokens?: number;
  /** Turn off "thinking" where the vendor supports it (Gemini 2.5) so long JSON isn't truncated. */
  disableThinking?: boolean;
}

/**
 * A key (and optionally a model or endpoint) for one call, used instead of the school's
 * env key — a user's own provider account (PERSONAL_AI_PROVIDERS_PLAN.md §7.1). Without
 * one, every adapter behaves exactly as before. Clients built from it are never cached,
 * so one user's key can't serve another user's call.
 */
export interface ProviderCredential {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** OpenRouter only: refuse paid models. Default true; the school's own key is always free-only. */
  freeOnly?: boolean;
}

export interface AIProvider {
  name: string;
  /** Whether this provider has the env vars it needs (an API key, etc). */
  isConfigured(): boolean;
  /**
   * true only for providers that guarantee the response matches `schema` via constrained
   * decoding (Gemini's responseSchema, Groq's strict json_schema on gpt-oss models).
   * false for providers that only guarantee valid JSON (e.g. GLM's json_object mode) —
   * those need a runtime shape check on the response, see schemaValidator.ts.
   */
  supportsStrictSchema: boolean;
  generateJSON<T = any>(params: GenerateJSONParams, credential?: ProviderCredential): Promise<ProviderResult<T>>;
}

/** Token counts as reported by the vendor, when it reports them. */
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

/** What one provider call returns: the parsed JSON plus what it cost in tokens. */
export interface ProviderResult<T> {
  data: T;
  model: string;
  usage?: TokenUsage;
}

/**
 * What a call is for, which decides the provider order (see roleOrder() in registry.ts):
 * long lessons, strict-JSON questions, an independent second opinion, a JSON fix-up, or
 * anything a person is waiting on right now.
 */
export type AIRole = "draft" | "assess" | "verify" | "repair" | "interactive";
