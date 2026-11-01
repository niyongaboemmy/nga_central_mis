import crypto from "crypto";
import { ValidationError } from "../../../errors/CustomError";
import { open, seal } from "../../secrets/vault";

/**
 * One-click "Connect OpenRouter" (OAuth PKCE, https://openrouter.ai/docs/guides/overview/auth/oauth):
 * the person approves on openrouter.ai and OpenRouter creates a key in THEIR account, which
 * we store like a pasted key. No copy-paste, revocable from their OpenRouter settings.
 *
 * Stateless: the PKCE verifier travels inside `state`, sealed by the vault and bound to the
 * user, so it survives restarts and several server processes, and nobody else can use it.
 */

const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const TTL_MS = 10 * 60_000;

const b64url = (b: Buffer) => b.toString("base64url");
const aad = (userId: number) => `oauth|openrouter|${userId}`;

/** Only our own front end may receive the code. */
function allowedCallback(raw: string): string {
  const front = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ValidationError("Bad callback address.");
  }
  const ok = (front && u.origin === new URL(front).origin) || (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname));
  if (!ok) throw new ValidationError("Bad callback address.");
  return u.href;
}

export function startOpenRouterConnect(userId: number, callbackUrl: string): { url: string } {
  const callback = allowedCallback(callbackUrl);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const s = seal(JSON.stringify({ v: verifier, exp: Date.now() + TTL_MS }), aad(userId));
  const state = [s.kekVersion, s.ciphertext, s.nonce, s.tag, s.wrappedDek, s.dekNonce, s.dekTag].map((x) => (typeof x === "number" ? String(x) : b64url(x))).join(".");
  const url = new URL(AUTH_URL);
  url.searchParams.set("callback_url", `${callback}${callback.includes("?") ? "&" : "?"}state=${encodeURIComponent(state)}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.href };
}

function readState(userId: number, state: string): string {
  const parts = state.split(".");
  if (parts.length !== 7) throw new ValidationError("This connection link is invalid or expired. Please try again.");
  const [kv, ...rest] = parts;
  const [ciphertext, nonce, tag, wrappedDek, dekNonce, dekTag] = rest.map((p) => Buffer.from(p, "base64url"));
  try {
    const body = JSON.parse(open({ kekVersion: Number(kv), ciphertext, nonce, tag, wrappedDek, dekNonce, dekTag }, aad(userId)));
    if (typeof body?.v !== "string" || Date.now() > Number(body.exp)) throw new Error("expired");
    return body.v;
  } catch {
    throw new ValidationError("This connection link is invalid or expired. Please try again.");
  }
}

/** Tests swap the network out. */
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setOpenRouterOAuthFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

/** Exchange the code for the user's new key. */
export async function completeOpenRouterConnect(userId: number, code: string, state: string): Promise<string> {
  if (!code || code.length > 500) throw new ValidationError("OpenRouter did not send a code. Please try again.");
  const verifier = readState(userId, state);
  const res = await fetchImpl(EXCHANGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.key !== "string") throw new ValidationError("OpenRouter did not accept the connection. Please try again.");
  return body.key;
}
