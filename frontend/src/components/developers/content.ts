import type { Group } from "./types";

/**
 * The developer documentation, as data. Sources of truth (keep them in step):
 *   SSO_CLIENT_INTEGRATION.md, API_DOCS.md, docs/SINGLE_SIGN_OUT.md,
 *   docs/REMINDER_HUB.md, packages/tenancy/CONTRACT.md
 * and the code they describe: routes/ssoRoutes.ts, routes/integrationRoutes.ts,
 * middleware/serviceAuth.ts, routes/reminders.ts.
 *
 * Placeholders in samples ({{BASE}}, {{LOGIN}}, {{CLIENT_ID}}, {{REDIRECT_URI}},
 * {{TENANT}}) are filled with the reader's values.
 */

const EXCHANGE_RESPONSE = `{
  "success": true,
  "message": "Token generated successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "user_id": 1203,
      "username": "a.teacher",
      "email": "a.teacher@school.example",
      "status": "ACTIVE",
      "preferred_theme": "light"
    },
    "permissions": ["VIEW_DASHBOARD", "VIEW_SUBJECTS"],
    "access_version": 14,
    "tenant": {
      "tid": 1,
      "slug": "nga",
      "name": "New Generation Academy",
      "status": "ACTIVE",
      "isPrimary": true,
      "timezone": "Africa/Kigali",
      "pkg": "standard"
    }
  }
}`;

export const GROUPS: Group[] = [
  {
    title: "Get started",
    sections: [
      {
        id: "overview",
        title: "Overview",
        lead: "Connect your app to Amashuri: one sign-in, the school's people and classes, and reminders.",
        keywords: "introduction start what can I build",
        blocks: [
          {
            kind: "p",
            text: "Amashuri is the school's system of record. Your app does not keep its own passwords or its own copy of the class lists: it asks Amashuri who the person is, and reads the school's data from one API.",
          },
          {
            kind: "table",
            head: ["You want to", "Use", "Credential"],
            rows: [
              ["Let people sign in with their school account", "[Single sign-on](#sso-flow)", "Client ID and secret"],
              ["Sign people out when they sign out of Amashuri", "[Single sign-out](#sign-out)", "Amashuri's public keys"],
              ["Read users, classes, subjects and timetables", "[Data sync](#sync)", "Client credentials or an integration token"],
              ["Report a quiz result or a finished activity", "[Learning events](#learning-events)", "Integration token"],
              ["Remind people about a deadline or a meeting", "[Reminders](#reminders)", "Client credentials or an integration token"],
            ],
          },
          {
            kind: "steps",
            steps: [
              { title: "Register your app", text: "A platform administrator adds it under **Systems** and gives you a client ID and a client secret." },
              { title: "Add sign-in", text: "Send people to the Amashuri sign-in page, then exchange the code you get back for a token." },
              { title: "Read the school's data", text: "Call `/integrations/ping` to test your credentials, then pull people and classes." },
            ],
          },
        ],
      },
      {
        id: "conventions",
        title: "Base URL and format",
        lead: "One API host, JSON in and out, the same envelope on every response.",
        keywords: "base url host envelope json response format prefix",
        blocks: [
          {
            kind: "table",
            head: ["Environment", "API", "Sign-in page"],
            rows: [
              ["Production", "`https://api.amashuri.com`", "`https://mis.amashuri.com/login`"],
              ["Local development", "`http://localhost:3000`", "`http://localhost:5173/login`"],
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "The API and the web app are different hosts",
            text: "Routes start at the root of the API host: `/sso/token`, `/users/me`. There is no `/api` or `/api/v1` prefix. The web app host (`mis.amashuri.com`) answers every path with its HTML page, so an API call sent there fails as a JSON parse error, not a 404.",
          },
          { kind: "p", text: "Send request bodies as JSON with `Content-Type: application/json`. Every successful response has the same shape:" },
          {
            kind: "code",
            title: "Success",
            samples: [{ lang: "json", code: `{\n  "success": true,\n  "message": "Operation successful",\n  "data": { }\n}` }],
          },
          { kind: "p", text: "A failed call has `success: false`. Read the HTTP status first, then `code` when there is one. See [Errors](#errors) for both error shapes." },
        ],
      },
      {
        id: "authentication",
        title: "Authentication",
        lead: "Three credentials. Which one you send depends on who is calling: a person, or your server.",
        keywords: "bearer basic token jwt client secret integration token ngamis authorization header",
        blocks: [
          {
            kind: "table",
            head: ["Credential", "Header", "Stands for", "Use it for"],
            rows: [
              ["User token", "`Authorization: Bearer <jwt>`", "One signed-in person, for 24 hours", "`/users/me`, `/auth/verify` and any call made for that person"],
              ["Client credentials", "`Authorization: Basic base64(client_id:client_secret)`", "Your registered app", "`/sso/token` (in the body), `/integrations/*`, `/reminders/sources`"],
              ["Integration token", "`Authorization: Bearer ngamis_<64 hex>`", "A sync job, with its own scopes", "`/integrations/*`, `/reminders/sources`"],
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Keep secrets on your server",
            text: "The client secret and integration tokens must never reach a browser or a mobile app. Only the client ID is public.",
          },
          {
            kind: "p",
            text: "An integration token is the more precise choice for a sync job: it can expire, it is revoked on its own, it carries only the scopes you chose, and it records when it was last used. A platform administrator creates one under **Systems → Integration tokens**. The value is shown once.",
          },
          {
            kind: "table",
            head: ["Scope", "Allows"],
            rows: [
              ["`sync:read`", "`/integrations/ping` and every `/integrations/sync/*` read"],
              ["`learning-events:write`", "`POST /integrations/learning-events`"],
              ["`reminders:write`", "`PUT` and `DELETE /reminders/sources`"],
              ["`tenants:read`", "`GET /platform/tenants/active`"],
            ],
          },
          {
            kind: "code",
            title: "The three headers",
            samples: [
              {
                lang: "http",
                code: `# A person (token from POST /sso/token)\nAuthorization: Bearer eyJhbGciOiJIUzI1NiIs...\n\n# Your app (client credentials)\nAuthorization: Basic dGFza21lbnRvcl9hcHA6czNjcjN0\nX-NGA-Tenant: {{TENANT}}\n\n# A sync job (integration token)\nAuthorization: Bearer ngamis_4f1c...9ab2\nX-NGA-Tenant: {{TENANT}}`,
              },
            ],
          },
        ],
      },
      {
        id: "schools",
        title: "Schools",
        lead: "Amashuri serves many schools. Each school has a number, and every call is made for one school.",
        keywords: "tenant tenancy multi school X-NGA-Tenant tid header",
        blocks: [
          {
            kind: "p",
            text: "A school is identified by `tid`, a positive integer. Each school's data is kept apart, so the same user ID can belong to different people in two schools. Always store `tid` next to any Amashuri ID you keep.",
          },
          {
            kind: "list",
            items: [
              "**Calls with a user token** need nothing extra. The token names the school (`tid` claim), and the response includes a `tenant` block.",
              "**Calls without a person** (client credentials or an integration token) send `X-NGA-Tenant: <tid>`.",
              "Your app must be **enabled for that school**. If it is not, the call is refused with `SYSTEM_NOT_ASSIGNED`.",
              "An integration token belongs to one school. Using it for another school returns `TENANT_MISMATCH`.",
            ],
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "tenants-active",
              method: "GET",
              path: "/platform/tenants/active",
              summary: "List schools",
              auth: "Client credentials, or an integration token with `tenants:read`",
              description: "Every school and its status. Filter on your side: only `ACTIVE` and `GRACE` schools are usable.",
              samples: [
                { lang: "curl", code: `curl {{BASE}}/platform/tenants/active \\\n  -u "{{CLIENT_ID}}:$CLIENT_SECRET" \\\n  -H "X-NGA-Tenant: {{TENANT}}"` },
                {
                  lang: "node",
                  code: `const basic = Buffer.from("{{CLIENT_ID}}:" + process.env.CLIENT_SECRET).toString("base64");\n\nconst res = await fetch("{{BASE}}/platform/tenants/active", {\n  headers: { Authorization: "Basic " + basic, "X-NGA-Tenant": "{{TENANT}}" },\n});\nconst { tenants } = await res.json();\nconst usable = tenants.filter((t) => ["ACTIVE", "GRACE"].includes(t.status));`,
                },
                {
                  lang: "python",
                  code: `import os, requests\n\nres = requests.get(\n    "{{BASE}}/platform/tenants/active",\n    auth=("{{CLIENT_ID}}", os.environ["CLIENT_SECRET"]),\n    headers={"X-NGA-Tenant": "{{TENANT}}"},\n    timeout=15,\n)\nusable = [t for t in res.json()["tenants"] if t["status"] in ("ACTIVE", "GRACE")]`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/platform/tenants/active");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_USERPWD => "{{CLIENT_ID}}:" . getenv("CLIENT_SECRET"),
    CURLOPT_HTTPHEADER => ["X-NGA-Tenant: {{TENANT}}"],
]);
$tenants = json_decode(curl_exec($ch), true)["tenants"];
$usable = array_filter($tenants, fn($t) => in_array($t["status"], ["ACTIVE", "GRACE"]));
curl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "tenants": [\n    {\n      "tid": 1,\n      "slug": "nga",\n      "name": "New Generation Academy",\n      "status": "ACTIVE",\n      "isPrimary": true,\n      "timezone": "Africa/Kigali",\n      "pkg": "standard"\n    }\n  ]\n}`,
              },
            },
          },
        ],
      },
    ],
  },
  {
    title: "Single sign-on",
    sections: [
      {
        id: "sso-flow",
        title: "How sign-in works",
        lead: "The OAuth 2 authorization code flow. The person signs in on Amashuri, and your server swaps a one-time code for a token.",
        keywords: "oauth authorization code flow login sso sign in with amashuri",
        blocks: [
          {
            kind: "steps",
            steps: [
              { title: "Redirect", text: "Your app sends the person to the Amashuri sign-in page with your `client_id` and `redirect_uri`." },
              { title: "Sign in", text: "The person signs in with their school account. If they are already signed in, this step is skipped." },
              { title: "Code", text: "Amashuri sends the browser back to your `redirect_uri` with `?code=...&state=...`. The code works once and lasts 5 minutes." },
              { title: "Exchange", text: "Your server sends the code with your client secret to `POST /sso/token` and receives a token, the user and their permissions." },
              { title: "Profile", text: "Your server calls `GET /users/me` with the token to load the full profile, roles and classes." },
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Before you start",
            text: "Ask a platform administrator to register your app under **Systems**. You need the client ID, the client secret, and your callback address on the list of allowed redirect addresses.",
          },
          {
            kind: "code",
            title: "Settings",
            samples: [
              {
                lang: "env",
                label: "Server .env",
                code: `# API host, used for the token exchange\nAMASHURI_API_URL={{BASE}}\nSSO_CLIENT_ID={{CLIENT_ID}}\n# Never send this to a browser\nSSO_CLIENT_SECRET=your_client_secret`,
              },
              {
                lang: "env",
                label: "Browser .env",
                code: `# Sign-in page, where people are sent\nVITE_AMASHURI_LOGIN_URL={{LOGIN}}\nVITE_SSO_CLIENT_ID={{CLIENT_ID}}`,
              },
            ],
          },
        ],
      },
      {
        id: "sso-redirect",
        title: "1. Send the person to sign in",
        lead: "Build the sign-in address and redirect the browser.",
        keywords: "redirect login url state csrf redirect_uri",
        blocks: [
          {
            kind: "table",
            head: ["Parameter", "Required", "Meaning"],
            rows: [
              ["`client_id`", "Yes", "Your app's client ID."],
              ["`redirect_uri`", "Yes", "Where to send the person back. It must match a registered address exactly."],
              ["`state`", "Recommended", "A random value you create. It comes back unchanged, so you can check the answer belongs to the request you made."],
            ],
          },
          {
            kind: "code",
            title: "Start sign-in",
            samples: [
              {
                lang: "browser",
                label: "JavaScript",
                code: `function signInWithAmashuri() {\n  const state = crypto.randomUUID();\n  sessionStorage.setItem("sso_state", state);\n\n  const url = new URL("{{LOGIN}}");\n  url.searchParams.set("client_id", "{{CLIENT_ID}}");\n  url.searchParams.set("redirect_uri", "{{REDIRECT_URI}}");\n  url.searchParams.set("state", state);\n\n  window.location.assign(url);\n}`,
              },
              {
                lang: "text",
                label: "URL",
                code: `{{LOGIN}}\n  ?client_id={{CLIENT_ID}}\n  &redirect_uri={{REDIRECT_URI}}\n  &state=9f2c1e7a`,
              },
            ],
          },
          {
            kind: "note",
            tone: "warn",
            title: "Redirect addresses are matched exactly",
            text: "Only a trailing slash is ignored. Registering `http://localhost:4000` does not allow `http://localhost:4000/sso/callback`: register the full callback address. In local development, use a port other than 5173, which the Amashuri web app uses.",
          },
        ],
      },
      {
        id: "sso-callback",
        title: "2. Handle the callback",
        lead: "Read the code from the address, check the state, and pass the code to your server once.",
        keywords: "callback code state react strict mode",
        blocks: [
          {
            kind: "code",
            title: "Callback page",
            samples: [
              {
                lang: "browser",
                label: "React",
                code: `import { useEffect, useRef } from "react";\n\nexport default function SsoCallback() {\n  const sent = useRef(false);\n\n  useEffect(() => {\n    if (sent.current) return; // the code works once: never send it twice\n    sent.current = true;\n\n    const params = new URLSearchParams(window.location.search);\n    const code = params.get("code");\n    const state = params.get("state");\n\n    if (!code || state !== sessionStorage.getItem("sso_state")) {\n      window.location.replace("/login?error=sso");\n      return;\n    }\n    sessionStorage.removeItem("sso_state");\n\n    fetch("/api/auth/sso", {\n      method: "POST",\n      headers: { "Content-Type": "application/json" },\n      credentials: "include",\n      body: JSON.stringify({ code }),\n    }).then((res) => window.location.replace(res.ok ? "/" : "/login?error=sso"));\n  }, []);\n\n  return <p>Signing you in…</p>;\n}`,
              },
              {
                lang: "browser",
                label: "JavaScript",
                code: `const params = new URLSearchParams(window.location.search);\nconst code = params.get("code");\nconst state = params.get("state");\n\nif (!code || state !== sessionStorage.getItem("sso_state")) {\n  window.location.replace("/login?error=sso");\n} else {\n  sessionStorage.removeItem("sso_state");\n  const res = await fetch("/api/auth/sso", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    credentials: "include",\n    body: JSON.stringify({ code }),\n  });\n  window.location.replace(res.ok ? "/" : "/login?error=sso");\n}`,
              },
            ],
          },
        ],
      },
      {
        id: "sso-token",
        title: "3. Exchange the code",
        lead: "From your server, swap the code for a token. This is the only call that uses the client secret in the body.",
        keywords: "token exchange client_secret server",
        blocks: [
          {
            kind: "endpoint",
            endpoint: {
              id: "post-sso-token",
              method: "POST",
              path: "/sso/token",
              summary: "Exchange an authorization code for a token",
              auth: "Client ID and secret, in the body",
              description:
                "Returns a token valid for 24 hours, the user, their permissions and their school. The answer is small on purpose: call `GET /users/me` next for the profile, roles and classes.",
              params: [
                { name: "code", in: "body", type: "string", required: true, description: "The code from the callback. Single use, valid for 5 minutes." },
                { name: "client_id", in: "body", type: "string", required: true, description: "Your app's client ID." },
                { name: "client_secret", in: "body", type: "string", required: true, description: "Your app's client secret." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -X POST {{BASE}}/sso/token \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"code\\": \\"$CODE\\", \\"client_id\\": \\"{{CLIENT_ID}}\\", \\"client_secret\\": \\"$CLIENT_SECRET\\"}"`,
                },
                {
                  lang: "node",
                  code: `// Express route your callback page posts to\napp.post("/api/auth/sso", async (req, res) => {\n  const exchange = await fetch("{{BASE}}/sso/token", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({\n      code: req.body.code,\n      client_id: process.env.SSO_CLIENT_ID,\n      client_secret: process.env.SSO_CLIENT_SECRET,\n    }),\n  });\n  if (!exchange.ok) return res.status(401).json({ error: "Sign-in failed" });\n\n  const { data } = await exchange.json();\n  const { token, user, permissions, tenant } = data;\n\n  // Create your own session. Keep the Amashuri token on the server.\n  req.session.user = { id: user.user_id, tid: tenant.tid, permissions };\n  req.session.amashuriToken = token;\n  res.json({ ok: true });\n});`,
                },
                {
                  lang: "python",
                  code: `import os, requests\n\ndef exchange_code(code: str) -> dict:\n    res = requests.post(\n        "{{BASE}}/sso/token",\n        json={\n            "code": code,\n            "client_id": os.environ["SSO_CLIENT_ID"],\n            "client_secret": os.environ["SSO_CLIENT_SECRET"],\n        },\n        timeout=15,\n    )\n    res.raise_for_status()\n    data = res.json()["data"]\n    # data["token"], data["user"], data["permissions"], data["tenant"]\n    return data`,
                },
                {
                  lang: "php",
                  code: `<?php\nfunction exchangeCode(string $code): array {\n    $ch = curl_init("{{BASE}}/sso/token");\n    curl_setopt_array($ch, [\n        CURLOPT_POST => true,\n        CURLOPT_RETURNTRANSFER => true,\n        CURLOPT_TIMEOUT => 15,\n        CURLOPT_HTTPHEADER => ["Content-Type: application/json"],\n        CURLOPT_POSTFIELDS => json_encode([\n            "code" => $code,\n            "client_id" => getenv("SSO_CLIENT_ID"),\n            "client_secret" => getenv("SSO_CLIENT_SECRET"),\n        ]),\n    ]);\n    $body = json_decode(curl_exec($ch), true);\n    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\n    curl_close($ch);\n\n    if ($status !== 200) throw new RuntimeException("Sign-in failed");\n    return $body["data"]; // token, user, permissions, tenant\n}`,
                },
              ],
              response: { status: 200, body: EXCHANGE_RESPONSE },
              errors: [
                { status: 400, meaning: "`code`, `client_id` or `client_secret` is missing." },
                { status: 401, meaning: "Invalid client credentials: wrong ID or secret, or the app is disabled or not enabled for that school." },
                { status: 401, meaning: "Invalid or already used authorization code. A code works once." },
                { status: 401, meaning: "Authorization code expired (after 5 minutes)." },
                { status: 401, meaning: "User account is not active." },
                { status: 403, code: "TENANT_SUSPENDED", meaning: "The person's school is suspended or archived." },
              ],
            },
          },
        ],
      },
      {
        id: "sso-profile",
        title: "4. Load the profile",
        lead: "Use the token to read who the person is, what they may do and where they belong.",
        keywords: "users me profile roles permissions grades programs",
        blocks: [
          {
            kind: "endpoint",
            endpoint: {
              id: "get-users-me",
              method: "GET",
              path: "/users/me",
              summary: "The signed-in person",
              auth: "User token",
              description:
                "Profile, roles with their permissions, assigned programs and grades, the current academic year and terms, the apps the person can open, and their school. If this call fails, keep the `user` and `permissions` from the exchange and try again later. Do not fail the sign-in.",
              samples: [
                { lang: "curl", code: `curl {{BASE}}/users/me \\\n  -H "Authorization: Bearer $TOKEN"` },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/users/me", {\n  headers: { Authorization: "Bearer " + token },\n});\nconst { data } = await res.json();\nconst { user, profile, roles, permissions, assignedPrograms, assignedGrades, tenant } = data;`,
                },
                {
                  lang: "python",
                  code: `res = requests.get(\n    "{{BASE}}/users/me",\n    headers={"Authorization": f"Bearer {token}"},\n    timeout=15,\n)\nme = res.json()["data"]\nroles = [r["name"] for r in me["roles"]]`,
                },
                {
                  lang: "php",
                  code: `<?php\n$ch = curl_init("{{BASE}}/users/me");\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $token],\n]);\n$me = json_decode(curl_exec($ch), true)["data"];\ncurl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "User profile retrieved successfully",\n  "data": {\n    "user": { "user_id": 1203, "username": "a.teacher", "status": "ACTIVE" },\n    "profile": { "first_name": "Aline", "last_name": "Teacher" },\n    "roles": [{ "role_id": 4, "name": "TEACHER", "permissions": [{ "perm_id": 12, "name": "VIEW_SUBJECTS" }] }],\n    "permissions": ["VIEW_DASHBOARD", "VIEW_SUBJECTS"],\n    "assignedPrograms": [],\n    "assignedGrades": [],\n    "currentAcademicYear": { "academic_year_id": 3, "name": "2026-2027" },\n    "currentAcademicTerms": [],\n    "systems": [],\n    "tenant": { "tid": 1, "slug": "nga", "status": "ACTIVE" }\n  }\n}`,
              },
              errors: [{ status: 401, meaning: "The token is missing, expired, or the person signed out." }],
            },
          },
        ],
      },
      {
        id: "sso-session",
        title: "5. Keep the session in step",
        lead: "Check that the Amashuri session still exists, so your app follows a sign-out or a deactivated account.",
        keywords: "verify session poll token valid session ended",
        blocks: [
          {
            kind: "p",
            text: "The token is signed with a key only Amashuri holds, so you cannot check it yourself. Ask the API. Check when your app loads, when its window gets focus, and about once a minute.",
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-auth-verify",
              method: "GET",
              path: "/auth/verify",
              summary: "Is this token still valid?",
              auth: "User token",
              description: "A light call made for polling. `access_version` changes when the person's permissions change: when it moves, load `/users/me` again.",
              samples: [
                { lang: "curl", code: `curl {{BASE}}/auth/verify \\\n  -H "Authorization: Bearer $TOKEN"` },
                {
                  lang: "node",
                  code: `async function stillSignedIn(token) {\n  let res;\n  try {\n    res = await fetch("{{BASE}}/auth/verify", {\n      headers: { Authorization: "Bearer " + token },\n      signal: AbortSignal.timeout(8000),\n    });\n  } catch {\n    return true; // network problem: not a sign-out\n  }\n  if (res.status === 401) return false; // the session ended\n  return true; // 5xx: Amashuri is busy, keep the session\n}`,
                },
                {
                  lang: "python",
                  code: `def still_signed_in(token: str) -> bool:\n    try:\n        res = requests.get(\n            "{{BASE}}/auth/verify",\n            headers={"Authorization": f"Bearer {token}"},\n            timeout=8,\n        )\n    except requests.RequestException:\n        return True  # network problem: not a sign-out\n    return res.status_code != 401`,
                },
                {
                  lang: "php",
                  code: `<?php
function stillSignedIn(string $token): bool {
    $ch = curl_init("{{BASE}}/auth/verify");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $token],
    ]);
    curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Only a 401 means the session ended. 0 (network) or 5xx: keep the session.
    return $status !== 401;
}`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Token valid",\n  "data": {\n    "userId": 1203,\n    "access_version": 14,\n    "tenant": { "tid": 1, "slug": "nga", "status": "ACTIVE" }\n  }\n}`,
              },
              errors: [{ status: 401, meaning: "The session ended. Sign the person out of your app." }],
            },
          },
          {
            kind: "note",
            tone: "warn",
            title: "Only a 401 means signed out",
            text: "A timeout or a 5xx answer says nothing about the person. Keep their session and check again.",
          },
        ],
      },
      {
        id: "sso-authorize",
        title: "Get a code without the sign-in page",
        lead: "For a page that already holds an Amashuri session, such as an app launcher.",
        keywords: "authorize code launcher apps menu",
        blocks: [
          {
            kind: "endpoint",
            endpoint: {
              id: "get-sso-authorize",
              method: "GET",
              path: "/sso/authorize",
              summary: "Create an authorization code",
              auth: "User token, or the Amashuri session cookie",
              description: "Returns a code for the signed-in person and the app named by `client_id`. Add it to the app's redirect address as `?code=`. The sign-in page calls this for you in the normal flow.",
              params: [
                { name: "client_id", in: "query", type: "string", required: true, description: "The app to open." },
                { name: "redirect_uri", in: "query", type: "string", required: true, description: "One of that app's registered addresses." },
                { name: "response_type", in: "query", type: "string", description: "Only `code` is supported." },
                { name: "state", in: "query", type: "string", description: "Returned unchanged." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -G {{BASE}}/sso/authorize \\\n  -H "Authorization: Bearer $TOKEN" \\\n  --data-urlencode "client_id={{CLIENT_ID}}" \\\n  --data-urlencode "redirect_uri={{REDIRECT_URI}}" \\\n  --data-urlencode "state=9f2c1e7a"`,
                },
                {
                  lang: "node",
                  code: `const query = new URLSearchParams({\n  client_id: "{{CLIENT_ID}}",\n  redirect_uri: "{{REDIRECT_URI}}",\n  state,\n});\nconst res = await fetch("{{BASE}}/sso/authorize?" + query, {\n  headers: { Authorization: "Bearer " + token },\n});\nconst { data } = await res.json();\n\nconst target = new URL("{{REDIRECT_URI}}");\ntarget.searchParams.set("code", data.code);\ntarget.searchParams.set("state", data.state);`,
                },
                {
                  lang: "python",
                  code: `from urllib.parse import urlencode

res = requests.get(
    "{{BASE}}/sso/authorize",
    params={
        "client_id": "{{CLIENT_ID}}",
        "redirect_uri": "{{REDIRECT_URI}}",
        "state": state,
    },
    headers={"Authorization": f"Bearer {token}"},
    timeout=15,
)
data = res.json()["data"]
target = "{{REDIRECT_URI}}?" + urlencode({"code": data["code"], "state": data["state"]})`,
                },
                {
                  lang: "php",
                  code: `<?php
$query = http_build_query([
    "client_id" => "{{CLIENT_ID}}",
    "redirect_uri" => "{{REDIRECT_URI}}",
    "state" => $state,
]);
$ch = curl_init("{{BASE}}/sso/authorize?" . $query);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $token],
]);
$data = json_decode(curl_exec($ch), true)["data"];
curl_close($ch);

$target = "{{REDIRECT_URI}}?" . http_build_query(["code" => $data["code"], "state" => $data["state"]]);`,
                },
              ],
              response: { status: 200, body: `{\n  "success": true,\n  "message": "Authorization code generated",\n  "data": {\n    "code": "1.9c41d0...e7.sA1b2C3d4",\n    "state": "9f2c1e7a"\n  }\n}` },
              errors: [
                { status: 400, meaning: "`client_id` or `redirect_uri` is missing, or the redirect address is not registered." },
                { status: 401, meaning: "Not signed in, or the app is disabled." },
                { status: 403, code: "APP_NOT_IN_PACKAGE", meaning: "The app is not in the school's package or not enabled for the school." },
                { status: 404, meaning: "No app has that `client_id`." },
              ],
            },
          },
          { kind: "note", tone: "info", text: "Treat the code as an opaque string. Its format changes, and it can contain dots." },
        ],
      },
      {
        id: "token",
        title: "The token",
        lead: "What the user token carries, and how to handle it.",
        keywords: "jwt claims tid aud iss expiry header size",
        blocks: [
          {
            kind: "table",
            head: ["Claim", "Meaning"],
            rows: [
              ["`userId`, `username`", "The person, inside their school."],
              ["`tid`, `tslug`, `tstatus`, `pkg`", "The school: number, short name, status and package."],
              ["`permissions`", "What the person may do in Amashuri."],
              ["`preferred_theme`", "`light` or `dark`. Use it to match the person's choice."],
              ["`sid`", "The browser session the token came from."],
              ["`iss`, `aud`, `exp`", "Issuer `nga-mis`, your client ID, and an expiry 24 hours after issue."],
            ],
          },
          {
            kind: "list",
            items: [
              "**Create your own session** after the exchange and keep the Amashuri token on your server. Use it when you call Amashuri for that person.",
              "**Do not read permissions from an old token.** They are a snapshot from sign-in. Load `/users/me` again when `access_version` changes.",
              "**Allow large headers.** A token can pass 8 KB for a person with many permissions. If your server or proxy limits header size, raise it to 32 KB.",
              "**A token without `tid`** is an old one. Treat it as school 1.",
            ],
          },
        ],
      },
      {
        id: "sign-out",
        title: "Single sign-out",
        lead: "When a person signs out of Amashuri, Amashuri tells your server so their session in your app ends too.",
        keywords: "logout backchannel openid connect logout_token jwks rs256 discovery well-known",
        blocks: [
          {
            kind: "p",
            text: "This follows OpenID Connect Back-Channel Logout 1.0. Give the administrator an `https://` address on your server (the **Back-channel logout URL** of your app under Systems). Amashuri then sends it a signed `logout_token`.",
          },
          {
            kind: "code",
            title: "What Amashuri sends you",
            samples: [
              {
                lang: "http",
                label: "Request",
                code: `POST /sso/backchannel-logout HTTP/1.1\nHost: your-app.example\nContent-Type: application/x-www-form-urlencoded\n\nlogout_token=eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...`,
              },
              {
                lang: "json",
                label: "Token claims",
                code: `{\n  "iss": "{{BASE}}",\n  "aud": "{{CLIENT_ID}}",\n  "sub": "1203",\n  "tid": 1,\n  "iat": 1795000000,\n  "exp": 1795000120,\n  "jti": "6f0d2c1e-...",\n  "events": {\n    "http://schemas.openid.net/event/backchannel-logout": {}\n  }\n}`,
              },
            ],
          },
          {
            kind: "list",
            ordered: true,
            items: [
              "Check the signature (RS256) against the keys at `/.well-known/jwks.json`. Cache the keys for an hour, and fetch them again when you see an unknown `kid`.",
              "Check `iss` is the API host, `aud` is your client ID, and the token has not expired.",
              "Check the `events` claim holds the back-channel logout event, and that there is no `nonce`.",
              "Accept each `jti` once.",
              "End every session of the person named by `sub` in the school named by `tid`.",
              "Answer `200` with `Cache-Control: no-store`, or `400` for a token you reject.",
            ],
          },
          {
            kind: "code",
            title: "Your logout endpoint",
            samples: [
              {
                lang: "node",
                code: `import express from "express";\nimport { createRemoteJWKSet, jwtVerify } from "jose";\n\nconst ISSUER = "{{BASE}}";\nconst EVENT = "http://schemas.openid.net/event/backchannel-logout";\nconst keys = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks.json"));\nconst seen = new Map(); // jti -> expiry; use a shared store with several servers\n\napp.post("/sso/backchannel-logout", express.urlencoded({ extended: false }), async (req, res) => {\n  res.set("Cache-Control", "no-store");\n  try {\n    const { payload } = await jwtVerify(req.body.logout_token, keys, {\n      issuer: ISSUER,\n      audience: process.env.SSO_CLIENT_ID,\n      algorithms: ["RS256"],\n    });\n    if (!payload.sub || !payload.jti) throw new Error("missing claims");\n    if (!payload.events || !(EVENT in payload.events)) throw new Error("not a logout token");\n    if ("nonce" in payload) throw new Error("nonce not allowed");\n    if (seen.has(payload.jti)) throw new Error("replayed");\n    seen.set(payload.jti, payload.exp);\n\n    await endSessions({ tid: payload.tid ?? 1, amashuriUserId: payload.sub });\n    res.sendStatus(200);\n  } catch {\n    res.sendStatus(400);\n  }\n});`,
              },
              {
                lang: "python",
                code: `import os, jwt\nfrom flask import Flask, request\n\nISSUER = "{{BASE}}"\nEVENT = "http://schemas.openid.net/event/backchannel-logout"\nkeys = jwt.PyJWKClient(ISSUER + "/.well-known/jwks.json", cache_keys=True, lifespan=3600)\nseen = set()  # use a shared store with several servers\n\napp = Flask(__name__)\n\n@app.post("/sso/backchannel-logout")\ndef backchannel_logout():\n    headers = {"Cache-Control": "no-store"}\n    try:\n        token = request.form["logout_token"]\n        payload = jwt.decode(\n            token,\n            keys.get_signing_key_from_jwt(token).key,\n            algorithms=["RS256"],\n            issuer=ISSUER,\n            audience=os.environ["SSO_CLIENT_ID"],\n            options={"require": ["exp", "iat", "sub", "jti"]},\n        )\n        if EVENT not in payload.get("events", {}) or "nonce" in payload:\n            raise ValueError("not a logout token")\n        if payload["jti"] in seen:\n            raise ValueError("replayed")\n        seen.add(payload["jti"])\n\n        end_sessions(tid=payload.get("tid", 1), amashuri_user_id=payload["sub"])\n        return "", 200, headers\n    except Exception:\n        return "", 400, headers`,
              },
              {
                lang: "php",
                code: `<?php
// composer require firebase/php-jwt
use Firebase\\JWT\\JWK;
use Firebase\\JWT\\JWT;

const ISSUER = "{{BASE}}";
const EVENT = "http://schemas.openid.net/event/backchannel-logout";

header("Cache-Control: no-store");
try {
    // Cache this answer for an hour; fetch it again on an unknown key id.
    $jwks = json_decode(file_get_contents(ISSUER . "/.well-known/jwks.json"), true);
    $claims = (array) JWT::decode($_POST["logout_token"] ?? "", JWK::parseKeySet($jwks, "RS256"));

    if (($claims["iss"] ?? "") !== ISSUER) throw new Exception("issuer");
    if (($claims["aud"] ?? "") !== getenv("SSO_CLIENT_ID")) throw new Exception("audience");
    if (empty($claims["sub"]) || empty($claims["jti"])) throw new Exception("missing claims");
    if (!isset(((array) ($claims["events"] ?? []))[EVENT])) throw new Exception("not a logout token");
    if (array_key_exists("nonce", $claims)) throw new Exception("nonce not allowed");
    if (!rememberJti($claims["jti"], $claims["exp"])) throw new Exception("replayed"); // false when seen before

    endSessions((int) ($claims["tid"] ?? 1), (string) $claims["sub"]);
    http_response_code(200);
} catch (Throwable $e) {
    http_response_code(400);
}`,
              },
            ],
          },
          {
            kind: "table",
            head: ["Endpoint", "Returns"],
            rows: [
              ["`GET /.well-known/jwks.json`", "The public signing keys."],
              ["`GET /.well-known/openid-configuration`", "The issuer, the key address and `backchannel_logout_supported: true`."],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Delivery",
            text: "A network error or a 5xx answer is retried after 1 second and again after 4 seconds. A 4xx answer is not retried. Keep the `/auth/verify` check as a backstop: it catches a sign-out your server missed.",
          },
        ],
      },
    ],
  },
  {
    title: "School data",
    sections: [
      {
        id: "sync",
        title: "Data sync",
        lead: "Read the whole school from your server in a few calls: structure, people, and the work itself.",
        keywords: "integrations sync roster bulk server to server read only",
        blocks: [
          {
            kind: "p",
            text: "Sign-in tells you about one person at the moment they sign in. To mirror a school, use `/integrations/*`. These calls are read-only, need no signed-in person, and answer for the school named in `X-NGA-Tenant`.",
          },
          {
            kind: "table",
            head: ["Call", "Gives you", "Changes only"],
            rows: [
              ["[`/integrations/ping`](#get-integrations-ping)", "Who you are and how much data there is", "–"],
              ["[`/integrations/sync/reference`](#get-sync-reference)", "Years, terms, programs, grades, subjects, class groups, roles", "No, always complete"],
              ["[`/integrations/sync/people`](#get-sync-people)", "Users with roles, classes, enrolments and teaching", "Yes, with `since`"],
              ["[`/integrations/sync/academics`](#get-sync-academics)", "Lesson notes, schemes of work, lesson plans, timetables, marks", "Partly, with `since`"],
              ["[`/integrations/sync/courses`](#get-sync-courses)", "Published courses and the items that point at your app", "No"],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "A good sync order",
            text: "Reference first, then people, then academics. People and academics refer to the IDs that reference gives you. Run a full pass (no `since`) once a day, and `since` passes in between.",
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-integrations-ping",
              method: "GET",
              path: "/integrations/ping",
              summary: "Test your credentials",
              auth: "Client credentials, or an integration token with `sync:read`",
              description: "Use it behind a “Test connection” button. A wrong host or a token from another environment shows here, not in the middle of a sync.",
              samples: [
                { lang: "curl", label: "cURL (token)", code: `curl {{BASE}}/integrations/ping \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}"` },
                { lang: "curl", label: "cURL (client)", code: `curl {{BASE}}/integrations/ping \\\n  -u "{{CLIENT_ID}}:$CLIENT_SECRET" \\\n  -H "X-NGA-Tenant: {{TENANT}}"` },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/integrations/ping", {\n  headers: {\n    Authorization: "Bearer " + process.env.AMASHURI_TOKEN,\n    "X-NGA-Tenant": "{{TENANT}}",\n  },\n});\nconst { data } = await res.json();\nconsole.log(data.client.name, data.counts.users);`,
                },
                {
                  lang: "python",
                  code: `res = requests.get(\n    "{{BASE}}/integrations/ping",\n    headers={\n        "Authorization": f"Bearer {os.environ['AMASHURI_TOKEN']}",\n        "X-NGA-Tenant": "{{TENANT}}",\n    },\n    timeout=15,\n)\nprint(res.json()["data"]["counts"])`,
                },
                {
                  lang: "php",
                  code: `<?php\n$ch = curl_init("{{BASE}}/integrations/ping");\ncurl_setopt_array($ch, [\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER => [\n        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),\n        "X-NGA-Tenant: {{TENANT}}",\n    ],\n]);\n$ping = json_decode(curl_exec($ch), true)["data"];\ncurl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Integration token is valid",\n  "data": {\n    "client": { "name": "Partner production", "scopes": ["sync:read"] },\n    "scope": { "schoolFilter": "instance" },\n    "counts": { "users": 1840, "subjects": 96, "classGroups": 42, "schools": 1 },\n    "serverTime": "2026-11-27T08:15:00.000Z"\n  }\n}`,
              },
            },
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-sync-reference",
              method: "GET",
              path: "/integrations/sync/reference",
              summary: "The school's structure",
              auth: "Client credentials, or an integration token with `sync:read`",
              description: "Everything in one call: `academicYears`, `academicTerms`, `programs`, `grades`, `subjects`, `gradeSubjects`, `classGroups`, `roles`. It is always complete (`delta.supported` is `false`), so replace your copy each time.",
              samples: [
                { lang: "curl", code: `curl {{BASE}}/integrations/sync/reference \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}"` },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/integrations/sync/reference", { headers });\nconst { data } = await res.json();\n\nawait replaceAll("subjects", data.subjects);\nawait replaceAll("class_groups", data.classGroups);`,
                },
                {
                  lang: "python",
                  code: `ref = requests.get("{{BASE}}/integrations/sync/reference", headers=headers, timeout=60).json()["data"]\n\nreplace_all("subjects", ref["subjects"])\nreplace_all("class_groups", ref["classGroups"])`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/integrations/sync/reference");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
    ],
]);
$ref = json_decode(curl_exec($ch), true)["data"];

replaceAll("subjects", $ref["subjects"]);
replaceAll("class_groups", $ref["classGroups"]);
curl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Reference data retrieved",\n  "data": {\n    "scope": { "schoolFilter": "instance" },\n    "delta": { "supported": false, "reason": "Reference tables carry no updated_at column" },\n    "generatedAt": "2026-11-27T08:15:00.000Z",\n    "academicYears": [],\n    "academicTerms": [],\n    "programs": [],\n    "grades": [],\n    "subjects": [],\n    "gradeSubjects": [],\n    "classGroups": [],\n    "roles": []\n  }\n}`,
              },
            },
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-sync-people",
              method: "GET",
              path: "/integrations/sync/people",
              summary: "Users and everything attached to them",
              auth: "Client credentials, or an integration token with `sync:read`",
              description:
                "Each user comes with `profile`, `roles`, `classGroups`, `subjectEnrollments`, `teachingAssignments` and `gradeAssignments`. Pages are read by cursor: pass the last ID you received, and repeat until `pagination.hasMore` is `false`.",
              params: [
                { name: "cursor", in: "query", type: "integer", description: "The last user `id` you received. Not a page number. Start at `0`." },
                { name: "limit", in: "query", type: "integer", description: "Users per page. Default `500`, at most `2000`." },
                { name: "since", in: "query", type: "ISO 8601 date", description: "Only users whose own record changed at or after this time." },
                { name: "status", in: "query", type: "string", description: "`ACTIVE`, `INACTIVE` or `SUSPENDED`. Leave out to get everyone, so you learn about deactivated accounts." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -G {{BASE}}/integrations/sync/people \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}" \\\n  -d cursor=0 -d limit=500`,
                },
                {
                  lang: "node",
                  code: `const headers = {\n  Authorization: "Bearer " + process.env.AMASHURI_TOKEN,\n  "X-NGA-Tenant": "{{TENANT}}",\n};\n\nlet cursor = 0;\nfor (;;) {\n  const res = await fetch("{{BASE}}/integrations/sync/people?limit=500&cursor=" + cursor, { headers });\n  if (!res.ok) throw new Error("Sync failed: " + res.status);\n  const { data } = await res.json();\n\n  await upsertUsers(data.users);\n\n  if (!data.pagination.hasMore) break;\n  cursor = data.pagination.nextCursor;\n}`,
                },
                {
                  lang: "python",
                  code: `headers = {\n    "Authorization": f"Bearer {os.environ['AMASHURI_TOKEN']}",\n    "X-NGA-Tenant": "{{TENANT}}",\n}\n\ncursor = 0\nwhile True:\n    res = requests.get(\n        "{{BASE}}/integrations/sync/people",\n        params={"cursor": cursor, "limit": 500},\n        headers=headers,\n        timeout=60,\n    )\n    res.raise_for_status()\n    data = res.json()["data"]\n\n    upsert_users(data["users"])\n\n    if not data["pagination"]["hasMore"]:\n        break\n    cursor = data["pagination"]["nextCursor"]`,
                },
                {
                  lang: "php",
                  code: `<?php\n$cursor = 0;\ndo {\n    $ch = curl_init("{{BASE}}/integrations/sync/people?limit=500&cursor=" . $cursor);\n    curl_setopt_array($ch, [\n        CURLOPT_RETURNTRANSFER => true,\n        CURLOPT_HTTPHEADER => [\n            "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),\n            "X-NGA-Tenant: {{TENANT}}",\n        ],\n    ]);\n    $data = json_decode(curl_exec($ch), true)["data"];\n    curl_close($ch);\n\n    upsertUsers($data["users"]);\n    $cursor = $data["pagination"]["nextCursor"];\n} while ($data["pagination"]["hasMore"]);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "People retrieved",\n  "data": {\n    "delta": { "supported": true, "appliedSince": null },\n    "generatedAt": "2026-11-27T08:15:00.000Z",\n    "pagination": { "limit": 500, "returned": 500, "cursor": 0, "nextCursor": 1840, "hasMore": true },\n    "users": [\n      {\n        "id": 1203,\n        "username": "a.teacher",\n        "email": "a.teacher@school.example",\n        "phone": null,\n        "status": "ACTIVE",\n        "updatedAt": "2026-11-20T10:02:11.000Z",\n        "profile": {\n          "firstName": "Aline",\n          "lastName": "Teacher",\n          "fullName": "Aline Teacher",\n          "userType": "STAFF",\n          "externalId": null\n        },\n        "roles": [{ "id": 4, "name": "TEACHER" }],\n        "classGroups": [],\n        "subjectEnrollments": [],\n        "teachingAssignments": [],\n        "gradeAssignments": []\n      }\n    ]\n  }\n}`,
              },
              errors: [{ status: 400, meaning: "`since` is not a date, `cursor` is not a whole number from 0, or `limit` is below 1." }],
            },
          },
          {
            kind: "note",
            tone: "warn",
            title: "`since` sees changes to the user record only",
            text: "Moving a student to another class group does not change the user record, so a `since` pass misses it. Run a full pass regularly. A student may have no e-mail address: do not use e-mail as your key, use `tid` and `id`.",
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-sync-academics",
              method: "GET",
              path: "/integrations/sync/academics",
              summary: "Lesson notes, schemes, plans, timetables and marks",
              auth: "Client credentials, or an integration token with `sync:read`",
              description:
                "Returns `lessonNotes`, `schemesOfWork` (with entries), `lessonPlans`, calendars with their slots and activities, competencies and assessment scores. There are no pages. Each list stops at 5,000 rows, and `truncation.complete` tells you whether you received everything.",
              params: [
                { name: "since", in: "query", type: "ISO 8601 date", description: "Applies to lesson notes, schemes of work and calendars (`delta.appliesTo`). Lesson plans and scores are always complete." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -G {{BASE}}/integrations/sync/academics \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}" \\\n  --data-urlencode "since=2026-11-26T00:00:00Z"`,
                },
                {
                  lang: "node",
                  code: `const since = lastRunAt.toISOString();\nconst res = await fetch("{{BASE}}/integrations/sync/academics?since=" + encodeURIComponent(since), { headers });\nconst { data } = await res.json();\n\nif (!data.truncation.complete) {\n  console.warn("Partial lists:", data.truncation.truncated);\n}\nawait upsertNotes(data.lessonNotes);`,
                },
                {
                  lang: "python",
                  code: `data = requests.get(\n    "{{BASE}}/integrations/sync/academics",\n    params={"since": last_run_at.isoformat()},\n    headers=headers,\n    timeout=120,\n).json()["data"]\n\nif not data["truncation"]["complete"]:\n    print("Partial lists:", data["truncation"]["truncated"])\nupsert_notes(data["lessonNotes"])`,
                },
                {
                  lang: "php",
                  code: `<?php
$since = urlencode($lastRunAt->format(DATE_ATOM));
$ch = curl_init("{{BASE}}/integrations/sync/academics?since=" . $since);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
    ],
]);
$data = json_decode(curl_exec($ch), true)["data"];
curl_close($ch);

if (!$data["truncation"]["complete"]) {
    error_log("Partial lists: " . implode(", ", $data["truncation"]["truncated"]));
}
upsertNotes($data["lessonNotes"]);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Academic records retrieved",\n  "data": {\n    "delta": {\n      "supported": true,\n      "appliedSince": "2026-11-26T00:00:00.000Z",\n      "appliesTo": ["lessonNotes", "schemesOfWork", "calendars", "calendarSlots", "calendarActivities"]\n    },\n    "truncation": { "limit": 5000, "truncated": [], "complete": true },\n    "generatedAt": "2026-11-27T08:15:00.000Z",\n    "lessonNotes": [],\n    "schemesOfWork": [],\n    "lessonPlans": []\n  }\n}`,
              },
            },
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "get-sync-courses",
              method: "GET",
              path: "/integrations/sync/courses",
              summary: "Published courses and their linked items",
              auth: "Client credentials, or an integration token with `sync:read`",
              description: "Published e-learning courses, with the items that point at a quiz, an assignment or a discussion in a connected app. Use `ref_id` to find your own object, and `return_url` to send the student back to the course.",
              samples: [
                { lang: "curl", code: `curl {{BASE}}/integrations/sync/courses \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}"` },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/integrations/sync/courses", { headers });\nconst { data: courses } = await res.json();\n\nfor (const course of courses) {\n  for (const item of course.items) {\n    await linkItem(item.ref_id, item.item_id, item.return_url);\n  }\n}`,
                },
                {
                  lang: "python",
                  code: `courses = requests.get(
    "{{BASE}}/integrations/sync/courses",
    headers=headers,
    timeout=60,
).json()["data"]

for course in courses:
    for item in course["items"]:
        link_item(item["ref_id"], item["item_id"], item["return_url"])`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/integrations/sync/courses");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
    ],
]);
$courses = json_decode(curl_exec($ch), true)["data"];

foreach ($courses as $course) {
    foreach ($course["items"] as $item) {
        linkItem($item["ref_id"], $item["item_id"], $item["return_url"]);
    }
}
curl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Courses",\n  "data": [\n    {\n      "course_id": 31,\n      "title": "Web UI development",\n      "subject_id": 42,\n      "class_group_id": 7,\n      "academic_term_id": 9,\n      "items": [\n        {\n          "item_id": 512,\n          "item_type": "TASKMENTOR_QUIZ",\n          "ref_id": 812,\n          "title": "Flexbox quiz",\n          "completion_rule": "MIN_SCORE",\n          "min_score_pct": 60,\n          "due_at": "2026-12-02T13:00:00.000Z",\n          "return_url": "/my-learning/courses/31/items/512"\n        }\n      ]\n    }\n  ]\n}`,
              },
            },
          },
        ],
      },
      {
        id: "learning-events",
        title: "Learning events",
        lead: "Tell Amashuri what a student did in your app, so their course progress stays complete.",
        keywords: "learning events quiz score submitted progress elearning xapi",
        blocks: [
          {
            kind: "p",
            text: "An event is a short statement: this student did this to that object. Events only add progress on course items that point at your objects. They cannot change users, classes or lessons.",
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "post-learning-events",
              method: "POST",
              path: "/integrations/learning-events",
              summary: "Send a batch of events",
              auth: "Integration token with `learning-events:write`",
              description: "Up to 500 events per call. Each event is accepted, refused or recognised as a repeat on its own: read `results` to see which.",
              params: [
                { name: "events", in: "body", type: "array", required: true, description: "The events, at most 500." },
                { name: "events[].actor_user_id", in: "body", type: "integer", required: true, description: "The student's Amashuri user ID." },
                { name: "events[].verb", in: "body", type: "string", required: true, description: "`VIEWED`, `PROGRESSED`, `COMPLETED`, `MARKED_DONE`, `ATTEMPTED`, `SCORED`, `PASSED`, `FAILED`, `SUBMITTED`, `COMMENTED` or `ASKED_AI`." },
                { name: "events[].object_type", in: "body", type: "string", required: true, description: "`COURSE_ITEM`, `COURSE_SECTION`, `COURSE`, `LESSON_NOTE`, `TASKMENTOR_QUIZ`, `TASKMENTOR_ASSIGNMENT` or `TUPO_THREAD`." },
                { name: "events[].object_id", in: "body", type: "integer", required: true, description: "The object's ID. For a quiz or an assignment, your own ID (the item's `ref_id`)." },
                { name: "events[].course_item_id", in: "body", type: "integer", description: "The course item, when you know it. Otherwise it is found from `object_type` and `object_id`." },
                { name: "events[].result", in: "body", type: "object", description: "For example `{ \"score_pct\": 78 }`. A score completes an item that needs a minimum score." },
                { name: "events[].occurred_at", in: "body", type: "ISO 8601 date", description: "When it happened. Defaults to now." },
                { name: "events[].idempotency_key", in: "body", type: "string", description: "Up to 120 characters. Sending the same key again is counted as `duplicate`, so a retry is safe." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -X POST {{BASE}}/integrations/learning-events \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "events": [{\n      "actor_user_id": 1503,\n      "verb": "SCORED",\n      "object_type": "TASKMENTOR_QUIZ",\n      "object_id": 812,\n      "result": { "score_pct": 78 },\n      "occurred_at": "2026-11-27T08:10:00Z",\n      "idempotency_key": "quiz-812-user-1503-attempt-1"\n    }]\n  }'`,
                },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/integrations/learning-events", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer " + process.env.AMASHURI_TOKEN,\n    "X-NGA-Tenant": "{{TENANT}}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    events: attempts.map((a) => ({\n      actor_user_id: a.amashuriUserId,\n      verb: "SCORED",\n      object_type: "TASKMENTOR_QUIZ",\n      object_id: a.quizId,\n      result: { score_pct: a.scorePct },\n      occurred_at: a.finishedAt,\n      idempotency_key: "quiz-" + a.quizId + "-user-" + a.amashuriUserId + "-attempt-" + a.number,\n    })),\n  }),\n});\nconst { data } = await res.json();\nconst refused = data.results.filter((r) => r.status === "rejected");`,
                },
                {
                  lang: "python",
                  code: `res = requests.post(\n    "{{BASE}}/integrations/learning-events",\n    headers=headers,\n    json={\n        "events": [\n            {\n                "actor_user_id": 1503,\n                "verb": "SCORED",\n                "object_type": "TASKMENTOR_QUIZ",\n                "object_id": 812,\n                "result": {"score_pct": 78},\n                "idempotency_key": "quiz-812-user-1503-attempt-1",\n            }\n        ]\n    },\n    timeout=30,\n)\nrefused = [r for r in res.json()["data"]["results"] if r["status"] == "rejected"]`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/integrations/learning-events");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode(["events" => [[
        "actor_user_id" => 1503,
        "verb" => "SCORED",
        "object_type" => "TASKMENTOR_QUIZ",
        "object_id" => 812,
        "result" => ["score_pct" => 78],
        "idempotency_key" => "quiz-812-user-1503-attempt-1",
    ]]]),
]);
$data = json_decode(curl_exec($ch), true)["data"];
curl_close($ch);

$refused = array_filter($data["results"], fn($r) => $r["status"] === "rejected");`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Events processed",\n  "data": {\n    "accepted": 1,\n    "duplicate": 0,\n    "rejected": 0,\n    "results": [{ "index": 0, "status": "accepted", "course_item_id": 512 }]\n  }\n}`,
              },
              errors: [
                { status: 400, meaning: "`events` is empty, or holds more than 500 events." },
                { status: 403, code: "FORBIDDEN", meaning: "The credential does not carry `learning-events:write`." },
              ],
            },
          },
        ],
      },
      {
        id: "reminders",
        title: "Reminders",
        lead: "Give Amashuri a dated item, and it reminds the right people: in the app, by push notification, and on Telegram.",
        keywords: "reminders notifications push deadline meeting quiz source api",
        blocks: [
          {
            kind: "p",
            text: "You send what happens and when. Amashuri works out who to remind and when, using each person's own settings and quiet hours. Send the same item again whenever you like: an unchanged item does nothing, so a regular re-send is a safe backstop.",
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "put-reminder-sources-batch",
              method: "PUT",
              path: "/reminders/sources/batch",
              summary: "Create or update up to 200 items",
              auth: "Integration token with `reminders:write`, or the client credentials of an allowed app",
              description: "Each item succeeds or fails on its own. An item is identified by `source_app`, `source_type` and `external_id` together.",
              params: [
                { name: "items", in: "body", type: "array", required: true, description: "The items, at most 200." },
                { name: "items[].source_app", in: "body", type: "string", required: true, description: "A short name for your app, for example `taskmentor`." },
                { name: "items[].source_type", in: "body", type: "string", required: true, description: "`quiz_open`, `quiz_close`, `assignment_due`, `meeting` or `event`." },
                { name: "items[].external_id", in: "body", type: "string", required: true, description: "Your stable ID for the item, at most 100 characters." },
                { name: "items[].title", in: "body", type: "string", required: true, description: "What people read in the reminder." },
                { name: "items[].starts_at", in: "body", type: "ISO 8601 date", required: true, description: "When it happens, in UTC. For a closing time or a due date, this is the deadline." },
                { name: "items[].ends_at", in: "body", type: "ISO 8601 date", description: "When it ends, if it has a length." },
                { name: "items[].link", in: "body", type: "URL", description: "Where the reminder opens." },
                { name: "items[].location", in: "body", type: "string", description: "A room or a place." },
                { name: "items[].critical", in: "body", type: "boolean", description: "`true` skips quiet hours and the daily limit. Keep it for real deadlines." },
                { name: "items[].audience_subject_id", in: "body", type: "integer", description: "Remind the students enrolled in this subject. Amashuri keeps the list current." },
                { name: "items[].audience_user_ids", in: "body", type: "integer[]", description: "Remind these users, at most 5,000. Give at least one of the two audience fields." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -X PUT {{BASE}}/reminders/sources/batch \\\n  -u "{{CLIENT_ID}}:$CLIENT_SECRET" \\\n  -H "X-NGA-Tenant: {{TENANT}}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "items": [{\n      "source_app": "taskmentor",\n      "source_type": "quiz_close",\n      "external_id": "quiz-812-close",\n      "title": "Algebra quiz",\n      "starts_at": "2026-12-02T13:00:00Z",\n      "link": "https://your-app.example/quizzes/812",\n      "critical": true,\n      "audience_subject_id": 42\n    }]\n  }'`,
                },
                {
                  lang: "node",
                  code: `const basic = Buffer.from("{{CLIENT_ID}}:" + process.env.CLIENT_SECRET).toString("base64");\n\nconst res = await fetch("{{BASE}}/reminders/sources/batch", {\n  method: "PUT",\n  headers: {\n    Authorization: "Basic " + basic,\n    "X-NGA-Tenant": "{{TENANT}}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    items: [\n      {\n        source_app: "taskmentor",\n        source_type: "quiz_close",\n        external_id: "quiz-812-close",\n        title: "Algebra quiz",\n        starts_at: "2026-12-02T13:00:00Z",\n        link: "https://your-app.example/quizzes/812",\n        critical: true,\n        audience_subject_id: 42,\n      },\n    ],\n  }),\n});\nconst { data } = await res.json();\nconsole.log(data.saved, "saved,", data.failed, "failed");`,
                },
                {
                  lang: "python",
                  code: `res = requests.put(\n    "{{BASE}}/reminders/sources/batch",\n    auth=("{{CLIENT_ID}}", os.environ["CLIENT_SECRET"]),\n    headers={"X-NGA-Tenant": "{{TENANT}}"},\n    json={\n        "items": [\n            {\n                "source_app": "taskmentor",\n                "source_type": "quiz_close",\n                "external_id": "quiz-812-close",\n                "title": "Algebra quiz",\n                "starts_at": "2026-12-02T13:00:00Z",\n                "link": "https://your-app.example/quizzes/812",\n                "critical": True,\n                "audience_subject_id": 42,\n            }\n        ]\n    },\n    timeout=30,\n)\nprint(res.json()["data"])`,
                },
                {
                  lang: "php",
                  code: `<?php\n$ch = curl_init("{{BASE}}/reminders/sources/batch");\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => "PUT",\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_USERPWD => "{{CLIENT_ID}}:" . getenv("CLIENT_SECRET"),\n    CURLOPT_HTTPHEADER => ["Content-Type: application/json", "X-NGA-Tenant: {{TENANT}}"],\n    CURLOPT_POSTFIELDS => json_encode(["items" => [[\n        "source_app" => "taskmentor",\n        "source_type" => "quiz_close",\n        "external_id" => "quiz-812-close",\n        "title" => "Algebra quiz",\n        "starts_at" => "2026-12-02T13:00:00Z",\n        "critical" => true,\n        "audience_subject_id" => 42,\n    ]]]),\n]);\n$result = json_decode(curl_exec($ch), true)["data"];\ncurl_close($ch);`,
                },
              ],
              response: {
                status: 200,
                body: `{\n  "success": true,\n  "message": "Reminder sources saved",\n  "data": {\n    "results": [{ "external_id": "quiz-812-close", "ok": true, "changed": true }],\n    "saved": 1,\n    "failed": 0\n  }\n}`,
              },
              errors: [{ status: 403, meaning: "The app is not on the list of apps allowed to write reminders with client credentials. Use an integration token with `reminders:write`." }],
            },
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "put-reminder-sources",
              method: "PUT",
              path: "/reminders/sources",
              summary: "Create or update one item",
              auth: "Integration token with `reminders:write`, or the client credentials of an allowed app",
              description: "The body is one item, with the same fields as an entry of `items` above.",
              samples: [
                {
                  lang: "curl",
                  code: `curl -X PUT {{BASE}}/reminders/sources \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "source_app": "taskmentor",\n    "source_type": "meeting",\n    "external_id": "meeting-77",\n    "title": "Parents meeting",\n    "starts_at": "2026-12-05T07:00:00Z",\n    "audience_user_ids": [1203, 1204]\n  }'`,
                },
                {
                  lang: "node",
                  code: `const res = await fetch("{{BASE}}/reminders/sources", {
  method: "PUT",
  headers: {
    Authorization: "Bearer " + process.env.AMASHURI_TOKEN,
    "X-NGA-Tenant": "{{TENANT}}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source_app: "taskmentor",
    source_type: "meeting",
    external_id: "meeting-77",
    title: "Parents meeting",
    starts_at: "2026-12-05T07:00:00Z",
    audience_user_ids: [1203, 1204],
  }),
});
const { data } = await res.json();
console.log(data.created ? "created" : data.changed ? "updated" : "unchanged");`,
                },
                {
                  lang: "python",
                  code: `res = requests.put(
    "{{BASE}}/reminders/sources",
    headers=headers,
    json={
        "source_app": "taskmentor",
        "source_type": "meeting",
        "external_id": "meeting-77",
        "title": "Parents meeting",
        "starts_at": "2026-12-05T07:00:00Z",
        "audience_user_ids": [1203, 1204],
    },
    timeout=30,
)
saved = res.json()["data"]  # source_id, created, changed, noticed`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/reminders/sources");
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => "PUT",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "source_app" => "taskmentor",
        "source_type" => "meeting",
        "external_id" => "meeting-77",
        "title" => "Parents meeting",
        "starts_at" => "2026-12-05T07:00:00Z",
        "audience_user_ids" => [1203, 1204],
    ]),
]);
$saved = json_decode(curl_exec($ch), true)["data"]; // source_id, created, changed, noticed
curl_close($ch);`,
                },
              ],
              response: { status: 200, body: `{\n  "success": true,\n  "message": "Reminder source saved",\n  "data": { "source_id": 941, "created": true, "changed": true, "noticed": 0 }\n}` },
            },
          },
          {
            kind: "endpoint",
            endpoint: {
              id: "delete-reminder-sources",
              method: "DELETE",
              path: "/reminders/sources/:app/:type/:externalId",
              summary: "Cancel an item",
              auth: "Integration token with `reminders:write`, or the client credentials of an allowed app",
              description: "Cancels the item and every reminder still waiting for it.",
              params: [
                { name: "app", in: "path", type: "string", required: true, description: "The item's `source_app`." },
                { name: "type", in: "path", type: "string", required: true, description: "The item's `source_type`." },
                { name: "externalId", in: "path", type: "string", required: true, description: "The item's `external_id`." },
              ],
              samples: [
                {
                  lang: "curl",
                  code: `curl -X DELETE {{BASE}}/reminders/sources/taskmentor/quiz_close/quiz-812-close \\\n  -H "Authorization: Bearer $AMASHURI_TOKEN" \\\n  -H "X-NGA-Tenant: {{TENANT}}"`,
                },
                {
                  lang: "node",
                  code: `await fetch("{{BASE}}/reminders/sources/taskmentor/quiz_close/quiz-812-close", {\n  method: "DELETE",\n  headers,\n});`,
                },
                {
                  lang: "python",
                  code: `res = requests.delete(
    "{{BASE}}/reminders/sources/taskmentor/quiz_close/quiz-812-close",
    headers=headers,
    timeout=30,
)
if res.status_code == 404:
    pass  # already cancelled, or never sent`,
                },
                {
                  lang: "php",
                  code: `<?php
$ch = curl_init("{{BASE}}/reminders/sources/taskmentor/quiz_close/quiz-812-close");
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => "DELETE",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("AMASHURI_TOKEN"),
        "X-NGA-Tenant: {{TENANT}}",
    ],
]);
curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE); // 404: already cancelled, or never sent
curl_close($ch);`,
                },
              ],
              errors: [{ status: 404, meaning: "No item has that app, type and ID." }],
            },
          },
          {
            kind: "note",
            tone: "info",
            title: "When a time changes",
            text: "If `starts_at` moves by a minute or more, or the item is cancelled, within 48 hours of the old or new time, everyone already reminded gets one notice about the change. People you remove from the audience lose their waiting reminders.",
          },
        ],
      },
    ],
  },
  {
    title: "Reference",
    sections: [
      {
        id: "errors",
        title: "Errors",
        lead: "Read the HTTP status first. A `code` says exactly what went wrong when there is one.",
        keywords: "error codes status 400 401 403 404 tenant required mismatch unauthorized forbidden",
        blocks: [
          {
            kind: "code",
            title: "Two error shapes",
            samples: [
              { lang: "json", label: "Most endpoints", code: `{\n  "success": false,\n  "code": "APP_NOT_IN_PACKAGE",\n  "message": "This app is not in your school's package"\n}` },
              {
                lang: "json",
                label: "Server-to-server credentials",
                code: `{\n  "success": false,\n  "code": "TENANT_MISMATCH",\n  "error": {\n    "code": "TENANT_MISMATCH",\n    "message": "This token belongs to another school",\n    "details": []\n  },\n  "timestamp": "2026-11-27T08:15:00.000Z"\n}`,
              },
            ],
          },
          { kind: "p", text: "`code` is not always present. A handler that reads `body.code ?? body.error?.code` and then falls back to the status covers both shapes." },
          {
            kind: "table",
            head: ["Status", "Code", "Meaning", "What to do"],
            rows: [
              ["400", "–", "A field is missing or has the wrong type.", "Read `message` and fix the request."],
              ["400", "`TENANT_REQUIRED`", "The call does not say which school it is for.", "Send `X-NGA-Tenant`."],
              ["401", "`UNAUTHORIZED`", "The credential is missing, wrong, expired or revoked.", "Check the header and the environment."],
              ["401", "–", "On a user token: it expired, or the person signed out.", "End their session in your app."],
              ["401", "`TENANT_UNKNOWN`", "No school has that number.", "Check `tid`."],
              ["403", "`FORBIDDEN`", "The credential lacks the scope.", "Ask for the scope, or use another token."],
              ["403", "`SYSTEM_NOT_ASSIGNED`", "Your app is not enabled for that school.", "Ask the platform administrator to enable it."],
              ["403", "`TENANT_MISMATCH`", "The token and `X-NGA-Tenant` name different schools.", "Use that school's token."],
              ["403", "`APP_NOT_IN_PACKAGE`", "The school's package does not include your app.", "Tell the person their school has no access."],
              ["403", "`TENANT_PENDING`, `TENANT_SUSPENDED`", "The school is not usable yet, or is suspended.", "Stop calling for that school until it is active."],
              ["404", "–", "Nothing has that ID or address.", "Check the ID. Check you are calling the API host."],
              ["5xx", "–", "A problem on the Amashuri side.", "Try again later, waiting longer each time. Do not sign anyone out."],
            ],
          },
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        lead: "The problems integrators meet most often.",
        keywords: "problems faq debugging not working json parse error invalid code",
        blocks: [
          {
            kind: "table",
            head: ["What you see", "Likely cause", "Fix"],
            rows: [
              ["A JSON parse error, or HTML where JSON should be", "The call went to the web app host.", "Call `https://api.amashuri.com`, with no `/api` prefix."],
              ["“Redirect URI not allowed”", "The callback address is not registered exactly.", "Register the full address, including the path."],
              ["“Invalid or already used authorization code”", "The code was sent twice, or is older than 5 minutes.", "Send it once. In React strict mode, guard the effect with a ref."],
              ["401 during the exchange", "Wrong secret, a disabled app, or an app not enabled for the school.", "Check the secret with the administrator."],
              ["400 `TENANT_REQUIRED` on a sync call", "No `X-NGA-Tenant` header.", "Send the school's `tid`."],
              ["Sign-in works, then every call returns 401", "An old token is still stored.", "Clear the old token and use the one from the latest exchange."],
              ["400 or 431 from your own proxy", "The token is larger than the header limit.", "Allow headers up to 32 KB."],
              ["People stay signed in after an Amashuri sign-out", "No back-channel logout address is registered.", "Register it, and keep the `/auth/verify` check."],
            ],
          },
          {
            kind: "note",
            tone: "info",
            title: "Need credentials or a new scope?",
            text: "Clients, redirect addresses, logout addresses and integration tokens are managed under **Systems** by a platform administrator.",
          },
        ],
      },
    ],
  },
];

export const ALL_SECTIONS = GROUPS.flatMap((g) => g.sections);
