/**
 * Creates a confidential OAuth client for the NGA connector, for AI apps that want a fixed
 * client id and secret instead of dynamic registration (e.g. a ChatGPT workspace app).
 *
 * The secret is printed ONCE; only its SHA-256 is stored. Lost it? Create another client and
 * disable the old one.
 *
 * Usage:
 *   npx ts-node scripts/create-mcp-client.ts --name="ChatGPT (NGA workspace)" \
 *       --redirect=https://chatgpt.com/connector_platform_oauth_redirect
 *   npx ts-node scripts/create-mcp-client.ts --list
 *   npx ts-node scripts/create-mcp-client.ts --disable=nga_xxxxxxxx
 *
 * --redirect may be repeated or comma-separated.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { createClient } from "../src/services/mcp/oauthStore";
import { mcpIssuer, mcpResource, validRedirectUri } from "../src/services/mcp/config";

const args = (name: string) =>
  process.argv
    .filter((a) => a.startsWith(`--${name}=`))
    .flatMap((a) => a.slice(name.length + 3).split(","))
    .map((s) => s.trim())
    .filter(Boolean);

async function main() {
  if (process.argv.includes("--list")) {
    const [rows]: any = await db.execute(sql`SELECT client_id, client_name, registration_type, token_endpoint_auth_method, status, created_at FROM OAuthClient ORDER BY created_at DESC LIMIT 200`);
    for (const r of rows) console.log(`${r.client_id}  ${r.status.padEnd(8)} ${r.registration_type.padEnd(8)} ${r.token_endpoint_auth_method.padEnd(20)} ${r.client_name}`);
    return;
  }
  const disable = args("disable")[0];
  if (disable) {
    await db.execute(sql`UPDATE OAuthClient SET status = 'disabled' WHERE client_id = ${disable}`);
    await db.execute(sql`UPDATE OAuthToken SET revoked_at = ${new Date()} WHERE client_id = ${disable} AND revoked_at IS NULL`);
    console.log(`Disabled ${disable} and revoked its tokens.`);
    return;
  }
  const name = args("name")[0];
  const redirects = args("redirect");
  if (!name || redirects.length === 0) throw new Error('Pass --name="…" and at least one --redirect=https://…');
  const bad = redirects.filter((r) => !validRedirectUri(r));
  if (bad.length) throw new Error(`Not allowed as redirect URIs (https, or http://localhost): ${bad.join(", ")}`);
  const method = process.argv.includes("--basic") ? "client_secret_basic" : "client_secret_post";
  const c = await createClient({ name, redirectUris: redirects, authMethod: method, registrationType: "admin" });
  console.log(`MCP server URL:  ${mcpResource()}`);
  console.log(`Issuer:          ${mcpIssuer()}`);
  console.log(`Client ID:       ${c.clientId}`);
  console.log(`Client secret:   ${c.clientSecret}   (shown once)`);
  console.log(`Auth method:     ${method}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
