/**
 * Tenant-management notices (plan §9): in-app for platform staff (the primary
 * tenant's Notification table) and e-mail for applicants and school owners.
 * Never throws -- a delivery failure must not fail the action.
 */
import { RowDataPacket } from "mysql2/promise";
import { PRIMARY_TENANT_ID, runWithTenant } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";
import { primaryTenantCtx } from "../../vendor/nga-tenancy";
import { primaryDb } from "../../db";
import { sql } from "drizzle-orm";
import emailService, { productName } from "../../utils/email";
import { notifyUser } from "../../utils/notifications";
import { controlPool } from "../../db/platform";
import logger from "../../utils/logger";

export type PlatformEventKey =
  | "application.submitted"
  | "application.resubmitted"
  | "application.message"
  | "payment.submitted"
  | "provisioning.failed"
  | "tenant.live"
  | "billing.digest"
  | "limit.digest";

/** Primary-tenant users who hold one of `caps` through an ACTIVE grant (any scope). */
export async function platformStaffWith(caps: string[]): Promise<number[]> {
  if (caps.length === 0) return [];
  try {
    const rows = (await primaryDb().execute(sql`
      SELECT DISTINCT g.user_id AS id
        FROM AccessGrant g
        JOIN RolePermission rp ON rp.role_id = g.role_id
        JOIN Permission p ON p.perm_id = rp.perm_id
        JOIN \`User\` u ON u.user_id = g.user_id
       WHERE g.status = 'ACTIVE' AND u.status = 'ACTIVE'
         AND (g.valid_until IS NULL OR g.valid_until >= CURRENT_DATE())
         AND p.name IN (${sql.join(caps.map((c) => sql`${c}`), sql`, `)})`)) as any;
    return (rows[0] as RowDataPacket[]).map((r) => Number(r.id));
  } catch (err) {
    logger.error("[tenantMgmt] platform staff lookup failed", { err });
    return [];
  }
}

/** Opt-outs from PlatformNotificationPref (default: both channels on). */
async function prefs(userIds: number[], eventKey: string): Promise<Map<number, { email: boolean; inApp: boolean }>> {
  const out = new Map<number, { email: boolean; inApp: boolean }>();
  if (!userIds.length) return out;
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT user_id, email, in_app FROM PlatformNotificationPref WHERE event_key = ? AND user_id IN (?)",
      [eventKey, userIds],
    );
    for (const r of rows) out.set(Number(r.user_id), { email: Number(r.email) === 1, inApp: Number(r.in_app) === 1 });
  } catch {
    /* defaults */
  }
  return out;
}

/**
 * Tell platform staff holding any of `caps` (or exactly `userIds`) about an event.
 * In-app always (unless opted out); e-mail when `email` is set.
 */
export async function notifyPlatformStaff(input: {
  event: PlatformEventKey;
  caps?: string[];
  userIds?: number[];
  title: string;
  body?: string;
  link: string;
  subjectType: "platform_application" | "platform_invoice" | "platform_payment" | "tenant";
  subjectId: number;
  email?: boolean;
}): Promise<number> {
  const primary = (await getTenant(PRIMARY_TENANT_ID).catch(() => null)) ?? primaryTenantCtx();
  return runWithTenant(primary, async () => {
    const ids = input.userIds ?? (await platformStaffWith(input.caps ?? []));
    const pref = await prefs(ids, input.event);
    let sent = 0;
    for (const userId of ids) {
      const p = pref.get(userId) ?? { email: true, inApp: true };
      try {
        if (p.inApp) {
          await notifyUser({
            userId,
            kind: "platform_event",
            title: input.title,
            body: input.body,
            link: input.link,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
          });
          sent++;
        }
        if (input.email && p.email) {
          const rows = (await primaryDb().execute(sql`SELECT email FROM \`User\` WHERE user_id = ${userId}`)) as any;
          const to = rows[0]?.[0]?.email;
          if (to) await sendMail(to, input.title, input.body ?? "", input.link);
        }
      } catch (err) {
        logger.error("[tenantMgmt] staff notice failed", { err, userId });
      }
    }
    return sent;
  });
}

const appBase = () => (process.env.FRONTEND_URL || process.env.APP_URL || "https://mis.amashuri.com").replace(/\/$/, "");

/** A short branded e-mail with one button. `link` may be a path ("/onboarding"). */
export async function sendMail(to: string, subject: string, body: string, link?: string, cta = "Open"): Promise<boolean> {
  try {
    if (!emailService.isAvailable()) return false;
    const href = link ? (link.startsWith("http") ? link : `${appBase()}${link}`) : null;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
<h2 style="margin:0 0 12px;color:#0f172a">${esc(subject)}</h2>
<p style="color:#334155;line-height:1.5;white-space:pre-line">${esc(body)}</p>
${href ? `<p><a href="${esc(href)}" style="display:inline-block;background:#2f56d9;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${esc(cta)}</a></p>` : ""}
<p style="color:#64748b;font-size:12px;margin-top:24px">${esc(productName())}</p></div>`;
    return await emailService.sendEmail({ to, subject, html }, false);
  } catch (err) {
    logger.error("[tenantMgmt] e-mail failed", { err, to });
    return false;
  }
}

/** E-mail an applicant (ApplicantAccount) by id. */
export async function emailApplicant(accountId: number, subject: string, body: string, link = "/onboarding", cta = "Open my application"): Promise<boolean> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT email_norm FROM ApplicantAccount WHERE account_id = ?", [accountId]);
    const to = rows[0]?.email_norm;
    return to ? sendMail(String(to), subject, body, link, cta) : false;
  } catch {
    return false;
  }
}

/**
 * Notify a school's owners (holders of SCHOOL_BILLING_MANAGE in that tenant's
 * database): in-app + e-mail. Runs inside the tenant.
 */
export async function notifySchoolOwners(tid: number, input: { title: string; body?: string; link: string; subjectId?: number; email?: boolean }): Promise<number> {
  const tenant = await getTenant(tid).catch(() => null);
  if (!tenant) return 0;
  return runWithTenant(tenant, async () => {
    const { db } = await import("../../db");
    let ids: number[] = [];
    try {
      const rows = (await db.execute(sql`
        SELECT DISTINCT g.user_id AS id FROM AccessGrant g
          JOIN RolePermission rp ON rp.role_id = g.role_id
          JOIN Permission p ON p.perm_id = rp.perm_id
         WHERE g.status = 'ACTIVE' AND p.name = 'SCHOOL_BILLING_MANAGE'`)) as any;
      ids = (rows[0] as RowDataPacket[]).map((r) => Number(r.id));
    } catch {
      ids = [];
    }
    for (const userId of ids) {
      try {
        await notifyUser({ userId, kind: "tenant_billing", title: input.title, body: input.body, link: input.link, subjectType: "tenant", subjectId: input.subjectId ?? tid });
        if (input.email !== false) {
          const rows = (await db.execute(sql`SELECT email FROM \`User\` WHERE user_id = ${userId}`)) as any;
          const to = rows[0]?.[0]?.email;
          if (to) await sendMail(to, input.title, input.body ?? "", input.link);
        }
      } catch (err) {
        logger.error("[tenantMgmt] owner notice failed", { err, userId, tid });
      }
    }
    return ids.length;
  });
}
