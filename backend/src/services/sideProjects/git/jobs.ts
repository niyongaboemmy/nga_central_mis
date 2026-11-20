import { sql } from "drizzle-orm";
import { db } from "../../../db";
import logger from "../../../utils/logger";
import { notifyPerson } from "../../notifications/notifyPerson";
import { apiUrl } from "../../reminders/webPush";
import { currentTenantOrNull } from "../../../tenancy";
const currentTid = () => currentTenantOrNull()?.tid ?? 1;
import { many, one } from "../core";
import { applyEvent, processPending } from "./ingest";
import { refreshDraft, submitDraft } from "./drafts";
import { githubEnabled, repoGet } from "./github";
import { settingsOf, signState } from "./store";
import { kigaliDay } from "./hours";

/**
 * Background work for Git reporting (GIT_AUTOMATED_REPORTING_ANALYSIS.md §7.2-§7.3, §9.1):
 *   - retry webhook deliveries that failed or were never processed;
 *   - Friday 16:00 Kigali: "Your report is ready" with Submit as is / Review;
 *   - auto-submit open drafts N days after that notice when the project's policy says so;
 *   - nightly reconcile against the GitHub API (GitHub does not redeliver missed events).
 */

const kigaliNow = (now: Date) => new Date(now.getTime() + 2 * 3_600_000);

/** Monday 00:00 Kigali of this week, as a UTC SQL datetime. */
function weekStartUtc(now: Date): string {
  const k = kigaliNow(now);
  const dow = (k.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow) - 2 * 3_600_000);
  return monday.toISOString().slice(0, 19).replace("T", " ");
}

export const isFridayNoticeTime = (now: Date) => {
  const k = kigaliNow(now);
  return (k.getUTCDay() === 5 && k.getUTCHours() >= 16) || k.getUTCDay() === 6 || k.getUTCDay() === 0;
};

/** Signed one-tap action URL for a draft (push notification buttons). */
export function draftActionUrl(draftId: number, userId: number, action: "submit"): string {
  const token = signState({ d: draftId, u: userId, t: currentTid(), a: action }, 7 * 86_400);
  return apiUrl(`/integrations/github/drafts/action?token=${encodeURIComponent(token)}`);
}

export async function notifyDrafts(now = new Date()): Promise<number> {
  if (!isFridayNoticeTime(now)) return 0;
  const since = weekStartUtc(now);
  const drafts = await many(sql`
    SELECT d.draft_id, d.user_id, d.project_id, d.hours, d.work_lines, sp.title FROM SideProjectReportDraft d
    JOIN SideProject sp ON sp.project_id = d.project_id AND sp.deleted_at IS NULL
    WHERE d.status = 'OPEN' AND (d.notified_at IS NULL OR d.notified_at < ${since})`);
  let sent = 0;
  for (const d of drafts) {
    const lines = (d.work_lines ? JSON.parse(d.work_lines) : []).filter((l: any) => l.include);
    if (!lines.length) continue;
    const tasks = lines.filter((l: any) => l.taskId).length;
    const hours = d.hours ? ` · ~${Number(d.hours)} h` : "";
    await notifyPerson({
      userId: Number(d.user_id),
      kind: "side_project_git_draft" as any,
      title: `Your report is ready: ${d.title}`,
      body: `${tasks || lines.length} ${tasks === 1 ? "task" : "tasks"}${hours}, written from your GitHub work. Review it, or submit as is.`,
      link: `/my-projects?project=${d.project_id}&tab=progress&draft=1`,
      subjectType: "side_project" as any,
      subjectId: Number(d.project_id),
      pushData: { actions: [{ action: "submit", title: "✅ Submit as is", url: draftActionUrl(Number(d.draft_id), Number(d.user_id), "submit") }, { action: "open", title: "Review" }] },
    }).catch(() => undefined);
    await db.execute(sql`UPDATE SideProjectReportDraft SET notified_at = UTC_TIMESTAMP() WHERE draft_id = ${d.draft_id}`);
    sent++;
  }
  return sent;
}

export async function autoSubmitDrafts(now = new Date()): Promise<number> {
  const rows = await many(sql`
    SELECT d.draft_id, d.user_id, d.notified_at, l.settings, sp.kind FROM SideProjectReportDraft d
    JOIN SideProject sp ON sp.project_id = d.project_id AND sp.deleted_at IS NULL
    LEFT JOIN GitRepoLink l ON l.link_id = (SELECT MIN(x.link_id) FROM GitRepoLink x WHERE x.project_id = d.project_id AND x.status = 'ACTIVE')
    WHERE d.status = 'OPEN' AND d.notified_at IS NOT NULL`);
  let n = 0;
  for (const r of rows) {
    const s = settingsOf(r.settings, r.kind);
    if (!s.autoSubmitDays) continue;
    const notified = new Date(String(r.notified_at instanceof Date ? r.notified_at.toISOString() : String(r.notified_at).replace(" ", "T") + "Z"));
    if (now.getTime() - notified.getTime() < s.autoSubmitDays * 86_400_000) continue;
    try {
      await submitDraft(Number(r.draft_id), Number(r.user_id), { auto: true });
      n++;
    } catch (e: any) {
      logger.info(`[git] auto-submit skipped for draft ${r.draft_id}: ${e?.message ?? e}`);
    }
  }
  return n;
}

/** Fill gaps from the GitHub API: recent default-branch commits and pull requests (48 h). */
export async function reconcile(now = new Date()): Promise<number> {
  if (!githubEnabled()) return 0;
  const links = await many(sql`
    SELECT link_id, repo_id, full_name, installation_id, default_branch FROM GitRepoLink
    WHERE status = 'ACTIVE' AND installation_id IS NOT NULL AND (reconciled_at IS NULL OR reconciled_at < UTC_TIMESTAMP() - INTERVAL 20 HOUR)`);
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  let done = 0;
  for (const l of links) {
    try {
      const inst = Number(l.installation_id);
      const commits = await repoGet(inst, `/repos/${l.full_name}/commits?sha=${encodeURIComponent(l.default_branch)}&since=${since}&per_page=100`);
      const fresh = [];
      for (const c of Array.isArray(commits) ? commits : []) {
        const seen = await one(sql`SELECT 1 AS x FROM GitCommit WHERE repo_id = ${l.repo_id} AND sha = ${c.sha}`);
        if (!seen) fresh.push({ id: c.sha, message: c.commit?.message ?? "", timestamp: c.commit?.author?.date, url: c.html_url, author: { username: c.author?.login ?? null, email: c.commit?.author?.email ?? null, name: c.commit?.author?.name ?? null }, added: [], removed: [], modified: [] });
      }
      const touched = fresh.length ? await applyEvent("push", { ref: `refs/heads/${l.default_branch}`, repository: { id: Number(l.repo_id) }, commits: fresh.reverse(), sender: {} }) : [];
      const pulls = await repoGet(inst, `/repos/${l.full_name}/pulls?state=all&sort=updated&direction=desc&per_page=30`);
      for (const pr of Array.isArray(pulls) ? pulls : []) {
        if (new Date(pr.updated_at).toISOString() < since) break;
        touched.push(...(await applyEvent("pull_request", { action: pr.merged_at ? "closed" : "reconcile", pull_request: pr, repository: { id: Number(l.repo_id) } })));
      }
      for (const t of touched) await refreshDraft(t.projectId, t.userId).catch(() => undefined);
      await db.execute(sql`UPDATE GitRepoLink SET reconciled_at = UTC_TIMESTAMP() WHERE link_id = ${l.link_id}`);
      done++;
    } catch (e: any) {
      logger.info(`[git] reconcile skipped for ${l.full_name}: ${e?.message ?? e}`);
    }
  }
  return done;
}

/** One housekeeping pass (every 10 minutes per tenant). */
export async function gitHousekeeping(now = new Date()) {
  const pending = await processPending();
  // Repositories connected with their link (no app): poll them (migration 141).
  const { syncDue } = await import("./linkMode");
  const synced = await syncDue();
  const notified = await notifyDrafts(now);
  const auto = await autoSubmitDrafts(now);
  const reconciled = kigaliNow(now).getUTCHours() < 5 ? await reconcile(now) : 0;
  return { pending, synced, notified, auto, reconciled };
}

/**
 * TMCode reports active editing minutes for a repository branch (phase 3). Minutes are a
 * daily total per branch (TMCode sends the running total), so a resend never double counts.
 */
export async function recordEditorActivity(userId: number, body: any): Promise<{ ok: true; projectId: number; taskId: number | null }> {
  const { fail } = await import("../core");
  const repo = String(body.repo ?? "").replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/$/, "");
  const link = repo
    ? await one(sql`SELECT l.project_id, sp.task_key FROM GitRepoLink l JOIN SideProject sp ON sp.project_id = l.project_id WHERE l.full_name = ${repo} AND l.status = 'ACTIVE' LIMIT 1`)
    : body.projectId
      ? await one(sql`SELECT project_id, task_key FROM SideProject WHERE project_id = ${Number(body.projectId)}`)
      : null;
  if (!link) fail(404, "NOT_FOUND", "That repository isn't connected to a project");
  const projectId = Number(link.project_id);
  const team = await one(sql`
    SELECT 1 AS ok FROM SideProject WHERE project_id = ${projectId} AND owner_user_id = ${userId}
    UNION SELECT 1 FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId} AND status = 'ACCEPTED'`);
  if (!team) fail(403, "NOT_ON_TEAM", "You're not on this project's team");
  const minutes = Math.round(Number(body.minutes));
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 16 * 60) fail(400, "VALIDATION", "Minutes: 0 to 960", "minutes");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? "")) ? String(body.date) : kigaliDay(new Date());
  if (date > kigaliDay(new Date())) fail(400, "VALIDATION", "The date can't be in the future", "date");
  const branch = String(body.branch ?? "").slice(0, 255);
  const { findRefs } = await import("./refs");
  const [ref] = findRefs(branch, link.task_key, { allowBare: false });
  const task = ref ? await one(sql`SELECT task_id FROM SideProjectTask WHERE task_id = ${ref} AND project_id = ${projectId}`) : null;
  const taskId = task ? Number(task.task_id) : null;
  await db.execute(sql`
    INSERT INTO GitEditorActivity (user_id, project_id, task_id, branch, work_date, minutes, source, updated_at)
    VALUES (${userId}, ${projectId}, ${taskId}, ${branch}, ${date}, ${minutes}, 'TMCODE', UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE minutes = GREATEST(minutes, VALUES(minutes)), task_id = COALESCE(VALUES(task_id), task_id), updated_at = UTC_TIMESTAMP()`);
  await refreshDraft(projectId, userId).catch(() => undefined);
  return { ok: true, projectId, taskId };
}
