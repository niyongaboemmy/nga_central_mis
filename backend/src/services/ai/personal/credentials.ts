import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { CustomError, NotFoundError, ValidationError } from "../../../errors/CustomError";
import { recordActivity } from "../../../utils/activityLogger";
import { notifyUser } from "../../../utils/notifications";
import logger from "../../../utils/logger";
import {
  AI_PERSONAL_APPS,
  AI_PROVIDER_IDS,
  personalProviderAllowed,
  type AiPersonalApp,
  type AiPolicy,
  type AiProviderId,
} from "../../../vendor/nga-access";
import { isVaultConfigured, keyHint, open, seal, type SealedSecret } from "../../secrets/vault";
import { PROVIDERS } from "./providers";
import { checkEndpointUrl, UnsafeUrlError } from "./safeFetch";
import { validateKey, type CredentialStatus } from "./validate";

/**
 * Users' own AI keys (PERSONAL_AI_PROVIDERS_PLAN.md §5.1, §6). Raw SQL like PlatformSetting:
 * the secret columns are binary and must come back as Buffers. A secret is decrypted only
 * by loadSecret(), for one call, and never leaves the MIS.
 */

export const MAX_CREDENTIALS_PER_USER = 20;

export interface PublicCredential {
  id: number;
  provider: AiProviderId;
  providerLabel: string;
  authType: string;
  label: string;
  baseUrl: string | null;
  keyHint: string;
  status: CredentialStatus;
  statusDetail: string | null;
  allowedApps: AiPersonalApp[];
  dailyRequestCap: number | null;
  freeOnly: boolean;
  models: string[];
  balance: Record<string, unknown> | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CredentialSecret {
  id: number;
  ownerUserId: number | null;
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string | null;
  freeOnly: boolean;
  status: CredentialStatus;
  allowedApps: AiPersonalApp[];
  dailyRequestCap: number | null;
  label: string;
}

export class PersonalAiForbiddenError extends CustomError {
  constructor(message: string, readonly code = "AI_PERSONAL_FORBIDDEN") {
    super(message, 403);
  }
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v !== "string") return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null);
// Dates go to MySQL as JS Dates (like every Drizzle write), never UTC_TIMESTAMP(): the
// connection reads DATETIMEs in the server's zone, so mixing the two shifts times locally.
const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const aad = (id: number, owner: number | null, provider: string) => `aicred|v1|${id}|${owner ?? "school"}|${provider}`;

const asApps = (v: unknown): AiPersonalApp[] => {
  const list = json<unknown[]>(v, [...AI_PERSONAL_APPS]);
  return Array.isArray(list) ? (list.filter((a) => AI_PERSONAL_APPS.includes(a as AiPersonalApp)) as AiPersonalApp[]) : [...AI_PERSONAL_APPS];
};

function toPublic(r: any): PublicCredential {
  const provider = r.provider as AiProviderId;
  return {
    id: Number(r.credential_id),
    provider,
    providerLabel: PROVIDERS[provider]?.label ?? provider,
    authType: r.auth_type,
    label: r.label,
    baseUrl: r.base_url ?? null,
    keyHint: r.key_hint,
    status: r.status,
    statusDetail: r.status_detail ?? null,
    allowedApps: asApps(r.allowed_apps),
    dailyRequestCap: r.daily_request_cap == null ? null : Number(r.daily_request_cap),
    freeOnly: Number(r.free_only) === 1,
    models: json<string[]>(r.models_cache, []),
    balance: json<Record<string, unknown> | null>(r.balance, null),
    lastValidatedAt: iso(r.last_validated_at),
    lastUsedAt: iso(r.last_used_at),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
  };
}

const PUBLIC_COLS = sql.raw(
  "credential_id, owner_user_id, provider, auth_type, label, base_url, key_hint, status, status_detail, allowed_apps, daily_request_cap, free_only, models_cache, balance, last_validated_at, last_used_at, created_at",
);

export async function listCredentials(userId: number): Promise<PublicCredential[]> {
  const r = rows(await db.execute(sql`SELECT ${PUBLIC_COLS} FROM AiCredential WHERE owner_user_id = ${userId} ORDER BY created_at, credential_id`));
  return r.map(toPublic);
}

async function getOwned(userId: number, id: number): Promise<any> {
  const [r] = rows(await db.execute(sql`SELECT ${PUBLIC_COLS} FROM AiCredential WHERE credential_id = ${id} AND owner_user_id = ${userId} LIMIT 1`));
  if (!r) throw new NotFoundError("That AI key was not found.");
  return r;
}

export async function getCredential(userId: number, id: number): Promise<PublicCredential> {
  return toPublic(await getOwned(userId, id));
}

export interface CredentialInput {
  provider?: unknown;
  apiKey?: unknown;
  label?: unknown;
  baseUrl?: unknown;
  allowedApps?: unknown;
  dailyRequestCap?: unknown;
  freeOnly?: unknown;
  authType?: "api_key" | "oauth_pkce";
}

interface Who {
  userId: number;
  isStudent: boolean;
  policy: AiPolicy;
}

function parseCommon(input: CredentialInput, errors: string[]) {
  const out: { label?: string; allowedApps?: AiPersonalApp[]; dailyRequestCap?: number | null; freeOnly?: boolean } = {};
  if (input.label !== undefined) {
    const label = String(input.label ?? "").trim();
    if (!label || label.length > 80) errors.push("Give the key a name of 1–80 characters.");
    else out.label = label;
  }
  if (input.allowedApps !== undefined) {
    if (!Array.isArray(input.allowedApps) || input.allowedApps.some((a) => !AI_PERSONAL_APPS.includes(a as AiPersonalApp))) {
      errors.push(`allowedApps must be a list of: ${AI_PERSONAL_APPS.join(", ")}`);
    } else out.allowedApps = [...new Set(input.allowedApps as AiPersonalApp[])];
  }
  if (input.dailyRequestCap !== undefined) {
    const v = input.dailyRequestCap;
    if (v === null || v === "") out.dailyRequestCap = null;
    else if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 100000) errors.push("The daily limit must be a whole number from 1 to 100000, or empty.");
    else out.dailyRequestCap = v as number;
  }
  if (input.freeOnly !== undefined) {
    if (typeof input.freeOnly !== "boolean") errors.push("freeOnly must be true or false");
    else out.freeOnly = input.freeOnly;
  }
  return out;
}

function assertCanUse(who: Who, provider: AiProviderId) {
  if (!isVaultConfigured()) throw new PersonalAiForbiddenError("My AI is not set up on this server yet.", "AI_VAULT_NOT_CONFIGURED");
  if (!who.policy.personal.enabled) throw new PersonalAiForbiddenError("My AI is turned off for the school.", "AI_PERSONAL_OFF");
  if (!personalProviderAllowed(who.policy.personal, provider, who.isStudent)) {
    const why = who.isStudent ? PROVIDERS[provider]?.notForStudents : null;
    throw new PersonalAiForbiddenError(why ?? `${PROVIDERS[provider]?.label ?? provider} is not allowed at this school.`, "AI_PROVIDER_BLOCKED");
  }
}

function writeSealed(id: number, owner: number | null, provider: string, secret: string) {
  const s = seal(secret, aad(id, owner, provider));
  return db.execute(sql`
    UPDATE AiCredential SET secret_ct = ${s.ciphertext}, secret_nonce = ${s.nonce}, secret_tag = ${s.tag},
      wrapped_dek = ${s.wrappedDek}, dek_nonce = ${s.dekNonce}, dek_tag = ${s.dekTag}, kek_version = ${s.kekVersion},
      key_hint = ${keyHint(secret)}
    WHERE credential_id = ${id}`);
}

/** Validate the key with the provider, then store it sealed. An invalid key is never stored. */
export async function createCredential(who: Who, input: CredentialInput): Promise<PublicCredential> {
  const errors: string[] = [];
  const provider = String(input.provider ?? "") as AiProviderId;
  if (!AI_PROVIDER_IDS.includes(provider)) throw new ValidationError("Choose a provider.");
  assertCanUse(who, provider);
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length < 8 || apiKey.length > 1000 || /\s/.test(apiKey)) errors.push("Paste the whole key (no spaces).");
  let baseUrl: string | null = null;
  if (provider === "custom") {
    try {
      baseUrl = checkEndpointUrl(String(input.baseUrl ?? "")).href.replace(/\/+$/, "");
    } catch (e) {
      errors.push(e instanceof UnsafeUrlError ? e.message : "Enter the endpoint address.");
    }
  }
  const common = parseCommon({ ...input, label: input.label ?? PROVIDERS[provider].label }, errors);
  if (errors.length) throw new ValidationError(errors.join(" "), errors);

  const [{ n }] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM AiCredential WHERE owner_user_id = ${who.userId}`));
  if (Number(n) >= MAX_CREDENTIALS_PER_USER) throw new ValidationError(`You can keep up to ${MAX_CREDENTIALS_PER_USER} AI keys.`);

  const check = await validateKey(provider, apiKey, baseUrl);
  if (check.status === "invalid") throw new ValidationError(check.detail ?? "The provider refused this key.");

  // Students' OpenRouter keys stay on free models (and data_collection: deny) whatever they ask.
  const freeOnly = provider === "openrouter" ? (who.isStudent ? true : common.freeOnly ?? false) : false;
  const placeholder = Buffer.alloc(1);
  const res: any = await db.execute(sql`
    INSERT INTO AiCredential (owner_user_id, provider, auth_type, label, base_url, secret_ct, secret_nonce, secret_tag, wrapped_dek, dek_nonce, dek_tag,
      kek_version, key_hint, status, status_detail, allowed_apps, daily_request_cap, free_only, models_cache, balance, last_validated_at)
    VALUES (${who.userId}, ${provider}, ${input.authType ?? "api_key"}, ${common.label!}, ${baseUrl}, ${placeholder}, ${placeholder}, ${placeholder},
      ${placeholder}, ${placeholder}, ${placeholder}, 0, '', ${check.status}, ${check.detail},
      CAST(${JSON.stringify(common.allowedApps ?? AI_PERSONAL_APPS)} AS JSON), ${common.dailyRequestCap ?? null}, ${freeOnly ? 1 : 0},
      CAST(${JSON.stringify(check.models)} AS JSON), CAST(${JSON.stringify(check.balance)} AS JSON), ${new Date()})`);
  const id = Number(res?.[0]?.insertId ?? res?.insertId);
  try {
    await writeSealed(id, who.userId, provider, apiKey);
  } catch (e) {
    await db.execute(sql`DELETE FROM AiCredential WHERE credential_id = ${id}`);
    throw e;
  }
  await recordActivity(who.userId, "AI_CREDENTIAL_ADD", `Added an AI key: ${PROVIDERS[provider].label} (${keyHint(apiKey)})`, "AiCredential", id, { provider, status: check.status }, who.userId);
  return getCredential(who.userId, id);
}

export async function updateCredential(who: Who, id: number, input: CredentialInput): Promise<PublicCredential> {
  const current = await getOwned(who.userId, id);
  const errors: string[] = [];
  const common = parseCommon(input, errors);
  const newKey = typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : null;
  if (newKey && (newKey.length < 8 || newKey.length > 1000 || /\s/.test(newKey))) errors.push("Paste the whole key (no spaces).");
  if (errors.length) throw new ValidationError(errors.join(" "), errors);

  if (newKey) {
    assertCanUse(who, current.provider);
    const check = await validateKey(current.provider, newKey, current.base_url);
    if (check.status === "invalid") throw new ValidationError(check.detail ?? "The provider refused this key.");
    await writeSealed(id, who.userId, current.provider, newKey);
    await saveCheck(id, check);
  }
  const freeOnly = current.provider === "openrouter" && common.freeOnly !== undefined ? (who.isStudent ? true : common.freeOnly) : undefined;
  await db.execute(sql`
    UPDATE AiCredential SET
      label = COALESCE(${common.label ?? null}, label),
      allowed_apps = ${common.allowedApps ? sql`CAST(${JSON.stringify(common.allowedApps)} AS JSON)` : sql`allowed_apps`},
      daily_request_cap = ${common.dailyRequestCap !== undefined ? sql`${common.dailyRequestCap}` : sql`daily_request_cap`},
      free_only = ${freeOnly !== undefined ? (freeOnly ? 1 : 0) : sql`free_only`}
    WHERE credential_id = ${id} AND owner_user_id = ${who.userId}`);
  await recordActivity(who.userId, "AI_CREDENTIAL_UPDATE", `Changed an AI key: ${current.label}${newKey ? " (new key)" : ""}`, "AiCredential", id, { provider: current.provider }, who.userId);
  return getCredential(who.userId, id);
}

/** Hard delete: the ciphertext goes too. Routes using the key are removed by the FK. */
export async function deleteCredential(userId: number, id: number): Promise<void> {
  const current = await getOwned(userId, id);
  await db.execute(sql`DELETE FROM AiRoute WHERE credential_id = ${id} AND user_id = ${userId}`);
  await db.execute(sql`DELETE FROM AiCredential WHERE credential_id = ${id} AND owner_user_id = ${userId}`);
  await recordActivity(userId, "AI_CREDENTIAL_DELETE", `Deleted an AI key: ${current.label} (${current.key_hint})`, "AiCredential", id, { provider: current.provider }, userId);
}

async function saveCheck(id: number, check: Awaited<ReturnType<typeof validateKey>>) {
  await db.execute(sql`
    UPDATE AiCredential SET status = ${check.status}, status_detail = ${check.detail},
      models_cache = ${check.models.length ? sql`CAST(${JSON.stringify(check.models)} AS JSON)` : sql`models_cache`},
      balance = ${check.balance ? sql`CAST(${JSON.stringify(check.balance)} AS JSON)` : sql`balance`},
      last_validated_at = ${new Date()}
    WHERE credential_id = ${id}`);
}

/** Re-check a key now ("Test now"). */
export async function testCredential(userId: number, id: number): Promise<PublicCredential> {
  await getOwned(userId, id);
  const secret = await loadSecret(id, userId);
  const check = await validateKey(secret.provider, secret.apiKey, secret.baseUrl);
  await saveCheck(id, check);
  return getCredential(userId, id);
}

/** Decrypt one key for one call. ownerUserId must match (null only for school keys). */
export async function loadSecret(id: number, ownerUserId: number | null): Promise<CredentialSecret> {
  const [r] = rows(
    await db.execute(sql`
      SELECT credential_id, owner_user_id, provider, label, base_url, secret_ct, secret_nonce, secret_tag, wrapped_dek, dek_nonce, dek_tag,
             kek_version, status, allowed_apps, daily_request_cap, free_only
      FROM AiCredential WHERE credential_id = ${id} LIMIT 1`),
  );
  const owner = r?.owner_user_id == null ? null : Number(r.owner_user_id);
  if (!r || owner !== ownerUserId) throw new NotFoundError("That AI key was not found.");
  const sealed: SealedSecret = {
    ciphertext: r.secret_ct,
    nonce: r.secret_nonce,
    tag: r.secret_tag,
    wrappedDek: r.wrapped_dek,
    dekNonce: r.dek_nonce,
    dekTag: r.dek_tag,
    kekVersion: Number(r.kek_version),
  };
  return {
    id,
    ownerUserId: owner,
    provider: r.provider,
    apiKey: open(sealed, aad(id, owner, r.provider)),
    baseUrl: r.base_url ?? null,
    freeOnly: Number(r.free_only) === 1,
    status: r.status,
    allowedApps: asApps(r.allowed_apps),
    dailyRequestCap: r.daily_request_cap == null ? null : Number(r.daily_request_cap),
    label: r.label,
  };
}

/** Successful personal calls: when the key was last used. Fire-and-forget. */
export function touchCredential(id: number): void {
  db.execute(sql`UPDATE AiCredential SET last_used_at = ${new Date()}, status = IF(status IN ('rate_limited','unreachable'), 'active', status), status_detail = IF(status IN ('rate_limited','unreachable'), NULL, status_detail) WHERE credential_id = ${id}`).catch(
    (e: any) => logger.warn("[my-ai] could not mark key used", { error: e?.message }),
  );
}

const FAILURE_STATUS: Record<string, CredentialStatus | null> = {
  AI_KEY_INVALID: "invalid",
  AI_KEY_NO_CREDIT: "no_credit",
  AI_KEY_RATE_LIMITED: "rate_limited",
  AI_PERSONAL_FAILED: null,
};

/**
 * A call on this key failed. A refused key or an empty account is marked so the router
 * stops using it, and the owner gets one notification (refreshed, not stacked).
 */
export async function noteCredentialFailure(id: number, code: string): Promise<void> {
  const status = FAILURE_STATUS[code];
  if (!status) return;
  try {
    const [r] = rows(await db.execute(sql`SELECT owner_user_id, label, status FROM AiCredential WHERE credential_id = ${id} LIMIT 1`));
    if (!r) return;
    const detail = status === "invalid" ? "The provider refused this key." : status === "no_credit" ? "The account is out of credit." : "Rate-limited by the provider.";
    await db.execute(sql`UPDATE AiCredential SET status = ${status}, status_detail = ${detail} WHERE credential_id = ${id}`);
    if (r.owner_user_id != null && status !== "rate_limited" && r.status !== status) {
      await notifyUser({
        userId: Number(r.owner_user_id),
        kind: "ai_key_problem",
        title: `Your AI key "${r.label}" stopped working`,
        body: `${detail} The school's AI is answering instead until you fix it in My AI.`,
        link: "/my-ai",
        subjectType: "ai_credential",
        subjectId: id,
      });
    }
  } catch (e: any) {
    logger.warn("[my-ai] could not record key failure", { error: e?.message });
  }
}

/** Personal calls on this key today (successful or not), for its daily cap. */
export async function usedToday(credentialId: number): Promise<number> {
  const [r] = rows(
    await db.execute(sql`SELECT COUNT(*) AS n FROM AIUsageLog WHERE credential_id = ${credentialId} AND occurred_at >= ${startOfUtcDay()}`),
  );
  return Number(r?.n ?? 0);
}

/** A student's personal calls today across all their keys (students.maxDailyRequests). */
export async function userPersonalUsedToday(userId: number): Promise<number> {
  const [r] = rows(
    await db.execute(sql`SELECT COUNT(*) AS n FROM AIUsageLog WHERE actor_user_id = ${userId} AND route = 'personal' AND occurred_at >= ${startOfUtcDay()}`),
  );
  return Number(r?.n ?? 0);
}

/** Deactivated or deleted user: their keys stop at once (active-users-only rule). */
export async function disableCredentialsOf(userId: number): Promise<void> {
  await db
    .execute(sql`UPDATE AiCredential SET status = 'disabled', status_detail = 'The account was deactivated.' WHERE owner_user_id = ${userId}`)
    .catch((e: any) => {
      if (e?.code !== "ER_NO_SUCH_TABLE") logger.warn("[my-ai] could not disable keys", { error: e?.message });
    });
}

/**
 * Daily re-check (PERSONAL_AI_PROVIDERS_PLAN.md §7.2): keys used in the last 30 days and not
 * checked for a day. At most `limit` per run, one at a time, to spare people's quotas.
 */
export async function sweepCredentials(limit = 50): Promise<{ checked: number; changed: number }> {
  if (!isVaultConfigured()) return { checked: 0, changed: 0 };
  let due: any[];
  try {
    due = rows(
      await db.execute(sql`
        SELECT credential_id, owner_user_id, status FROM AiCredential
        WHERE owner_user_id IS NOT NULL AND status <> 'disabled'
          AND last_used_at >= ${new Date(Date.now() - 30 * 86_400_000)}
          AND (last_validated_at IS NULL OR last_validated_at < ${new Date(Date.now() - 86_400_000)})
        ORDER BY last_validated_at LIMIT ${limit}`),
    );
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE") return { checked: 0, changed: 0 };
    throw e;
  }
  let changed = 0;
  for (const r of due) {
    try {
      const secret = await loadSecret(Number(r.credential_id), Number(r.owner_user_id));
      const check = await validateKey(secret.provider, secret.apiKey, secret.baseUrl);
      await saveCheck(secret.id, check);
      if (check.status !== r.status) {
        changed++;
        if (check.status === "invalid") await noteCredentialFailure(secret.id, "AI_KEY_INVALID");
        if (check.status === "no_credit") await noteCredentialFailure(secret.id, "AI_KEY_NO_CREDIT");
      }
    } catch (e: any) {
      logger.warn("[my-ai] sweep could not check a key", { credentialId: r.credential_id, error: e?.message });
    }
  }
  return { checked: due.length, changed };
}
