/**
 * Account Directory (ADR-5): control-plane index of `email/username -> (tenant,
 * user)`, so sign-in can find which school(s) an identifier belongs to without
 * touching every tenant database.
 *
 * Written by the bootstrap backfill (tenant 1), on every successful sign-in
 * (self-healing), and by the user create/update/delete hooks. Every write is
 * best-effort: a directory hiccup must never fail a user operation.
 */
import { and, eq, or } from "drizzle-orm";
import { User, UserProfile } from "../db/schema";
import { dbForTenant } from "../db";
import { controlDb, controlPool, isControlPlaneMissing } from "../db/platform";
import { AccountDirectory } from "../db/platformSchema";
import { currentRealTenantOrNull } from "./context";

export const normIdentifier = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s ? s.slice(0, 191) : null;
};

const kindOf = (userType: string | null | undefined): "STAFF" | "STUDENT" | "PARENT" =>
  userType === "STUDENT" ? "STUDENT" : userType === "PARENT" ? "PARENT" : "STAFF";

export interface DirectoryUser {
  user_id: number;
  email: string | null;
  username: string | null;
  status: string | null;
  user_type?: string | null;
}

export async function upsertDirectoryEntry(tid: number, u: DirectoryUser): Promise<void> {
  const row = {
    tenant_id: tid,
    user_id: u.user_id,
    email_norm: normIdentifier(u.email),
    username_norm: normIdentifier(u.username),
    kind: kindOf(u.user_type),
    status: String(u.status ?? "ACTIVE"),
  };
  // A previous account of this tenant may still hold the same e-mail.
  if (row.email_norm) {
    await controlPool().query("DELETE FROM AccountDirectory WHERE tenant_id = ? AND email_norm = ? AND user_id <> ?", [
      tid,
      row.email_norm,
      u.user_id,
    ]);
  }
  await controlDb
    .insert(AccountDirectory)
    .values(row)
    .onDuplicateKeyUpdate({ set: { email_norm: row.email_norm, username_norm: row.username_norm, kind: row.kind, status: row.status } });
}

/** Re-read one user from tenant `tid` and index it (never throws). */
export async function syncDirectoryUser(userId: number, tid?: number): Promise<void> {
  const t = tid ?? currentRealTenantOrNull()?.tid ?? 1;
  try {
    const tdb = dbForTenant(t);
    const [u] = await tdb
      .select({ user_id: User.user_id, email: User.email, username: User.username, status: User.status, user_type: UserProfile.user_type })
      .from(User)
      .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
      .where(eq(User.user_id, userId))
      .limit(1);
    if (!u) return removeDirectoryUser(userId, t);
    await upsertDirectoryEntry(t, u);
  } catch (err) {
    if (!isControlPlaneMissing(err)) logDirectoryError("sync", err);
  }
}

export async function removeDirectoryUser(userId: number, tid?: number): Promise<void> {
  const t = tid ?? currentRealTenantOrNull()?.tid ?? 1;
  try {
    await controlDb.delete(AccountDirectory).where(and(eq(AccountDirectory.tenant_id, t), eq(AccountDirectory.user_id, userId)));
  } catch (err) {
    if (!isControlPlaneMissing(err)) logDirectoryError("remove", err);
  }
}

/** Fire-and-forget form for controllers. */
export function queueDirectorySync(userId: number): void {
  void syncDirectoryUser(userId).catch(() => undefined);
}

export interface DirectoryHit {
  tid: number;
  userId: number;
  status: string;
}

/**
 * Who answers to this e-mail / username. null = the directory is not available
 * (control plane not provisioned or unreachable) -- callers fall back to tenant 1.
 */
export async function lookupDirectory(identifier: string): Promise<DirectoryHit[] | null> {
  const key = normIdentifier(identifier);
  if (!key) return [];
  try {
    const rows = await controlDb
      .select({ tid: AccountDirectory.tenant_id, userId: AccountDirectory.user_id, status: AccountDirectory.status })
      .from(AccountDirectory)
      .where(or(eq(AccountDirectory.email_norm, key), eq(AccountDirectory.username_norm, key)));
    return rows;
  } catch (err) {
    if (!isControlPlaneMissing(err)) logDirectoryError("lookup", err);
    return null;
  }
}

/** Index every user of tenant `tid` (bootstrap / provisioning). Returns the count. */
export async function backfillDirectory(tid: number): Promise<number> {
  const tdb = dbForTenant(tid);
  const users = await tdb
    .select({ user_id: User.user_id, email: User.email, username: User.username, status: User.status, user_type: UserProfile.user_type })
    .from(User)
    .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id));
  const seen = new Set<number>();
  let n = 0;
  for (const u of users) {
    if (seen.has(u.user_id)) continue;
    seen.add(u.user_id);
    await upsertDirectoryEntry(tid, u);
    n++;
  }
  return n;
}

function logDirectoryError(op: string, err: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logger = require("../utils/logger").default;
  logger.warn(`[tenancy] account directory ${op} failed: ${(err as Error)?.message ?? err}`);
}
