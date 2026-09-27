import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  AccessGrant,
  AccessRule,
  UserAccessVersion,
} from "../../db/accessSchema";
import {
  MentorAssignment,
  Parenting,
  TeacherSubjectAssignment,
  User,
  UserGrade,
  UserProfile,
  UserProgramLead,
} from "../../db/schema";
import { writeAudit } from "./registry";

/**
 * Auto-assignment: turns placements (class teacher, subject teacher, programme
 * lead, mentor, parent) and personas (UserProfile.user_type) into grants,
 * according to the editable AccessRule rows (plan §5.1).
 *
 * Idempotent and convergent: a run computes the grants every ACTIVE rule
 * wants, creates or re-activates the missing ones, ends the ones whose source
 * disappeared (or whose rule was paused/deleted), and repoints grants when a
 * rule now grants a different role. Every affected user's access_version is
 * bumped so apps refresh their snapshot.
 */

export type TriggerType =
  | "PERSONA"
  | "CLASS_TEACHER"
  | "SUBJECT_TEACHER"
  | "PROGRAM_LEAD"
  | "MENTOR"
  | "PARENT";

interface DesiredGrant {
  rule_id: number;
  role_id: number;
  user_id: number;
  scope_type:
    | "CLASS_GROUP"
    | "SUBJECT_CLASS"
    | "PROGRAM"
    | "MENTEES"
    | "CHILDREN"
    | "SELF";
  scope_id: number | null;
  scope_id2: number | null;
  academic_year_id: number | null;
  source_ref: string;
}

export interface RuleSyncResult {
  created: number;
  reactivated: number;
  ended: number;
  repointed: number;
  affectedUsers: number[];
}

type RuleRow = typeof AccessRule.$inferSelect;

const parseFilter = (raw: string | null): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

async function desiredForRule(
  rule: RuleRow,
  userIds: number[] | null,
): Promise<DesiredGrant[]> {
  const base = { rule_id: rule.rule_id, role_id: rule.role_id };
  const only = <T extends { user_id: number }>(rows: T[]) =>
    userIds ? rows.filter((r) => userIds.includes(r.user_id)) : rows;

  switch (rule.trigger_type as TriggerType) {
    case "PERSONA": {
      const userType = String(parseFilter(rule.trigger_filter).user_type ?? "");
      if (!userType) return [];
      const rows = await db
        .select({ user_id: UserProfile.user_id })
        .from(UserProfile)
        .innerJoin(User, eq(User.user_id, UserProfile.user_id))
        .where(
          and(
            eq(UserProfile.user_type, userType as any),
            eq(User.status, "ACTIVE"),
            userIds ? inArray(UserProfile.user_id, userIds) : undefined,
          ),
        );
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "SELF" as const,
        scope_id: null,
        scope_id2: null,
        academic_year_id: null,
        source_ref: `u:${r.user_id}`,
      }));
    }
    case "PARENT": {
      const rows = await db
        .selectDistinct({ user_id: Parenting.parent_id })
        .from(Parenting)
        .where(userIds ? inArray(Parenting.parent_id, userIds) : undefined);
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "CHILDREN" as const,
        scope_id: null,
        scope_id2: null,
        academic_year_id: null,
        source_ref: `u:${r.user_id}`,
      }));
    }
    case "CLASS_TEACHER": {
      const rows = await db
        .select({
          user_id: UserGrade.user_id,
          grade_id: UserGrade.grade_id,
          class_group_id: UserGrade.class_group_id,
          academic_year_id: UserGrade.academic_year_id,
        })
        .from(UserGrade)
        .where(userIds ? inArray(UserGrade.user_id, userIds) : undefined);
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "CLASS_GROUP" as const,
        scope_id: r.class_group_id,
        scope_id2: null,
        academic_year_id: r.academic_year_id,
        source_ref: `u:${r.user_id}:g:${r.grade_id}:c:${r.class_group_id}:y:${r.academic_year_id}`,
      }));
    }
    case "SUBJECT_TEACHER": {
      const rows = await db
        .select({
          user_id: TeacherSubjectAssignment.user_id,
          subject_id: TeacherSubjectAssignment.subject_id,
          class_group_id: TeacherSubjectAssignment.class_group_id,
          academic_year_id: TeacherSubjectAssignment.academic_year_id,
        })
        .from(TeacherSubjectAssignment)
        .where(userIds ? inArray(TeacherSubjectAssignment.user_id, userIds) : undefined);
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "SUBJECT_CLASS" as const,
        scope_id: r.subject_id,
        scope_id2: r.class_group_id,
        academic_year_id: r.academic_year_id,
        source_ref: `u:${r.user_id}:s:${r.subject_id}:c:${r.class_group_id}:y:${r.academic_year_id}`,
      }));
    }
    case "PROGRAM_LEAD": {
      const rows = await db
        .select({
          user_id: UserProgramLead.user_id,
          program_id: UserProgramLead.program_id,
          academic_year_id: UserProgramLead.academic_year_id,
        })
        .from(UserProgramLead)
        .where(userIds ? inArray(UserProgramLead.user_id, userIds) : undefined);
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "PROGRAM" as const,
        scope_id: r.program_id,
        scope_id2: null,
        academic_year_id: r.academic_year_id,
        source_ref: `u:${r.user_id}:p:${r.program_id}:y:${r.academic_year_id}`,
      }));
    }
    case "MENTOR": {
      const rows = await db
        .selectDistinct({
          user_id: MentorAssignment.mentor_id,
          academic_year_id: MentorAssignment.academic_year_id,
        })
        .from(MentorAssignment)
        .where(
          and(
            eq(MentorAssignment.status, "ACTIVE"),
            userIds ? inArray(MentorAssignment.mentor_id, userIds) : undefined,
          ),
        );
      return only(rows).map((r) => ({
        ...base,
        user_id: r.user_id,
        scope_type: "MENTEES" as const,
        scope_id: null,
        scope_id2: null,
        academic_year_id: r.academic_year_id,
        source_ref: `u:${r.user_id}:y:${r.academic_year_id}`,
      }));
    }
    default:
      return [];
  }
}

export async function bumpAccessVersion(userIds: number[]): Promise<void> {
  const ids = Array.from(new Set(userIds)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 500) {
    await db
      .update(UserAccessVersion)
      .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
      .where(inArray(UserAccessVersion.user_id, ids.slice(i, i + 500)));
  }
}

/**
 * Converge rule-owned grants. Pass `userIds` to limit the work to people whose
 * placements just changed (called from the placement write paths); omit it for
 * the full nightly reconcile.
 */
export async function syncRuleGrants(
  opts: { userIds?: number[]; actorId?: number | null; ruleIds?: number[] } = {},
): Promise<RuleSyncResult> {
  const userIds = opts.userIds && opts.userIds.length > 0 ? opts.userIds : null;
  const result: RuleSyncResult = {
    created: 0,
    reactivated: 0,
    ended: 0,
    repointed: 0,
    affectedUsers: [],
  };
  const affected = new Set<number>();

  const allRules = await db.select().from(AccessRule);
  const rules = opts.ruleIds
    ? allRules.filter((r) => opts.ruleIds!.includes(r.rule_id))
    : allRules;
  const activeRules = rules.filter((r) => r.status === "ACTIVE");

  const desired = new Map<string, DesiredGrant>();
  for (const rule of activeRules) {
    for (const d of await desiredForRule(rule, userIds)) {
      desired.set(`${d.rule_id}|${d.source_ref}`, d);
    }
  }

  // Existing rule-owned grants in the same slice (all rules considered, so a
  // paused or deleted rule's grants are ended too).
  const existing = await db
    .select()
    .from(AccessGrant)
    .where(
      and(
        eq(AccessGrant.source, "RULE"),
        isNotNull(AccessGrant.rule_id),
        opts.ruleIds ? inArray(AccessGrant.rule_id, opts.ruleIds) : undefined,
        userIds ? inArray(AccessGrant.user_id, userIds) : undefined,
      ),
    );
  const existingByKey = new Map(existing.map((g) => [`${g.rule_id}|${g.source_ref}`, g]));

  const now = new Date();
  for (const [key, d] of desired) {
    const g = existingByKey.get(key);
    if (!g) {
      await db.insert(AccessGrant).values({
        user_id: d.user_id,
        role_id: d.role_id,
        scope_type: d.scope_type,
        scope_id: d.scope_id,
        scope_id2: d.scope_id2,
        academic_year_id: d.academic_year_id,
        source: "RULE",
        rule_id: d.rule_id,
        source_ref: d.source_ref,
        status: "ACTIVE",
        granted_by: opts.actorId ?? null,
      });
      result.created++;
      affected.add(d.user_id);
      continue;
    }
    if (g.status === "ENDED") {
      await db
        .update(AccessGrant)
        .set({
          status: "ACTIVE",
          role_id: d.role_id,
          ended_at: null,
          ended_by: null,
          end_reason: null,
          granted_at: now,
        })
        .where(eq(AccessGrant.grant_id, g.grant_id));
      result.reactivated++;
      affected.add(d.user_id);
    } else if (g.role_id !== d.role_id) {
      // Rule edited to grant a different role. A SUSPENDED grant stays
      // suspended (someone suspended it on purpose) but follows the rule.
      await db
        .update(AccessGrant)
        .set({ role_id: d.role_id })
        .where(eq(AccessGrant.grant_id, g.grant_id));
      result.repointed++;
      affected.add(d.user_id);
    }
  }

  const ruleStatus = new Map(allRules.map((r) => [r.rule_id, r.status]));
  for (const [key, g] of existingByKey) {
    if (desired.has(key) || g.status === "ENDED") continue;
    const status = g.rule_id ? ruleStatus.get(g.rule_id) : undefined;
    const reason =
      status === undefined
        ? "rule deleted"
        : status === "PAUSED"
          ? "rule paused"
          : "placement removed";
    await db
      .update(AccessGrant)
      .set({ status: "ENDED", ended_at: now, ended_by: opts.actorId ?? null, end_reason: reason })
      .where(eq(AccessGrant.grant_id, g.grant_id));
    result.ended++;
    affected.add(g.user_id);
  }

  result.affectedUsers = Array.from(affected);
  await bumpAccessVersion(result.affectedUsers);

  if (result.created + result.reactivated + result.ended + result.repointed > 0) {
    await writeAudit({
      actorId: opts.actorId ?? null,
      action: "rules.sync",
      target: { userIds: userIds ?? "all", ruleIds: opts.ruleIds ?? "all" },
      after: {
        created: result.created,
        reactivated: result.reactivated,
        ended: result.ended,
        repointed: result.repointed,
        users: result.affectedUsers.length,
      },
    });
  }
  return result;
}

/**
 * Hook for placement write paths (class teacher, subject assignment, programme
 * lead, mentor, parent links, profile type). Awaited so the grant exists when
 * the request returns, but it never throws: an access-engine problem must not
 * fail the placement write itself -- the nightly reconcile catches up.
 *
 * The given users' access_version is always bumped: a mentor's or parent's
 * snapshot lists their mentees/children live, so it changes even when no
 * grant row does. `structural` also refreshes everyone whose programme, grade
 * or department scope is derived from subject assignments/structure.
 */
export async function applyPlacementChange(
  userIds: Array<number | null | undefined>,
  actorId?: number | null,
  opts: { structural?: boolean } = {},
): Promise<void> {
  const ids = Array.from(
    new Set(userIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
  try {
    if (ids.length > 0) {
      await syncRuleGrants({ userIds: ids, actorId: actorId ?? null });
      await bumpAccessVersion(ids);
    }
    if (opts.structural) await bumpStructuralHolders();
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[access] rule sync after placement change failed:", err?.message ?? err);
  }
}

/**
 * Programme, grade and department scopes are expanded from the structure and
 * from subject assignments, so any change there refreshes their holders (a
 * handful of leaders -- cheap). Never throws.
 */
export async function bumpStructuralHolders(): Promise<void> {
  if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
  try {
    const holders = await db
      .selectDistinct({ user_id: AccessGrant.user_id })
      .from(AccessGrant)
      .where(
        and(
          inArray(AccessGrant.scope_type, ["PROGRAM", "GRADE", "DEPARTMENT"]),
          inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"]),
        ),
      );
    await bumpAccessVersion(holders.map((h) => h.user_id));
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[access] structural refresh failed:", err?.message ?? err);
  }
}

/**
 * A programme, grade or class group was deleted: end every grant anchored on
 * it (manual positions included -- the node no longer exists) and re-run the
 * rules for the people concerned. Never throws, like applyPlacementChange.
 */
export async function onNodeDeleted(
  scopeType: "PROGRAM" | "GRADE" | "CLASS_GROUP",
  scopeId: number,
  actorId?: number | null,
): Promise<void> {
  if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
  try {
    const anchored = await db
      .select({ grant_id: AccessGrant.grant_id, user_id: AccessGrant.user_id })
      .from(AccessGrant)
      .where(
        and(
          inArray(AccessGrant.status, ["ACTIVE", "SUSPENDED"]),
          scopeType === "CLASS_GROUP"
            ? sql`((${AccessGrant.scope_type} = 'CLASS_GROUP' AND ${AccessGrant.scope_id} = ${scopeId}) OR (${AccessGrant.scope_type} = 'SUBJECT_CLASS' AND ${AccessGrant.scope_id2} = ${scopeId}))`
            : and(eq(AccessGrant.scope_type, scopeType), eq(AccessGrant.scope_id, scopeId)),
        ),
      );
    await bumpStructuralHolders();
    if (anchored.length === 0) return;
    await db
      .update(AccessGrant)
      .set({
        status: "ENDED",
        ended_at: new Date(),
        ended_by: actorId ?? null,
        end_reason: `${scopeType.toLowerCase().replace("_", " ")} deleted`,
      })
      .where(inArray(AccessGrant.grant_id, anchored.map((a) => a.grant_id)));
    const users = Array.from(new Set(anchored.map((a) => a.user_id)));
    await bumpAccessVersion(users);
    await writeAudit({
      actorId: actorId ?? null,
      action: "node.deleted",
      target: { scopeType, scopeId },
      after: { endedGrants: anchored.length, users: users.length },
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[access] ending grants of a deleted node failed:", err?.message ?? err);
  }
}

/**
 * A student's class placement changed: their snapshot's `user.class_groups`
 * (and their parents', which lists the children's classes) must refresh.
 * No grant changes -- only access_version. Never throws.
 */
export async function touchLearners(studentIds: Array<number | null | undefined>): Promise<void> {
  if (process.env.ACCESS_V2_BOOTSTRAP === "false") return;
  const ids = Array.from(new Set(studentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) return;
  try {
    const parents = await db
      .selectDistinct({ parent_id: Parenting.parent_id })
      .from(Parenting)
      .where(inArray(Parenting.student_id, ids));
    await bumpAccessVersion([...ids, ...parents.map((p) => p.parent_id)]);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[access] learner refresh failed:", err?.message ?? err);
  }
}
