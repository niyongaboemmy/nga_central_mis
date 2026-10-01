import { setTestProviders, resetLimiterState } from "../services/aiProviders";
import type { AIProvider, GenerateJSONParams } from "../services/aiProviders";

export type FakeHandler = (params: GenerateJSONParams, provider: string) => any | Promise<any>;

export interface FakeAICall {
  provider: string;
  schemaName?: string;
  prompt: string;
}

/**
 * Installs deterministic AI providers for a test (see registry.setTestProviders). Pass one
 * handler (installed as "glm", "groq" and "gemini", so role orders and verifier exclusion
 * work) or a map of provider name → handler. A handler may throw to simulate failures, e.g.
 * `Object.assign(new Error("quota"), { status: 429 })`.
 */
export function installFakeAI(handlers: FakeHandler | Record<string, FakeHandler>): { calls: FakeAICall[] } {
  const map: Record<string, FakeHandler> =
    typeof handlers === "function" ? { glm: handlers, groq: handlers, gemini: handlers } : handlers;
  const calls: FakeAICall[] = [];
  const providers: Record<string, AIProvider> = {};
  for (const [name, handler] of Object.entries(map)) {
    providers[name] = {
      name,
      isConfigured: () => true,
      supportsStrictSchema: true,
      async generateJSON<T>(params: GenerateJSONParams) {
        calls.push({ provider: name, schemaName: params.schemaName, prompt: params.prompt });
        const data = (await handler(params, name)) as T;
        return { data, model: `fake-${name}`, usage: { input_tokens: 10, output_tokens: 20 } };
      },
    };
  }
  resetLimiterState();
  setTestProviders(providers);
  return { calls };
}

export function uninstallFakeAI(): void {
  setTestProviders(null);
  resetLimiterState();
}
