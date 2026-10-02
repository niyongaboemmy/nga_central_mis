// Every provider SDK throws its own shape of error (the @google/genai SDK puts the raw
// provider error JSON straight into `.message`; OpenAI-compatible clients set `.status`).
// Centralize "is this a quota/rate-limit error" and "what should the teacher see" here so
// every provider adapter and the orchestrator agree on the same classification.
export const isQuotaError = (err: any): boolean => {
  // 402 = prepaid balance exhausted (DeepSeek, OpenRouter) — same treatment: skip it for a while.
  if (err?.status === 429 || err?.status === 413 || err?.status === 402) return true;
  const raw = String(err?.message || err?.error?.message || "");
  return (
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes("429") ||
    raw.includes("413") ||
    /quota/i.test(raw) ||
    /insufficient (balance|credits)/i.test(raw) ||
    /rate.?limit/i.test(raw) ||
    /tokens per minute|tokens per day|TPM|TPD/i.test(raw)
  );
};

const isSafetyBlock = (err: any): boolean => {
  const raw = String(err?.message || err?.error?.message || "");
  return raw.includes("SAFETY") || raw.includes("blockReason") || /content.?filter/i.test(raw);
};

export const friendlyAIErrorMessage = (err: any): string => {
  if (isQuotaError(err)) {
    return "The AI is temporarily rate-limited. Please try again in a few minutes.";
  }
  if (isSafetyBlock(err)) {
    return "The AI declined to generate content for this request. Try rephrasing or picking a different topic.";
  }
  return "AI generation failed. Please try again.";
};

/**
 * A provider that will keep failing until a human fixes something: a bad or revoked key,
 * or an account that now needs billing (OpenAI's 429 "insufficient_quota" is this, not a
 * rate limit). Parked for an hour instead of the 5-minute quota cooldown, so a dead key
 * doesn't cost every request a failed round trip.
 */
export const isDeadProviderError = (err: any): boolean => {
  if (err?.status === 401 || err?.status === 403) return true;
  const raw = [err?.message, err?.error?.message, err?.code, err?.error?.code].filter(Boolean).join(" ");
  // Careful: Gemini's *free-tier daily* 429 also says "check your plan and billing details",
  // and that one resets tomorrow — it is a quota error, not a dead key. Only OpenAI's explicit
  // insufficient_quota code, a bad key, or a payment/suspension message parks a provider.
  return (
    /insufficient_quota/i.test(raw) ||
    /invalid.?api.?key|incorrect api key|api key not valid|API_KEY_INVALID/i.test(raw) ||
    /payment required|account.*(deactivated|suspended)/i.test(raw)
  );
};

export type AIErrorClass = "QUOTA" | "DEAD" | "TIMEOUT" | "SCHEMA" | "SAFETY" | "OTHER";

/** One word per failure for the usage log, so the admin view can say why a provider failed. */
export const classifyAIError = (err: any): AIErrorClass => {
  if (isDeadProviderError(err)) return "DEAD";
  if (isQuotaError(err)) return "QUOTA";
  const raw = String(err?.message || err?.name || "");
  if (/timeout|timed out|ETIMEDOUT|aborted/i.test(raw)) return "TIMEOUT";
  if (/JSON|schema|Unexpected token|Unterminated/i.test(raw)) return "SCHEMA";
  if (isSafetyBlock(err)) return "SAFETY";
  return "OTHER";
};
