/**
 * Daily tenant-management jobs (plan §6.7, §6.8, M6-M7) -- WORK PACKAGE D.
 *
 * Every job is exported, takes an injected `now` (tests use a fake clock) and is
 * safe to run twice the same day. startTenantMgmtScheduler() runs them once a
 * day (never under NODE_ENV=test; TENANT_MGMT_JOBS=false switches it off):
 *
 *   runRenewalJob        RENEWAL invoice auto-drafted 30 days before period_end;
 *                        reminders at renewal.reminder_days (e-mail + in-app to the
 *                        school owners + a Reminder Hub item, source_app
 *                        "platform_billing" -- the hub's app key can't hold a dot)
 *   runGraceJob          ACTIVE -> GRACE once period_end has passed
 *   runSuspendJob        GRACE -> SUSPENDED once grace_until has passed
 *   runRetentionDigest   archived schools past archive.retention_days: a digest to
 *                        the platform owner (never an automatic delete)
 *   billing.runBillingExpiry, applications.expireStaleDrafts / purgeStaleApplications
 *   runUsageFanout       TenantUsageDaily
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { getTenant } from "../../tenancy/registry";
import { platformAudit } from "../../tenancy/audit";
import { runWithTenant } from "../../vendor/nga-tenancy";
import logger from "../../utils/logger";
import { PLATFORM_CAPS } from "./catalog";
import { getPlatformSetting } from "./settings";
import { notifyPlatformStaff, notifySchoolOwners } from "./notify";
import { addCycle, addDays, dateOnly, daysUntil, scheduledChange } from "./subscription";
import { enterGrace, suspendTenant } from "./lifecycle";
import { runUsageFanout } from "./usage";

const today = (now: Date) => now.toISOString().slice(0, 10);

/** Subscriptions of non-primary ACTIVE / GRACE tenants. */
async function liveSubscriptions(): Promise<RowDataPacket[]> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT s.*, t.status AS tenant_status, t.display_name, t.slug
       FROM Subscription s JOIN Tenant t ON t.tenant_id = s.tenant_id
      WHERE s.status = 'ACTIVE' AND t.is_primary = 0 AND t.tenant_id <> 1 AND t.status IN ('ACTIVE','GRACE')`,
  );
  return rows;
}

async function alreadyDone(action: string, tid: number, key: string): Promise<boolean> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT audit_id FROM PlatformAudit WHERE action = ? AND target_tid = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.key')) = ? LIMIT 1",
    [action, tid, key],
  );
  return rows.length > 0;
}

/** Owners' user ids in the school (for the Reminder Hub audience). */
async function ownerIds(tid: number): Promise<number[]> {
  try {
    const { poolFor } = await import("../../db/pools");
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(
      `SELECT DISTINCT g.user_id AS id FROM AccessGrant g JOIN RolePermission rp ON rp.role_id = g.role_id
         JOIN Permission p ON p.perm_id = rp.perm_id WHERE g.status = 'ACTIVE' AND p.name = 'SCHOOL_BILLING_MANAGE'`,
    );
    return rows.map((r) => Number(r.id));
  } catch {
    return [];
  }
}

async function hubReminder(tid: number, periodEnd: string, title: string, body: string): Promise<void> {
  const audience = await ownerIds(tid);
  if (!audience.length) return;
  const tenant = await getTenant(tid).catch(() => null);
  if (!tenant) return;
  try {
    await runWithTenant(tenant, async () => {
      const { saveSource } = await import("../reminders/sources");
      await saveSource({
        source_app: "platform_billing",
        source_type: "event",
        external_id: `renewal-${tid}-${periodEnd}`,
        title,
        body,
        link: "/settings/subscription",
        location: null,
        starts_at: new Date(`${periodEnd}T08:00:00Z`),
        ends_at: null,
        critical: 1,
        audience_user_ids: audience,
        audience_subject_id: null,
      });
    });
  } catch (err) {
    logger.warn(`[tenantMgmt] Reminder Hub item for t${tid} skipped: ${(err as Error)?.message ?? err}`);
  }
}

/** Renewal drafts (30 days ahead) and reminders. */
export async function runRenewalJob(now = new Date()): Promise<{ drafted: number; reminded: number }> {
  const reminderDays = ((await getPlatformSetting("renewal.reminder_days")) as number[]) ?? [30, 14, 7, 1];
  let drafted = 0;
  let reminded = 0;
  for (const s of await liveSubscriptions()) {
    const tid = Number(s.tenant_id);
    const periodEnd = dateOnly(s.period_end);
    const left = daysUntil(periodEnd, now);
    try {
      if (left <= 30 && left >= -60) {
        const [open] = await controlPool().query<RowDataPacket[]>(
          "SELECT invoice_id FROM Invoice WHERE tenant_id = ? AND kind = 'RENEWAL' AND status <> 'VOID' AND (period_start IS NULL OR period_start >= ?) LIMIT 1",
          [tid, periodEnd],
        );
        if (!open[0]) {
          const scheduled = await scheduledChange(tid);
          const pkg = scheduled ? String(scheduled.to_package) : String(s.package_code);
          const cycle = (scheduled?.billing_cycle ?? s.billing_cycle ?? "TERM") as "TERM" | "YEAR";
          const billing = await import("./billing");
          const invoiceId = await billing.createInvoice({
            kind: "RENEWAL",
            tenantId: tid,
            packageCode: pkg,
            billingCycle: cycle,
            periodStart: periodEnd,
            periodEnd: addCycle(periodEnd, cycle),
            notes: `Renewal of ${s.display_name}`,
            issue: false,
            createdBy: null,
          });
          drafted++;
          await platformAudit({ action: "renewal.draft", targetTid: tid, payload: { invoiceId, periodEnd, key: periodEnd } });
        }
      }
      if (reminderDays.includes(left)) {
        const key = `${periodEnd}:${left}`;
        if (!(await alreadyDone("renewal.reminder", tid, key))) {
          const title = left === 1 ? "Your subscription ends tomorrow" : `Your subscription ends in ${left} days`;
          const body = `${s.display_name}'s ${s.package_code} subscription ends on ${periodEnd}. Renew to keep every app working.`;
          await notifySchoolOwners(tid, { title, body, link: "/settings/subscription", subjectId: tid });
          await hubReminder(tid, periodEnd, title, body);
          await platformAudit({ action: "renewal.reminder", targetTid: tid, payload: { key, daysLeft: left } });
          reminded++;
        }
      }
    } catch (err) {
      logger.error("[tenantMgmt] renewal job failed for a tenant", { tid, error: err });
    }
  }
  return { drafted, reminded };
}

/** ACTIVE -> GRACE when the period ended (period_end is the last paid day). */
export async function runGraceJob(now = new Date()): Promise<number> {
  let moved = 0;
  for (const s of await liveSubscriptions()) {
    if (s.tenant_status !== "ACTIVE") continue;
    const periodEnd = dateOnly(s.period_end);
    if (periodEnd >= today(now)) continue;
    const tid = Number(s.tenant_id);
    try {
      if (await enterGrace(tid, periodEnd)) {
        moved++;
        const days = Number(await getPlatformSetting("grace.days")) || 14;
        await notifySchoolOwners(tid, {
          title: "Your subscription has expired",
          body: `Everything keeps working until ${addDays(periodEnd, days)}. Renew before then to avoid a suspension.`,
          link: "/settings/subscription",
          subjectId: tid,
        });
      }
    } catch (err) {
      logger.error("[tenantMgmt] grace job failed for a tenant", { tid, error: err });
    }
  }
  return moved;
}

/** GRACE -> SUSPENDED after grace_until. */
export async function runSuspendJob(now = new Date()): Promise<number> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT tenant_id, grace_until FROM Tenant WHERE status = 'GRACE' AND is_primary = 0 AND tenant_id <> 1 AND grace_until IS NOT NULL AND grace_until < ?",
    [now],
  );
  let moved = 0;
  for (const r of rows) {
    const tid = Number(r.tenant_id);
    try {
      await suspendTenant(tid, "Grace period ended without payment", { userId: null }, { system: true });
      moved++;
      await notifySchoolOwners(tid, {
        title: "Your school is suspended",
        body: "Only the school owner can sign in now, to renew the subscription.",
        link: "/settings/subscription",
        subjectId: tid,
      });
    } catch (err) {
      logger.error("[tenantMgmt] suspend job failed for a tenant", { tid, error: err });
    }
  }
  return moved;
}

/** Archived schools past the retention window: a digest, never an automatic delete. */
export async function runRetentionDigest(now = new Date()): Promise<number> {
  const days = Number(await getPlatformSetting("archive.retention_days")) || 180;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT tenant_id, display_name, archived_at FROM Tenant WHERE status = 'ARCHIVED' AND archived_at IS NOT NULL AND archived_at < ?",
    [cutoff],
  );
  if (!rows.length) return 0;
  const key = today(now);
  const [done] = await controlPool().query<RowDataPacket[]>(
    "SELECT audit_id FROM PlatformAudit WHERE action = 'retention.digest' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.key')) = ? LIMIT 1",
    [key],
  );
  if (done.length) return rows.length;
  await notifyPlatformStaff({
    event: "billing.digest",
    caps: [PLATFORM_CAPS.packages],
    title: `${rows.length} archived school(s) past the ${days}-day retention window`,
    body: rows.map((r) => `${r.display_name} (archived ${dateOnly(r.archived_at)})`).join("\n") + "\n\nDelete them from the console when you're ready.",
    link: "/platform/tenants?status=ARCHIVED",
    subjectType: "tenant",
    subjectId: Number(rows[0].tenant_id),
    email: true,
  }).catch(() => 0);
  await platformAudit({ action: "retention.digest", payload: { key, tenants: rows.map((r) => Number(r.tenant_id)) } });
  return rows.length;
}

async function optional<T>(label: string, fn: () => Promise<T>): Promise<T | { skipped: string }> {
  try {
    return await fn();
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (/not implemented|Cannot find module|is not a function/.test(msg)) return { skipped: msg };
    logger.error(`[tenantMgmt] ${label} failed`, { error: err });
    return { skipped: msg };
  }
}

/** Every daily job, in order. Never throws. */
export async function runDailyTenantJobs(now = new Date()) {
  const report: Record<string, unknown> = {};
  report.renewals = await optional("renewals", () => runRenewalJob(now));
  report.grace = await optional("grace", () => runGraceJob(now));
  report.suspended = await optional("suspend", () => runSuspendJob(now));
  report.retention = await optional("retention", () => runRetentionDigest(now));
  report.billingExpiry = await optional("billing expiry", async () => (await import("./billing")).runBillingExpiry());
  const appsPath = "./applications";
  report.drafts = await optional("draft expiry", async () => (await import(appsPath)).expireStaleDrafts(now));
  report.purge = await optional("application purge", async () => (await import(appsPath)).purgeStaleApplications(now));
  report.usage = await optional("usage", () => runUsageFanout(now));
  return report;
}

let started = false;

/** Daily scheduler (index.ts). Only with a provisioned control plane. */
export function startTenantMgmtScheduler(): void {
  if (started || process.env.NODE_ENV === "test" || process.env.TENANT_MGMT_JOBS === "false") return;
  started = true;
  const tick = async () => {
    try {
      await controlPool().query("SELECT 1 FROM Tenant LIMIT 1");
    } catch (err) {
      if (!isControlPlaneMissing(err)) logger.warn(`[tenantMgmt] jobs skipped: ${(err as Error)?.message ?? err}`);
      return;
    }
    const report = await runDailyTenantJobs(new Date());
    logger.info("[tenantMgmt] daily jobs", { report });
  };
  setTimeout(tick, 3 * 60_000).unref();
  setInterval(tick, 24 * 60 * 60 * 1000).unref();
}
