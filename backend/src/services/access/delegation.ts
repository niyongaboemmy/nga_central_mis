import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AccessGrant,
  AccessPermission,
  AccessRole,
  AccessRolePermission,
} from "../../db/accessSchema";
import {
  AccessSnapshot,
  decide,
  depthRank,
  Depth,
  ScopeType,
  Target,
} from "../../vendor/nga-access";
import { effectiveDepth } from "./compile";
import { getSnapshot } from "./snapshotCache";
import { isRestrictedGrant } from "./registry";

/**
 * Who may grant what (plan §3.4) -- one generic rule instead of a table:
 *
 *  1. the actor holds ACCESS_GRANTS_MANAGE on a node containing the target node;
 *  2. the actor holds every capability of the role there, at least as deep;
 *  3. platform-only roles (Platform Owner, IT Support) need a PLATFORM actor;
 *  4. restricted depths need ACCESS_GRANTS_RESTRICTED, a justification and an
 *     expiry (at most MAX_RESTRICTED_DAYS away).
 *
 * The platform owner (a PLATFORM grant holding ACCESS_GRANTS_MANAGE) is exempt
 * from rule 2 -- it is how operations roles (Bursar, Registrar, IT) that no
 * academic leader holds get appointed at all.
 */

export const MANUAL_SCOPE_TYPES: ScopeType[] = [
  "PLATFORM",
  "SCHOOL",
  "PROGRAM",
  "DEPARTMENT",
  "GRADE",
  "CLASS_GROUP",
  "SUBJECT_CLASS",
];
export const MAX_RESTRICTED_DAYS = 366;

export interface NodeRef {
  scopeType: ScopeType;
  scopeId?: number | null;
  scopeId2?: number | null;
}

/** A node as a decision target. SCHOOL/PLATFORM have no target (see covers). */
export function nodeTarget(node: NodeRef): Target {
  switch (node.scopeType) {
    case "PROGRAM":
      return { programId: node.scopeId ?? null };
    case "DEPARTMENT":
      return { departmentId: node.scopeId ?? null };
    case "GRADE":
      return { gradeId: node.scopeId ?? null };
    case "CLASS_GROUP":
      return { classGroupId: node.scopeId ?? null };
    case "SUBJECT_CLASS":
      return { subjectId: node.scopeId ?? null, classGroupId: node.scopeId2 ?? null };
    default:
      return {};
  }
}

/**
 * Does the snapshot give `cap` on the WHOLE node? For SCHOOL/PLATFORM that
 * means an `all` scope -- an empty target would otherwise match "anywhere".
 */
export function coversNode(
  snapshot: AccessSnapshot,
  cap: string,
  node: NodeRef,
  minDepth: Depth | null = null,
): boolean {
  if (node.scopeType === "SCHOOL" || node.scopeType === "PLATFORM") {
    return (snapshot.caps[cap] ?? []).some(
      (e) => e.scope.all && depthRank(e.depth) >= depthRank(minDepth),
    );
  }
  return decide(snapshot, cap, nodeTarget(node), minDepth).allowed;
}

export const isPlatformActor = (snapshot: AccessSnapshot) =>
  Object.values(snapshot.grants).some((g) => g.scope_type === "PLATFORM") &&
  coversNode(snapshot, "ACCESS_GRANTS_MANAGE", { scopeType: "PLATFORM" });

export interface GrantRequest extends NodeRef {
  userId: number;
  roleId: number;
  validFrom?: string | null;
  validUntil?: string | null;
  justification?: string | null;
}

export interface DelegationResult {
  ok: boolean;
  errors: string[];
  restricted: boolean;
}

export async function roleCapabilities(roleId: number) {
  const rows = await db
    .select({
      name: AccessPermission.name,
      kind: AccessPermission.kind,
      depths: AccessPermission.depths,
      depth: AccessRolePermission.depth,
      status: AccessPermission.status,
    })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
    .where(eq(AccessRolePermission.role_id, roleId));
  return rows
    .filter((r) => r.status === "ACTIVE")
    .map((r) => ({ name: r.name, depth: effectiveDepth(r) }));
}

const daysFromToday = (iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export async function checkGrant(actorId: number, req: GrantRequest): Promise<DelegationResult> {
  const errors: string[] = [];
  const [role] = await db.select().from(AccessRole).where(eq(AccessRole.role_id, req.roleId)).limit(1);
  if (!role || role.status !== "ACTIVE") {
    return { ok: false, errors: ["Role not found or disabled"], restricted: false };
  }

  if (!MANUAL_SCOPE_TYPES.includes(req.scopeType)) {
    errors.push(`${req.scopeType} grants are created by auto-assignment rules, not by hand`);
  }
  const allowed = (role.allowed_scope_types ?? "").split(",").filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(req.scopeType)) {
    errors.push(`${role.name} can only be granted at: ${allowed.join(", ")}`);
  }
  const needsId = !["SCHOOL", "PLATFORM"].includes(req.scopeType);
  if (needsId && !req.scopeId) errors.push("scopeId is required for this node");
  if (req.scopeType === "SUBJECT_CLASS" && !req.scopeId2) errors.push("scopeId2 (class group) is required");
  if (req.validFrom && req.validUntil && req.validFrom > req.validUntil) {
    errors.push("validFrom must be on or before validUntil");
  }

  const actor = await getSnapshot(actorId, "*");
  const platform = isPlatformActor(actor);

  if (actorId === req.userId && !platform) errors.push("You cannot grant a role to yourself");
  if (role.platform_only && !platform) errors.push(`${role.name} can only be granted by the platform owner`);
  if (req.scopeType === "PLATFORM" && !platform) errors.push("Only the platform owner can grant at PLATFORM");

  if (!coversNode(actor, "ACCESS_GRANTS_MANAGE", req)) {
    errors.push("You cannot assign positions at this node");
  }

  const caps = await roleCapabilities(role.role_id);
  let restricted = false;
  for (const c of caps) {
    if (await isRestrictedGrant(c.name, c.depth)) restricted = true;
    if (platform) continue;
    if (!coversNode(actor, c.name, req, c.depth)) {
      errors.push(`You do not hold ${c.name}${c.depth ? ` (${c.depth})` : ""} at this node yourself`);
    }
  }

  if (restricted) {
    if (!coversNode(actor, "ACCESS_GRANTS_RESTRICTED", req)) {
      errors.push("This role includes restricted access; you cannot grant restricted access");
    }
    if (!req.justification || req.justification.trim().length < 10) {
      errors.push("Restricted access needs a justification (at least 10 characters)");
    }
    if (!req.validUntil) {
      errors.push("Restricted access needs an end date");
    } else if (daysFromToday(req.validUntil) > MAX_RESTRICTED_DAYS) {
      errors.push(`Restricted access may last at most ${MAX_RESTRICTED_DAYS} days`);
    }
  }

  if (role.max_holders) {
    const [row] = await db
      .select({ n: sql<number>`COUNT(DISTINCT ${AccessGrant.user_id})` })
      .from(AccessGrant)
      .where(
        and(
          eq(AccessGrant.role_id, role.role_id),
          eq(AccessGrant.status, "ACTIVE"),
          ne(AccessGrant.user_id, req.userId),
        ),
      );
    if (Number(row?.n ?? 0) >= role.max_holders) {
      errors.push(`${role.name} already has its maximum of ${role.max_holders} holder(s)`);
    }
  }

  return { ok: errors.length === 0, errors, restricted };
}

/** May the actor end/suspend/certify this grant? (Removing access is always within your node.) */
export async function checkManageExisting(actorId: number, grant: NodeRef): Promise<string[]> {
  const actor = await getSnapshot(actorId, "*");
  if (isPlatformActor(actor)) return [];
  // A school-wide manager is not a platform manager.
  if (grant.scopeType === "PLATFORM") return ["Only the platform owner can manage platform positions"];
  return coversNode(actor, "ACCESS_GRANTS_MANAGE", grant)
    ? []
    : ["You cannot manage positions at this node"];
}

/**
 * Lock-out guard: never end/suspend the last active grant that lets someone
 * manage access for the whole school.
 */
export async function wouldLockOut(grantId: number): Promise<boolean> {
  const [g] = await db.select().from(AccessGrant).where(eq(AccessGrant.grant_id, grantId)).limit(1);
  if (!g || !["SCHOOL", "PLATFORM"].includes(g.scope_type)) return false;
  const managers = await db
    .select({ role_id: AccessRolePermission.role_id })
    .from(AccessRolePermission)
    .innerJoin(AccessPermission, eq(AccessPermission.perm_id, AccessRolePermission.perm_id))
    .where(eq(AccessPermission.name, "ACCESS_GRANTS_MANAGE"));
  const managerRoles = managers.map((m) => m.role_id);
  if (!managerRoles.includes(g.role_id)) return false;
  const [others] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(AccessGrant)
    .where(
      and(
        inArray(AccessGrant.role_id, managerRoles),
        inArray(AccessGrant.scope_type, ["SCHOOL", "PLATFORM"]),
        eq(AccessGrant.status, "ACTIVE"),
        ne(AccessGrant.grant_id, grantId),
      ),
    );
  return Number(others?.n ?? 0) === 0;
}
