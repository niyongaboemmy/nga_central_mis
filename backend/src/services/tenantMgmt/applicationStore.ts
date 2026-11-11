/**
 * TenantApplication rows: load, serialise to the frontend contract
 * (frontend/src/api/tenantMgmt.ts `Application`, `TimelineEvent`), and change
 * status -- always through the state machine, always writing an ApplicationEvent
 * (the applicant's timeline and the audit), in one transaction.
 */
import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { NotFoundError } from "../../errors/CustomError";
import { ApplicationStatus, assertTransition, trackerStep } from "./stateMachine";
import { platformAudit } from "../../tenancy/audit";

export type ActorKind = "APPLICANT" | "PLATFORM" | "SYSTEM";
export interface Actor {
  kind: ActorKind;
  id: number | null;
  ip?: string | null;
}

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const json = (v: any) => (v === null || v === undefined ? null : typeof v === "string" ? JSON.parse(v) : v);

export function serializeApplication(r: RowDataPacket) {
  const status = String(r.status) as ApplicationStatus;
  return {
    id: Number(r.application_id),
    ref: r.ref ?? null,
    status,
    step: trackerStep(status),
    schoolName: String(r.school_name),
    schoolType: r.school_type ?? null,
    country: r.country ?? null,
    province: r.province ?? null,
    district: r.district ?? null,
    sector: r.sector ?? null,
    address: r.address ?? null,
    schoolPhone: r.school_phone ?? null,
    schoolEmail: r.school_email ?? null,
    website: r.website ?? null,
    estStudents: r.est_students === null || r.est_students === undefined ? null : Number(r.est_students),
    estStaff: r.est_staff === null || r.est_staff === undefined ? null : Number(r.est_staff),
    desiredSlug: r.desired_slug ?? null,
    requestedPackage: r.requested_package ?? null,
    approvedPackage: r.approved_package ?? null,
    billingCycle: (r.billing_cycle ?? "TERM") as "TERM" | "YEAR",
    requestedApps: (json(r.requested_apps) as string[] | null) ?? [],
    notes: r.notes ?? null,
    submittedAt: iso(r.submitted_at),
    decidedAt: iso(r.decided_at),
    decisionReason: r.decision_reason ?? null,
    expiresAt: iso(r.expires_at),
    tenantId: r.tenant_id === null || r.tenant_id === undefined ? null : Number(r.tenant_id),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at),
  };
}
export type SerializedApplication = ReturnType<typeof serializeApplication>;

export async function loadApplicationRow(id: number, conn?: PoolConnection, forUpdate = false): Promise<RowDataPacket> {
  const q = `SELECT * FROM TenantApplication WHERE application_id = ?${forUpdate ? " FOR UPDATE" : ""}`;
  const [rows] = await (conn ?? controlPool()).query<RowDataPacket[]>(q, [id]);
  if (!rows[0]) throw new NotFoundError("Application not found");
  return rows[0];
}

export async function loadApplication(id: number): Promise<SerializedApplication> {
  return serializeApplication(await loadApplicationRow(id));
}

/** The account's application that is not finished (at most one), else its latest. */
export async function applicationOfAccount(accountId: number): Promise<RowDataPacket | null> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM TenantApplication WHERE account_id = ? ORDER BY (status IN ('REJECTED','WITHDRAWN','EXPIRED')) ASC, application_id DESC LIMIT 1",
    [accountId],
  );
  return rows[0] ?? null;
}

export async function recordEvent(
  applicationId: number,
  e: { from?: string | null; to?: string | null; kind?: string; actor: Actor; message?: string | null; visible?: boolean },
  conn?: PoolConnection,
): Promise<void> {
  await (conn ?? controlPool()).query(
    "INSERT INTO ApplicationEvent (application_id, from_status, to_status, kind, actor_kind, actor_id, message, visible_to_applicant) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [applicationId, e.from ?? null, e.to ?? null, e.kind ?? "STATUS", e.actor.kind, e.actor.id, e.message ?? null, e.visible === false ? 0 : 1],
  );
}

export async function listEvents(applicationId: number, opts: { applicantView: boolean }) {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM ApplicationEvent WHERE application_id = ?${opts.applicantView ? " AND visible_to_applicant = 1" : ""} ORDER BY created_at DESC, event_id DESC`,
    [applicationId],
  );
  return rows.map((r) => ({
    id: Number(r.event_id),
    at: iso(r.created_at)!,
    from: r.from_status ?? null,
    to: r.to_status ?? null,
    kind: String(r.kind),
    actor: r.actor_kind as ActorKind,
    message: r.message ?? null,
    ...(opts.applicantView ? {} : { visibleToApplicant: Number(r.visible_to_applicant) === 1 }),
  }));
}

/** Run `fn` in a control-plane transaction. */
export async function inControlTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await controlPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Move an application to `to` (409 when the state machine refuses). `set` adds
 * column updates in the same statement (e.g. decided_by, approved_package).
 * The status read is locked, so two reviewers can't both decide.
 */
export async function transitionApplication(
  id: number,
  to: ApplicationStatus,
  actor: Actor,
  opts: { message?: string | null; visible?: boolean; set?: Record<string, unknown>; expectFrom?: ApplicationStatus[]; conn?: PoolConnection } = {},
): Promise<SerializedApplication> {
  const work = async (conn: PoolConnection) => {
    const row = await loadApplicationRow(id, conn, true);
    const from = String(row.status) as ApplicationStatus;
    if (opts.expectFrom && !opts.expectFrom.includes(from)) assertTransition("application", from, "__unexpected__");
    assertTransition("application", from, to);
    const cols = { ...(opts.set ?? {}), status: to, last_activity_at: new Date() };
    const keys = Object.keys(cols);
    await conn.query(`UPDATE TenantApplication SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE application_id = ?`, [
      ...keys.map((k) => {
        const v = (cols as any)[k];
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      }),
      id,
    ]);
    await recordEvent(id, { from, to, actor, message: opts.message ?? null, visible: opts.visible }, conn);
    return serializeApplication(await loadApplicationRow(id, conn));
  };
  const out = opts.conn ? await work(opts.conn) : await inControlTx(work);
  if (actor.kind === "PLATFORM") {
    void platformAudit({ action: `application.${to.toLowerCase()}`, actorUserId: actor.id, ip: actor.ip ?? null, payload: { applicationId: id, message: opts.message ?? null } });
  }
  return out;
}
