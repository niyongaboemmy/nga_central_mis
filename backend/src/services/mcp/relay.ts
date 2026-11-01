import jwt from "jsonwebtoken";
import { getUserTokenVersion } from "../../middleware/auth";
import logger from "../../utils/logger";
import type { AiApp, AiPolicy } from "../../vendor/nga-access";
import { configuredApps, type AppSource, type HomeApp } from "../home/apps";
import type { McpTool, ToolKind } from "./tools";

/**
 * Tools that belong to Task Mentor, Tupo and Tendo (EXTERNAL_AI_CONTRACT.md §2). The MIS
 * relays to each app's /api/integration/mcp/* with a freshly minted, short-lived MIS token
 * for the person -- the same token shape `authenticate` accepts -- exactly as Home relays
 * /api/integration/home-summary. Each app checks it against MIS /auth/verify and applies
 * its own rules. An app that is not configured, fails or answers 404 contributes no tools.
 */

const PREFIX: Record<AppSource, string> = { taskmentor: "tm_", tupo: "tupo_", attendance: "da_" };
const POLICY_APP: Record<AppSource, AiApp> = { taskmentor: "tm", tupo: "tupo", attendance: "da" };
const TOOL_NAME = /^[a-z][a-z0-9_]{2,63}$/;
const CACHE_MS = 60_000;
const timeoutMs = () => Number(process.env.MCP_APP_TIMEOUT_MS) || 10_000;

/** The app a relayed tool name belongs to, or null. */
export function appForTool(name: string): HomeApp | null {
  for (const app of configuredApps()) if (name.startsWith(PREFIX[app.source])) return app;
  return null;
}

/** A 5-minute MIS token for the person, for this relay only. */
export async function mintRelayToken(userId: number, username?: string | null): Promise<string> {
  const tokenVersion = (await getUserTokenVersion(userId)) ?? 0;
  return jwt.sign({ userId, username: username ?? undefined, tokenVersion, purpose: "mcp-relay" }, process.env.JWT_SECRET!, {
    expiresIn: "5m",
    issuer: "nga-mis",
    audience: "nga-mcp-relay",
  });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validate one app's tool. Anything malformed, or named for another app, is dropped. */
function sanitiseTool(app: HomeApp, raw: any): McpTool | null {
  const name = str(raw?.name, 64);
  if (!TOOL_NAME.test(name) || !name.startsWith(PREFIX[app.source])) return null;
  const description = str(raw?.description, 1500);
  if (!description) return null;
  const schema = raw?.inputSchema && typeof raw.inputSchema === "object" && !Array.isArray(raw.inputSchema) ? raw.inputSchema : { type: "object", properties: {} };
  if (schema.type !== "object" || JSON.stringify(schema).length > 8000) return null;
  const kind: ToolKind = raw?.kind === "draft" ? "draft" : "read";
  return {
    name,
    title: str(raw?.title, 120) || name,
    description,
    kind,
    pupilData: raw?.pupilData === true,
    inputSchema: schema,
    source: app.source,
  };
}

const cache = new Map<number, { at: number; tools: McpTool[] }>();
export const forgetAppTools = (userId?: number) => (userId === undefined ? cache.clear() : cache.delete(userId));

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Every configured app's tools for this person (cached 60 s per person). Never throws. */
export async function appTools(userId: number, policy: AiPolicy, username?: string | null): Promise<McpTool[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tools;
  const apps = configuredApps().filter((a) => policy.apps[POLICY_APP[a.source]] !== false);
  if (apps.length === 0) return [];
  const token = await mintRelayToken(userId, username);
  const lists = await Promise.all(
    apps.map(async (app) => {
      try {
        const { status, body } = await fetchJson(`${app.apiBaseUrl}/api/integration/mcp/tools`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (status !== 200) return [];
        const list = Array.isArray(body?.tools) ? body.tools : Array.isArray(body?.data?.tools) ? body.data.tools : [];
        return (list as unknown[]).slice(0, 40).flatMap((t) => sanitiseTool(app, t) ?? []);
      } catch (e) {
        logger.warn("[mcp] app tools unavailable", { app: app.source, reason: (e as any)?.name === "AbortError" ? "timeout" : (e as any)?.message });
        return [];
      }
    }),
  );
  const tools = lists.flat();
  cache.set(userId, { at: Date.now(), tools });
  return tools;
}

export interface RelayResult {
  ok: boolean;
  /** For the audit row and the model: the app's code on refusal. */
  code?: string;
  message?: string;
  summary?: string;
  result?: unknown;
  openUrl?: string | null;
}

const safeUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Relay one tools/call to its app. Never throws. */
export async function callAppTool(
  app: HomeApp,
  userId: number,
  username: string | null,
  name: string,
  args: unknown,
  consent: { pupilNames: boolean },
): Promise<RelayResult> {
  try {
    const token = await mintRelayToken(userId, username);
    const { status, body } = await fetchJson(`${app.apiBaseUrl}/api/integration/mcp/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name, arguments: args ?? {}, consent }),
    });
    if (status >= 200 && status < 300 && body && typeof body === "object") {
      return { ok: true, summary: str(body.summary, 2000), result: body.result ?? null, openUrl: safeUrl(body.openUrl) };
    }
    if (status === 401) return { ok: false, code: "APP_UNAUTHORIZED", message: `${app.name} did not accept your NGA session.` };
    return {
      ok: false,
      code: str(body?.code, 40) || `HTTP_${status}`,
      message: str(body?.message, 500) || `${app.name} answered ${status}.`,
    };
  } catch (e) {
    const aborted = (e as any)?.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "APP_TIMEOUT" : "APP_UNAVAILABLE",
      message: aborted ? `${app.name} took too long to answer.` : `${app.name} could not be reached.`,
    };
  }
}
