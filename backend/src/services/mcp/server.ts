import logger from "../../utils/logger";
import { decideAi, externalPupilDataAllowed } from "../../vendor/nga-access";
import { hasAiUse } from "../ai/gate";
import { SCOPE_DRAFTS, SCOPE_PUPIL_NAMES, SCOPE_READ, isOurResource, mcpIssuer, mcpResource } from "./config";
import { ConnectorError, assertConnectorSession, type McpPerson } from "./gate";
import { auditToolCall, findToken, tokenLive, touchToken, type StoredToken } from "./oauthStore";
import { appForTool, appTools, callAppTool } from "./relay";
import { ToolError, misTool, misToolsFor, type McpTool, type ToolOutput } from "./tools";

/**
 * The NGA MCP endpoint (POST /mcp): Streamable HTTP, JSON-RPC 2.0, stateless (no session id,
 * no server-initiated stream; every POST answers with application/json).
 *
 * Every request: a live access token for this resource -> the account ACTIVE -> issued under
 * the person's current token_version -> the AI policy (decideAi for the MIS, AI_USE) and the
 * connector switch on -> the person still holds AI_EXTERNAL_CONNECT (services/mcp/gate.ts).
 */

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "nga", title: "NGA (Nu-Vision High School)", version: "1.0.0" };
const INSTRUCTIONS =
  "NGA is the school's MIS, Task Mentor, Tupo and Tendo. Tools whose names start with mis_, tm_, tupo_ and da_ read the signed-in teacher's own " +
  "school data. Draft tools only save drafts (unpublished, unsent, unreleased) that the teacher reviews and confirms in the NGA app at openUrl; " +
  "always give the teacher that link. Pupil names are left out unless the teacher allowed them when connecting.";
const MAX_RESULT_CHARS = 50_000;

type Id = string | number | null;
const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: "2.0", id, result });

export const resourceMetadataUrl = () => `${mcpIssuer()}/.well-known/oauth-protected-resource/mcp`;
const challenge = (error?: string, description?: string) =>
  `Bearer resource_metadata="${resourceMetadataUrl()}"` + (error ? `, error="${error}", error_description="${description ?? ""}"` : "");

interface Session {
  token: StoredToken;
  person: McpPerson;
}

/** Tools for this token: MIS tools + the apps' tools, minus drafts without the drafts scope. */
async function toolsFor(s: Session): Promise<McpTool[]> {
  if (!s.token.scope.includes(SCOPE_READ) && !s.token.scope.includes(SCOPE_DRAFTS)) return [];
  const [mis, apps] = await Promise.all([misToolsFor(s.person), appTools(s.person.userId, s.person.policy)]);
  return [...mis, ...apps].filter((t) => (t.kind === "draft" ? s.token.scope.includes(SCOPE_DRAFTS) : s.token.scope.includes(SCOPE_READ)));
}

const describe = (t: McpTool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: {
    title: t.title,
    readOnlyHint: t.kind === "read",
    destructiveHint: false,
    idempotentHint: t.kind === "read",
    openWorldHint: false,
  },
});

function content(out: ToolOutput) {
  let json = JSON.stringify(out.result ?? null, null, 1);
  if (json.length > MAX_RESULT_CHARS) json = `${json.slice(0, MAX_RESULT_CHARS)}\n… (cut at ${MAX_RESULT_CHARS} characters; ask for a smaller page)`;
  const parts = [out.summary, json];
  if (out.openUrl) parts.push(`Open in NGA: ${out.openUrl}`);
  const structured = { summary: out.summary, openUrl: out.openUrl ?? null, result: out.result ?? null };
  return {
    content: [{ type: "text", text: parts.filter(Boolean).join("\n\n") }],
    ...(JSON.stringify(structured).length <= MAX_RESULT_CHARS ? { structuredContent: structured } : {}),
    isError: false,
  };
}
const toolError = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });

async function callTool(s: Session, name: string, args: Record<string, unknown>) {
  const started = Date.now();
  let ok = false;
  let code: string | null = null;
  try {
    const tools = await toolsFor(s);
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      code = "TOOL_UNKNOWN";
      return toolError(`No NGA tool called "${name}" is available to you. Call tools/list to see the tools you can use.`);
    }
    // Draft tools are content authoring ("author"); the policy may differ from read access.
    if (tool.kind === "draft") {
      const d = decideAi(s.person.policy, { app: "mis", feature: "author", hasAiUse: await hasAiUse(s.person.req) });
      if (!d.allowed) {
        code = "EXTERNAL_OFF";
        return toolError("Your school does not allow AI drafting right now.");
      }
    }
    if (tool.source === "mis") {
      const out = await misTool(name)!.run(s.person, args);
      ok = true;
      return content(out);
    }
    const app = appForTool(name);
    if (!app) {
      code = "TOOL_UNKNOWN";
      return toolError(`The app that serves "${name}" is not available.`);
    }
    const pupilNames = s.token.scope.includes(SCOPE_PUPIL_NAMES) && externalPupilDataAllowed(s.person.policy, true);
    const r = await callAppTool(app, s.person.userId, null, name, args, { pupilNames });
    if (!r.ok) {
      code = r.code ?? "APP_ERROR";
      return toolError(r.message ?? `${app.name} could not run ${name}.`);
    }
    ok = true;
    return content({ summary: r.summary ?? "", result: r.result, openUrl: r.openUrl ?? null });
  } catch (e) {
    if (e instanceof ToolError) {
      code = e.code;
      return toolError(e.message);
    }
    code = "INTERNAL";
    logger.error(`[mcp] tool ${name} failed: ${(e as any)?.message ?? e}`);
    return toolError("NGA hit an error running this tool. Try again, or open NGA directly.");
  } finally {
    await auditToolCall({ userId: s.person.userId, clientId: s.token.clientId, tool: name, ok, errorCode: code, durationMs: Date.now() - started });
  }
}

/** One JSON-RPC message. Returns null for notifications (no answer). */
async function handleMessage(s: Session, msg: any): Promise<object | null> {
  const isRequest = msg && typeof msg === "object" && msg.jsonrpc === "2.0" && typeof msg.method === "string";
  if (!isRequest) {
    // Responses from the client (we send no requests) and junk.
    if (msg && typeof msg === "object" && ("result" in msg || "error" in msg)) return null;
    return rpcError(msg?.id ?? null, -32600, "Invalid Request");
  }
  if (msg.id === undefined) return null; // notifications/initialized, cancelled, …
  const id: Id = msg.id;

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return rpcResult(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: (await toolsFor(s)).map(describe) });
    case "tools/call": {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) return rpcError(id, -32602, "tools/call needs params.name and an object params.arguments");
      return rpcResult(id, await callTool(s, name, args));
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

/** POST /mcp */
export async function mcpPost(req: any, res: any) {
  res.set("Cache-Control", "no-store");
  const header = String(req.get("Authorization") || "");
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!bearer) {
    res.set("WWW-Authenticate", challenge());
    return res.status(401).json({ error: "unauthorized", error_description: "Sign in with NGA to use this connector." });
  }
  const token = await findToken(bearer);
  if (!tokenLive(token, "access") || !isOurResource(token.resource)) {
    res.set("WWW-Authenticate", challenge("invalid_token", "The access token is invalid or expired"));
    return res.status(401).json({ error: "invalid_token", error_description: "The access token is invalid or expired." });
  }

  const pv = req.get("MCP-Protocol-Version");
  if (pv && !PROTOCOL_VERSIONS.includes(pv)) {
    return res.status(400).json(rpcError(null, -32600, `Unsupported MCP-Protocol-Version ${pv}. Supported: ${PROTOCOL_VERSIONS.join(", ")}`));
  }

  const body = req.body;
  const firstId = Array.isArray(body) ? (body[0]?.id ?? null) : (body?.id ?? null);
  let person: McpPerson;
  try {
    person = await assertConnectorSession(token.userId, token.tokenVersion);
  } catch (e) {
    if (e instanceof ConnectorError) {
      if (e.status === 401) {
        res.set("WWW-Authenticate", challenge("invalid_token", e.message));
        return res.status(401).json({ error: "invalid_token", error_description: e.message });
      }
      return res.status(403).json(rpcError(firstId, -32001, e.message, { code: e.code }));
    }
    throw e;
  }
  void touchToken(token);
  const session: Session = { token, person };

  if (body === undefined || body === null || (typeof body !== "object")) {
    return res.status(400).json(rpcError(null, -32700, "Parse error: send one JSON-RPC message as JSON"));
  }
  if (Array.isArray(body)) {
    if (body.length === 0) return res.status(400).json(rpcError(null, -32600, "Invalid Request"));
    const answers = (await Promise.all(body.map((m) => handleMessage(session, m)))).filter(Boolean);
    return answers.length ? res.status(200).json(answers) : res.status(202).end();
  }
  const answer = await handleMessage(session, body);
  return answer ? res.status(200).json(answer) : res.status(202).end();
}

/** GET/DELETE /mcp: no server-initiated stream and no sessions in this stateless server. */
export function mcpNotAllowed(_req: any, res: any) {
  res.set("Allow", "POST");
  res.status(405).json(rpcError(null, -32000, "Method not allowed: this NGA server answers POST only."));
}

/** RFC 9728 protected resource metadata. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [mcpIssuer()],
    scopes_supported: [SCOPE_READ, SCOPE_DRAFTS, SCOPE_PUPIL_NAMES],
    bearer_methods_supported: ["header"],
    resource_name: "NGA",
    resource_documentation: `${mcpIssuer()}/`,
  };
}
