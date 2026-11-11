import express from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { School } from "../db/schema";
import { PRIMARY_TENANT_ID, TenantCtx, isTenantUsable, runWithTenant } from "../vendor/nga-tenancy";
import { findTenant, primaryTenant, responseTenant } from "../tenancy";
import { publicApiBase } from "../services/avatar/urls";

/**
 * GET /tenant/branding?slug=<slug>|tid=<tid>  (public, MIS-S10)
 *
 * What a sign-in page or app shell needs to look like the school before anyone is
 * signed in: name, logo URLs (through the existing public School logo endpoint) and
 * the primary colour when the school has set one (PlatformSetting 'branding').
 * Without a slug it answers for the caller's school (token) -- NGA for a stranger.
 *
 * Logos are institutional branding, not sensitive data (same rule as /schools/:id/logo).
 */
const router = express.Router();

type LogoSlot = "primary" | "partner" | "documents";
const SLOTS: Array<[LogoSlot, "logo" | "partner_logo" | "documents_logo"]> = [
  ["primary", "logo"],
  ["partner", "partner_logo"],
  ["documents", "documents_logo"],
];

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

async function readPrimaryColor(): Promise<string | null> {
  try {
    const r: any = await db.execute(sql`SELECT value FROM PlatformSetting WHERE setting_key = 'branding' LIMIT 1`);
    const row = (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r)?.[0];
    if (!row) return null;
    const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    const c = v?.primary_color ?? v?.primaryColor;
    return typeof c === "string" && HEX.test(c) ? c : null;
  } catch {
    return null; // no table / no row / bad JSON: no colour
  }
}

export async function brandingFor(tenant: TenantCtx) {
  return runWithTenant(tenant, async () => {
    let school: typeof School.$inferSelect | undefined;
    try {
      [school] = await db.select().from(School).where(eq(School.status, "ACTIVE")).orderBy(asc(School.school_id)).limit(1);
    } catch {
      school = undefined;
    }
    const q = tenant.tid === PRIMARY_TENANT_ID ? "" : `?tenant=${encodeURIComponent(tenant.slug)}`;
    const logos: Record<LogoSlot, string | null> = { primary: null, partner: null, documents: null };
    if (school) {
      for (const [slot, col] of SLOTS) {
        if (school[col]) logos[slot] = `${publicApiBase()}/schools/${school.school_id}/logo/${slot}${q}`;
      }
    }
    return {
      tid: tenant.tid,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      isPrimary: tenant.isPrimary,
      school_name: school?.name ?? null,
      school_id: school?.school_id ?? null,
      logos,
      logo_url: logos.primary,
      primary_color: await readPrimaryColor(),
    };
  });
}

router.get("/branding", async (req, res) => {
  const ref = req.query.slug ?? req.query.tid ?? req.query.tenant;
  let tenant: TenantCtx | null;
  if (ref !== undefined && ref !== "") {
    tenant = await findTenant(String(ref)).catch(() => null);
    // Public: only schools people can actually use (ACTIVE / GRACE). A PENDING,
    // SUSPENDED or ARCHIVED school answers exactly like an unknown one, so its
    // name, logos and status are never handed to anybody who guesses a slug/tid.
    if (!tenant || !isTenantUsable(tenant.status)) {
      return res.status(404).json({ success: false, code: "TENANT_UNKNOWN", message: "This school is not known." });
    }
  } else {
    tenant = (req as any).tenant ?? responseTenant();
    if (!tenant) tenant = await primaryTenant();
  }
  res.set("Cache-Control", "public, max-age=300");
  return res.json({ success: true, data: await brandingFor(tenant!) });
});

export default router;
