import api from "../services/api";

/**
 * Service credentials partner systems use to READ data from this MIS.
 *
 * Not to be confused with a System (see ./systems): that is an SSO client, a
 * client_id/secret pair which lets a partner sign our users in. This is a
 * machine credential used with no user present — Ganzaa's nightly sync holds
 * one. A partner integrating fully needs both, for different jobs.
 */
export interface IntegrationToken {
  token_id: number;
  name: string;
  /** The first characters of the value, so a row can be matched to a config. */
  token_prefix: string;
  scopes: string[];
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
}

/** Only the create response ever carries the value itself. */
export interface CreatedIntegrationToken extends IntegrationToken {
  token: string;
}

export const getIntegrationTokens = async (): Promise<IntegrationToken[]> => {
  const response = await api.get<IntegrationToken[]>("/systems/integration-tokens");
  return response.data;
};

export const createIntegrationToken = async (input: {
  name: string;
  expires_days?: number;
}): Promise<CreatedIntegrationToken> => {
  const response = await api.post<CreatedIntegrationToken>(
    "/systems/integration-tokens",
    input,
  );
  return response.data;
};

/** Revoked, never deleted: last_used_at on a withdrawn credential is evidence. */
export const revokeIntegrationToken = async (id: number): Promise<void> => {
  await api.delete(`/systems/integration-tokens/${id}`);
};
