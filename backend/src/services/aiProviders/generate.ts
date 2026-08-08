import { ServiceUnavailableError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { GenerateJSONParams } from "./types";
import { orderedProviders, isCoolingDown, markCoolingDown } from "./registry";
import { isQuotaError, friendlyAIErrorMessage } from "./errors";

export interface GenerateStructuredContentResult<T> {
  data: T;
  providerUsed: string;
}

/**
 * Tries each configured provider in AI_PROVIDER_ORDER, skipping any currently
 * cooling down from a recent quota error. Returns the first success. Callers never
 * need to know which provider actually answered unless they want to (providerUsed).
 */
export async function generateStructuredContent<T = any>(
  params: GenerateJSONParams,
): Promise<GenerateStructuredContentResult<T>> {
  const providers = orderedProviders();
  let lastErr: any = null;
  let attempted = 0;

  for (const provider of providers) {
    if (!provider.isConfigured()) continue;
    if (isCoolingDown(provider.name)) {
      logger.info(`AI provider ${provider.name} is cooling down, skipping`);
      continue;
    }

    attempted++;
    try {
      const data = await provider.generateJSON<T>(params);
      return { data, providerUsed: provider.name };
    } catch (err: any) {
      lastErr = err;
      logger.warn(`AI provider ${provider.name} failed`, { error: err?.message });
      if (isQuotaError(err)) {
        markCoolingDown(provider.name);
      }
    }
  }

  if (attempted === 0) {
    throw new ServiceUnavailableError(
      "AI generation is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }
  throw new ServiceUnavailableError(friendlyAIErrorMessage(lastErr));
}
