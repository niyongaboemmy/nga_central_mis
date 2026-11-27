import express from "express";
import multer from "multer";
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../db/platform";
import { primaryDb } from "../db";
import { sql } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { PLATFORM_CAPS } from "../services/tenantMgmt/catalog";
import { moduleSchools, resolveSchoolIds, schoolModules } from "../services/tenantMgmt/modules";
import { holds, platformActor, requirePlatform } from "../services/tenantMgmt/guards";
import { resolveEntitlements } from "../services/tenantMgmt/entitlements";
import { currentSubscriptionRow, dateOnly, serializeSubscription } from "../services/tenantMgmt/subscription";
import { liveUsage, tenantUsage } from "../services/tenantMgmt/usage";
import {
  addOverride,
  allowedActions,
  archiveTenant,
  changeTenantPackage,
  deleteTenant,
  extendGrace,
  reactivateTenant,
  removeOverride,
  setTenantApp,
  setModuleForSchools,
  suspendTenant,
  tenantRow,
  updateTenantDetails,
} from "../services/tenantMgmt/lifecycle";
import { retryRun, runForTenant, serializeRun } from "../services/tenantMgmt/provisioning";
import { listActiveSessions, openSession } from "../services/tenantMgmt/support";
import { assignableRoles, copyPersonInto, searchEverySchool } from "../services/tenantMgmt/crossSchool";
import { createTenantAdmin, listTenantAdmins, removeTenantAdmin, resetTenantAdminPassword } from "../services/tenantMgmt/tenantAdmins";
import { clearTenantLogo, setTenantLogo } from "../services/tenantMgmt/tenantLogo";
import { brandingFor } from "./tenantBranding";
import { getTenant } from "../tenancy/registry";

/**
 * Tenant directory, lifecycle, provisioning and support access of the primary
 * console (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.5, §6.8, §6.9, §7) --
 * contract: `platformApi` in frontend/src/api/tenantMgmt.ts.
 *
 * Aggregates only (§6.9 / §10): counts, sizes, statuses -- never a school's
 * people or records, except its administrators (tenantAdmins.ts). Every route: primary tenant + a PLATFORM_* capability.
 */
const router = express.Router();

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const ok = (res: any, data: unknown) => res.json({ success: true, data });
const idParam = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError("Invalid id");
  return n;
};
type H = (req: any, res: any) => Promise<unknown>;
const wrap = (fn: H) => (req: any, res: any, next: any) => fn(req, res).catch(next);

const VIEW = requirePlatform(PLATFORM_CAPS.view);
const LIFECYCLE = requirePlatform(PLATFORM_CAPS.lifecycle);
const ENTITLEMENTS = requirePlatform(PLATFORM_CAPS.entitlements);
const SUPPORT = requirePlatform(PLATFORM_CAPS.support);

/** Primary-tenant user names (actors, grantors) by id. */
async function staffNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const list = Array.from(new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (!list.length) return out;
  try {
    const rows = (await primaryDb().execute(sql`
      SELECT u.user_id, u.username, p.first_name, p.last_name FROM \`User\` u LEFT JOIN UserProfile p ON p.user_id = u.user_id
       WHERE u.user_id IN (${sql.join(list.map((n) => sql`${n}`), sql`, `)})`)) as any;
    for (const r of rows[0] as RowDataPacket[]) out.set(Number(r.user_id), [r.first_name, r.last_name].filter(Boolean).join(" ") || String(r.username));
  } catch {
    /* names are cosmetic */
  }
  return out;
}

async function listItems(where = "", params: unknown[] = []) {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT t.*,
            u.students, u.staff, u.storage_mb, u.active_users,
            (SELECT MAX(d.day) FROM TenantUsageDaily d WHERE d.tenant_id = t.tenant_id AND d.active_users > 0) AS last_active_day,
            (SELECT MAX(s.period_end) FROM Subscription s WHERE s.tenant_id = t.tenant_id AND s.status = 'ACTIVE') AS period_end
       FROM Tenant t
       LEFT JOIN TenantUsageDaily u ON u.tenant_id = t.tenant_id
            AND u.day = (SELECT MAX(x.day) FROM TenantUsageDaily x WHERE x.tenant_id = t.tenant_id)
      ${where}
      ORDER BY t.is_primary DESC, t.tenant_id`,
    params,
  );
  const items = rows.map((r) => ({
    tid: Number(r.tenant_id),
    slug: String(r.slug),
    name: String(r.display_name),
    status: r.status,
    isPrimary: Number(r.tenant_id) === 1 || Number(r.is_primary) === 1,
    pkg: String(r.package_code),
    students: Number(r.students ?? 0),
    staff: Number(r.staff ?? 0),
    storageMb: Number(r.storage_mb ?? 0),
    activeUsers7d: Number(r.active_users ?? 0),
    periodEnd: r.period_end ? dateOnly(r.period_end) : null,
    graceUntil: iso(r.grace_until),
    lastActivityAt: r.last_active_day ? new Date(`${dateOnly(r.last_active_day)}T00:00:00Z`).toISOString() : null,
    createdAt: iso(r.created_at)!,
    usageLive: false,
    usageAt: null as string | null,
    /** the school's effective limits (package + overrides; null = unlimited) */
    limits: null as null | { students: number | null; staff: number | null; storageGb: number | null },
    _row: r,
  }));
  // Current numbers from each school's own database (cached a minute), not the nightly
  // snapshot that can be a day old or missing. A school whose database can't answer
  // within 5 s keeps its snapshot values (usageLive false).
  await Promise.all(
    items.map(async (it) => {
      if (it.status === "ARCHIVED") return;
      try {
        const ent = await resolveEntitlements(it.tid);
        const lim = (k: string) => (ent.unrestricted ? null : (ent.limits[k] ?? null));
        it.limits = { students: lim("limit.students"), staff: lim("limit.staff"), storageGb: lim("limit.storage_gb") };
      } catch {
        /* limits unknown: the console falls back to the package */
      }
      if (!it.isPrimary && !it._row.mis_db_name) return;
      const live = await Promise.race([liveUsage(it.tid).catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 5000).unref?.())]);
      if (!live) return;
      it.students = live.students;
      it.staff = live.staff;
      it.storageMb = live.storageMb;
      it.activeUsers7d = live.activeUsers7d;
      it.lastActivityAt = live.lastActivityAt ?? it.lastActivityAt;
      it.usageLive = true;
      it.usageAt = live.at;
    }),
  );
  return items;
}

const publicItem = ({ _row, ...item }: any) => item;

/** The school's primary logo URL (same as GET /tenant/branding), or null. Cosmetic: never throws. */
async function logoUrlOf(tid: number): Promise<string | null> {
  try {
    const tenant = await getTenant(tid);
    return tenant ? (await brandingFor(tenant)).logoUrl : null;
  } catch {
    return null;
  }
}

export async function tenantDetail(tid: number, can: (cap: string) => boolean) {
  const [item] = await listItems("WHERE t.tenant_id = ?", [tid]);
  if (!item) throw new NotFoundError("School not found");
  const r = item._row;
  const ent = await resolveEntitlements(tid);

  const [ovr] = await controlPool().query<RowDataPacket[]>("SELECT * FROM TenantEntitlementOverride WHERE tenant_id = ? ORDER BY id DESC", [tid]);
  const [audit] = await controlPool().query<RowDataPacket[]>("SELECT * FROM PlatformAudit WHERE target_tid = ? ORDER BY at DESC, audit_id DESC LIMIT 50", [tid]);
  const names = await staffNames([...ovr.map((o) => Number(o.granted_by)), ...audit.map((a) => Number(a.actor_user_id))]);
  let invoices: any[] = [];
  try {
    invoices = await (await import("../services/tenantMgmt/billing")).invoicesForTenant(tid, "platform");
  } catch {
    invoices = [];
  }
  // Every module, on or off: a module added after the school was created has no
  // TenantSystem row yet and must still be listed, or it could never be switched on.
  const apps = await schoolModules(tid, ent);

  return {
    tenant: {
      ...publicItem(item),
      legalName: r.legal_name ?? null,
      logoUrl: await logoUrlOf(tid),
      timezone: String(r.timezone),
      country: r.country ?? null,
      activatedAt: iso(r.activated_at),
      suspendedAt: iso(r.suspended_at),
      statusReason: r.status_reason ?? null,
    },
    entitlements: { pkg: ent.pkg, unrestricted: ent.unrestricted, apps: ent.apps, features: ent.features, limits: ent.limits },
    overrides: ovr.map((o) => ({
      id: Number(o.id),
      key: String(o.ent_key),
      value: o.value_int === null ? null : Number(o.value_int),
      enabled: Number(o.enabled) === 1,
      reason: String(o.reason),
      expiresAt: iso(o.expires_at),
      grantedBy: o.granted_by ? names.get(Number(o.granted_by)) ?? null : null,
    })),
    apps,
    usage: await tenantUsage(tid, ent),
    subscription: serializeSubscription(await currentSubscriptionRow(tid)),
    invoices,
    provisioning: await runForTenant(tid),
    audit: audit.map((a) => ({
      id: Number(a.audit_id),
      at: iso(a.at)!,
      action: String(a.action),
      actor: a.actor_user_id ? names.get(Number(a.actor_user_id)) ?? `User ${a.actor_user_id}` : null,
      targetTid: a.target_tid === null ? null : Number(a.target_tid),
      payload: typeof a.payload === "string" ? JSON.parse(a.payload) : a.payload,
    })),
    allowedActions: allowedActions(r, can),
  };
}

const detailFor = (req: any, tid: number) => tenantDetail(tid, (cap) => holds(req, cap));

// --- directory --------------------------------------------------------------

router.get(
  "/tenants",
  ...VIEW,
  wrap(async (req, res) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (typeof req.query.status === "string" && req.query.status) {
      where.push("t.status = ?");
      params.push(req.query.status.toUpperCase());
    }
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      where.push("(t.display_name LIKE ? OR t.slug LIKE ?)");
      const like = `%${req.query.q.trim()}%`;
      params.push(like, like);
    }
    ok(res, (await listItems(where.length ? `WHERE ${where.join(" AND ")}` : "", params)).map(publicItem));
  }),
);

router.get(
  "/tenants/:id",
  ...VIEW,
  wrap(async (req, res) => ok(res, await detailFor(req, idParam(req.params.id)))),
);

// --- details ----------------------------------------------------------------

// Name, legal name (on invoices), timezone, country. The slug is fixed. Reason required.
router.put(
  "/tenants/:id/details",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    const b = req.body ?? {};
    await updateTenantDetails(tid, { name: b.name, legalName: b.legalName, timezone: b.timezone, country: b.country, reason: b.reason }, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

// The school's logo (same storage and checks as the school's own upload; 5 MB, PNG/JPG/SVG/WEBP).
const logoMulter = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const takeLogo = (req: any, res: any, next: any) =>
  logoMulter.single("file")(req, res, (err: any) => {
    if (!err) return next();
    const big = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({ success: false, message: big ? "The image is larger than 5 MB" : "That upload couldn't be read" });
  });

router.post(
  "/tenants/:id/logo",
  ...LIFECYCLE,
  takeLogo,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await setTenantLogo(tid, (req as any).file, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.delete(
  "/tenants/:id/logo",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await clearTenantLogo(tid, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

// --- lifecycle --------------------------------------------------------------

router.post(
  "/tenants/:id/suspend",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await suspendTenant(tid, req.body?.reason, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.post(
  "/tenants/:id/reactivate",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await reactivateTenant(tid, req.body?.reason, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.post(
  "/tenants/:id/extend-grace",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await extendGrace(tid, req.body?.days, req.body?.reason, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.post(
  "/tenants/:id/archive",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await archiveTenant(tid, req.body?.reason, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

// Owner-level: lifecycle AND packages (only the platform owner holds both).
router.post(
  "/tenants/:id/delete",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    if (!holds(req, PLATFORM_CAPS.packages)) return res.status(403).json({ success: false, message: "Only the platform owner can delete a school." });
    await deleteTenant(idParam(req.params.id), req.body?.confirmName, platformActor(req));
    ok(res, { ok: true });
  }),
);

// --- package, overrides, apps -----------------------------------------------

router.put(
  "/tenants/:id/package",
  ...ENTITLEMENTS,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await changeTenantPackage(tid, req.body?.packageCode, req.body?.reason, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.post(
  "/tenants/:id/overrides",
  ...ENTITLEMENTS,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await tenantRow(tid);
    await addOverride(tid, req.body ?? {}, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.delete(
  "/tenants/:id/overrides/:overrideId",
  ...ENTITLEMENTS,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await removeOverride(tid, idParam(req.params.overrideId), platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

router.put(
  "/tenants/:id/apps/:systemId",
  ...ENTITLEMENTS,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    await setTenantApp(tid, idParam(req.params.systemId), req.body?.status, platformActor(req));
    ok(res, await detailFor(req, tid));
  }),
);

// --- modules: which schools have one ---------------------------------------
// The same switch as PUT /tenants/:id/apps/:systemId, seen from the module: used
// by Modules -> a module -> Schools, and to give a new module to several schools.

router.get(
  "/modules/:systemId/schools",
  ...VIEW,
  wrap(async (req, res) => {
    ok(res, await moduleSchools(idParam(req.params.systemId)));
  }),
);

router.put(
  "/modules/:systemId/schools",
  ...ENTITLEMENTS,
  wrap(async (req, res) => {
    const systemId = idParam(req.params.systemId);
    const tids = await resolveSchoolIds(req.body?.tids);
    await setModuleForSchools(systemId, tids, req.body?.status, platformActor(req));
    ok(res, await moduleSchools(systemId));
  }),
);

// --- administrators (the one list of people the console shows) -------------

router.get(
  "/tenants/:id/admins",
  ...VIEW,
  wrap(async (req, res) => ok(res, await listTenantAdmins(idParam(req.params.id)))),
);

router.post(
  "/tenants/:id/admins",
  ...LIFECYCLE,
  wrap(async (req, res) => ok(res, await createTenantAdmin(idParam(req.params.id), req.body ?? {}, platformActor(req)))),
);

router.post(
  "/tenants/:id/admins/:userId/reset-password",
  ...LIFECYCLE,
  wrap(async (req, res) =>
    ok(res, await resetTenantAdminPassword(idParam(req.params.id), idParam(req.params.userId), req.body?.reason, platformActor(req))),
  ),
);

router.delete(
  "/tenants/:id/admins/:userId",
  ...LIFECYCLE,
  wrap(async (req, res) => ok(res, await removeTenantAdmin(idParam(req.params.id), idParam(req.params.userId), req.body?.reason, platformActor(req)))),
);

// --- one person, several schools (crossSchool.ts) ----------------------------

router.get(
  "/people",
  ...VIEW,
  wrap(async (req, res) => ok(res, await searchEverySchool(req.query.q, req.query.forTid ? idParam(req.query.forTid) : null))),
);

router.get(
  "/tenants/:id/roles",
  ...VIEW,
  wrap(async (req, res) => ok(res, await assignableRoles(idParam(req.params.id)))),
);

router.post(
  "/tenants/:id/people",
  ...LIFECYCLE,
  wrap(async (req, res) => {
    const tid = idParam(req.params.id);
    if (tid === 1) return res.status(409).json({ success: false, message: "People join the primary school from its own Users screen." });
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length < 3) throw new ValidationError("A reason is required");
    ok(
      res,
      await copyPersonInto({
        sourceTid: idParam(req.body?.sourceTid),
        sourceUserId: idParam(req.body?.sourceUserId),
        targetTid: tid,
        roleIds: Array.isArray(req.body?.roleIds) ? req.body.roleIds : [],
        actorUserId: platformActor(req).userId,
        via: "platform",
        reason,
        ip: req.ip ?? null,
      }),
    );
  }),
);

// --- provisioning -----------------------------------------------------------

router.get(
  "/provisioning/:runId",
  ...VIEW,
  wrap(async (req, res) => ok(res, await serializeRun(idParam(req.params.runId), "platform"))),
);

router.post(
  "/provisioning/:runId/retry",
  ...LIFECYCLE,
  wrap(async (req, res) => ok(res, await retryRun(idParam(req.params.runId), platformActor(req).userId))),
);

// --- support sessions (§6.9) ------------------------------------------------

router.get(
  "/support-sessions",
  ...SUPPORT,
  wrap(async (_req, res) => ok(res, await listActiveSessions())),
);

router.post(
  "/support-sessions/:id/open",
  ...SUPPORT,
  wrap(async (req, res) => ok(res, await openSession(idParam(req.params.id), Number(req.user.userId), req.ip ?? null))),
);

export default router;
