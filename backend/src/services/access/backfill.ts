import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { AccessGrant, AccessRole } from "../../db/accessSchema";
import {
  School,
  User,
  UserGrade,
  UserProfile,
  UserProgramLead,
  UserRole,
} from "../../db/schema";
import { LEGACY_ROLE_BACKFILL } from "../../access/presets";
import { bumpAccessVersion, syncRuleGrants } from "./ruleEngine";
import { writeAudit } from "./registry";

/**
 * One-off Phase 1 backfill (plan §11 Phase 1): turns today's global UserRole
 * rows into grants, and runs every rule over the existing placements.
 *
 *  - platform owner / head teacher / administrator / bursar  -> MIGRATION grant
 *    at PLATFORM or SCHOOL
 *  - class teacher / programme coordinator                   -> nothing here;
 *    their scoped grant comes from the placement rule. A holder with no
 *    placement is REPORTED, never widened to the whole school.
 *  - personas (teacher, staff, student, parent)               -> persona rules
 *  - custom roles (no preset)                                  -> REPORTED for a
 *    manual decision
 *
 * Dry run by default: it only reports what it would do.
 */

export interface BackfillReport {
  applied: boolean;
  migrationGrants: Array<{ userId: number; role: string; scope: string }>;
  ruleSync: {
    created: number;
    reactivated: number;
    ended: number;
    repointed: number;
  } | null;
  needsAttention: Array<{ userId: number; username: string; issue: string }>;
}

export async function defaultSchoolId(): Promise<number> {
  const [row] = await db
    .select({ id: School.school_id })
    .from(School)
    .where(eq(School.status, "ACTIVE"))
    .orderBy(School.school_id)
    .limit(1);
  return row?.id ?? 1;
}

export async function backfillLegacyGrants(
  opts: { apply?: boolean; actorId?: number | null } = {},
): Promise<BackfillReport> {
  const apply = !!opts.apply;
  const report: BackfillReport = {
    applied: apply,
    migrationGrants: [],
    ruleSync: null,
    needsAttention: [],
  };
  const schoolId = await defaultSchoolId();

  const holdings = await db
    .select({
      user_id: UserRole.user_id,
      role_id: UserRole.role_id,
      role_name: AccessRole.name,
      preset_key: AccessRole.preset_key,
      role_status: AccessRole.status,
      username: User.username,
      user_status: User.status,
    })
    .from(UserRole)
    .innerJoin(AccessRole, eq(AccessRole.role_id, UserRole.role_id))
    .innerJoin(User, eq(User.user_id, UserRole.user_id));

  const [grades, leads, profiles] = await Promise.all([
    db.selectDistinct({ user_id: UserGrade.user_id }).from(UserGrade),
    db.selectDistinct({ user_id: UserProgramLead.user_id }).from(UserProgramLead),
    db.select({ user_id: UserProfile.user_id, user_type: UserProfile.user_type }).from(UserProfile),
  ]);
  const hasGrade = new Set(grades.map((g) => g.user_id));
  const hasLead = new Set(leads.map((l) => l.user_id));
  const profileType = new Map(profiles.map((p) => [p.user_id, p.user_type]));
  const usersWithRole = new Set(holdings.map((h) => h.user_id));

  const touched: number[] = [];
  for (const h of holdings) {
    if (h.role_status !== "ACTIVE" || h.user_status !== "ACTIVE") continue;
    const mode = h.preset_key ? LEGACY_ROLE_BACKFILL[h.preset_key] : undefined;

    if (!h.preset_key || mode === undefined) {
      report.needsAttention.push({
        userId: h.user_id,
        username: h.username,
        issue: `holds custom role "${h.role_name}" -- assign it at a node in Access Studio`,
      });
      continue;
    }
    if (mode === "RULE") {
      if (h.preset_key === "class_teacher" && !hasGrade.has(h.user_id)) {
        report.needsAttention.push({
          userId: h.user_id,
          username: h.username,
          issue: `holds ${h.role_name} but has no class-teacher assignment -- assign a class`,
        });
      }
      if (h.preset_key === "programme_coordinator" && !hasLead.has(h.user_id)) {
        report.needsAttention.push({
          userId: h.user_id,
          username: h.username,
          issue: `holds ${h.role_name} but leads no programme -- assign a programme`,
        });
      }
      continue;
    }

    const [already] = await db
      .select({ grant_id: AccessGrant.grant_id })
      .from(AccessGrant)
      .where(
        and(
          eq(AccessGrant.user_id, h.user_id),
          eq(AccessGrant.role_id, h.role_id),
          eq(AccessGrant.scope_type, mode),
          isNull(AccessGrant.scope_id),
          inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"]),
        ),
      )
      .limit(1);
    if (already) continue;

    report.migrationGrants.push({ userId: h.user_id, role: h.role_name, scope: mode });
    if (apply) {
      await db.insert(AccessGrant).values({
        user_id: h.user_id,
        role_id: h.role_id,
        school_id: schoolId,
        scope_type: mode,
        source: "MIGRATION",
        source_ref: `userrole:${h.user_id}:${h.role_id}`,
        status: "ACTIVE",
        granted_by: opts.actorId ?? null,
        title: h.role_name,
      });
      touched.push(h.user_id);
    }
  }

  // Staff with a profile but no role at all get their persona from the rules,
  // but nobody may have noticed they had no access before -- flag them.
  for (const [userId, type] of profileType) {
    if ((type === "TEACHER" || type === "STAFF") && !usersWithRole.has(userId)) {
      const [u] = await db
        .select({ username: User.username, status: User.status })
        .from(User)
        .where(eq(User.user_id, userId))
        .limit(1);
      if (u?.status === "ACTIVE") {
        report.needsAttention.push({
          userId,
          username: u.username,
          issue: `${type} profile with no role -- gets the persona baseline from rules; check it is enough`,
        });
      }
    }
  }

  if (apply) {
    const sync = await syncRuleGrants({ actorId: opts.actorId ?? null });
    report.ruleSync = {
      created: sync.created,
      reactivated: sync.reactivated,
      ended: sync.ended,
      repointed: sync.repointed,
    };
    await bumpAccessVersion(touched);
    await writeAudit({
      actorId: opts.actorId ?? null,
      action: "backfill.apply",
      after: {
        migrationGrants: report.migrationGrants.length,
        ruleSync: report.ruleSync,
        needsAttention: report.needsAttention.length,
      },
    });
  }
  return report;
}

/** Legacy roles whose holders must always carry their v2 grant (migration 099). */
const SELF_HEALING_PRESETS = ["platform_owner", "school_administrator"] as const;

/**
 * Boot-time self-heal: an ACTIVE holder of the legacy SUPER_ADMIN / ADMIN role
 * who has never had a v2 grant of that role gets one, so a platform owner
 * created after the Phase 1 backfill is not locked out of v2-only screens
 * (Access Studio, Usage & Monitoring). A grant that exists in any state --
 * including one an operator ended or suspended -- is left alone.
 */
export async function ensureLegacyAdminGrants(): Promise<Array<{ userId: number; role: string }>> {
  const holdings = await db
    .select({
      user_id: UserRole.user_id,
      role_id: UserRole.role_id,
      role_name: AccessRole.name,
      preset_key: AccessRole.preset_key,
      role_status: AccessRole.status,
      user_status: User.status,
    })
    .from(UserRole)
    .innerJoin(AccessRole, eq(AccessRole.role_id, UserRole.role_id))
    .innerJoin(User, eq(User.user_id, UserRole.user_id))
    .where(inArray(AccessRole.preset_key, [...SELF_HEALING_PRESETS]));
  const eligible = holdings.filter((h) => h.role_status === "ACTIVE" && h.user_status === "ACTIVE");
  if (eligible.length === 0) return [];

  const existing = await db
    .select({ user_id: AccessGrant.user_id, role_id: AccessGrant.role_id })
    .from(AccessGrant)
    .where(inArray(AccessGrant.role_id, Array.from(new Set(eligible.map((h) => h.role_id)))));
  const have = new Set(existing.map((g) => `${g.user_id}|${g.role_id}`));
  const missing = eligible.filter((h) => !have.has(`${h.user_id}|${h.role_id}`));
  if (missing.length === 0) return [];

  const schoolId = await defaultSchoolId();
  for (const h of missing) {
    await db.insert(AccessGrant).values({
      user_id: h.user_id,
      role_id: h.role_id,
      school_id: schoolId,
      scope_type: LEGACY_ROLE_BACKFILL[h.preset_key!] === "PLATFORM" ? "PLATFORM" : "SCHOOL",
      source: "MIGRATION",
      source_ref: `userrole:${h.user_id}:${h.role_id}`,
      status: "ACTIVE",
      title: h.role_name,
      justification: "Legacy role holder without a v2 grant (self-heal)",
    });
  }
  await bumpAccessVersion(missing.map((h) => h.user_id));
  await writeAudit({
    actorId: null,
    action: "backfill.self_heal",
    after: { grants: missing.map((h) => ({ userId: h.user_id, role: h.role_name })) },
  });
  return missing.map((h) => ({ userId: h.user_id, role: h.role_name }));
}
