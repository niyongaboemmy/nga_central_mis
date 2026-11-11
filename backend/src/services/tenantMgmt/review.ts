/**
 * Application review (plan §6.3, M3): the queue, the detail page, and the
 * reviewer's actions. Every status change is a transitionApplication (state
 * machine + ApplicationEvent + audit); an invalid move is a 409.
 *
 * Shapes = frontend/src/api/tenantMgmt.ts `ApplicationListItem`,
 * `ApplicationDetail`, `ChecklistItem`, `DuplicateHit`, `ThreadMessage`,
 * `ApplicationDocument`.
 */
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { sql } from "drizzle-orm";
import { controlPool } from "../../db/platform";
import { primaryDb } from "../../db";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import { platformAudit } from "../../tenancy/audit";
import logger from "../../utils/logger";
import {
  Actor,
  listEvents,
  loadApplicationRow,
  recordEvent,
  serializeApplication,
  transitionApplication,
} from "./applicationStore";
import { ApplicationStatus, canTransition } from "./stateMachine";
import { getPlatformSettings } from "./settings";
import { checkSlug, normalizeSlug } from "./slug";
import { APP_KEYS, PLATFORM_CAPS } from "./catalog";
import { emailApplicant, notifyPlatformStaff, platformStaffWith } from "./notify";
import { coded, createInvoice, invoiceForApplication } from "./billing";
import * as provisioning from "./provisioning";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);

export type ReviewAction = "assign" | "start_review" | "request_changes" | "reject" | "approve" | "reopen";

/** The default review checklist (plan §5 ReviewChecklistItem). */
export const CHECKLIST_ITEMS: Array<{ key: string; label: string }> = [
  { key: "school_exists", label: "School exists" },
  { key: "contact_verified", label: "Contact verified" },
  { key: "documents_ok", label: "Documents OK" },
  { key: "slug_ok", label: "Short name OK" },
  { key: "package_fits", label: "Package fits" },
];

const ASSIGNABLE: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"];
const SLA_STATUSES: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

// ---------------------------------------------------------------------------
// Names of primary-tenant staff
// ---------------------------------------------------------------------------

/** user id -> display name in the primary tenant (platform staff live there). */
export async function staffNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const list = [...new Set(ids.filter((x): x is number => typeof x === "number" && x > 0))];
  if (!list.length) return out;
  try {
    const rows = (await primaryDb().execute(sql`
      SELECT u.user_id, u.username, p.first_name, p.last_name
        FROM \`User\` u LEFT JOIN UserProfile p ON p.user_id = u.user_id
       WHERE u.user_id IN (${sql.join(list.map((i) => sql`${i}`), sql`, `)})`)) as any;
    for (const r of rows[0] as RowDataPacket[]) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      if (!out.has(Number(r.user_id))) out.set(Number(r.user_id), name || String(r.username));
    }
  } catch (err) {
    logger.error("[review] staff name lookup failed", { err });
  }
  return out;
}

const who = (names: Map<number, string>, id: any) =>
  id === null || id === undefined ? null : { id: Number(id), name: names.get(Number(id)) ?? `User ${id}` };

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueFilters {
  status?: string;
  package?: string;
  q?: string;
  mine?: boolean;
}

export async function listQueue(filters: QueueFilters, callerId: number) {
  const settings = await getPlatformSettings();
  // Every status unless `status` is given: the console filters and counts in the browser.
  const where: string[] = ["1 = 1"];
  const args: unknown[] = [];
  if (filters.status) {
    where.push("a.status IN (?)");
    args.push(String(filters.status).split(",").map((s) => s.trim().toUpperCase()));
  }
  if (filters.package) {
    where.push("COALESCE(a.approved_package, a.requested_package) = ?");
    args.push(String(filters.package));
  }
  if (filters.q && String(filters.q).trim()) {
    const like = `%${String(filters.q).trim()}%`;
    where.push("(a.school_name LIKE ? OR a.ref LIKE ? OR acc.email_norm LIKE ? OR acc.full_name LIKE ? OR a.district LIKE ?)");
    args.push(like, like, like, like, like);
  }
  if (filters.mine) {
    where.push("a.assigned_to = ?");
    args.push(callerId);
  }
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT a.*, acc.full_name AS applicant_name, acc.email_norm AS applicant_email,
            (SELECT COUNT(*) FROM ApplicationMessage m WHERE m.application_id = a.application_id AND m.author_kind = 'APPLICANT' AND m.read_at IS NULL) AS unread
       FROM TenantApplication a
       LEFT JOIN ApplicantAccount acc ON acc.account_id = a.account_id
      WHERE ${where.join(" AND ")}
      ORDER BY a.submitted_at IS NULL, a.submitted_at ASC, a.application_id ASC
      LIMIT 500`,
    args,
  );
  const names = await staffNames(rows.map((r) => (r.assigned_to === null ? null : Number(r.assigned_to))));
  const now = Date.now();
  return rows.map((r) => {
    const since = r.submitted_at ?? r.created_at;
    const ageDays = Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY_MS));
    const app = serializeApplication(r);
    return {
      id: app.id,
      ref: app.ref,
      schoolName: app.schoolName,
      status: app.status,
      step: app.step,
      requestedPackage: app.requestedPackage,
      applicantName: String(r.applicant_name ?? ""),
      applicantEmail: String(r.applicant_email ?? ""),
      district: app.district,
      estStudents: app.estStudents,
      submittedAt: app.submittedAt,
      ageDays,
      slaBreached: SLA_STATUSES.includes(app.status) && ageDays > Number(settings["review.sla_days"]),
      assignedTo: who(names, r.assigned_to),
      unread: Number(r.unread ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Detail pieces
// ---------------------------------------------------------------------------

export function serializeMessage(r: RowDataPacket) {
  return {
    id: Number(r.message_id),
    at: iso(r.created_at)!,
    author: r.author_kind as "APPLICANT" | "PLATFORM" | "SYSTEM",
    authorName: r.author_name ?? null,
    body: String(r.body),
    attachmentUrl: r.attachment_file ? `/platform/applications/${r.application_id}/messages/${r.message_id}/attachment` : null,
    internal: Number(r.is_internal) === 1,
    readAt: iso(r.read_at),
  };
}

export function serializeDocument(r: RowDataPacket) {
  return {
    id: Number(r.doc_id),
    kind: r.kind,
    name: r.original_name ?? null,
    url: `/platform/applications/${r.application_id}/documents/${r.doc_id}/file`,
    status: r.status as "PENDING" | "ACCEPTED" | "REJECTED",
    note: r.reviewer_note ?? null,
    at: iso(r.created_at)!,
  };
}

export async function checklistOf(applicationId: number) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ReviewChecklistItem WHERE application_id = ?", [applicationId]);
  const byKey = new Map(rows.map((r) => [String(r.item_key), r]));
  const names = await staffNames(rows.map((r) => (r.checked_by === null ? null : Number(r.checked_by))));
  return CHECKLIST_ITEMS.map(({ key, label }) => {
    const r = byKey.get(key);
    const checked = Boolean(r && r.checked_at);
    return {
      key,
      label,
      checked,
      checkedBy: checked && r!.checked_by !== null ? names.get(Number(r!.checked_by)) ?? `User ${r!.checked_by}` : null,
      checkedAt: checked ? iso(r!.checked_at) : null,
      note: r?.note ?? null,
    };
  });
}

// Duplicate detection ----------------------------------------------------------

const WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "yahoo.co.uk", "ymail.com", "outlook.com", "hotmail.com", "hotmail.fr",
  "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com",
  "yandex.com", "zoho.com",
]);
const STOP_WORDS = new Set(["school", "ecole", "groupe", "scolaire", "gs", "es", "ep", "the", "of", "de", "du", "la", "le", "academy", "college"]);

export function normalizeName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function similarNames(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const cx = x.replace(/ /g, "");
  const cy = y.replace(/ /g, "");
  if (cx.length >= 5 && cy.length >= 5 && (cx.includes(cy) || cy.includes(cx))) return true;
  return Math.min(cx.length, cy.length) >= 6 && levenshtein(cx, cy) <= 2;
}

const domainOf = (email: any): string | null => {
  const m = /@([^@\s]+)$/.exec(String(email ?? "").toLowerCase().trim());
  return m && !WEBMAIL.has(m[1]) ? m[1] : null;
};
const phoneKey = (p: any): string | null => {
  const d = String(p ?? "").replace(/\D+/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};

export async function findDuplicates(app: RowDataPacket, applicantEmail: string | null, applicantPhone: string | null) {
  const id = Number(app.application_id);
  const hits = new Map<string, { kind: "TENANT" | "APPLICATION"; id: number; name: string; reason: "NAME" | "EMAIL_DOMAIN" | "PHONE" | "SLUG" }>();
  const add = (kind: "TENANT" | "APPLICATION", hid: number, name: string, reason: "NAME" | "EMAIL_DOMAIN" | "PHONE" | "SLUG") => {
    const k = `${kind}:${hid}:${reason}`;
    if (!hits.has(k)) hits.set(k, { kind, id: hid, name, reason });
  };
  const myDomains = new Set([domainOf(applicantEmail), domainOf(app.school_email)].filter((d): d is string => Boolean(d)));
  const myPhones = new Set([phoneKey(applicantPhone), phoneKey(app.school_phone)].filter((p): p is string => Boolean(p)));
  const mySlug = app.desired_slug ? normalizeSlug(app.desired_slug) : null;

  const [tenants] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id, slug, display_name, legal_name FROM Tenant");
  for (const t of tenants) {
    const name = String(t.display_name);
    if (similarNames(app.school_name, name) || (t.legal_name && similarNames(app.school_name, t.legal_name))) add("TENANT", Number(t.tenant_id), name, "NAME");
    if (mySlug && String(t.slug) === mySlug) add("TENANT", Number(t.tenant_id), name, "SLUG");
  }
  if (myDomains.size) {
    try {
      const likes = [...myDomains].map(() => "email_norm LIKE ?").join(" OR ");
      const [dir] = await controlPool().query<RowDataPacket[]>(
        `SELECT DISTINCT d.tenant_id, t.display_name FROM AccountDirectory d JOIN Tenant t ON t.tenant_id = d.tenant_id
          WHERE d.kind = 'STAFF' AND (${likes})`,
        [...myDomains].map((dm) => `%@${dm}`),
      );
      for (const r of dir) add("TENANT", Number(r.tenant_id), String(r.display_name), "EMAIL_DOMAIN");
    } catch {
      /* no directory: skip */
    }
  }

  const [apps] = await controlPool().query<RowDataPacket[]>(
    `SELECT a.application_id, a.school_name, a.school_email, a.school_phone, a.desired_slug, acc.email_norm, acc.phone
       FROM TenantApplication a LEFT JOIN ApplicantAccount acc ON acc.account_id = a.account_id
      WHERE a.application_id <> ? AND a.status NOT IN ('REJECTED','WITHDRAWN','EXPIRED','ACTIVE')`,
    [id],
  );
  for (const o of apps) {
    const oid = Number(o.application_id);
    const name = String(o.school_name);
    if (similarNames(app.school_name, name)) add("APPLICATION", oid, name, "NAME");
    const theirDomains = [domainOf(o.email_norm), domainOf(o.school_email)];
    if (theirDomains.some((d) => d && myDomains.has(d))) add("APPLICATION", oid, name, "EMAIL_DOMAIN");
    const theirPhones = [phoneKey(o.phone), phoneKey(o.school_phone)];
    if (theirPhones.some((p) => p && myPhones.has(p))) add("APPLICATION", oid, name, "PHONE");
    if (mySlug && o.desired_slug && normalizeSlug(o.desired_slug) === mySlug) add("APPLICATION", oid, name, "SLUG");
  }
  return [...hits.values()];
}

// Allowed actions ---------------------------------------------------------------

export function allowedActions(status: ApplicationStatus, caps: { review: boolean; decide: boolean }): ReviewAction[] {
  const out: ReviewAction[] = [];
  if (caps.review && ASSIGNABLE.includes(status)) out.push("assign");
  if (caps.review && status === "SUBMITTED") out.push("start_review");
  if (caps.review && canTransition("application", status, "CHANGES_REQUESTED")) out.push("request_changes");
  if (caps.decide && canTransition("application", status, "REJECTED")) out.push("reject");
  if (caps.decide && (status === "SUBMITTED" || status === "UNDER_REVIEW")) out.push("approve");
  if (caps.review && status === "EXPIRED") out.push("reopen");
  return out;
}

export async function getDetail(id: number, caps: { review: boolean; decide: boolean }) {
  const row = await loadApplicationRow(id);
  const [accRows] = await controlPool().query<RowDataPacket[]>(
    "SELECT account_id, full_name, email_norm, phone, email_verified_at FROM ApplicantAccount WHERE account_id = ?",
    [row.account_id],
  );
  const acc = accRows[0];
  // Opening the application reads the applicant's messages.
  await controlPool().query("UPDATE ApplicationMessage SET read_at = ? WHERE application_id = ? AND author_kind = 'APPLICANT' AND read_at IS NULL", [
    new Date(),
    id,
  ]);
  const [msgRows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM ApplicationMessage WHERE application_id = ? ORDER BY created_at ASC, message_id ASC",
    [id],
  );
  const [docRows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE application_id = ? ORDER BY doc_id", [id]);
  const [actorRows] = await controlPool().query<RowDataPacket[]>(
    "SELECT DISTINCT actor_id FROM ApplicationEvent WHERE application_id = ? AND actor_kind = 'PLATFORM' AND actor_id IS NOT NULL",
    [id],
  );
  const names = await staffNames([row.assigned_to === null ? null : Number(row.assigned_to), ...actorRows.map((r) => Number(r.actor_id))]);
  const events = await listEvents(id, { applicantView: false });
  const [evActors] = await controlPool().query<RowDataPacket[]>("SELECT event_id, actor_id FROM ApplicationEvent WHERE application_id = ?", [id]);
  const actorOf = new Map(evActors.map((r) => [Number(r.event_id), r.actor_id === null ? null : Number(r.actor_id)]));
  const timeline = events.map((e) => {
    const aid = actorOf.get(e.id);
    return {
      ...e,
      actorName: e.actor === "PLATFORM" && aid ? names.get(aid) ?? null : e.actor === "APPLICANT" ? acc?.full_name ?? null : null,
    };
  });
  let provisioningRun: any = null;
  try {
    provisioningRun = await provisioning.runForApplication(id, "platform");
  } catch (err: any) {
    if (!/not implemented/.test(String(err?.message))) logger.error(`[review] provisioning run lookup failed: ${err?.message ?? err}`);
  }
  const settings = await getPlatformSettings();
  const status = String(row.status) as ApplicationStatus;
  return {
    application: serializeApplication(row),
    applicant: {
      id: Number(row.account_id),
      fullName: String(acc?.full_name ?? ""),
      email: String(acc?.email_norm ?? ""),
      phone: acc?.phone ?? null,
      emailVerified: Boolean(acc?.email_verified_at),
    },
    timeline,
    messages: msgRows.map(serializeMessage),
    documents: docRows.map(serializeDocument),
    requiredDocuments: settings["documents.required"],
    checklist: await checklistOf(id),
    duplicates: await findDuplicates(row, acc?.email_norm ?? null, acc?.phone ?? null),
    invoice: await invoiceForApplication(id, "platform"),
    provisioning: provisioningRun ?? null,
    assignedTo: who(names, row.assigned_to),
    allowedActions: allowedActions(status, caps),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const required = (v: unknown, what: string): string => {
  const s = String(v ?? "").trim();
  if (!s) throw coded(new ValidationError(`${what} is required.`), "REASON_REQUIRED");
  return s;
};

async function authorName(actor: Actor): Promise<string | null> {
  return actor.id ? (await staffNames([actor.id])).get(actor.id) ?? null : null;
}

async function addMessage(applicationId: number, actor: Actor, body: string, internal: boolean): Promise<number> {
  const [res] = await controlPool().query<ResultSetHeader>(
    "INSERT INTO ApplicationMessage (application_id, author_kind, author_id, author_name, body, is_internal) VALUES (?, 'PLATFORM', ?, ?, ?, ?)",
    [applicationId, actor.id, await authorName(actor), body.slice(0, 5000), internal ? 1 : 0],
  );
  await controlPool().query("UPDATE TenantApplication SET last_activity_at = ? WHERE application_id = ?", [new Date(), applicationId]);
  return Number(res.insertId);
}

export async function assign(id: number, userId: number | null, actor: Actor): Promise<void> {
  const row = await loadApplicationRow(id);
  if (!ASSIGNABLE.includes(String(row.status) as ApplicationStatus)) {
    throw coded(new ValidationError("This application is not in review."), "NOT_ASSIGNABLE");
  }
  if (userId !== null) {
    const staff = await platformStaffWith([PLATFORM_CAPS.review, PLATFORM_CAPS.decide]);
    if (!staff.includes(userId)) throw coded(new ValidationError("Choose a platform reviewer."), "NOT_PLATFORM_STAFF");
  }
  await controlPool().query("UPDATE TenantApplication SET assigned_to = ? WHERE application_id = ?", [userId, id]);
  const name = userId ? (await staffNames([userId])).get(userId) ?? `User ${userId}` : null;
  await recordEvent(id, { kind: "ASSIGNED", actor, message: name ? `Assigned to ${name}` : "Unassigned", visible: false });
  void platformAudit({ action: "application.assign", actorUserId: actor.id, ip: actor.ip ?? null, payload: { applicationId: id, userId } });
  if (userId && userId !== actor.id) {
    await notifyPlatformStaff({
      event: "application.submitted",
      userIds: [userId],
      title: `Application to review: ${row.school_name}`,
      body: `${row.ref ?? `#${id}`} was assigned to you.`,
      link: `/platform/applications/${id}`,
      subjectType: "platform_application",
      subjectId: id,
      email: true,
    }).catch(() => 0);
  }
}

export async function startReview(id: number, actor: Actor): Promise<void> {
  const row = await loadApplicationRow(id);
  await transitionApplication(id, "UNDER_REVIEW", actor, {
    expectFrom: ["SUBMITTED"],
    message: "Review started.",
    set: row.assigned_to === null && actor.id ? { assigned_to: actor.id } : {},
  });
}

export async function requestChanges(id: number, message: string, actor: Actor): Promise<void> {
  const text = required(message, "A message");
  const app = await transitionApplication(id, "CHANGES_REQUESTED", actor, { message: text });
  await addMessage(id, actor, text, false);
  const row = await loadApplicationRow(id);
  await emailApplicant(Number(row.account_id), `Changes needed — ${app.ref ?? app.schoolName}`, text, "/onboarding", "Update my application");
}

export async function reject(id: number, reason: string, actor: Actor): Promise<void> {
  const text = required(reason, "A reason");
  const app = await transitionApplication(id, "REJECTED", actor, {
    message: text,
    set: { decided_by: actor.id, decided_at: new Date(), decision_reason: text },
  });
  const row = await loadApplicationRow(id);
  await emailApplicant(Number(row.account_id), `Application ${app.ref ?? ""} not approved`.replace(/\s+/g, " "), text);
}

export interface ApproveInput {
  packageCode: string;
  billingCycle: "TERM" | "YEAR";
  slug: string;
  apps?: string[];
  note?: string;
}

export async function approve(id: number, body: ApproveInput, actor: Actor): Promise<void> {
  const code = String(body?.packageCode ?? "").trim();
  const [pk] = await controlPool().query<RowDataPacket[]>("SELECT code, is_active FROM Package WHERE code = ?", [code]);
  if (!pk[0] || Number(pk[0].is_active) !== 1) throw coded(new ValidationError("Choose an active package."), "UNKNOWN_PACKAGE");
  const cycle = body?.billingCycle;
  if (cycle !== "TERM" && cycle !== "YEAR") throw coded(new ValidationError("Choose a billing cycle."), "INVALID_CYCLE");
  const slug = await checkSlug(String(body?.slug ?? ""), { excludeApplicationId: id });
  if (!slug.available) {
    const err = coded(new ValidationError(`The short name "${slug.slug}" is not available.`, [{ reason: slug.reason, suggestion: slug.suggestion }]), "SLUG_UNAVAILABLE");
    throw err;
  }
  let apps: string[];
  if (Array.isArray(body?.apps) && body.apps.length) {
    const bad = body.apps.filter((a) => !(a in APP_KEYS));
    if (bad.length) throw coded(new ValidationError(`Unknown app: ${bad.join(", ")}`), "UNKNOWN_APP");
    apps = [...new Set(body.apps)];
  } else {
    const [ents] = await controlPool().query<RowDataPacket[]>("SELECT ent_key FROM PackageEntitlement WHERE package_code = ? AND kind = 'APP'", [code]);
    apps = ents.map((e) => String(e.ent_key));
  }
  const settings = await getPlatformSettings();
  const note = body?.note ? String(body.note).trim() : null;
  const expires = new Date(Date.now() + Number(settings["application.payment_expiry_days"]) * DAY_MS);
  const app = await transitionApplication(id, "APPROVED_AWAITING_PAYMENT", actor, {
    expectFrom: ["SUBMITTED", "UNDER_REVIEW"],
    message: note || "Approved.",
    set: {
      approved_package: code,
      billing_cycle: cycle,
      desired_slug: slug.slug,
      requested_apps: apps,
      decided_by: actor.id,
      decided_at: new Date(),
      decision_reason: note,
      expires_at: expires,
    },
  });
  const autoIssue = Boolean(settings["billing.auto_issue_on_approval"]);
  try {
    const existing = await invoiceForApplication(id, "platform");
    if (!existing) {
      await createInvoice({ kind: "NEW", applicationId: id, packageCode: code, billingCycle: cycle, issue: autoIssue, createdBy: actor.id });
    }
  } catch (err: any) {
    // The decision stands; finance can draft the invoice by hand.
    logger.error(`[review] invoice draft failed for application ${id}: ${err?.message ?? err}`);
  }
  const row = await loadApplicationRow(id);
  await emailApplicant(
    Number(row.account_id),
    `Approved — ${app.schoolName}`,
    autoIssue
      ? "Good news: your school is approved. Your invoice is ready — pay it and upload the proof to finish."
      : "Good news: your school is approved. Your invoice will follow shortly.",
  );
}

export async function reopen(id: number, reason: string, actor: Actor): Promise<void> {
  const text = required(reason, "A reason");
  const row = await loadApplicationRow(id);
  const settings = await getPlatformSettings();
  if (row.approved_package) {
    await transitionApplication(id, "APPROVED_AWAITING_PAYMENT", actor, {
      expectFrom: ["EXPIRED"],
      message: text,
      set: { expires_at: new Date(Date.now() + Number(settings["application.payment_expiry_days"]) * DAY_MS) },
    });
  } else {
    await transitionApplication(id, "UNDER_REVIEW", actor, { expectFrom: ["EXPIRED"], message: text });
  }
  await emailApplicant(Number(row.account_id), "Your application is open again", text);
}

export async function setChecklist(id: number, key: string, checked: boolean, note: string | null | undefined, actor: Actor) {
  await loadApplicationRow(id);
  if (!CHECKLIST_ITEMS.some((i) => i.key === key)) throw coded(new ValidationError("Unknown checklist item."), "UNKNOWN_ITEM");
  await controlPool().query(
    `INSERT INTO ReviewChecklistItem (application_id, item_key, checked_by, checked_at, note) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE checked_by = VALUES(checked_by), checked_at = VALUES(checked_at), note = VALUES(note)`,
    [id, key, checked ? actor.id : null, checked ? new Date() : null, note ? String(note).slice(0, 255) : null],
  );
  void platformAudit({ action: "application.checklist", actorUserId: actor.id, ip: actor.ip ?? null, payload: { applicationId: id, key, checked } });
  return checklistOf(id);
}

const DOC_LABELS: Record<string, string> = {
  REGISTRATION_CERT: "Registration certificate",
  AUTHORISATION_LETTER: "Authorisation letter",
  LOGO: "Logo",
  OTHER: "Document",
};

export async function reviewDocument(id: number, docId: number, status: string, note: string | null | undefined, actor: Actor) {
  if (status !== "ACCEPTED" && status !== "REJECTED") throw coded(new ValidationError("Accept or reject the document."), "INVALID_STATUS");
  const text = note ? String(note).trim().slice(0, 255) : null;
  if (status === "REJECTED" && !text) throw coded(new ValidationError("Say why the document is rejected."), "REASON_REQUIRED");
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE doc_id = ? AND application_id = ?", [docId, id]);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Document not found");
  await controlPool().query("UPDATE ApplicationDocument SET status = ?, reviewer_note = ?, reviewed_by = ? WHERE doc_id = ?", [status, text, actor.id, docId]);
  const label = DOC_LABELS[String(doc.kind)] ?? "Document";
  await recordEvent(id, {
    kind: "DOCUMENT_REVIEW",
    actor,
    message: status === "ACCEPTED" ? `${label} accepted.` : `${label} rejected: ${text}`,
    visible: true,
  });
  void platformAudit({ action: "application.document_review", actorUserId: actor.id, ip: actor.ip ?? null, payload: { applicationId: id, docId, status } });
  const [after] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationDocument WHERE doc_id = ?", [docId]);
  return serializeDocument(after[0]);
}

export async function documentFile(id: number, docId: number): Promise<{ path: string; name: string | null; mime: string | null }> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT file_path, original_name, mime FROM ApplicationDocument WHERE doc_id = ? AND application_id = ?", [
    docId,
    id,
  ]);
  if (!rows[0]) throw new NotFoundError("Document not found");
  return { path: String(rows[0].file_path), name: rows[0].original_name ?? null, mime: rows[0].mime ?? null };
}

export async function messageAttachment(id: number, messageId: number): Promise<string> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT attachment_file FROM ApplicationMessage WHERE message_id = ? AND application_id = ?", [
    messageId,
    id,
  ]);
  if (!rows[0]?.attachment_file) throw new NotFoundError("Attachment not found");
  return String(rows[0].attachment_file);
}

/** A platform message (or internal note). Visible ones are e-mailed to the applicant. */
export async function sendMessage(id: number, body: string, internal: boolean, actor: Actor) {
  const text = required(body, "A message");
  const row = await loadApplicationRow(id);
  const mid = await addMessage(id, actor, text, internal);
  if (!internal) {
    await emailApplicant(Number(row.account_id), `New message about ${row.school_name}`, text, "/onboarding", "Reply");
  }
  void platformAudit({ action: internal ? "application.note" : "application.message", actorUserId: actor.id, ip: actor.ip ?? null, payload: { applicationId: id, messageId: mid } });
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicationMessage WHERE message_id = ?", [mid]);
  return serializeMessage(rows[0]);
}
