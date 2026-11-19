import { sql } from "drizzle-orm";
import { db } from "../../db";
import { limits, many, recordEvent } from "./core";
import { notifyMany } from "./notify";
import { nudgeDueSoonTasks, nudgeOverdueTasks } from "./work";

/**
 * Weekly nudges (plan §7.6), run from index.ts per school:
 *   - in progress with no student activity for STALE days -> the team, once per 14 days;
 *     each supervisor gets one digest of their stale projects;
 *   - concept pending (imported) -> the owner, once per 7 days.
 * Idempotent: the last nudge is an event row, so a restart or a second run sends nothing.
 */

export async function sweepSideProjects(now = new Date()) {
  const stale = limits().staleDays;
  const at = now.toISOString().slice(0, 19).replace("T", " ");
  const staleRows = await many(sql`
    SELECT sp.project_id AS id, sp.title, sp.owner_user_id AS owner, sp.supervisor_user_id AS sup
    FROM SideProject sp
    WHERE sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.status = 'IN_PROGRESS'
      AND sp.last_activity_at < DATE_SUB(${at}, INTERVAL ${stale} DAY)
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = sp.project_id AND e.type = 'NUDGE_STALE'
                      AND e.created_at > DATE_SUB(${at}, INTERVAL 14 DAY))`);
  const digest = new Map<number, string[]>();
  for (const p of staleRows) {
    const team = await many(sql`SELECT user_id AS id FROM SideProjectMember WHERE project_id = ${p.id} AND status = 'ACCEPTED'`);
    await notifyMany([Number(p.owner), ...team.map((t) => Number(t.id))], "side_project_stale", `How is ${p.title} going?`, "No progress was recorded for a while. Post a quick update.", Number(p.id), false);
    await recordEvent(Number(p.id), null, "NUDGE_STALE");
    if (p.sup) digest.set(Number(p.sup), [...(digest.get(Number(p.sup)) ?? []), p.title]);
  }
  for (const [sup, titles] of digest) {
    await notifyMany([sup], "side_project_digest", `${titles.length} supervised project${titles.length > 1 ? "s" : ""} need a check-in`, titles.slice(0, 5).join(", "), 0, true);
  }

  const pending = await many(sql`
    SELECT sp.project_id AS id, sp.title, sp.owner_user_id AS owner FROM SideProject sp
    WHERE sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.concept_pending = 1
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = sp.project_id AND e.type = 'NUDGE_CONCEPT'
                      AND e.created_at > DATE_SUB(${at}, INTERVAL 7 DAY))`);
  for (const p of pending) {
    await notifyMany([Number(p.owner)], "side_project_concept", `Add the concept note for ${p.title}`, "Upload the concept note so your project can move forward.", Number(p.id), false);
    await recordEvent(Number(p.id), null, "NUDGE_CONCEPT");
  }
  // A stage past its planned end: tell the team and the supervisor once per stay in that stage.
  const overStage = await many(sql`
    SELECT sp.project_id AS id, sp.title, sp.owner_user_id AS owner, sp.supervisor_user_id AS sup, sp.status
    FROM SideProject sp
    JOIN SideProjectStage st ON st.project_id = sp.project_id AND st.stage = sp.status
    WHERE sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.status IN ('IDEA', 'PLANNING', 'IN_PROGRESS', 'TESTING')
      AND st.planned_end < DATE(${at})
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = sp.project_id AND e.type = 'NUDGE_STAGE'
                      AND e.to_value = sp.status AND e.created_at >= COALESCE(sp.stage_entered_at, sp.created_at))`);
  const label: Record<string, string> = { IDEA: "Idea", PLANNING: "Planning", IN_PROGRESS: "Building", TESTING: "Testing" };
  for (const p of overStage) {
    const team = await many(sql`SELECT user_id AS id FROM SideProjectMember WHERE project_id = ${p.id} AND status = 'ACCEPTED'`);
    await notifyMany([Number(p.owner), ...team.map((t) => Number(t.id))], "side_project_stage_overdue", `${p.title}: ${label[p.status]} is overdue`, "The planned time for this stage has passed. Move on or adjust the plan.", Number(p.id), false);
    if (p.sup) await notifyMany([Number(p.sup)], "side_project_stage_overdue", `${p.title}: ${label[p.status]} is overdue`, "A project you supervise is past its stage plan.", Number(p.id), true);
    await recordEvent(Number(p.id), null, "NUDGE_STAGE", null, p.status);
  }
  const tasksOverdue = await nudgeOverdueTasks();
  const tasksDueSoon = await nudgeDueSoonTasks();

  // Closing date: three days before (once per date), and once it has passed (once per date).
  const teamIds = async (id: number, owner: number) => [owner, ...(await many(sql`SELECT user_id AS id FROM SideProjectMember WHERE project_id = ${id} AND status = 'ACCEPTED'`)).map((t) => Number(t.id))];
  const closing = await many(sql`
    SELECT sp.project_id AS id, sp.title, sp.owner_user_id AS owner, sp.supervisor_user_id AS sup, DATE_FORMAT(sp.target_date, '%Y-%m-%d') AS target,
           DATEDIFF(sp.target_date, DATE(${at})) AS daysLeft
    FROM SideProject sp
    WHERE sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.status NOT IN ('COMPLETED', 'ON_HOLD') AND sp.target_date IS NOT NULL
      AND sp.target_date BETWEEN DATE(${at}) AND DATE_ADD(DATE(${at}), INTERVAL 3 DAY)
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = sp.project_id AND e.type = 'NUDGE_CLOSING' AND DATE(e.to_value) = sp.target_date)`);
  for (const p of closing) {
    const d = Number(p.daysLeft);
    const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
    await notifyMany(await teamIds(Number(p.id), Number(p.owner)), "side_project_closing", `${p.title} closes ${when}`, "Wrap up the open work, or move the closing date in the plan.", Number(p.id), false);
    if (p.sup) await notifyMany([Number(p.sup)], "side_project_closing", `${p.title} closes ${when}`, "A project you supervise is near its closing date.", Number(p.id), true);
    await recordEvent(Number(p.id), null, "NUDGE_CLOSING", null, p.target);
  }
  const late = await many(sql`
    SELECT sp.project_id AS id, sp.title, sp.owner_user_id AS owner, sp.supervisor_user_id AS sup, DATE_FORMAT(sp.target_date, '%Y-%m-%d') AS target
    FROM SideProject sp
    WHERE sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.status NOT IN ('COMPLETED', 'ON_HOLD', 'IDEA') AND sp.target_date IS NOT NULL
      AND sp.target_date < DATE(${at})
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = sp.project_id AND e.type = 'NUDGE_LATE' AND DATE(e.to_value) = sp.target_date)`);
  for (const p of late) {
    await notifyMany(await teamIds(Number(p.id), Number(p.owner)), "side_project_late", `${p.title} is past its closing date`, "Finish it, or agree a new closing date and update the plan.", Number(p.id), false);
    if (p.sup) await notifyMany([Number(p.sup)], "side_project_late", `${p.title} is past its closing date`, "A project you supervise passed its closing date.", Number(p.id), true);
    await recordEvent(Number(p.id), null, "NUDGE_LATE", null, p.target);
  }

  // Report reminder: someone with open assigned tasks on a working project who hasn't reported
  // on it for 7 days (or ever, once the task is 3 days old). Once per person per project per week.
  const quiet = await many(sql`
    SELECT DISTINCT t.project_id AS id, sp.title, t.assignee_user_id AS who
    FROM SideProjectTask t
    JOIN SideProject sp ON sp.project_id = t.project_id AND sp.deleted_at IS NULL AND sp.archived_at IS NULL AND sp.status IN ('PLANNING', 'IN_PROGRESS', 'TESTING')
    WHERE t.status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED') AND t.assignee_user_id IS NOT NULL
      AND t.created_at < DATE_SUB(${at}, INTERVAL 3 DAY)
      AND NOT EXISTS (SELECT 1 FROM SideProjectUpdate u WHERE u.project_id = t.project_id AND u.author_id = t.assignee_user_id
                      AND COALESCE(u.work_date, DATE(u.created_at)) > DATE_SUB(DATE(${at}), INTERVAL 7 DAY))
      AND NOT EXISTS (SELECT 1 FROM SideProjectEvent e WHERE e.project_id = t.project_id AND e.type = 'NUDGE_REPORT'
                      AND CAST(e.to_value AS UNSIGNED) = t.assignee_user_id AND e.created_at > DATE_SUB(${at}, INTERVAL 7 DAY))
    LIMIT 500`);
  for (const q of quiet) {
    await notifyMany([Number(q.who)], "side_project_report_reminder", `Report on your tasks in ${q.title}`, "You have open tasks and no report this week. Post a short report on them.", Number(q.id), false);
    await recordEvent(Number(q.id), null, "NUDGE_REPORT", null, String(q.who));
  }
  return { stale: staleRows.length, supervisors: digest.size, conceptPending: pending.length, stageOverdue: overStage.length, tasksOverdue, tasksDueSoon, closing: closing.length, late: late.length, reportReminders: quiet.length };
}

/** Used by tests to age a project. */
export async function backdateActivity(projectId: number, days: number) {
  await db.execute(sql`UPDATE SideProject SET last_activity_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${days} DAY) WHERE project_id = ${projectId}`);
}
