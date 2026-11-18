import { sql, SQL } from "drizzle-orm";
import { decide, scopeFor, ScopeEntry } from "../../vendor/nga-access";
import { requestSnapshot } from "../access/policy";
import { getCurrentAcademicYearId } from "../../utils/academicYear";
import { CAP, fail, inList, one } from "./core";

/**
 * Who may do what on side projects (plan §4).
 *
 *   owner / accepted co-owner  -> everything on their project (only the owner deletes,
 *                                 archives and manages members)
 *   SIDE_PROJECTS_VIEW summary -> dashboard aggregates only, small groups suppressed
 *   SIDE_PROJECTS_VIEW detail  -> list and open projects in scope, files included
 *   SIDE_PROJECTS_REVIEW       -> comment / request changes / verify in scope
 *   SIDE_PROJECTS_MANAGE_ANY   -> anything, school-wide
 *   supervisor of a project    -> view + review that project only (relation, no capability)
 *
 * The scope is matched against the student's current class (this year), falling back to
 * the class stamped on the project when the student has none.
 */

export interface Viewer {
  userId: number;
  summary: ScopeEntry | null;
  detail: ScopeEntry | null;
  review: ScopeEntry | null;
  manageAny: boolean;
}

export type ViewerResolver = (req: any) => Promise<Viewer>;

/** Production: the access v2 snapshot (always consulted, like requireCapability). */
export const snapshotViewer: ViewerResolver = async (req) => {
  const userId = Number(req.user.userId);
  try {
    const snap = await requestSnapshot(req);
    const manageAny = decide(snap, CAP.ANY).allowed;
    const all: ScopeEntry = { all: true };
    return {
      userId,
      summary: manageAny ? all : scopeFor(snap, CAP.VIEW, "summary"),
      detail: manageAny ? all : scopeFor(snap, CAP.VIEW, "detail"),
      review: manageAny ? all : scopeFor(snap, CAP.REVIEW),
      manageAny,
    };
  } catch {
    return { userId, summary: null, detail: null, review: null, manageAny: false };
  }
};

export const isEmptyScope = (s: ScopeEntry | null | undefined) =>
  !s ||
  (!s.all &&
    !s.programs?.length &&
    !s.grades?.length &&
    !s.class_groups?.length &&
    !s.students?.length &&
    !s.pairs?.length);

/** SQL condition for "this project's student is in scope"; aliases sp / cg / g. */
export function scopeCondition(scope: ScopeEntry | null, ownerCol = "sp.owner_user_id"): SQL {
  if (!scope) return sql`1 = 0`;
  if (scope.all) return sql`1 = 1`;
  const or: SQL[] = [];
  const classes = [...(scope.class_groups ?? []), ...(scope.pairs ?? []).map((p) => p[1])];
  if (classes.length) or.push(sql`cg.class_group_id IN (${inList([...new Set(classes)])})`);
  if (scope.grades?.length) or.push(sql`cg.grade_id IN (${inList(scope.grades)})`);
  if (scope.programs?.length) or.push(sql`g.program_id IN (${inList(scope.programs)})`);
  if (scope.students?.length) or.push(sql`${sql.raw(ownerCol)} IN (${inList(scope.students)})`);
  if (!or.length) return sql`1 = 0`;
  return sql`(${sql.join(or, sql` OR `)})`;
}

/** FROM clause every monitor query shares: project, student, live class, grade, programme. */
export async function projectFrom(): Promise<SQL> {
  const yearId = await getCurrentAcademicYearId();
  return sql`
    FROM SideProject sp
    JOIN User u ON u.user_id = sp.owner_user_id
    LEFT JOIN UserProfile up ON up.user_id = sp.owner_user_id
    LEFT JOIN (
      SELECT user_id, MIN(class_group_id) AS class_group_id FROM StudentClassGroup
      WHERE status = 'ACTIVE' AND academic_year_id = ${yearId ?? 0}
      GROUP BY user_id
    ) cur ON cur.user_id = sp.owner_user_id
    LEFT JOIN ClassGroup cg ON cg.class_group_id = COALESCE(cur.class_group_id, sp.class_group_id)
    LEFT JOIN Grade g ON g.grade_id = cg.grade_id
    LEFT JOIN Program pr ON pr.program_id = g.program_id`;
}

export interface ProjectAccess {
  project: any;
  isOwner: boolean;
  isMember: boolean;
  canEdit: boolean;
  canView: boolean;
  canReview: boolean;
  isSupervisor: boolean;
  manageAny: boolean;
}

/** Loads one live project with the viewer's rights on it. Unknown or unreachable -> 404. */
export async function accessProject(projectId: number, viewer: Viewer | { userId: number }, opts: { staffOnly?: boolean } = {}): Promise<ProjectAccess> {
  if (!Number.isFinite(projectId) || projectId <= 0) fail(404, "NOT_FOUND", "Project not found");
  const from = await projectFrom();
  const v = viewer as Viewer;
  const p = await one(sql`
    SELECT sp.*, cg.class_group_id AS live_class_id, cg.grade_id AS live_grade_id, g.program_id AS live_program_id,
           (SELECT m.status FROM SideProjectMember m WHERE m.project_id = sp.project_id AND m.user_id = ${v.userId}) AS member_status,
           ${v.detail ? sql`${scopeCondition(v.detail)}` : sql`0`} AS in_detail,
           ${v.review ? sql`${scopeCondition(v.review)}` : sql`0`} AS in_review
    ${from}
    WHERE sp.project_id = ${projectId} AND sp.deleted_at IS NULL`);
  if (!p) return fail(404, "NOT_FOUND", "Project not found");
  const isOwner = Number(p.owner_user_id) === v.userId;
  const isMember = p.member_status === "ACCEPTED";
  const isSupervisor = Number(p.supervisor_user_id) === v.userId;
  const manageAny = !!v.manageAny;
  const staffView = manageAny || Number(p.in_detail) === 1 || isSupervisor;
  const canView = (!opts.staffOnly && (isOwner || isMember || p.member_status === "INVITED")) || staffView;
  if (!canView) fail(404, "NOT_FOUND", "Project not found");
  return {
    project: p,
    isOwner,
    isMember,
    canEdit: isOwner || isMember || manageAny,
    canView,
    canReview: manageAny || isSupervisor || Number(p.in_review) === 1,
    isSupervisor,
    manageAny,
  };
}

export function assertEdit(a: ProjectAccess) {
  if (!a.canEdit) fail(403, "NOT_OWNER", "Only the project's team can change it");
}
export function assertOwnerOrAny(a: ProjectAccess) {
  if (!a.isOwner && !a.manageAny) fail(403, "NOT_OWNER", "Only the project owner can do this");
}
