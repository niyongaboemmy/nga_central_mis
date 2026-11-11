/**
 * Which school does a sign-in belong to? (plan Phase 2 task 1, [MIS-A2])
 *
 *  - an explicit `tenant` (slug or tid) in the request wins;
 *  - otherwise the Account Directory: one school -> route there; several ->
 *    the caller narrows (by password) or asks the person to choose;
 *  - nothing in the directory (or no control plane) -> the primary tenant, so
 *    every account that existed before tenancy signs in exactly as before.
 *  - the directory names other schools but not the primary: the primary's own
 *    database is asked too. The bootstrap backfills every tenant-1 account, but a
 *    tenant-1 user written by a path without a directory hook (imports, scripts)
 *    must not be silently routed to another school that shares the e-mail --
 *    Google sign-in has no password to narrow with, so it would land there.
 *    A hit there is indexed on the spot (self-healing).
 */
import { eq, or } from "drizzle-orm";
import { PRIMARY_TENANT_ID, TenantCtx, isTenantUsable } from "../vendor/nga-tenancy";
import { User } from "../db/schema";
import { dbForTenant } from "../db";
import { lookupDirectory, normIdentifier, syncDirectoryUser } from "./directory";
import { findTenant, getTenant } from "./registry";
import { TenantRefusal, isSuspendedRefusal, primaryTenant, tenantRefusal } from "./express";

export type LoginResolution =
  | { kind: "one"; tenant: TenantCtx; explicit: boolean }
  | { kind: "many"; tenants: TenantCtx[] }
  | { kind: "refused"; refusal: TenantRefusal };

export async function resolveLoginTenants(identifier: string, explicitTenant?: unknown): Promise<LoginResolution> {
  if (explicitTenant !== undefined && explicitTenant !== null && explicitTenant !== "") {
    const t = await findTenant(explicitTenant);
    const refusal = tenantRefusal(t);
    // A SUSPENDED school still signs in its billing owners (tenant management §6.7):
    // the sign-in checks the capability once the user is known (authController).
    if (refusal && !isSuspendedRefusal(t, refusal)) return { kind: "refused", refusal: t ? refusal : { ...refusal, status: 400 } };
    return { kind: "one", tenant: t!, explicit: true };
  }

  const hits = await lookupDirectory(identifier);
  if (!hits || hits.length === 0) return { kind: "one", tenant: await primaryTenant(), explicit: false };

  const tids = Array.from(new Set(hits.map((h) => h.tid))).sort((a, b) => a - b);
  if (!tids.includes(PRIMARY_TENANT_ID)) {
    const missed = await primaryAccountOf(identifier);
    if (missed) {
      tids.unshift(PRIMARY_TENANT_ID);
      void syncDirectoryUser(missed, PRIMARY_TENANT_ID);
    }
  }
  const tenants = (await Promise.all(tids.map((tid) => getTenant(tid)))).filter((t): t is TenantCtx => !!t);
  if (tenants.length === 0) return { kind: "one", tenant: await primaryTenant(), explicit: false };

  const usable = tenants.filter((t) => isTenantUsable(t.status));
  if (usable.length === 1) return { kind: "one", tenant: usable[0], explicit: false };
  if (usable.length > 1) return { kind: "many", tenants: usable };
  // Only unusable schools know this person: a suspended one may still let a billing
  // owner in (checked after the password); otherwise say why (pending / suspended).
  const suspendedOne = tenants.find((t) => t.status === "SUSPENDED");
  if (suspendedOne) return { kind: "one", tenant: suspendedOne, explicit: false };
  return { kind: "refused", refusal: tenantRefusal(tenants[0])! };
}

/** A tenant-1 user answering to this e-mail / username, straight from its database. */
async function primaryAccountOf(identifier: string): Promise<number | null> {
  const key = normIdentifier(identifier);
  if (!key) return null;
  try {
    const [u] = await dbForTenant(PRIMARY_TENANT_ID)
      .select({ id: User.user_id })
      .from(User)
      .where(or(eq(User.email, key), eq(User.username, key)))
      .limit(1);
    return u ? Number(u.id) : null;
  } catch {
    return null;
  }
}

/** The `choose` list sent back when several schools match. */
export const chooseList = (tenants: TenantCtx[]) => tenants.map((t) => ({ tid: t.tid, name: t.name, slug: t.slug }));

export function sendChoose(res: any, tenants: TenantCtx[]) {
  const choose = chooseList(tenants);
  return res.status(200).json({
    success: true,
    message: "This account belongs to more than one school. Choose one and sign in again.",
    choose,
    data: { choose, requiresTenant: true },
  });
}


/**
 * Tenant management §6.2: no school account opened with these credentials, but a
 * verified school applicant did -> the onboarding token (never a session) so the
 * frontend routes to /onboarding. Null otherwise. Lazy import: no cycle with auth.
 */
export async function applicantSignIn(identifier: string, password: string): Promise<{ token: string; status: string } | null> {
  if (!identifier || typeof password !== "string" || !password) return null;
  const { onboardingLoginFor } = await import("../services/tenantMgmt/applicants");
  return onboardingLoginFor(identifier, password);
}

/** Google sign-in: the e-mail is Google-verified, so a verified applicant gets the onboarding token. */
export async function applicantGoogleSignIn(email: string): Promise<{ token: string; status: string } | null> {
  if (!email) return null;
  const { onboardingTokenForVerifiedEmail } = await import("../services/tenantMgmt/applicants");
  return onboardingTokenForVerifiedEmail(email);
}

export function sendOnboarding(res: any, onboarding: { token: string; status: string }) {
  return res.status(200).json({ success: true, onboarding, data: { onboarding } });
}
