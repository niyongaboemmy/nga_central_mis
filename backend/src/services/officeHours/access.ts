import { resolveUserScope } from "../userScope";
import { AuthorizationError } from "../../errors/CustomError";

/**
 * Who is acting, and what they may do (plan §15).
 *
 * Routes gate on the legacy OFFICE_HOURS_* permissions (teachers, students and
 * parents still reach the MIS through legacy roles). Area scoping reuses
 * resolveUserScope -- the same class-teacher / programme-lead rule the
 * calendar uses -- with one safety change: a person who holds VIEW but no
 * MANAGE_ANY and resolves to "unscoped" sees only their own office hours, not
 * the whole school (a class-teacher role holder with no UserGrade row must
 * not become a school-wide viewer).
 */
export interface Actor {
  userId: number;
  manageOwn: boolean;
  manageAny: boolean;
  view: boolean;
  viewSelf: boolean;
  configure: boolean;
}

export const actorOf = (req: any): Actor => {
  const perms: string[] = req.user?.permissions ?? [];
  return {
    userId: Number(req.user?.userId),
    manageOwn: perms.includes("OFFICE_HOURS_MANAGE_OWN"),
    manageAny: perms.includes("OFFICE_HOURS_MANAGE_ANY"),
    view: perms.includes("OFFICE_HOURS_VIEW"),
    viewSelf: perms.includes("OFFICE_HOURS_VIEW_SELF"),
    configure: perms.includes("OFFICE_HOURS_CONFIGURE"),
  };
};

/** Owner (or the session's substitute host) or MANAGE_ANY. */
export const assertCanManage = (actor: Actor, ownerId: number, extraIds: number[] = []) => {
  if (actor.manageAny) return;
  if (actor.manageOwn && (ownerId === actor.userId || extraIds.includes(actor.userId))) return;
  throw new AuthorizationError("You can only manage your own office hours");
};

/**
 * The class groups whose students' office-hours data the actor may read.
 *   null      -> whole school
 *   number[]  -> only these class groups
 *   "own"     -> only office hours the actor runs (no area view)
 */
export type ReadScope = { kind: "school" } | { kind: "classGroups"; classGroupIds: number[] } | { kind: "own" };

export const readScopeOf = async (actor: Actor, academicYearId: number | null): Promise<ReadScope> => {
  if (!actor.view && !actor.manageAny) return { kind: "own" };
  const scope = await resolveUserScope(actor.userId, academicYearId);
  if (scope.scoped) return { kind: "classGroups", classGroupIds: scope.classGroupIds };
  if (actor.manageAny) return { kind: "school" };
  return { kind: "own" };
};
