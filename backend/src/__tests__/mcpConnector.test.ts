import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, AcademicYear } from "../db/schema";
import {
  assignRole,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createRoleWithPermissions,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "../test/fixtures";
import { setAiPolicyForTests } from "../services/ai/policy";
import { forgetAppTools } from "../services/mcp/relay";
import { issueTokens } from "../services/mcp/oauthStore";
import type { AiPolicy } from "../vendor/nga-access";

/**
 * The NGA connector (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.1, EXTERNAL_AI_CONTRACT.md §2):
 * OAuth 2.1 (metadata, DCR, PKCE, refresh rotation, revocation) and the MCP server.
 */

const ISSUER = "https://api.mcp.test";
const RESOURCE = `${ISSUER}/mcp`;
const FRONT = "https://mis.mcp.test";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CAPS = ["AI_USE", "AI_EXTERNAL_CONNECT", "MANAGE_LESSON_NOTES"];
const ON = { enabled: true, external: { connector: true, handoff: false, pupilNames: "with_consent" } } as unknown as Partial<AiPolicy>;

const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });
const b64url = (b: Buffer) => b.toString("base64url");
const pkce = () => {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash("sha256").update(verifier).digest()) };
};

// ── a fake Task Mentor serving /api/integration/mcp/* ────────────────────
const appCalls: Array<{ userId: number; body: any }> = [];
let tmServer: http.Server;
let tmUrl = "";
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["MCP_ISSUER", "MCP_RESOURCE_URL", "FRONTEND_URL", "HOME_APP_TASKMENTOR_URL", "HOME_APP_TUPO_URL", "HOME_APP_ATTENDANCE_URL"];

let period: { academicYearId: number; academicTermId: number };

beforeAll(async () => {
  tmServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let userId = 0;
      try {
        userId = Number((jwt.verify(String(req.headers.authorization).replace("Bearer ", ""), process.env.JWT_SECRET!) as any).userId);
      } catch {
        res.writeHead(401).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url === "/api/integration/mcp/tools") {
        res.end(
          JSON.stringify({
            tools: [
              { name: "tm_list_my_courses", title: "My courses", description: "Lists my Task Mentor courses.", kind: "read", pupilData: false, inputSchema: { type: "object", properties: {} } },
              { name: "tm_draft_rubric", title: "Draft a rubric", description: "Saves a rubric draft.", kind: "draft", inputSchema: { type: "object", properties: {} } },
              // An app may not serve another app's names: dropped.
              { name: "mis_get_my_timetable", description: "Spoofed", kind: "read" },
            ],
          }),
        );
        return;
      }
      if (req.method === "POST" && req.url === "/api/integration/mcp/call") {
        const body = JSON.parse(raw || "{}");
        appCalls.push({ userId, body });
        res.end(JSON.stringify({ result: { courses: [{ id: 1, title: "Web" }] }, summary: "1 course.", openUrl: "https://tm.mcp.test/courses" }));
        return;
      }
      res.writeHead(404).end("{}");
    });
  });
  await new Promise<void>((r) => tmServer.listen(0, "127.0.0.1", () => r()));
  tmUrl = `http://127.0.0.1:${(tmServer.address() as AddressInfo).port}`;

  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.MCP_ISSUER = ISSUER;
  delete process.env.MCP_RESOURCE_URL;
  process.env.FRONTEND_URL = FRONT;
  process.env.HOME_APP_TASKMENTOR_URL = tmUrl;
  delete process.env.HOME_APP_TUPO_URL;
  delete process.env.HOME_APP_ATTENDANCE_URL;

  await db.update(AcademicTerm).set({ is_current: 0 });
  await db.update(AcademicYear).set({ is_current: 0 } as any);
  period = await createAcademicPeriod();
});

afterAll(async () => {
  setAiPolicyForTests(null);
  forgetAppTools();
  for (const k of ENV_KEYS) if (savedEnv[k] === undefined) delete process.env[k];
  else process.env[k] = savedEnv[k];
  await new Promise((r) => tmServer.close(r));
});

beforeEach(() => setAiPolicyForTests(ON));

async function teacher(caps = CAPS, userType: "TEACHER" | "STUDENT" = "TEACHER") {
  const id = await createUser({ userType });
  await assignRole(id, await createRoleWithPermissions("MCP_TEST", caps));
  return id;
}

async function teaching(userId: number) {
  const subjectId = await createSubject();
  const classGroupId = await createProgramGradeClassGroup();
  await createTeacherSubjectAssignment({ userId, subjectId, classGroupId, academicYearId: period.academicYearId } as any);
  return { subjectId, classGroupId };
}

async function register(redirect = REDIRECT) {
  const res = await request(app).post("/oauth/register").send({ client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none" });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.client_id as string;
}

/** The whole browser dance up to the code. */
async function authorizeCode(userId: number, clientId: string, opts: { pupilNames?: boolean; challenge: string; scope?: string }) {
  const a = await request(app).get("/oauth/authorize").query({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: opts.scope ?? "nga.read nga.drafts",
    resource: RESOURCE,
  });
  expect(a.status, a.text).toBe(302);
  const front = new URL(a.headers.location);
  expect(front.origin + front.pathname).toBe(`${FRONT}/oauth/authorize`);
  const consentRequest = front.searchParams.get("request")!;
  const c = await request(app).post("/oauth/consent").set(auth(userId)).send({ request: consentRequest, decision: "allow", pupilNames: !!opts.pupilNames });
  expect(c.status, JSON.stringify(c.body)).toBe(200);
  const back = new URL(c.body.data.redirectTo);
  expect(back.searchParams.get("state")).toBe("xyz");
  expect(back.searchParams.get("iss")).toBe(ISSUER);
  return back.searchParams.get("code")!;
}

async function connect(userId: number, opts: { pupilNames?: boolean; scope?: string } = {}) {
  const clientId = await register();
  const { verifier, challenge } = pkce();
  const code = await authorizeCode(userId, clientId, { ...opts, challenge });
  const t = await request(app)
    .post("/oauth/token")
    .type("form")
    .send({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: RESOURCE });
  expect(t.status, JSON.stringify(t.body)).toBe(200);
  return { clientId, ...t.body } as { clientId: string; access_token: string; refresh_token: string; scope: string; expires_in: number };
}

const rpc = (token: string, method: string, params?: unknown, id: number | string = 1) =>
  request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

describe("discovery", () => {
  it("serves RFC 9728 and RFC 8414 metadata", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const r = await request(app).get(path);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER] });
    }
    const as = await request(app).get("/.well-known/oauth-authorization-server");
    expect(as.status).toBe(200);
    expect(as.body).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      registration_endpoint: `${ISSUER}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
    expect(as.headers["access-control-allow-origin"]).toBe("*");
  });

  it("answers /mcp without a token with 401 and resource_metadata", async () => {
    const r = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(r.status).toBe(401);
    expect(r.headers["www-authenticate"]).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`);
    const bad = await rpc("nga_at_nope", "ping");
    expect(bad.status).toBe(401);
    expect(bad.headers["www-authenticate"]).toContain('error="invalid_token"');
  });
});

describe("dynamic client registration", () => {
  it("accepts https and localhost redirect URIs only", async () => {
    expect((await request(app).post("/oauth/register").send({ redirect_uris: ["http://evil.example/cb"] })).status).toBe(400);
    expect((await request(app).post("/oauth/register").send({ redirect_uris: ["https://a.example/cb#frag"] })).status).toBe(400);
    expect((await request(app).post("/oauth/register").send({})).status).toBe(400);
    const local = await request(app).post("/oauth/register").send({ client_name: "Desktop", redirect_uris: ["http://127.0.0.1:33418/callback"] });
    expect(local.status).toBe(201);
    expect(local.body.client_secret).toBeUndefined();
    expect(local.body.token_endpoint_auth_method).toBe("none");
  });

  it("is rate limited", async () => {
    let limited = false;
    for (let i = 0; i < 15 && !limited; i++) {
      const r = await request(app).post("/oauth/register").set("X-Test-Rate-Limit", "1").send({ redirect_uris: [REDIRECT] });
      limited = r.status === 429;
    }
    expect(limited).toBe(true);
  });
});

describe("authorization code + PKCE", () => {
  it("issues tokens for the right verifier only, once", async () => {
    const id = await teacher();
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const code = await authorizeCode(id, clientId, { challenge });
    const wrong = await request(app).post("/oauth/token").type("form").send({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: pkce().verifier });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("invalid_grant");
    // The code was spent by the failed attempt too: one try per code.
    const again = await request(app).post("/oauth/token").type("form").send({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
    expect(again.status).toBe(400);

    const code2 = await authorizeCode(id, clientId, { challenge });
    const ok = await request(app).post("/oauth/token").type("form").send({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "nga.read nga.drafts" });
    expect(ok.body.access_token).toMatch(/^nga_at_/);
    // Only hashes are stored.
    const [rows]: any = await db.execute(sql`SELECT token_hash FROM OAuthToken WHERE user_id = ${id}`);
    expect(rows.length).toBe(2);
    expect(rows.every((r: any) => r.token_hash !== ok.body.access_token && r.token_hash.length === 64)).toBe(true);
  });

  it("requires PKCE S256 and a registered redirect URI", async () => {
    const clientId = await register();
    const plain = await request(app).get("/oauth/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: "x".repeat(43), code_challenge_method: "plain", state: "s" });
    expect(plain.status).toBe(302);
    expect(new URL(plain.headers.location).searchParams.get("error")).toBe("invalid_request");
    const other = await request(app).get("/oauth/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: "https://evil.example/cb", code_challenge: pkce().challenge, code_challenge_method: "S256" });
    expect(other.status).toBe(400);
  });

  it("sends a declined consent back as access_denied", async () => {
    const id = await teacher();
    const clientId = await register();
    const a = await request(app).get("/oauth/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256", state: "s1" });
    const req = new URL(a.headers.location).searchParams.get("request")!;
    const details = await request(app).get("/oauth/consent").query({ request: req }).set(auth(id));
    expect(details.status).toBe(200);
    expect(details.body.data).toMatchObject({ client: { name: "Claude", redirectHost: "claude.ai" }, pupilNamesOption: true });
    const deny = await request(app).post("/oauth/consent").set(auth(id)).send({ request: req, decision: "deny" });
    expect(new URL(deny.body.data.redirectTo).searchParams.get("error")).toBe("access_denied");
  });
});

describe("refresh tokens", () => {
  it("rotate, and a replayed refresh token ends the whole chain", async () => {
    const id = await teacher();
    const first = await connect(id);
    const r1 = await request(app).post("/oauth/token").type("form").send({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: first.clientId });
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    expect(r1.body.refresh_token).not.toBe(first.refresh_token);
    expect((await rpc(r1.body.access_token, "ping")).status).toBe(200);

    const replay = await request(app).post("/oauth/token").type("form").send({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: first.clientId });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    // The chain is revoked: the rotated tokens stop working too.
    expect((await rpc(r1.body.access_token, "ping")).status).toBe(401);
    const r2 = await request(app).post("/oauth/token").type("form").send({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: first.clientId });
    expect(r2.status).toBe(400);
  });
});

describe("who may connect", () => {
  it("is refused while the school's connector or AI is off", async () => {
    const id = await teacher();
    const t = await connect(id);
    setAiPolicyForTests({ enabled: true });
    const off = await rpc(t.access_token, "tools/list");
    expect(off.status).toBe(403);
    expect(off.body.error.data.code).toBe("CONNECTOR_OFF");
    setAiPolicyForTests({ ...ON, enabled: false });
    const aiOff = await rpc(t.access_token, "tools/list");
    expect(aiOff.status).toBe(403);
    expect(aiOff.body.error.data.code).toBe("AI_DISABLED");

    // The consent page says the same before anything is issued.
    const clientId = await register();
    const a = await request(app).get("/oauth/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256" });
    const req = new URL(a.headers.location).searchParams.get("request")!;
    const page = await request(app).get("/oauth/consent").query({ request: req }).set(auth(id));
    expect(page.status).toBe(403);
    expect(page.body.code).toBe("AI_DISABLED");
  });

  it("refuses people without AI_EXTERNAL_CONNECT, and students", async () => {
    const noCap = await teacher(["AI_USE"]);
    const student = await teacher(CAPS, "STUDENT");
    const clientId = await register();
    const a = await request(app).get("/oauth/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256" });
    const req = new URL(a.headers.location).searchParams.get("request")!;
    for (const id of [noCap, student]) {
      const page = await request(app).get("/oauth/consent").query({ request: req }).set(auth(id));
      expect(page.status).toBe(403);
      expect(page.body.code).toBe("NOT_ALLOWED");
      const allow = await request(app).post("/oauth/consent").set(auth(id)).send({ request: req, decision: "allow" });
      expect(allow.status).toBe(403);
      // Even a token that somehow exists is refused at /mcp.
      const t = await issueTokens({ clientId, userId: id, scope: "nga.read", resource: RESOURCE, familyId: crypto.randomBytes(16).toString("hex"), tokenVersion: 0 });
      const r = await rpc(t.accessToken, "tools/list");
      expect(r.status).toBe(403);
      expect(r.body.error.data.code).toBe("NOT_ALLOWED");
    }
  });

  it("deactivating the account revokes every connector token", async () => {
    const id = await teacher();
    const t = await connect(id);
    const admin = await teacher(["MANAGE_USERS"]);
    const res = await request(app).put(`/users/${id}/disable`).set(auth(admin));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [rows]: any = await db.execute(sql`SELECT COUNT(*) AS n FROM OAuthToken WHERE user_id = ${id} AND revoked_at IS NULL`);
    expect(Number(rows[0].n)).toBe(0);
    expect((await rpc(t.access_token, "ping")).status).toBe(401);
    const r = await request(app).post("/oauth/token").type("form").send({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId });
    expect(r.status).toBe(400);
  });
});

describe("the MCP server", () => {
  it("negotiates the protocol version", async () => {
    const id = await teacher();
    const t = await connect(id);
    const init = await rpc(t.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "nga" } });
    const future = await rpc(t.access_token, "initialize", { protocolVersion: "2099-01-01" });
    expect(future.body.result.protocolVersion).toBe("2025-11-25");
    const note = await request(app).post("/mcp").set("Authorization", `Bearer ${t.access_token}`).send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    expect((await rpc(t.access_token, "nope/nope")).body.error.code).toBe(-32601);
    expect((await request(app).get("/mcp")).status).toBe(405);
  });

  it("lists the MIS tools and the apps' tools, drafts only with the drafts scope", async () => {
    const id = await teacher();
    const t = await connect(id);
    const r = await rpc(t.access_token, "tools/list");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const names = r.body.result.tools.map((x: any) => x.name);
    for (const n of ["mis_get_my_timetable", "mis_list_my_subjects", "mis_get_scheme_of_work", "mis_list_my_lesson_notes", "mis_get_competences", "mis_create_lesson_note_draft", "mis_propose_scheme_week", "tm_list_my_courses", "tm_draft_rubric"]) {
      expect(names).toContain(n);
    }
    expect(names.filter((n: string) => n === "mis_get_my_timetable")).toHaveLength(1);
    expect(r.body.result.tools.find((x: any) => x.name === "mis_list_my_subjects").annotations.readOnlyHint).toBe(true);

    const readOnly = await teacher();
    const ro = await connect(readOnly, { scope: "nga.read" });
    expect(ro.scope).toBe("nga.read");
    const roNames = (await rpc(ro.access_token, "tools/list")).body.result.tools.map((x: any) => x.name);
    expect(roNames).toContain("tm_list_my_courses");
    expect(roNames).not.toContain("tm_draft_rubric");
    expect(roNames).not.toContain("mis_create_lesson_note_draft");
    const refused = await rpc(ro.access_token, "tools/call", { name: "mis_create_lesson_note_draft", arguments: {} });
    expect(refused.body.result.isError).toBe(true);
  });

  it("runs a MIS read tool and a MIS draft tool, and audits both", async () => {
    const id = await teacher();
    const { subjectId, classGroupId } = await teaching(id);
    const t = await connect(id);

    const subjects = await rpc(t.access_token, "tools/call", { name: "mis_list_my_subjects", arguments: {} });
    expect(subjects.status).toBe(200);
    expect(subjects.body.result.isError).toBe(false);
    expect(subjects.body.result.structuredContent.result.subjects).toEqual([expect.objectContaining({ subject_id: subjectId, class_group_id: classGroupId })]);
    expect(subjects.body.result.content[0].text).toContain("Open in NGA: https://mis.mcp.test/scheme-of-work");

    const draft = await rpc(t.access_token, "tools/call", {
      name: "mis_create_lesson_note_draft",
      arguments: { subject_id: subjectId, class_group_id: classGroupId, title: "Loops", content: "## Loops\n\n- for\n- while\n\n```js\nfor (;;) {}\n```" },
    });
    expect(draft.body.result.isError, JSON.stringify(draft.body)).toBe(false);
    const noteId = draft.body.result.structuredContent.result.note_id;
    expect(draft.body.result.structuredContent.openUrl).toBe(`${FRONT}/lesson-notes/${noteId}`);
    const [notes]: any = await db.execute(sql`SELECT status, user_id, content_html FROM LessonNote WHERE note_id = ${noteId}`);
    expect(notes[0]).toMatchObject({ status: "DRAFT", user_id: id });
    expect(notes[0].content_html).toContain("<h2>Loops</h2>");
    expect(notes[0].content_html).toContain("<li>");

    // Another teacher's subject is refused (no wider access than in the MIS).
    const other = await createSubject();
    const refused = await rpc(t.access_token, "tools/call", { name: "mis_create_lesson_note_draft", arguments: { subject_id: other, title: "x", content: "y" } });
    expect(refused.body.result.isError).toBe(true);

    // Proposing a scheme week writes nothing.
    const week = await rpc(t.access_token, "tools/call", { name: "mis_propose_scheme_week", arguments: { subject_id: subjectId, class_group_id: classGroupId, topic: "Loops", objective: "Use loops" } });
    expect(week.body.result.structuredContent.result).toMatchObject({ saved: false, proposed_week: { topic: "Loops" } });

    const [audit]: any = await db.execute(sql`SELECT tool_name, ok, error_code, client_id FROM McpAuditLog WHERE user_id = ${id} ORDER BY audit_id`);
    expect(audit.map((a: any) => [a.tool_name, a.ok])).toEqual([
      ["mis_list_my_subjects", 1],
      ["mis_create_lesson_note_draft", 1],
      ["mis_create_lesson_note_draft", 0],
      ["mis_propose_scheme_week", 1],
    ]);
    expect(audit[2].error_code).toBe("TOOL_FORBIDDEN");
    expect(audit.every((a: any) => a.client_id === t.clientId)).toBe(true);
  });

  it("relays app tools with the person's MIS identity and forwards pupil-name consent", async () => {
    const without = await teacher();
    const t1 = await connect(without);
    const r1 = await rpc(t1.access_token, "tools/call", { name: "tm_list_my_courses", arguments: { limit: 5 } });
    expect(r1.body.result.isError, JSON.stringify(r1.body)).toBe(false);
    expect(r1.body.result.structuredContent).toMatchObject({ summary: "1 course.", openUrl: "https://tm.mcp.test/courses" });
    const c1 = appCalls.find((c) => c.userId === without)!;
    expect(c1.body).toEqual({ name: "tm_list_my_courses", arguments: { limit: 5 }, consent: { pupilNames: false } });

    const withNames = await teacher();
    const t2 = await connect(withNames, { pupilNames: true });
    expect(t2.scope).toBe("nga.read nga.drafts pupil_names");
    await rpc(t2.access_token, "tools/call", { name: "tm_list_my_courses", arguments: {} });
    expect(appCalls.find((c) => c.userId === withNames)!.body.consent).toEqual({ pupilNames: true });

    // The school saying "never" wins over an earlier consent.
    setAiPolicyForTests({ ...ON, external: { connector: true, handoff: false, pupilNames: "never" } } as unknown as Partial<AiPolicy>);
    await rpc(t2.access_token, "tools/call", { name: "tm_list_my_courses", arguments: {} });
    expect(appCalls.filter((c) => c.userId === withNames).at(-1)!.body.consent).toEqual({ pupilNames: false });
  });
});

describe("My AI: connected apps", () => {
  it("lists my connections and revokes one", async () => {
    const id = await teacher();
    const t = await connect(id);
    const list = await request(app).get("/my-ai/connections").set(auth(id));
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ available: true, connectorUrl: RESOURCE });
    expect(list.body.data.connections).toEqual([expect.objectContaining({ clientId: t.clientId, name: "Claude", scopes: ["nga.read", "nga.drafts"] })]);

    const del = await request(app).delete(`/my-ai/connections/${t.clientId}`).set(auth(id));
    expect(del.status).toBe(200);
    expect((await rpc(t.access_token, "ping")).status).toBe(401);
    expect((await request(app).get("/my-ai/connections").set(auth(id))).body.data.connections).toEqual([]);
  });
});
