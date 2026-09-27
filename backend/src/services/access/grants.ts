import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { AccessGrant, AccessRole } from "../../db/accessSchema";
import { User } from "../../db/schema";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../errors/CustomError";
import { ScopeType, SCOPE_TYPES } from "../../vendor/nga-access";
import { checkGrant, checkManageExisting, wouldLockOut } from "./delegation";
import { bumpAccessVersion } from "./ruleEngine";
import { writeAudit } from "./registry";
import { defaultSchoolId } from "./backfill";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  return s;
}

const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function createGrant(actorId: number, body: any) {
  const userId = posInt(body?.user_id);
  const roleId = posInt(body?.role_id);
  const scopeType = String(body?.scope_type ?? "").toUpperCase() as ScopeType;
  if (!userId || !roleId) throw new ValidationError("user_id and role_id are required");
  if (!SCOPE_TYPES.includes(scopeType)) throw new ValidationError("Unknown scope_type");
  const scopeId = posInt(body?.scope_id);
  const scopeId2 = posInt(body?.scope_id2);
  const validFrom = parseDate(body?.valid_from, "valid_from");
  const validUntil = parseDate(body?.valid_until, "valid_until");
  const justification = body?.justification ? String(body.justification).slice(0, 500) : null;
  const title = body?.title ? String(body.title).slice(0, 150) : null;
  const academicYearId = posInt(body?.academic_year_id);

  const [user] = await db.select({ status: User.status }).from(User).where(eq(User.user_id, userId)).limit(1);
  if (!user) throw new NotFoundError("User not found");
  if (user.status !== "ACTIVE") throw new ValidationError("Cannot grant access to an inactive user");

  const check = await checkGrant(actorId, {
    userId,
    roleId,
    scopeType,
    scopeId,
    scopeId2,
    validFrom,
    validUntil,
    justification,
  });
  if (!check.ok) throw new AuthorizationError(check.errors.join("; "));

  const [dup] = await db
    .select({ grant_id: AccessGrant.grant_id })
    .from(AccessGrant)
    .where(
      and(
        eq(AccessGrant.user_id, userId),
        eq(AccessGrant.role_id, roleId),
        eq(AccessGrant.scope_type, scopeType),
        scopeId ? eq(AccessGrant.scope_id, scopeId) : undefined,
        scopeId2 ? eq(AccessGrant.scope_id2, scopeId2) : undefined,
        eq(AccessGrant.status, "ACTIVE"),
        eq(AccessGrant.source, "MANUAL"),
      ),
    )
    .limit(1);
  if (dup) throw new ConflictError("This person already holds this role at this node");

  const [res] = (await db.insert(AccessGrant).values({
    user_id: userId,
    role_id: roleId,
    school_id: await defaultSchoolId(),
    scope_type: scopeType,
    scope_id: ["SCHOOL", "PLATFORM"].includes(scopeType) ? null : scopeId,
    scope_id2: scopeType === "SUBJECT_CLASS" ? scopeId2 : null,
    academic_year_id: academicYearId,
    valid_from: validFrom,
    valid_until: validUntil,
    title,
    justification,
    source: "MANUAL",
    status: "ACTIVE",
    granted_by: actorId,
  })) as any;
  const grantId = res.insertId as number;
  await bumpAccessVersion([userId]);
  await writeAudit({
    actorId,
    subjectUserId: userId,
    action: "grant.create",
    target: { grantId, roleId, scopeType, scopeId, scopeId2 },
    after: { validFrom, validUntil, title, restricted: check.restricted },
    reason: justification,
  });
  return grantId;
}

async function loadGrant(grantId: number) {
  const [g] = await db
    .select({ grant: AccessGrant, role_name: AccessRole.name })
    .from(AccessGrant)
    .innerJoin(AccessRole, eq(AccessRole.role_id, AccessGrant.role_id))
    .where(eq(AccessGrant.grant_id, grantId))
    .limit(1);
  if (!g) throw new NotFoundError("Grant not found");
  return { ...g.grant, role_name: g.role_name };
}

async function assertCanManage(actorId: number, g: Awaited<ReturnType<typeof loadGrant>>) {
  const errors = await checkManageExisting(actorId, {
    scopeType: g.scope_type as ScopeType,
    scopeId: g.scope_id,
    scopeId2: g.scope_id2,
  });
  if (errors.length) throw new AuthorizationError(errors.join("; "));
}

export async function endGrant(actorId: number, grantId: number, reason: unknown) {
  const g = await loadGrant(grantId);
  await assertCanManage(actorId, g);
  if (g.status === "ENDED") throw new ConflictError("Grant already ended");
  if (g.source === "RULE") {
    throw new ConflictError(
      "This grant comes from an assignment (class teacher, subject, programme lead, mentor or parent link). Change the assignment, or suspend the grant.",
    );
  }
  const why = String(reason ?? "").trim();
  if (why.length < 3) throw new ValidationError("A reason is required");
  if (await wouldLockOut(grantId)) {
    throw new ConflictError("This is the last grant that can manage access for the whole school");
  }
  await db
    .update(AccessGrant)
    .set({ status: "ENDED", ended_at: new Date(), ended_by: actorId, end_reason: why.slice(0, 255) })
    .where(eq(AccessGrant.grant_id, grantId));
  await bumpAccessVersion([g.user_id]);
  await writeAudit({ actorId, subjectUserId: g.user_id, action: "grant.end", target: { grantId, role: g.role_name }, reason: why });
}

export async function setGrantSuspended(actorId: number, grantId: number, suspended: boolean, reason: unknown) {
  const g = await loadGrant(grantId);
  await assertCanManage(actorId, g);
  if (g.status === "ENDED") throw new ConflictError("Grant has ended");
  const why = String(reason ?? "").trim();
  if (suspended) {
    if (why.length < 3) throw new ValidationError("A reason is required");
    if (await wouldLockOut(grantId)) {
      throw new ConflictError("This is the last grant that can manage access for the whole school");
    }
  }
  await db
    .update(AccessGrant)
    .set({ status: suspended ? "SUSPENDED" : "ACTIVE" })
    .where(eq(AccessGrant.grant_id, grantId));
  await bumpAccessVersion([g.user_id]);
  await writeAudit({
    actorId,
    subjectUserId: g.user_id,
    action: suspended ? "grant.suspend" : "grant.resume",
    target: { grantId, role: g.role_name },
    reason: why || null,
  });
}

export async function certifyGrant(actorId: number, grantId: number) {
  const g = await loadGrant(grantId);
  await assertCanManage(actorId, g);
  if (g.status !== "ACTIVE") throw new ConflictError("Only active grants can be certified");
  await db
    .update(AccessGrant)
    .set({ last_certified_at: new Date(), certified_by: actorId })
    .where(eq(AccessGrant.grant_id, grantId));
  await writeAudit({ actorId, subjectUserId: g.user_id, action: "grant.certify", target: { grantId, role: g.role_name } });
}
