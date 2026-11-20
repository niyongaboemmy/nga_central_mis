import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { accessProject, assertEdit } from "../access";
import { fail, many, one } from "../core";
import * as progress from "../progress";
import * as notify from "../notify";
import { cleanTitle } from "./refs";
import { estimateByTask, kigaliDay, roundHalf } from "./hours";
import { linkForProject, linksForProject } from "./store";

/**
 * The living report draft (GIT_AUTOMATED_REPORTING_ANALYSIS.md §7).
 *
 * One OPEN draft per person and project (open_key), covering their Git activity since their
 * last report in that project (at most 14 days back). It is rebuilt after every event; once
 * the person edits it, their wording is kept and only the facts (lines, evidence, counts)
 * refresh. Submitting turns it into an ordinary report through progress.addUpdate, so plan
 * progress, task logs and notifications behave exactly as for a typed report.
 */

export interface DraftLine {
  key: string; // task id as text, or "u:<branch>" for unlinked work
  taskId: number | null;
  itemId: number | null;
  title: string;
  taskStatus: string | null;
  suggestedTaskId: number | null;
  commits: Array<{ sha: string; title: string; url: string | null; at: string }>;
  prs: Array<{ number: number; title: string; state: string; url: string }>;
  hours: number | null;
  hoursSource: "GIT_ESTIMATE" | "EDITOR" | "COMMIT" | "TYPED" | null;
  hoursEdited?: boolean;
  include: boolean;
}

export interface Draft {
  id: number;
  projectId: number;
  userId: number;
  from: string;
  to: string;
  did: string;
  nextSteps: string;
  blockers: string;
  lines: DraftLine[];
  hours: number | null;
  commitCount: number;
  edited: boolean;
  aiPolished: boolean;
  status: string;
  notifiedAt: string | null;
}

const openKey = (projectId: number, userId: number) => `${projectId}:${userId}`;
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const isoOf = (v: any) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v).replace(" ", "T") + (String(v).endsWith("Z") ? "" : "Z")).toISOString() : "");

async function onTeam(projectId: number, userId: number): Promise<boolean> {
  const r = await one(sql`
    SELECT 1 AS ok FROM SideProject WHERE project_id = ${projectId} AND owner_user_id = ${userId} AND deleted_at IS NULL
    UNION SELECT 1 FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId} AND status = 'ACCEPTED'`);
  return !!r;
}

function rowToDraft(r: any): Draft {
  return {
    id: Number(r.draft_id),
    projectId: Number(r.project_id),
    userId: Number(r.user_id),
    from: isoOf(r.window_from),
    to: isoOf(r.window_to),
    did: r.did ?? "",
    nextSteps: r.next_steps ?? "",
    blockers: r.blockers ?? "",
    lines: r.work_lines ? JSON.parse(r.work_lines) : [],
    hours: r.hours === null || r.hours === undefined ? null : Number(r.hours),
    commitCount: Number(r.commit_count ?? 0),
    edited: !!Number(r.edited),
    aiPolished: !!Number(r.ai_polished),
    status: r.status,
    notifiedAt: r.notified_at ? isoOf(r.notified_at) : null,
  };
}

export async function openDraft(projectId: number, userId: number): Promise<Draft | null> {
  const r = await one(sql`SELECT * FROM SideProjectReportDraft WHERE open_key = ${openKey(projectId, userId)}`);
  return r ? rowToDraft(r) : null;
}

export async function draftById(id: number): Promise<Draft | null> {
  const r = await one(sql`SELECT * FROM SideProjectReportDraft WHERE draft_id = ${id}`);
  return r ? rowToDraft(r) : null;
}

/** Plain-language text from the facts (no AI): what was done, what's next, what blocks. */
export function composeText(lines: DraftLine[], key: string | null, extra: { next: string[]; blockers: string[] }) {
  const did = lines
    .filter((l) => l.include)
    .map((l) => {
      const titles = [...new Set(l.commits.map((c) => cleanTitle(c.title, key)).filter(Boolean))];
      const shown = titles.slice(0, 4).join("; ");
      const more = titles.length > 4 ? ` (+${titles.length - 4} more)` : "";
      const prs = l.prs.map((p) => `PR #${p.number} ${p.state === "MERGED" ? "merged" : p.state === "CLOSED" ? "closed" : "opened"}`).join(", ");
      const body = [shown + more, prs].filter(Boolean).join(". ");
      return `${l.taskId ? l.title : "Other work"}: ${body || "worked on it"}.`;
    })
    .join("\n");
  return { did, nextSteps: extra.next.slice(0, 3).join("\n"), blockers: extra.blockers.slice(0, 3).join("\n") };
}

/** Rebuild (or create) the person's open draft for a project from their Git activity. */
export async function refreshDraft(projectId: number, userId: number, now = new Date()): Promise<Draft | null> {
  if (!(await onTeam(projectId, userId))) return null;
  const link = await linkForProject(projectId);
  const key = link?.taskKey ?? null;
  const last = await one(sql`SELECT MAX(created_at) AS at FROM SideProjectUpdate WHERE project_id = ${projectId} AND author_id = ${userId}`);
  const floor = new Date(now.getTime() - 14 * 86_400_000);
  const lastAt = last?.at ? new Date(isoOf(last.at)) : null;
  const from = lastAt && lastAt > floor ? lastAt : floor;
  const like = `%${userId}%`;
  const commits = await many(sql`
    SELECT c.sha, c.title, c.url, c.authored_at, c.task_id, c.branch, c.files_changed, c.time_hint, c.pr_number
    FROM GitCommit c
    WHERE c.project_id = ${projectId} AND c.counted = 1 AND c.authored_at >= ${sqlDate(from)}
      AND (c.author_user_id = ${userId} OR (c.coauthor_ids IS NOT NULL AND c.coauthor_ids LIKE ${like}))
    ORDER BY c.authored_at`);
  const prs = await many(sql`
    SELECT number, title, url, state, task_ids, opened_at, merged_at FROM GitPullRequest
    WHERE project_id = ${projectId} AND author_user_id = ${userId}
      AND (opened_at >= ${sqlDate(from)} OR merged_at >= ${sqlDate(from)} OR (state = 'OPEN' AND updated_at >= ${sqlDate(from)}))`);
  const editor = await many(sql`
    SELECT task_id, branch, work_date, minutes FROM GitEditorActivity
    WHERE project_id = ${projectId} AND user_id = ${userId} AND work_date >= ${kigaliDay(from)}`);
  // Work already cited by this person's reports never comes back in a new draft.
  const reported = new Set<string>();
  const reportedPrs = new Set<number>();
  for (const w of await many(sql`
    SELECT w.evidence FROM SideProjectUpdateWork w JOIN SideProjectUpdate u ON u.update_id = w.update_id
    WHERE u.project_id = ${projectId} AND u.author_id = ${userId} AND w.evidence IS NOT NULL AND u.created_at >= ${sqlDate(floor)} - INTERVAL 30 DAY`)) {
    try {
      const e = JSON.parse(w.evidence);
      (e.commits ?? []).forEach((sha: string) => reported.add(sha));
      (e.prs ?? []).forEach((n: number) => reportedPrs.add(Number(n)));
    } catch {
      /* ignore */
    }
  }
  for (let i = commits.length - 1; i >= 0; i--) if (reported.has(commits[i].sha)) commits.splice(i, 1);
  // A reported PR comes back only when it changed afterwards (e.g. merged after the report).
  for (let i = prs.length - 1; i >= 0; i--) {
    const p = prs[i];
    if (reportedPrs.has(Number(p.number)) && !(p.merged_at && lastAt && new Date(isoOf(p.merged_at)) > lastAt)) prs.splice(i, 1);
  }
  const existing = await openDraft(projectId, userId);
  if (!commits.length && !prs.length && !editor.length) {
    if (existing && !existing.edited) await db.execute(sql`DELETE FROM SideProjectReportDraft WHERE draft_id = ${existing.id}`);
    return existing?.edited ? existing : null;
  }

  // Tasks referenced anywhere, with their plan item, title and state.
  const taskIds = new Set<number>();
  commits.forEach((c) => c.task_id && taskIds.add(Number(c.task_id)));
  prs.forEach((p) => (p.task_ids ? JSON.parse(p.task_ids) : []).forEach((t: number) => taskIds.add(t)));
  editor.forEach((e) => e.task_id && taskIds.add(Number(e.task_id)));
  const tasks = new Map<number, any>();
  if (taskIds.size) {
    for (const t of await many(sql`SELECT task_id, plan_item_id, title, status, assignee_user_id FROM SideProjectTask WHERE project_id = ${projectId} AND task_id IN (${sql.join([...taskIds].map((i) => sql`${i}`), sql`, `)})`)) tasks.set(Number(t.task_id), t);
  }
  // Own work only: a task assigned to someone else is shown as unlinked work to re-pick.
  const mine = (tid: number | null) => {
    if (!tid) return null;
    const t = tasks.get(tid);
    return t && (!t.assignee_user_id || Number(t.assignee_user_id) === userId) ? tid : null;
  };
  const inProgress = await many(sql`SELECT task_id FROM SideProjectTask WHERE project_id = ${projectId} AND assignee_user_id = ${userId} AND status = 'IN_PROGRESS' LIMIT 2`);
  const suggestion = inProgress.length === 1 ? Number(inProgress[0].task_id) : null;

  const lines = new Map<string, DraftLine>();
  const lineFor = (tid: number | null, branch: string | null) => {
    const k = tid ? String(tid) : `u:${branch || "default"}`;
    if (!lines.has(k)) {
      const t = tid ? tasks.get(tid) : null;
      lines.set(k, {
        key: k,
        taskId: tid,
        itemId: t ? Number(t.plan_item_id) : null,
        title: t ? t.title : branch ? `Branch ${branch}` : "Unlinked commits",
        taskStatus: t ? t.status : null,
        suggestedTaskId: tid ? null : suggestion,
        commits: [],
        prs: [],
        hours: null,
        hoursSource: null,
        include: true,
      });
    }
    return lines.get(k)!;
  };
  for (const c of commits) lineFor(mine(c.task_id ? Number(c.task_id) : null), c.task_id ? null : c.branch).commits.push({ sha: c.sha, title: c.title, url: c.url, at: isoOf(c.authored_at) });
  for (const p of prs) {
    const ids: number[] = p.task_ids ? JSON.parse(p.task_ids) : [];
    const own = ids.map((i) => mine(i)).filter(Boolean) as number[];
    for (const tid of own.length ? own : [null]) lineFor(tid, tid ? null : `PR #${p.number}`).prs.push({ number: Number(p.number), title: p.title, state: p.state, url: p.url });
  }

  // Hours: TMCode editing time when present, else #time hints, else commit sessions.
  // A #time hint is that commit's own hours; the other commits are estimated from sessions.
  const est = estimateByTask(commits.filter((c) => !c.time_hint).map((c) => ({ at: new Date(isoOf(c.authored_at)), taskKey: String(mine(c.task_id ? Number(c.task_id) : null) ?? `u:${c.branch || "default"}`), weight: Number(c.files_changed) || 1 })));
  const hints = new Map<string, number>();
  for (const c of commits) if (c.time_hint) { const k = String(mine(c.task_id ? Number(c.task_id) : null) ?? `u:${c.branch || "default"}`); hints.set(k, (hints.get(k) ?? 0) + Number(c.time_hint)); }
  const edMin = new Map<string, number>();
  for (const e of editor) { const k = e.task_id && mine(Number(e.task_id)) ? String(e.task_id) : null; if (k) edMin.set(k, (edMin.get(k) ?? 0) + Number(e.minutes)); }
  for (const [k, m] of edMin) if (!lines.has(k)) lineFor(Number(k), null);
  for (const l of lines.values()) {
    if (edMin.has(l.key)) { l.hours = roundHalf(edMin.get(l.key)! / 60); l.hoursSource = "EDITOR"; }
    else if (hints.has(l.key) || est.has(l.key)) {
      l.hours = Math.min(24, roundHalf((hints.get(l.key) ?? 0) + (est.get(l.key) ?? 0)));
      l.hoursSource = hints.has(l.key) ? "COMMIT" : "GIT_ESTIMATE";
    }
  }
  // Keep what the person already chose (hours, task, include) when refreshing.
  if (existing) {
    for (const old of existing.lines) {
      const cur = lines.get(old.key);
      if (!cur) continue;
      if (old.hoursEdited) { cur.hours = old.hours; cur.hoursSource = "TYPED"; cur.hoursEdited = true; }
      cur.include = old.include;
      if (!cur.taskId && old.taskId) { cur.taskId = old.taskId; cur.itemId = old.itemId; cur.title = old.title; cur.taskStatus = old.taskStatus; }
    }
  }
  // Unlinked work: suggest the open task whose words best match the branch and commit titles.
  const open = await many(sql`
    SELECT task_id, title FROM SideProjectTask WHERE project_id = ${projectId} AND status NOT IN ('DONE','CANCELLED')
      AND (assignee_user_id = ${userId} OR assignee_user_id IS NULL)`);
  for (const l of lines.values()) {
    if (l.taskId) continue;
    const text = `${l.key.startsWith("u:") ? l.key.slice(2) : ""} ${l.commits.map((c) => c.title).join(" ")} ${l.prs.map((p) => p.title).join(" ")}`;
    const best = bestTask(text, open.map((t) => ({ id: Number(t.task_id), title: String(t.title) })));
    if (best) l.suggestedTaskId = best;
  }
  const list = [...lines.values()].sort((a, b) => (a.taskId ? 0 : 1) - (b.taskId ? 0 : 1));

  // Next steps and blockers from the plan and pull requests.
  const next: string[] = [];
  for (const p of prs.filter((p) => p.state === "OPEN")) next.push(`PR #${p.number} is waiting for review.`);
  for (const t of await many(sql`SELECT title, status, due_date FROM SideProjectTask WHERE project_id = ${projectId} AND assignee_user_id = ${userId} AND status IN ('IN_PROGRESS','TODO') ORDER BY status = 'IN_PROGRESS' DESC, due_date IS NULL, due_date LIMIT 3`)) {
    next.push(t.status === "IN_PROGRESS" ? `Continue ${t.title}.` : `Start ${t.title}${t.due_date ? ` (due ${String(t.due_date instanceof Date ? t.due_date.toISOString() : t.due_date).slice(0, 10)})` : ""}.`);
  }
  const blockers = (await many(sql`SELECT title, blocked_reason FROM SideProjectTask WHERE project_id = ${projectId} AND assignee_user_id = ${userId} AND status = 'BLOCKED' LIMIT 3`)).map((t) => `${t.title}: ${t.blocked_reason || "blocked"}`);
  const text = composeText(list, key, { next, blockers });
  const total = list.filter((l) => l.include && l.hours).reduce((s, l) => s + (l.hours ?? 0), 0);
  const nowSql = sqlDate(now);

  if (existing) {
    await db.execute(sql`
      UPDATE SideProjectReportDraft SET window_from = ${sqlDate(from)}, window_to = ${nowSql}, work_lines = ${JSON.stringify(list)}, hours = ${total || null},
        commit_count = ${commits.length}, refreshed_at = ${nowSql},
        did = IF(edited = 1, did, ${text.did}), next_steps = IF(edited = 1, next_steps, ${text.nextSteps}), blockers = IF(edited = 1, blockers, ${text.blockers}),
        ai_polished = IF(edited = 1, ai_polished, 0)
      WHERE draft_id = ${existing.id}`);
  } else {
    await db.execute(sql`
      INSERT IGNORE INTO SideProjectReportDraft (project_id, user_id, open_key, window_from, window_to, did, next_steps, blockers, work_lines, hours, commit_count, refreshed_at, created_at)
      VALUES (${projectId}, ${userId}, ${openKey(projectId, userId)}, ${sqlDate(from)}, ${nowSql}, ${text.did}, ${text.nextSteps}, ${text.blockers},
              ${JSON.stringify(list)}, ${total || null}, ${commits.length}, ${nowSql}, ${nowSql})`);
  }
  return openDraft(projectId, userId);
}

const STOP = new Set(["the", "and", "for", "with", "from", "into", "add", "fix", "feat", "chore", "update", "wip", "task", "branch", "this", "that", "new", "use", "make"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((w) => w.replace(/(ing|ed|es|s)$/, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)),
  );

/** The task whose title shares the most words with the work (at least one), else null. */
export function bestTask(text: string, tasks: Array<{ id: number; title: string }>): number | null {
  const have = words(text);
  if (!have.size) return null;
  let best: { id: number; score: number } | null = null;
  for (const t of tasks) {
    const tw = words(t.title);
    if (!tw.size) continue;
    let hit = 0;
    for (const w of tw) if (have.has(w)) hit++;
    const score = hit / Math.sqrt(tw.size);
    if (hit && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best?.id ?? null;
}

/** A task picked for an unlinked draft line is remembered on the branch and its commits. */
async function rememberPick(projectId: number, userId: number, l: DraftLine, taskId: number) {
  const shas = l.commits.map((c) => c.sha);
  if (shas.length) {
    await db.execute(sql`UPDATE GitCommit SET task_id = ${taskId} WHERE project_id = ${projectId} AND task_id IS NULL AND sha IN (${sql.join(shas.map((x) => sql`${x}`), sql`, `)})`);
  }
  const branch = l.key.startsWith("u:") ? l.key.slice(2) : null;
  if (branch && branch !== "default" && !branch.startsWith("PR #")) {
    const links = await linksForProject(projectId);
    if (links.length && !links.some((l) => l.defaultBranch === branch)) {
      await db.execute(sql`UPDATE GitBranch SET task_id = ${taskId} WHERE project_id = ${projectId} AND name = ${branch} AND task_id IS NULL`);
      await db.execute(sql`UPDATE GitCommit SET task_id = ${taskId} WHERE project_id = ${projectId} AND branch = ${branch} AND task_id IS NULL AND author_user_id = ${userId}`);
    }
  }
}

/** The person edits their draft (wording, hours, task picks, which lines to include). */
export async function editDraft(id: number, userId: number, body: any): Promise<Draft> {
  const d = await draftById(id);
  if (!d || d.userId !== userId || d.status !== "OPEN") fail(404, "NOT_FOUND", "Draft not found");
  const lines = d!.lines;
  if (Array.isArray(body.lines)) {
    const planTasks = new Map<number, any>();
    for (const t of await many(sql`SELECT task_id, plan_item_id, title, status FROM SideProjectTask WHERE project_id = ${d!.projectId}`)) planTasks.set(Number(t.task_id), t);
    for (const patch of body.lines) {
      const l = lines.find((x) => x.key === patch.key);
      if (!l) continue;
      if (patch.include !== undefined) l.include = !!patch.include;
      if (patch.hours !== undefined) {
        const h = patch.hours === null || patch.hours === "" ? null : Number(patch.hours);
        if (h !== null && (!Number.isFinite(h) || h <= 0 || h > 24 || Math.round(h * 2) !== h * 2)) fail(400, "VALIDATION", "Hours per item: 0.5 to 24, in half hours", "hours");
        l.hours = h;
        l.hoursSource = "TYPED";
        l.hoursEdited = true;
      }
      if (patch.taskId !== undefined) {
        const t = patch.taskId ? planTasks.get(Number(patch.taskId)) : null;
        if (patch.taskId && !t) fail(400, "VALIDATION", "That task isn't in this project's plan", "taskId");
        l.taskId = t ? Number(t.task_id) : null;
        l.itemId = t ? Number(t.plan_item_id) : null;
        // Pick once: the branch (and these commits) stay linked, so the next draft needs no pick.
        if (t) await rememberPick(d!.projectId, userId, l, Number(t.task_id));
        l.title = t ? t.title : l.title;
        l.taskStatus = t ? t.status : null;
      }
    }
  }
  const textEdited = body.did !== undefined || body.nextSteps !== undefined || body.blockers !== undefined;
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const total = lines.filter((l) => l.include && l.hours).reduce((s, l) => s + (l.hours ?? 0), 0);
  await db.execute(sql`
    UPDATE SideProjectReportDraft SET work_lines = ${JSON.stringify(lines)}, hours = ${total || null},
      did = ${body.did !== undefined ? clip(body.did, 2000) : d!.did}, next_steps = ${body.nextSteps !== undefined ? clip(body.nextSteps, 1000) : d!.nextSteps},
      blockers = ${body.blockers !== undefined ? clip(body.blockers, 1000) : d!.blockers}, edited = IF(${textEdited ? 1 : 0} = 1, 1, edited)
    WHERE draft_id = ${id}`);
  return (await draftById(id))!;
}

export async function dismissDraft(id: number, userId: number): Promise<void> {
  const d = await draftById(id);
  if (!d || d.userId !== userId || d.status !== "OPEN") fail(404, "NOT_FOUND", "Draft not found");
  await db.execute(sql`UPDATE SideProjectReportDraft SET status = 'DISMISSED', open_key = NULL WHERE draft_id = ${id}`);
}

/** Submit the draft as a report (badged GIT, or GIT_AUTO when the policy submits it). */
export async function submitDraft(id: number, userId: number, opts: { auto?: boolean; workDate?: string } = {}): Promise<number> {
  const d = await draftById(id);
  if (!d || d.userId !== userId || d.status !== "OPEN") fail(404, "NOT_FOUND", "Draft not found");
  const a = await accessProject(d!.projectId, { userId });
  assertEdit(a);
  const lines = d!.lines.filter((l) => l.include && (l.taskId || l.itemId));
  const lastAt = d!.lines.flatMap((l) => l.commits.map((c) => c.at)).sort().pop();
  const today = kigaliDay(new Date());
  let workDate = opts.workDate || (lastAt ? kigaliDay(new Date(lastAt)) : today);
  if (workDate > today) workDate = today;
  const oldest = new Date(Date.now() - 59 * 86_400_000).toISOString().slice(0, 10);
  if (workDate < oldest) workDate = oldest;
  const did = d!.did.trim() || "Work from GitHub.";
  const body = {
    did,
    nextSteps: d!.nextSteps.trim() || null,
    blockers: d!.blockers.trim() || null,
    workDate,
    work: lines.map((l) => (l.taskId ? { taskId: l.taskId, hours: l.hours } : { itemId: l.itemId, hours: l.hours })),
  };
  const updateId = await progress.addUpdate(a, userId, body as any, []);
  await db.execute(sql`UPDATE SideProjectUpdate SET source = ${opts.auto ? "GIT_AUTO" : "GIT"} WHERE update_id = ${updateId}`);
  for (const l of lines) {
    const evidence = JSON.stringify({ commits: l.commits.map((c) => c.sha.slice(0, 40)).slice(0, 50), prs: l.prs.map((p) => p.number) });
    if (l.taskId) await db.execute(sql`UPDATE SideProjectUpdateWork SET evidence = ${evidence}, hours_source = ${l.hours ? l.hoursSource : null} WHERE update_id = ${updateId} AND task_id = ${l.taskId}`);
    else await db.execute(sql`UPDATE SideProjectUpdateWork SET evidence = ${evidence}, hours_source = ${l.hours ? l.hoursSource : null} WHERE update_id = ${updateId} AND plan_item_id = ${l.itemId} AND task_id IS NULL`);
  }
  await db.execute(sql`
    UPDATE SideProjectReportDraft SET status = 'SUBMITTED', open_key = NULL, update_id = ${updateId}, submitted_at = UTC_TIMESTAMP(), auto_submitted = ${opts.auto ? 1 : 0}
    WHERE draft_id = ${id}`);
  await notify.onReport(d!.projectId, userId, updateId).catch(() => undefined);
  return updateId;
}

/**
 * AI wording (optional; GIT_AUTOMATED_REPORTING_ANALYSIS.md §7.1): commit titles and task
 * names only, never code. The caller has already checked the school AI policy for this person.
 */
export async function polishDraft(id: number, userId: number): Promise<Draft> {
  const d = await draftById(id);
  if (!d || d.userId !== userId || d.status !== "OPEN") fail(404, "NOT_FOUND", "Draft not found");
  const facts = d!.lines.filter((l) => l.include).map((l) => ({ task: l.taskId ? l.title : "Other work", commits: l.commits.map((c) => c.title).slice(0, 12), pullRequests: l.prs.map((p) => `#${p.number} ${p.state.toLowerCase()}: ${p.title}`) }));
  const { generateStructuredContent } = await import("../../aiProviders/generate");
  const r = await generateStructuredContent<{ did: string; nextSteps: string }>(
    {
      prompt:
        "Write a short weekly progress report for a software project from these Git facts. " +
        "Plain, friendly English, first person, past tense for what was done. 2-4 short sentences for 'did', " +
        "1-2 sentences for 'nextSteps'. No markdown, no commit hashes, do not invent work.\n\n" +
        JSON.stringify({ facts, plannedNext: d!.nextSteps }),
      schema: { type: "object", properties: { did: { type: "string" }, nextSteps: { type: "string" } }, required: ["did", "nextSteps"], additionalProperties: false } as any,
      schemaName: "progress_report",
      maxOutputTokens: 500,
    },
    { feature: "side_project_report_draft", actorUserId: userId, role: "assist" as any },
  );
  const did = String(r.data?.did ?? "").trim().slice(0, 2000);
  const next = String(r.data?.nextSteps ?? "").trim().slice(0, 1000);
  if (did.length >= 5) await db.execute(sql`UPDATE SideProjectReportDraft SET did = ${did}, next_steps = ${next || d!.nextSteps}, ai_polished = 1 WHERE draft_id = ${id}`);
  return (await draftById(id))!;
}

/** Drafts the person can act on (all their projects). */
export async function myDrafts(userId: number): Promise<Array<Draft & { projectTitle: string }>> {
  const rows = await many(sql`
    SELECT d.*, sp.title AS project_title FROM SideProjectReportDraft d JOIN SideProject sp ON sp.project_id = d.project_id AND sp.deleted_at IS NULL
    WHERE d.user_id = ${userId} AND d.status = 'OPEN' ORDER BY d.refreshed_at DESC`);
  return rows.map((r) => ({ ...rowToDraft(r), projectTitle: r.project_title }));
}

