import { sql } from "drizzle-orm";
import { db } from "../../db";
import { clip, fail, fullName, many, one, recordEvent, ROLE_KEYS, TEAM_MODES } from "./core";
import { ProjectAccess } from "./access";

/**
 * Team projects (plan Phase 5): the owner invites anyone (people search or registration number); an
 * invited student accepts or declines. Accepted members edit like the owner, but only the
 * owner deletes, archives and manages the team.
 */

const MAX_MEMBERS = 8;

/**
 * Invite someone to the team: picked from the people search (`userId`) or typed as a
 * registration number. Anyone active may join -- students, staff, parents.
 */
export async function invite(a: ProjectAccess, by: number, who: { userId?: unknown; regNumber?: unknown }) {
  if (!a.isOwner && !a.manageAny) fail(403, "NOT_OWNER", "Only the project owner can invite");
  const reg = clip(who.regNumber, 20);
  const id = Number(who.userId);
  if (!reg && !(Number.isInteger(id) && id > 0)) fail(400, "VALIDATION", "Choose a person", "regNumber");
  const s = await one(
    Number.isInteger(id) && id > 0
      ? sql`SELECT u.user_id, u.status FROM User u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ${id}`
      : sql`SELECT u.user_id, u.status FROM UserProfile p JOIN User u ON u.user_id = p.user_id WHERE p.registration_number = ${reg}`,
  );
  if (!s || s.status !== "ACTIVE") fail(404, "PERSON_NOT_FOUND", "No active person matches", "regNumber");
  const userId = Number(s.user_id);
  if (userId === Number(a.project.owner_user_id)) fail(409, "ALREADY_MEMBER", "That's the project owner", "regNumber");
  if (a.project.supervisor_user_id && userId === Number(a.project.supervisor_user_id))
    fail(409, "IS_SUPERVISOR", "This person supervises the project: a supervisor guides it from outside the team", "regNumber");
  const n = await one(sql`SELECT COUNT(*) AS n FROM SideProjectMember WHERE project_id = ${a.project.project_id}`);
  if (Number(n?.n ?? 0) >= MAX_MEMBERS) fail(400, "TEAM_FULL", `A team has at most ${MAX_MEMBERS + 1} people`, "regNumber");
  const exists = await one(sql`SELECT status FROM SideProjectMember WHERE project_id = ${a.project.project_id} AND user_id = ${userId}`);
  if (exists) fail(409, "ALREADY_MEMBER", exists.status === "INVITED" ? "Already invited" : "Already in the team", "regNumber");
  // Inviting someone makes a personal project a team project.
  if (a.project.team_mode !== "TEAM") await db.execute(sql`UPDATE SideProject SET team_mode = 'TEAM' WHERE project_id = ${a.project.project_id}`);
  await db.execute(sql`
    INSERT INTO SideProjectMember (project_id, user_id, status, invited_by, added_at)
    VALUES (${a.project.project_id}, ${userId}, 'INVITED', ${by}, UTC_TIMESTAMP())`);
  await recordEvent(Number(a.project.project_id), by, "MEMBER_INVITED", null, String(userId));
  return userId;
}

export async function respond(projectId: number, userId: number, accept: boolean) {
  const m = await one(sql`SELECT status FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId}`);
  if (!m || m.status !== "INVITED") fail(404, "NOT_FOUND", "Invitation not found");
  if (accept) {
    await db.execute(sql`UPDATE SideProjectMember SET status = 'ACCEPTED', responded_at = UTC_TIMESTAMP() WHERE project_id = ${projectId} AND user_id = ${userId}`);
  } else {
    await db.execute(sql`DELETE FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId}`);
  }
  await recordEvent(projectId, userId, accept ? "MEMBER_JOINED" : "MEMBER_DECLINED", null, String(userId));
}

export async function removeMember(a: ProjectAccess, by: number, userId: number) {
  const self = userId === by;
  if (!self && !a.isOwner && !a.manageAny) fail(403, "NOT_OWNER", "Only the project owner can remove members");
  const r = await one(sql`SELECT 1 AS x FROM SideProjectMember WHERE project_id = ${a.project.project_id} AND user_id = ${userId}`);
  if (!r) fail(404, "NOT_FOUND", "Not a member");
  await db.execute(sql`DELETE FROM SideProjectMember WHERE project_id = ${a.project.project_id} AND user_id = ${userId}`);
  await recordEvent(Number(a.project.project_id), by, self ? "MEMBER_LEFT" : "MEMBER_REMOVED", null, String(userId));
}

/** People search for team invites and for staff registering a project: every active user. */
export async function people(userId: number, q: string, opts: { students?: boolean } = {}) {
  const needle = `%${clip(q, 60)}%`;
  return many(sql`
    SELECT u.user_id AS id, ${fullName("p")} AS name, p.registration_number AS regNumber, p.user_type AS type
    FROM User u JOIN UserProfile p ON p.user_id = u.user_id
    WHERE u.status = 'ACTIVE' AND u.user_id <> ${userId}
      AND TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) <> ''
      ${opts.students ? sql`AND p.user_type = 'STUDENT'` : sql``}
      AND (CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,'')) LIKE ${needle}
           OR p.registration_number LIKE ${needle} OR u.email LIKE ${needle})
    ORDER BY p.first_name, p.last_name LIMIT 12`);
}

/** Personal (owner only) or team. Back to personal only once the team is empty. */
export async function setMode(a: ProjectAccess, by: number, raw: unknown) {
  if (!a.isOwner && !a.manageAny) fail(403, "NOT_OWNER", "Only the project owner can change this");
  const mode = String(raw ?? "").toUpperCase();
  if (!(TEAM_MODES as readonly string[]).includes(mode)) fail(400, "VALIDATION", "Choose personal or team", "mode");
  if (mode === "PERSONAL") {
    const n = await one(sql`SELECT COUNT(*) AS n FROM SideProjectMember WHERE project_id = ${a.project.project_id}`);
    if (Number(n?.n ?? 0) > 0) fail(409, "HAS_MEMBERS", "Remove the teammates first", "mode");
  }
  if (mode === a.project.team_mode) return mode;
  await db.execute(sql`UPDATE SideProject SET team_mode = ${mode}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${a.project.project_id}`);
  await recordEvent(Number(a.project.project_id), by, "TEAM_MODE", String(a.project.team_mode ?? "PERSONAL"), mode);
  return mode;
}

/** A teammate's role, responsibilities and whether they may plan and assign work. */
export async function updateMember(a: ProjectAccess, by: number, userId: number, body: { roleKey?: unknown; roleTitle?: unknown; responsibilities?: unknown; isManager?: unknown }) {
  if (!a.isOwner && !a.manageAny) fail(403, "NOT_OWNER", "Only the project owner can change roles");
  const m = await one(sql`SELECT role_key, is_manager FROM SideProjectMember WHERE project_id = ${a.project.project_id} AND user_id = ${userId}`);
  if (!m) fail(404, "NOT_FOUND", "Not a member");
  const sets: ReturnType<typeof sql>[] = [];
  if (body.roleKey !== undefined) {
    const k = String(body.roleKey).toUpperCase();
    if (!(ROLE_KEYS as readonly string[]).includes(k)) fail(400, "VALIDATION", "Unknown role", "roleKey");
    sets.push(sql`role_key = ${k}`);
  }
  if (body.roleTitle !== undefined) sets.push(sql`role_title = ${clip(body.roleTitle, 60) || null}`);
  if (body.responsibilities !== undefined) {
    const r = String(body.responsibilities ?? "").trim();
    if (r.length > 1000) fail(400, "VALIDATION", "At most 1000 characters", "responsibilities");
    sets.push(sql`responsibilities = ${r || null}`);
  }
  if (body.isManager !== undefined) sets.push(sql`is_manager = ${body.isManager === true || body.isManager === "true" || body.isManager === 1 ? 1 : 0}`);
  if (!sets.length) return;
  await db.execute(sql`UPDATE SideProjectMember SET ${sql.join(sets, sql`, `)} WHERE project_id = ${a.project.project_id} AND user_id = ${userId}`);
  await recordEvent(Number(a.project.project_id), by, "MEMBER_ROLE", null, String(userId));
}
