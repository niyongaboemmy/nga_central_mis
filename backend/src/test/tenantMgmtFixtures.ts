/**
 * Fixtures for the tenant-operations suites (work package D): an application in
 * PAYMENT_CONFIRMED, a provisioned school, platform staff with PLATFORM_* caps,
 * session tokens and cleanup of the databases a test created.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { controlPool } from "../db/platform";
import { poolFor } from "../db/pools";
import { AccessGrant, AccessRolePermission } from "../db/accessSchema";
import { bootstrapPlatform, dropMisTenantDatabase, invalidateTenants } from "../tenancy";
import { startProvisioning, waitForProvisioning } from "../services/tenantMgmt/provisioning";
import { vi } from "vitest";
import emailService from "../utils/email";
import { createRoleWithPermissions, createUser } from "./fixtures";

export const PASSWORD = "Sch00l-Owner!pw";

export const stampOf = () => `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let platformReady = false;
export async function ensurePlatform(): Promise<void> {
  // Never a real e-mail from a test (welcome, reminders, staff notices).
  vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
  if (!platformReady) {
    await bootstrapPlatform();
    platformReady = true;
  }
  invalidateTenants();
}

/** An ApplicantAccount + TenantApplication (status PAYMENT_CONFIRMED by default), straight in SQL. */
export async function seedApplication(opts: { pkg?: string; status?: string; cycle?: "TERM" | "YEAR" } = {}) {
  const s = stampOf();
  const email = `owner-${s}@school.test`;
  const slug = `sch-${s}`;
  const [acc]: any = await controlPool().query(
    "INSERT INTO ApplicantAccount (email_norm, full_name, phone, password_hash, email_verified_at, status) VALUES (?, ?, ?, ?, NOW(), 'ACTIVE')",
    [email, "Grace Owner", "+250788000000", await bcrypt.hash(PASSWORD, 4)],
  );
  const accountId = Number(acc.insertId);
  const [app]: any = await controlPool().query(
    `INSERT INTO TenantApplication (ref, account_id, status, school_name, school_type, country, district, address, school_phone, school_email,
       requested_package, approved_package, billing_cycle, desired_slug, submitted_at, decided_at)
     VALUES (?, ?, ?, ?, 'secondary', 'RW', 'Gasabo', 'KG 1 Ave', '+250788111111', ?, ?, ?, ?, ?, NOW(), NOW())`,
    [`APP-T-${s}`.slice(0, 20), accountId, opts.status ?? "PAYMENT_CONFIRMED", `School ${s}`, `info-${s}@school.test`, opts.pkg ?? "gold", opts.pkg ?? "gold", opts.cycle ?? "TERM", slug],
  );
  return { applicationId: Number(app.insertId), accountId, email, slug, name: `School ${s}` };
}

/** Seed + provision + wait. Returns the new school. */
export async function provisionSchool(opts: { pkg?: string } = {}) {
  const seeded = await seedApplication(opts);
  const { runId } = await startProvisioning(seeded.applicationId);
  await waitForProvisioning(seeded.applicationId);
  invalidateTenants();
  const [[t]] = await controlPool().query<any[]>("SELECT tenant_id FROM Tenant WHERE application_id = ?", [seeded.applicationId]);
  const tid = Number(t?.tenant_id);
  const [[u]] = await poolFor(tid).query<any[]>("SELECT user_id FROM `User` WHERE email = ?", [seeded.email]);
  return { ...seeded, runId, tid, ownerId: Number(u?.user_id) };
}

/** Drop a test school's database and its control-plane rows. */
export async function removeSchool(tid: number | null | undefined, applicationId?: number): Promise<void> {
  if (tid && tid > 1) {
    invalidateTenants();
    await dropMisTenantDatabase(tid).catch(() => undefined);
    for (const t of ["TenantSystem", "AccountDirectory", "TenantEntitlementOverride", "TenantUsageDaily", "TenantUsageCounter", "TenantSetupState", "SupportSession", "Subscription", "SubscriptionChange", "TenantMigration"]) {
      await controlPool().query(`DELETE FROM \`${t}\` WHERE tenant_id = ?`, [tid]).catch(() => undefined);
    }
    await controlPool().query("DELETE FROM Invoice WHERE tenant_id = ?", [tid]).catch(() => undefined);
    await controlPool().query("DELETE FROM Tenant WHERE tenant_id = ?", [tid]).catch(() => undefined);
  }
  if (applicationId) {
    await controlPool().query("DELETE FROM ProvisioningStep WHERE run_id IN (SELECT run_id FROM ProvisioningRun WHERE application_id = ?)", [applicationId]).catch(() => undefined);
    await controlPool().query("DELETE FROM ProvisioningRun WHERE application_id = ?", [applicationId]).catch(() => undefined);
  }
  invalidateTenants();
}

/** A session token for user `userId` of tenant `tid` (current token_version). */
export async function sessionToken(userId: number, tid: number, extra: Record<string, unknown> = {}): Promise<string> {
  const [[u]] = await poolFor(tid).query<any[]>("SELECT token_version FROM `User` WHERE user_id = ?", [userId]);
  return jwt.sign({ userId, tokenVersion: Number(u?.token_version ?? 0), tid, ...extra }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}

/** The capability row (mis app), created when the cloned catalog lacks it. */
async function ensureCap(key: string, kind: "READ" | "WRITE"): Promise<number> {
  const find = async () => ((await db.execute(sql`SELECT perm_id FROM Permission WHERE name = ${key} LIMIT 1`)) as any)[0][0]?.perm_id as number | undefined;
  let id = await find();
  if (!id) {
    await db.execute(sql`
      INSERT INTO Permission (name, description, status, app, cap_key, label, domain, kind, depths, restricted, scopeable)
      VALUES (${key}, ${key}, 'ACTIVE', 'mis', ${key}, ${key}, 'SYSTEM', ${kind}, ${kind === "READ" ? "summary,detail" : null}, 0, 0)`);
    id = await find();
  }
  await db.execute(sql`UPDATE Permission SET status = 'ACTIVE', deprecated_at = NULL, app = 'mis', cap_key = ${key} WHERE perm_id = ${id}`);
  return id!;
}

/** A primary-tenant user holding exactly `caps` through a PLATFORM-scope grant. */
export async function platformUser(caps: string[]): Promise<{ id: number; token: string }> {
  const roleId = await createRoleWithPermissions("PLATFORM_D_TEST", []);
  for (const c of caps) {
    const permId = await ensureCap(c, c === "PLATFORM_TENANTS_VIEW" || c === "PLATFORM_AUDIT_VIEW" ? "READ" : "WRITE");
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: permId, depth: null }).catch(() => undefined);
  }
  const id = await createUser({ userType: "ADMIN" });
  await db.insert(AccessGrant).values({ user_id: id, role_id: roleId, scope_type: "PLATFORM" as any, source: "MANUAL", status: "ACTIVE" });
  return { id, token: jwt.sign({ userId: id, tokenVersion: 0, tid: 1 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
}
