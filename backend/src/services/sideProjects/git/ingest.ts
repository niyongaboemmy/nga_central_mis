import { sql } from "drizzle-orm";
import { db } from "../../../db";
import logger from "../../../utils/logger";
import { accessProject } from "../access";
import { many, one } from "../core";
import * as work from "../work";
import { notifyWork } from "../notify";
import { closingRefs, findRefs, isIgnoredPath, parseCommands } from "./refs";
import { linksForRepo, pickLink, resolveAuthor, resolveCoauthors, type RepoLink } from "./store";
import { repoPost, githubEnabled } from "./github";

/**
 * Webhook events -> linked activity -> task automations -> living drafts
 * (GIT_AUTOMATED_REPORTING_ANALYSIS.md §5-§7). Every function here runs inside the tenant
 * the installation belongs to.
 *
 * Automations act AS the developer, with exactly the rights they have on the board
 * (work.moveTask): when they could not make the move by hand, nothing moves.
 */

const toDate = (v: unknown) => {
  const d = v ? new Date(String(v)) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 19).replace("T", " ");
};

type Touched = Set<string>;
const touch = (t: Touched, projectId: number, userId: number | null | undefined) => {
  if (userId) t.add(`${projectId}:${userId}`);
};

/** Task ids that really are tasks of this project (drops stray numbers). */
async function realTasks(projectId: number, ids: number[]): Promise<number[]> {
  const uniq = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!uniq.length) return [];
  const r = await many(sql`SELECT task_id FROM SideProjectTask WHERE project_id = ${projectId} AND task_id IN (${sql.join(uniq.map((i) => sql`${i}`), sql`, `)})`);
  return r.map((x) => Number(x.task_id));
}

const refsIn = async (link: RepoLink, ...texts: Array<string | null | undefined>) =>
  realTasks(link.projectId, texts.flatMap((t) => findRefs(t, link.taskKey, { allowBare: true })));

type Move = "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" | "BACK";
const FROM: Record<Move, string[]> = {
  IN_PROGRESS: ["TODO"],
  IN_REVIEW: ["TODO", "IN_PROGRESS"],
  DONE: ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "IN_REVIEW"],
  BACK: ["IN_REVIEW"],
};

/** Move a task as `userId` when the repo allows automations and the person may move it. */
export async function moveAs(link: RepoLink, userId: number | null, taskId: number, move: Move, note: string): Promise<boolean> {
  if (!userId || !link.settings.automations) return false;
  const t = await one(sql`SELECT status, assignee_user_id FROM SideProjectTask WHERE task_id = ${taskId} AND project_id = ${link.projectId}`);
  if (!t || !FROM[move].includes(t.status)) return false;
  try {
    const a = await accessProject(link.projectId, { userId });
    if (!a.canEdit) return false;
    const to = move === "BACK" ? "IN_PROGRESS" : move;
    await work.moveTask(a, userId, taskId, { to, note: note.slice(0, 500) });
    // Starting work makes an unassigned task yours (also for team managers, as Linear does).
    if (move === "IN_PROGRESS" && !t.assignee_user_id) await db.execute(sql`UPDATE SideProjectTask SET assignee_user_id = ${userId} WHERE task_id = ${taskId} AND assignee_user_id IS NULL`);
    return true;
  } catch (e: any) {
    logger.info(`[git] automation skipped for task ${taskId}: ${e?.message ?? e}`);
    return false;
  }
}

async function upsertBranch(link: RepoLink, name: string, userId: number | null, taskId: number | null, at: string) {
  await db.execute(sql`
    INSERT INTO GitBranch (repo_id, project_id, name, task_id, user_id, created_at, last_commit_at)
    VALUES (${link.repoId}, ${link.projectId}, ${name}, ${taskId}, ${userId}, ${at}, NULL)
    ON DUPLICATE KEY UPDATE task_id = COALESCE(task_id, VALUES(task_id)), user_id = COALESCE(user_id, VALUES(user_id)), deleted_at = NULL`);
}

async function branchTask(link: RepoLink, name: string): Promise<number | null> {
  const b = await one(sql`SELECT task_id FROM GitBranch WHERE repo_id = ${link.repoId} AND name = ${name}`);
  if (b?.task_id) return Number(b.task_id);
  const [t] = await refsIn(link, name);
  return t ?? null;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function onInstallation(p: any) {
  const inst = p.installation;
  if (!inst?.id) return;
  if (p.action === "deleted") {
    await db.execute(sql`UPDATE GitInstallation SET removed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE installation_id = ${inst.id}`);
    await db.execute(sql`UPDATE GitRepoLink SET status = 'DISCONNECTED', updated_at = UTC_TIMESTAMP() WHERE installation_id = ${inst.id} AND status = 'ACTIVE'`);
    return;
  }
  const suspended = p.action === "suspend" ? sql`UTC_TIMESTAMP()` : p.action === "unsuspend" ? sql`NULL` : sql`suspended_at`;
  await db.execute(sql`
    INSERT INTO GitInstallation (installation_id, account_id, account_login, account_type, created_at, updated_at)
    VALUES (${inst.id}, ${inst.account?.id ?? null}, ${inst.account?.login ?? "unknown"}, ${inst.account?.type ?? "User"}, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE account_login = VALUES(account_login), removed_at = NULL, updated_at = UTC_TIMESTAMP()`);
  await db.execute(sql`UPDATE GitInstallation SET suspended_at = ${suspended} WHERE installation_id = ${inst.id}`);
}

async function onInstallationRepos(p: any) {
  for (const r of p.repositories_removed ?? []) {
    await db.execute(sql`UPDATE GitRepoLink SET status = 'DISCONNECTED', updated_at = UTC_TIMESTAMP() WHERE repo_id = ${r.id} AND status = 'ACTIVE'`);
  }
}

async function onCreate(p: any, touched: Touched) {
  if (p.ref_type !== "branch" || !p.repository?.id) return;
  const links = await linksForRepo(p.repository.id);
  const userId = await resolveAuthor({ login: p.sender?.login, githubId: p.sender?.id });
  const uid = typeof userId === "number" ? userId : null;
  for (const link of links) {
    if (p.ref === link.defaultBranch) continue;
    const taskId = await branchTask(link, p.ref);
    await upsertBranch(link, p.ref, uid, taskId, toDate(null));
    if (taskId) await moveAs(link, uid, taskId, "IN_PROGRESS", `From GitHub: branch ${p.ref} created`);
    touch(touched, link.projectId, uid);
  }
}

async function onDelete(p: any) {
  if (p.ref_type !== "branch" || !p.repository?.id) return;
  await db.execute(sql`UPDATE GitBranch SET deleted_at = UTC_TIMESTAMP() WHERE repo_id = ${p.repository.id} AND name = ${p.ref}`);
}

const isMergeMessage = (m: string) => /^Merge (pull request|branch|remote-tracking branch)\b/.test(m);

async function onPush(p: any, touched: Touched) {
  const repoId = p.repository?.id;
  const ref = String(p.ref ?? "");
  if (!repoId || !ref.startsWith("refs/heads/")) return;
  const branch = ref.slice("refs/heads/".length);
  const links = await linksForRepo(repoId);
  if (!links.length) return;
  if (p.deleted) {
    await db.execute(sql`UPDATE GitBranch SET deleted_at = UTC_TIMESTAMP() WHERE repo_id = ${repoId} AND name = ${branch}`);
    return;
  }
  const pusher = await resolveAuthor({ login: p.sender?.login, githubId: p.sender?.id });
  const pushedAt = toDate(p.head_commit?.timestamp ?? null);
  const started = new Set<string>();
  for (const c of p.commits ?? []) {
    const files: string[] = [...(c.added ?? []), ...(c.removed ?? []), ...(c.modified ?? [])];
    const link = pickLink(links, files);
    if (!link) continue;
    const isDefault = branch === link.defaultBranch;
    if (!isDefault) {
      const bt = await branchTask(link, branch);
      await upsertBranch(link, branch, typeof pusher === "number" ? pusher : null, bt, pushedAt);
    }
    const message = String(c.message ?? "");
    const author = await resolveAuthor({ login: c.author?.username, email: c.author?.email, name: c.author?.name });
    const authorId = typeof author === "number" ? author : null;
    const ignoredAuthor = author === "ignored";
    const commitRefs = await refsIn(link, message);
    const taskId = commitRefs[0] ?? (isDefault ? null : await branchTask(link, branch));
    const merge = isMergeMessage(message);
    const onlyIgnoredFiles = files.length > 0 && files.every((f) => isIgnoredPath(f, link.settings.ignoredPaths));
    const cmd = parseCommands(message);
    const title = (message.split("\n")[0] || "").slice(0, 300) || "(no message)";
    const authoredAt = toDate(c.timestamp);
    // A rebase or force push re-creates commits with new SHAs: same author, title and time.
    const twin = await one(sql`
      SELECT commit_id FROM GitCommit
      WHERE project_id = ${link.projectId} AND sha <> ${c.id} AND title = ${title} AND authored_at = ${authoredAt}
        AND COALESCE(author_email, '') = ${String(c.author?.email ?? "").toLowerCase()} LIMIT 1`);
    const counted = !merge && !onlyIgnoredFiles && !ignoredAuthor && !twin;
    const coauthors = authorId ? await resolveCoauthors(message, authorId) : [];
    await db.execute(sql`
      INSERT INTO GitCommit (repo_id, sha, project_id, author_user_id, coauthor_ids, author_login, author_email, author_name, authored_at, pushed_at,
                             branch, title, files_changed, task_id, is_merge, counted, time_hint, url)
      VALUES (${repoId}, ${c.id}, ${link.projectId}, ${authorId}, ${coauthors.length ? JSON.stringify(coauthors) : null}, ${c.author?.username ?? null},
              ${String(c.author?.email ?? "").toLowerCase() || null}, ${c.author?.name ?? null}, ${authoredAt}, ${pushedAt}, ${branch}, ${title},
              ${files.length}, ${taskId}, ${merge ? 1 : 0}, ${counted ? 1 : 0}, ${cmd.timeHours}, ${c.url ?? null})
      ON DUPLICATE KEY UPDATE task_id = COALESCE(task_id, VALUES(task_id)), author_user_id = COALESCE(author_user_id, VALUES(author_user_id))`);
    if (!isDefault) await db.execute(sql`UPDATE GitBranch SET last_commit_at = GREATEST(COALESCE(last_commit_at, ${authoredAt}), ${authoredAt}) WHERE repo_id = ${repoId} AND name = ${branch}`);
    if (taskId && authorId && counted) {
      if (cmd.blocked) await moveAs(link, authorId, taskId, "BLOCKED", cmd.blocked);
      else if (cmd.done) await moveAs(link, authorId, taskId, "DONE", `From GitHub: commit ${String(c.id).slice(0, 7)}`);
      else if (cmd.review) await moveAs(link, authorId, taskId, "IN_REVIEW", `From GitHub: commit ${String(c.id).slice(0, 7)}`);
      else if (!started.has(`${link.projectId}:${taskId}`)) {
        started.add(`${link.projectId}:${taskId}`);
        await moveAs(link, authorId, taskId, "IN_PROGRESS", `From GitHub: first commit on ${branch}`);
      }
    }
    touch(touched, link.projectId, authorId);
    for (const co of coauthors) touch(touched, link.projectId, co);
  }
  for (const l of links) await db.execute(sql`UPDATE GitRepoLink SET last_event_at = UTC_TIMESTAMP() WHERE link_id = ${l.linkId}`);
}

async function prTasks(link: RepoLink, pr: any): Promise<number[]> {
  const fromText = await refsIn(link, pr.title, pr.body, pr.head?.ref);
  const fromBranch = pr.head?.ref ? await branchTask(link, pr.head.ref) : null;
  return [...new Set([...fromText, ...(fromBranch ? [fromBranch] : [])])];
}

async function onPullRequest(p: any, touched: Touched) {
  const pr = p.pull_request;
  if (!pr || !p.repository?.id) return;
  const links = await linksForRepo(p.repository.id);
  const author = await resolveAuthor({ login: pr.user?.login, githubId: pr.user?.id });
  const authorId = typeof author === "number" ? author : null;
  for (const link of links) {
    const tasks = await prTasks(link, pr);
    if (links.length > 1 && !tasks.length) continue; // monorepo: only projects whose tasks it names
    const state = pr.merged || pr.merged_at ? "MERGED" : pr.state === "closed" ? "CLOSED" : "OPEN";
    await db.execute(sql`
      INSERT INTO GitPullRequest (repo_id, project_id, number, title, url, task_ids, author_user_id, author_login, state, draft, head_ref, base_ref, opened_at, merged_at, closed_at, updated_at)
      VALUES (${p.repository.id}, ${link.projectId}, ${pr.number}, ${String(pr.title ?? "").slice(0, 300)}, ${pr.html_url ?? ""}, ${tasks.length ? JSON.stringify(tasks) : null},
              ${authorId}, ${pr.user?.login ?? null}, ${state}, ${pr.draft ? 1 : 0}, ${pr.head?.ref ?? null}, ${pr.base?.ref ?? null},
              ${toDate(pr.created_at)}, ${pr.merged_at ? toDate(pr.merged_at) : null}, ${pr.closed_at ? toDate(pr.closed_at) : null}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE title = VALUES(title), task_ids = VALUES(task_ids), author_user_id = COALESCE(VALUES(author_user_id), author_user_id),
        state = VALUES(state), draft = VALUES(draft), head_ref = VALUES(head_ref), base_ref = VALUES(base_ref), merged_at = VALUES(merged_at),
        closed_at = VALUES(closed_at), updated_at = UTC_TIMESTAMP()`);
    if (pr.head?.ref) await db.execute(sql`UPDATE GitCommit SET pr_number = ${pr.number} WHERE repo_id = ${p.repository.id} AND branch = ${pr.head.ref} AND pr_number IS NULL`);
    const tag = `From GitHub: PR #${pr.number}`;
    if ((p.action === "opened" || p.action === "reopened" || p.action === "ready_for_review") && !pr.draft) {
      for (const t of tasks) await moveAs(link, authorId, t, "IN_REVIEW", `${tag} opened`);
    }
    if (p.action === "closed" && state === "MERGED" && pr.base?.ref === link.defaultBranch) {
      const closing = await realTasks(link.projectId, closingRefs(`${pr.title}\n${pr.body ?? ""}`, link.taskKey));
      for (const t of [...new Set([...tasks, ...closing])]) await moveAs(link, authorId, t, "DONE", `${tag} merged`);
    }
    if (p.action === "closed" && state === "CLOSED") {
      const managers = (await many(sql`SELECT user_id AS id FROM SideProjectMember WHERE project_id = ${link.projectId} AND status = 'ACCEPTED' AND is_manager = 1
                                       UNION SELECT owner_user_id FROM SideProject WHERE project_id = ${link.projectId}`)).map((r) => Number(r.id));
      await notifyWork(managers, "side_project_git_pr_closed", `PR #${pr.number} closed without merging`, `${String(pr.title ?? "").slice(0, 120)} (${link.title})`, link.projectId, authorId);
    }
    if (link.settings.checks && githubEnabled() && link.installationId && (p.action === "opened" || p.action === "synchronize") && pr.head?.sha) {
      const keys = tasks.map((t) => `${link.taskKey ?? "#"}${link.taskKey ? "-" : ""}${t}`).join(", ");
      await repoPost(link.installationId, `/repos/${link.fullName}/check-runs`, {
        name: "NGA Projects",
        head_sha: pr.head.sha,
        status: "completed",
        conclusion: tasks.length ? "success" : "neutral",
        output: { title: tasks.length ? `Linked to ${keys}` : "No task linked", summary: tasks.length ? `This pull request updates ${keys} in ${link.title}.` : `Add a task key (e.g. ${link.taskKey ?? "KEY"}-12) to the branch or title to link it.` },
      }).catch((e) => logger.info(`[git] check run skipped: ${e?.message ?? e}`));
    }
    touch(touched, link.projectId, authorId);
  }
}

async function onReview(p: any, touched: Touched) {
  const pr = p.pull_request;
  const review = p.review;
  if (!pr || !review || p.action !== "submitted" || !p.repository?.id) return;
  const state = String(review.state ?? "").toUpperCase(); // webhook: lowercase; API: uppercase
  await db.execute(sql`UPDATE GitPullRequest SET review_state = ${state}, updated_at = UTC_TIMESTAMP() WHERE repo_id = ${p.repository.id} AND number = ${pr.number}`);
  if (state !== "CHANGES_REQUESTED") return;
  for (const link of await linksForRepo(p.repository.id)) {
    const row = await one(sql`SELECT author_user_id, task_ids FROM GitPullRequest WHERE repo_id = ${p.repository.id} AND number = ${pr.number} AND project_id = ${link.projectId}`);
    if (!row) continue;
    const authorId = row.author_user_id ? Number(row.author_user_id) : null;
    const tasks: number[] = row.task_ids ? JSON.parse(row.task_ids) : [];
    for (const t of tasks) await moveAs(link, authorId, t, "BACK", `From GitHub: changes requested on PR #${pr.number}`);
    if (authorId) await notifyWork([authorId], "side_project_git_changes", `Changes requested on PR #${pr.number}`, `${review.user?.login ?? "A reviewer"}: ${String(review.body ?? "see the review on GitHub").slice(0, 160)}`, link.projectId, null);
    touch(touched, link.projectId, authorId);
  }
}

/** Apply one event; returns the (project, person) drafts it touched. */
export async function applyEvent(event: string, payload: any): Promise<Array<{ projectId: number; userId: number }>> {
  const touched: Touched = new Set();
  switch (event) {
    case "installation":
      await onInstallation(payload);
      break;
    case "installation_repositories":
      await onInstallationRepos(payload);
      break;
    case "create":
      await onCreate(payload, touched);
      break;
    case "delete":
      await onDelete(payload);
      break;
    case "push":
      await onPush(payload, touched);
      break;
    case "pull_request":
      await onPullRequest(payload, touched);
      break;
    case "pull_request_review":
      await onReview(payload, touched);
      break;
    default:
      break;
  }
  return [...touched].map((k) => {
    const [projectId, userId] = k.split(":").map(Number);
    return { projectId, userId };
  });
}

/** Store a delivery (idempotent by delivery id). Returns the event id, or null if seen before. */
export async function storeEvent(deliveryId: string, event: string, payload: any): Promise<number | null> {
  const r: any = await db.execute(sql`
    INSERT IGNORE INTO GitEvent (delivery_id, event, action, installation_id, repo_id, payload, received_at)
    VALUES (${deliveryId.slice(0, 64)}, ${event.slice(0, 40)}, ${payload?.action ? String(payload.action).slice(0, 40) : null},
            ${payload?.installation?.id ?? null}, ${payload?.repository?.id ?? null}, ${JSON.stringify(payload)}, UTC_TIMESTAMP())`);
  const affected = Array.isArray(r) ? r[0]?.affectedRows : r?.affectedRows;
  if (!affected) return null;
  const row = await one(sql`SELECT event_id FROM GitEvent WHERE delivery_id = ${deliveryId.slice(0, 64)}`);
  return row ? Number(row.event_id) : null;
}

/** Process one stored event (and refresh the drafts it touched). */
export async function processEvent(eventId: number): Promise<void> {
  const ev = await one(sql`SELECT event, payload, processed_at, attempts FROM GitEvent WHERE event_id = ${eventId}`);
  if (!ev || ev.processed_at) return;
  try {
    const touched = await applyEvent(ev.event, JSON.parse(ev.payload || "{}"));
    const { refreshDraft } = await import("./drafts");
    for (const t of touched) await refreshDraft(t.projectId, t.userId).catch((e) => logger.error("[git] draft refresh failed", { error: e }));
    await db.execute(sql`UPDATE GitEvent SET processed_at = UTC_TIMESTAMP(), attempts = attempts + 1, error = NULL WHERE event_id = ${eventId}`);
  } catch (e: any) {
    logger.error("[git] event failed", { error: e, eventId });
    await db.execute(sql`UPDATE GitEvent SET attempts = attempts + 1, error = ${String(e?.message ?? e).slice(0, 500)} WHERE event_id = ${eventId}`);
  }
}

/** Retry what failed or was never processed (up to 5 attempts); drop raw payloads after 14 days. */
export async function processPending(limit = 100): Promise<number> {
  const rows = await many(sql`SELECT event_id FROM GitEvent WHERE processed_at IS NULL AND attempts < 5 ORDER BY event_id LIMIT ${limit}`);
  for (const r of rows) await processEvent(Number(r.event_id));
  await db.execute(sql`UPDATE GitEvent SET payload = NULL WHERE payload IS NOT NULL AND received_at < UTC_TIMESTAMP() - INTERVAL 14 DAY`);
  return rows.length;
}
