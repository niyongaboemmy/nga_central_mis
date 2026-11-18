import { sql } from "drizzle-orm";
import { notifyPerson } from "../notifications/notifyPerson";
import { CAP, inList, many, one } from "./core";

/**
 * Side-project notices (plan §7.6). Never throw: a failed notice must not fail the action.
 * Students land on their board, staff on the monitor drawer.
 */

const studentLink = (id: number) => `/my-projects?project=${id}`;
const staffLink = (id: number) => (id ? `/projects-monitor?project=${id}` : "/projects-monitor?tab=supervising");

async function send(userIds: number[], kind: string, title: string, body: string, link: string, projectId: number, actorId: number | null) {
  const seen = new Set<number>();
  for (const userId of userIds) {
    if (!userId || seen.has(userId) || userId === actorId) continue;
    seen.add(userId);
    await notifyPerson({
      userId,
      kind: kind as any,
      title,
      body,
      link,
      subjectType: "side_project" as any,
      subjectId: projectId,
      actorId: actorId ?? undefined,
    }).catch(() => undefined);
  }
}

async function teamOf(projectId: number): Promise<number[]> {
  const r = await many(sql`
    SELECT owner_user_id AS id FROM SideProject WHERE project_id = ${projectId}
    UNION SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId} AND status = 'ACCEPTED'`);
  return r.map((x) => Number(x.id));
}

/** The student's class teacher(s) this year, through the class_teacher grant. */
async function classTeachersOf(projectId: number): Promise<number[]> {
  try {
    const r = await many(sql`
      SELECT DISTINCT g.user_id AS id
      FROM SideProject sp
      JOIN AccessGrant g ON g.status = 'ACTIVE' AND g.scope_type = 'CLASS_GROUP' AND g.scope_id = sp.class_group_id
      JOIN Role r ON r.role_id = g.role_id AND r.preset_key = 'class_teacher'
      WHERE sp.project_id = ${projectId} AND sp.class_group_id IS NOT NULL`);
    return r.map((x) => Number(x.id));
  } catch {
    return [];
  }
}

/** Holders of the Student Projects Lead role (whoever runs the programme). */
async function leads(): Promise<number[]> {
  try {
    const r = await many(sql`
      SELECT DISTINCT g.user_id AS id FROM AccessGrant g JOIN Role r ON r.role_id = g.role_id
      WHERE g.status = 'ACTIVE' AND r.preset_key = 'side_projects_lead'
      UNION
      SELECT DISTINCT ur.user_id FROM UserRole ur JOIN Role r ON r.role_id = ur.role_id WHERE r.preset_key = 'side_projects_lead'`);
    return r.map((x) => Number(x.id));
  } catch {
    return [];
  }
}

const head = async (projectId: number) =>
  one(sql`
    SELECT sp.title, sp.supervisor_user_id AS sup, TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS student
    FROM SideProject sp LEFT JOIN UserProfile p ON p.user_id = sp.owner_user_id WHERE sp.project_id = ${projectId}`);

export async function onCreated(projectId: number, actorId: number) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const staff = [Number(h.sup) || 0, ...(await classTeachersOf(projectId))];
    await send(staff, "side_project_created", `New project: ${h.title}`, `${h.student} started a new side project.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* never fail the action */
  }
}

export async function onStatus(projectId: number, actorId: number, to: string) {
  try {
    const h = await head(projectId);
    if (!h || to !== "COMPLETED") return;
    await send([Number(h.sup) || 0, ...(await leads())], "side_project_completed", `Completed: ${h.title}`, `${h.student} completed a project. It is waiting for verification.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function onReview(projectId: number, actorId: number, kind: "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED") {
  try {
    const h = await head(projectId);
    if (!h) return;
    const title =
      kind === "VERIFIED" ? `Verified: ${h.title}` : kind === "CHANGES_REQUESTED" ? `Changes requested: ${h.title}` : `New feedback on ${h.title}`;
    const body = kind === "VERIFIED" ? "Your project was verified as complete." : kind === "CHANGES_REQUESTED" ? "Open the feedback to see what to change." : "A reviewer left a comment.";
    await send(await teamOf(projectId), `side_project_${kind.toLowerCase()}`, title, body, studentLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

/** A student replied: tell the staff who left feedback on this project. */
export async function onStudentReply(projectId: number, actorId: number) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const r = await many(sql`
      SELECT DISTINCT c.author_id AS id FROM SideProjectComment c
      WHERE c.project_id = ${projectId} AND c.deleted_at IS NULL
        AND c.author_id NOT IN (SELECT owner_user_id FROM SideProject WHERE project_id = ${projectId})
        AND c.author_id NOT IN (SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId})`);
    await send([Number(h.sup) || 0, ...r.map((x) => Number(x.id))], "side_project_reply", `Reply on ${h.title}`, `${h.student} replied to the feedback.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function onInvite(projectId: number, actorId: number, userId: number) {
  try {
    const h = await head(projectId);
    if (!h) return;
    await send([userId], "side_project_invite", `Join ${h.title}?`, `${h.student} invited you to their project team.`, studentLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function onSupervisor(projectId: number, actorId: number, supervisorId: number | null) {
  if (!supervisorId) return;
  try {
    const h = await head(projectId);
    if (!h) return;
    await send([supervisorId], "side_project_supervisor", `You supervise ${h.title}`, `${h.student}'s project now lists you as supervisor.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function notifyMany(userIds: number[], kind: string, title: string, body: string, projectId: number, staff: boolean) {
  await send(userIds, kind, title, body, staff ? staffLink(projectId) : studentLink(projectId), projectId, null);
}

export { CAP, inList };
