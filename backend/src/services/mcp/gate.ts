import { getUserSessionState } from "../../middleware/auth";
import { getEffectivePermissions } from "../../utils/auth";
import { decideAi, type AiFeature, type AiPolicy } from "../../vendor/nga-access";
import { hasAiUse } from "../ai/gate";
import { getAiPolicy } from "../ai/policy";
import { CAP_EXTERNAL, requestHasCap } from "../ai/personal/routes";
import { loadPersona } from "../desktop/assistant";

/**
 * Who may use the NGA connector, checked on every consent and every MCP request
 * (EXTERNAL_AI_CONTRACT.md, rules 1-2): an ACTIVE staff account, the school's AI policy on
 * (decideAi for the MIS, the person's AI_USE), the connector switch on, and the person
 * still holding AI_EXTERNAL_CONNECT. Students never: they hold neither capability.
 */

export type ConnectorRefusal =
  | "ACCOUNT_INACTIVE"
  | "SESSION_REVOKED"
  | "AI_DISABLED"
  | "CONNECTOR_OFF"
  | "NOT_ALLOWED";

export const CONNECTOR_MESSAGES: Record<ConnectorRefusal, string> = {
  ACCOUNT_INACTIVE: "This NGA account is no longer active.",
  SESSION_REVOKED: "Your NGA sign-in has ended. Connect NGA again.",
  AI_DISABLED: "AI is turned off for your school, so the NGA connector is unavailable.",
  CONNECTOR_OFF: "Your school has not turned on the NGA connector for Claude and ChatGPT.",
  NOT_ALLOWED: "Your NGA role cannot connect NGA to your own AI apps. Ask a school administrator.",
};

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorRefusal,
    readonly status: number,
  ) {
    super(CONNECTOR_MESSAGES[code]);
  }
}

/** A request-shaped object for the shared capability helpers (legacy list or v2 snapshot). */
export interface McpPerson {
  userId: number;
  permissions: string[];
  isStudent: boolean;
  policy: AiPolicy;
  /** The fake request the access helpers read; also caches the v2 snapshot. */
  req: { user: { userId: number; permissions: string[] } };
}

export async function loadPerson(userId: number): Promise<McpPerson> {
  const [permissions, policy, { persona }] = await Promise.all([
    getEffectivePermissions(userId).catch(() => [] as string[]),
    getAiPolicy(),
    loadPersona(userId),
  ]);
  return { userId, permissions, policy, isStudent: persona === "student", req: { user: { userId, permissions } } };
}

/** The policy + capability part, for a person already known to be signed in. */
export async function assertConnectorAllowed(p: McpPerson, feature: AiFeature = "assist"): Promise<void> {
  const aiUse = await hasAiUse(p.req);
  const d = decideAi(p.policy, { app: "mis", feature, hasAiUse: aiUse });
  if (!d.allowed) {
    // A role without AI_USE is a "not allowed" for this person, not a school-wide switch.
    throw new ConnectorError(d.reason === "ROLE_OFF" ? "NOT_ALLOWED" : "AI_DISABLED", 403);
  }
  if (!p.policy.external.connector) throw new ConnectorError("CONNECTOR_OFF", 403);
  if (p.isStudent || !(await requestHasCap(p.req, CAP_EXTERNAL))) throw new ConnectorError("NOT_ALLOWED", 403);
}

/**
 * Everything for one MCP request: the account still ACTIVE, then the policy checks.
 *
 * Deliberately NOT tied to token_version: signing out of the MIS (which bumps it) must not
 * disconnect Claude/ChatGPT, like any connected app. A connection ends when the person
 * revokes it in My AI, when the account is deactivated (revokeUserTokens), or on expiry.
 */
export async function assertConnectorSession(userId: number, _tokenVersion?: number): Promise<McpPerson> {
  const state = await getUserSessionState(userId);
  if (!state) throw new ConnectorError("SESSION_REVOKED", 401);
  if (state.status !== "ACTIVE") throw new ConnectorError("ACCOUNT_INACTIVE", 401);
  const p = await loadPerson(userId);
  await assertConnectorAllowed(p);
  return p;
}
