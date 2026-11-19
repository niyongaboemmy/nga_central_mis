import { sql } from "drizzle-orm";
import { notifyPerson } from "../notifications/notifyPerson";
import { CAP, inList, many, one } from "./core";

/**
 * Side-project notices (plan §7.6). Never throw: a failed notice must not fail the action.
 * Students land on their board, staff on the monitor drawer.
 */

const studentLink = (id: number) => `/my-projects?project=${id}`;
const staffLink = (id: number) => (id ? `/projects-monitor?project=${id}` : "/projects-monitor?tab=supervising");
/** Supervisors land on their Assigned projects page (migration 131). */
const supervisorLink = (id: number) => (id ? `/assigned-projects?project=${id}` : "/assigned-projects");

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
    const sup = Number(h.sup) || 0;
    const teachers = (await classTeachersOf(projectId)).filter((id) => id !== sup);
    await send([sup], "side_project_created", `New project: ${h.title}`, `${h.student} started a new side project.`, supervisorLink(projectId), projectId, actorId);
    await send(teachers, "side_project_created", `New project: ${h.title}`, `${h.student} started a new side project.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* never fail the action */
  }
}

const STATUS_LABEL: Record<string, string> = { IDEA: "Idea", PLANNING: "Planning", IN_PROGRESS: "Building", TESTING: "Testing", COMPLETED: "Completed", ON_HOLD: "On hold" };

/** The owner and accepted teammates marked manager (who plan and assign). */
async function managersOf(projectId: number): Promise<number[]> {
  const r = await many(sql`
    SELECT owner_user_id AS id FROM SideProject WHERE project_id = ${projectId}
    UNION SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId} AND status = 'ACCEPTED' AND is_manager = 1`);
  return r.map((x) => Number(x.id));
}
const nameOf = async (userId: number) =>
  ((await one(sql`SELECT TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS n FROM UserProfile WHERE user_id = ${userId}`))?.n as string) || "Someone";

/**
 * Every stage change: the team (except whoever moved it) and the supervisor. Completion also
 * reaches the Student Projects Lead, since it waits for verification.
 */
export async function onStatus(projectId: number, actorId: number, to: string, from?: string | null) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const sup = Number(h.sup) || 0;
    const who = await nameOf(actorId);
    if (to === "COMPLETED") {
      await send(await teamOf(projectId), "side_project_status", `Completed: ${h.title}`, `${who} marked the project completed. It now waits for verification.`, studentLink(projectId), projectId, actorId);
      await send([sup], "side_project_completed", `Completed: ${h.title}`, `${h.student} completed a project. It is waiting for verification.`, supervisorLink(projectId), projectId, actorId);
      await send((await leads()).filter((id) => id !== sup), "side_project_completed", `Completed: ${h.title}`, `${h.student} completed a project. It is waiting for verification.`, staffLink(projectId), projectId, actorId);
      return;
    }
    const label = STATUS_LABEL[to] ?? to;
    const title = to === "ON_HOLD" ? `Paused: ${h.title}` : from === "ON_HOLD" ? `Resumed: ${h.title}` : `${h.title} moved to ${label}`;
    const body = to === "ON_HOLD" ? `${who} put the project on hold.` : `${who} moved the project${from ? ` from ${STATUS_LABEL[from] ?? from}` : ""} to ${label}.`;
    await send(await teamOf(projectId), "side_project_status", title, body, studentLink(projectId), projectId, actorId);
    await send([sup], "side_project_status", title, body, supervisorLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

/**
 * A progress report was posted: the owner, the team managers and the supervisor hear what was
 * done (and on which plan items). A blocker also goes out as its own notice, so it isn't missed.
 */
export async function onReport(projectId: number, actorId: number, reportId: number, edited = false) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const r = await one(sql`SELECT did, hours, blockers FROM SideProjectUpdate WHERE update_id = ${reportId} AND project_id = ${projectId}`);
    if (!r) return;
    const lines = await many(sql`
      SELECT COALESCE(t.title, i.title) AS t FROM SideProjectUpdateWork w
      JOIN SideProjectPlanItem i ON i.item_id = w.plan_item_id LEFT JOIN SideProjectTask t ON t.task_id = w.task_id
      WHERE w.update_id = ${reportId} ORDER BY w.work_id LIMIT 4`);
    const who = await nameOf(actorId);
    const on = lines.length ? ` on ${lines.map((x) => x.t).join(", ")}` : "";
    const hours = r.hours ? ` (${Number(r.hours)}h)` : "";
    const body = `${who} ${edited ? "updated a report" : "reported"}${hours}${on}: ${String(r.did).replace(/\s+/g, " ").slice(0, 160)}`;
    const sup = Number(h.sup) || 0;
    const managers = await managersOf(projectId);
    await send(managers, "side_project_report", `${edited ? "Report updated" : "New report"}: ${h.title}`, body, `${studentLink(projectId)}&tab=progress`, projectId, actorId);
    await send([sup].filter((id) => !managers.includes(id)), "side_project_report", `${edited ? "Report updated" : "New report"}: ${h.title}`, body, supervisorLink(projectId), projectId, actorId);
    if (r.blockers && !edited) {
      const b = `${who} is blocked: ${String(r.blockers).replace(/\s+/g, " ").slice(0, 200)}`;
      await send(managers, "side_project_report_blocker", `Blocker on ${h.title}`, b, `${studentLink(projectId)}&tab=progress`, projectId, actorId);
      await send([sup].filter((id) => !managers.includes(id)), "side_project_report_blocker", `Blocker on ${h.title}`, b, supervisorLink(projectId), projectId, actorId);
    }
  } catch {
    /* ignore */
  }
}

/** Invitation answered: the owner and team managers. */
export async function onInviteAnswer(projectId: number, userId: number, accepted: boolean) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const who = await nameOf(userId);
    await send(
      await managersOf(projectId),
      "side_project_invite_answer",
      accepted ? `${who} joined ${h.title}` : `${who} declined to join ${h.title}`,
      accepted ? "They are on the team now: give them tasks in the plan." : "You can invite someone else from the Team tab.",
      `${studentLink(projectId)}&tab=team`,
      projectId,
      userId,
    );
  } catch {
    /* ignore */
  }
}

/** Someone left (tell the owner and managers) or was removed (tell them). */
export async function onMemberGone(projectId: number, actorId: number, userId: number) {
  try {
    const h = await head(projectId);
    if (!h) return;
    if (actorId === userId) {
      await send(await managersOf(projectId), "side_project_member_left", `${await nameOf(userId)} left ${h.title}`, "Their tasks stay in the plan: reassign them.", `${studentLink(projectId)}&tab=team`, projectId, actorId);
    } else {
      await send([userId], "side_project_member_removed", `You are no longer on ${h.title}`, `${await nameOf(actorId)} removed you from the project team.`, "/my-projects", projectId, actorId);
    }
  } catch {
    /* ignore */
  }
}

/** A teammate's position changed: tell them. */
export async function onPosition(projectId: number, actorId: number, userId: number, title: string | null) {
  try {
    const h = await head(projectId);
    if (!h || !title) return;
    await send([userId], "side_project_position", `Your position on ${h.title}`, `${await nameOf(actorId)} set your position to ${title}.`, `${studentLink(projectId)}&tab=team`, projectId, actorId);
  } catch {
    /* ignore */
  }
}

/** A document (concept note, SRS, implementation plan) was added: the supervisor reviews it. */
export async function onDocument(projectId: number, actorId: number, docType: string) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const label: Record<string, string> = { CONCEPT: "Concept note", SRS: "SRS", IMPLEMENTATION_PLAN: "Implementation plan" };
    const sup = Number(h.sup) || 0;
    await send([sup], "side_project_document", `${label[docType] ?? "Document"} added: ${h.title}`, `${await nameOf(actorId)} uploaded the ${(label[docType] ?? "document").toLowerCase()}.`, supervisorLink(projectId), projectId, actorId);
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
    const sup = Number(h.sup) || 0;
    await send([sup], "side_project_reply", `Reply on ${h.title}`, `${h.student} replied to the feedback.`, supervisorLink(projectId), projectId, actorId);
    await send(r.map((x) => Number(x.id)).filter((id) => id !== sup), "side_project_reply", `Reply on ${h.title}`, `${h.student} replied to the feedback.`, staffLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function onInvite(projectId: number, actorId: number, userId: number) {
  try {
    const h = await head(projectId);
    if (!h) return;
    const m = await one(sql`SELECT role_title FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId}`);
    const as = m?.role_title ? ` as ${m.role_title}` : "";
    await send([userId], "side_project_invite", `Join ${h.title}?`, `${await nameOf(actorId)} invited you to the project team${as}. Accept or decline from My projects.`, studentLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

export async function onSupervisor(projectId: number, actorId: number, supervisorId: number | null) {
  if (!supervisorId) return;
  try {
    const h = await head(projectId);
    if (!h) return;
    await send([supervisorId], "side_project_supervisor", `You supervise ${h.title}`, `${h.student}'s project now lists you as supervisor.`, supervisorLink(projectId), projectId, actorId);
  } catch {
    /* ignore */
  }
}

/** `staff` recipients are supervisors (sweep digests and stage nudges): their Assigned page. */
export async function notifyMany(userIds: number[], kind: string, title: string, body: string, projectId: number, staff: boolean) {
  await send(userIds, kind, title, body, staff ? supervisorLink(projectId) : studentLink(projectId), projectId, null);
}

export { CAP, inList };

/** Task notifications (migration 133): assigned, review requested, blocked, overdue. Open the project's plan. */
export async function notifyWork(userIds: number[], kind: string, title: string, body: string, projectId: number, actorId: number | null) {
  try {
    await send(userIds, kind, title, body, `/my-projects?project=${projectId}&tab=plan`, projectId, actorId);
  } catch {
    /* never fail the action */
  }
}
