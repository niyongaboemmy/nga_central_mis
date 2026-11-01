import axios, { type AxiosInstance } from "axios";
import api, { API_BASE_URL } from "../services/api";

/**
 * The NGA connector (backend services/mcp/routes.ts): NGA as an MCP server inside a person's
 * own Claude or ChatGPT. The consent page approves a connection; My AI lists and revokes them.
 */

type Envelope<T> = { success: boolean; message?: string; code?: string; data: T };

export interface ConsentDetails {
  client: { name: string; clientUri: string | null; redirectHost: string; registeredBySchool: boolean };
  scopes: { scope: string; text: string }[];
  pupilNamesOption: boolean;
}

/**
 * The consent page skips the shared client's 401 handling on purpose (as /desktop/signin
 * does): that handler sends the page to "/" and the AI app's request would be lost. Here a
 * 401 only means "sign in first", on this same page.
 */
let client: AxiosInstance | null = null;
/** Created on first use, so pages that only import this module (My AI) never build it. */
const consentHttp = (): AxiosInstance => {
  if (!client) {
    client = axios.create({ baseURL: API_BASE_URL, withCredentials: true });
    client.interceptors.request.use((config) => {
      const token = localStorage.getItem("token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }
  return client;
};

export const consentApi = {
  get: (request: string) => consentHttp().get<Envelope<ConsentDetails>>("/oauth/consent", { params: { request } }),
  decide: (request: string, decision: "allow" | "deny", pupilNames: boolean) =>
    consentHttp().post<Envelope<{ redirectTo: string }>>("/oauth/consent", { request, decision, pupilNames }),
};

/** Leave for the AI app's callback (a full navigation, never the SPA router). */
export const leaveTo = (url: string) => window.location.assign(url);

export interface McpConnection {
  clientId: string;
  name: string;
  clientUri: string | null;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

export interface McpConnectionsView {
  available: boolean;
  blocked: { code: string; message: string } | null;
  connectorUrl: string;
  connections: McpConnection[];
}

export const connectionsApi = {
  list: () => api.get<Envelope<McpConnectionsView>>("/my-ai/connections"),
  revoke: (clientId: string) => api.delete<Envelope<{ revoked: number }>>(`/my-ai/connections/${encodeURIComponent(clientId)}`),
};

export const SCOPE_LABELS: Record<string, string> = {
  "nga.read": "Read",
  "nga.drafts": "Create drafts",
  pupil_names: "Pupil names",
};
