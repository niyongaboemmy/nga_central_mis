import { sql } from "drizzle-orm";
import { db } from "../../db";
import { fail, inList, iso, many, STAGES, type Stage, type Status, ymd } from "./core";
import { pathStage } from "./lifecycle";

/**
 * Period management (migration 131).
 *
 *   plan  -- each working stage (Idea, Planning, Building, Testing) has a planned window inside
 *            the project's start..closing dates (SideProjectStage). The default splits the time
 *            10 / 20 / 50 / 20 %; the team can move the boundaries.
 *   logs  -- every actual stay in a stage (SideProjectStageLog). Projects from before 131 have
 *            their history rebuilt from the STATUS events the first time they are read.
 *   view  -- per stage: planned days, actual days, days in the current stage, days left, overrun.
 */

export const DAY = 86_400_000;
const WEIGHTS: Record<Stage, number> = { IDEA: 0.1, PLANNING: 0.2, IN_PROGRESS: 0.5, TESTING: 0.2 };
export const MIN_PROJECT_DAYS = 4;

const toDay = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY);
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);

export interface PlanRow {
  stage: Stage;
  start: string;
  end: string;
}

/** The default split of start..target (inclusive) over the four working stages. */
export function defaultPlan(start: string, target: string): PlanRow[] {
  const s = toDay(start);
  const total = toDay(target) - s + 1;
  if (total < MIN_PROJECT_DAYS) fail(400, "VALIDATION", `Give the project at least ${MIN_PROJECT_DAYS} days`, "targetDate");
  const out: PlanRow[] = [];
  let cursor = s;
  let acc = 0;
  STAGES.forEach((stage, i) => {
    acc += WEIGHTS[stage];
    const remainingStages = STAGES.length - i - 1;
    let end = i === STAGES.length - 1 ? s + total - 1 : s + Math.round(total * acc) - 1;
    end = Math.max(end, cursor); // at least one day
    end = Math.min(end, s + total - 1 - remainingStages); // leave a day for each stage after
    out.push({ stage, start: fromDay(cursor), end: fromDay(end) });
    cursor = end + 1;
  });
  return out;
}

/** Keep the same proportions when the project's dates change. */
export function rescalePlan(old: PlanRow[], start: string, target: string): PlanRow[] {
  if (old.length !== STAGES.length) return defaultPlan(start, target);
  const oldTotal = toDay(old[old.length - 1].end) - toDay(old[0].start) + 1;
  if (oldTotal <= 0) return defaultPlan(start, target);
  const s = toDay(start);
  const total = toDay(target) - s + 1;
  if (total < MIN_PROJECT_DAYS) fail(400, "VALIDATION", `Give the project at least ${MIN_PROJECT_DAYS} days`, "targetDate");
  const ends: string[] = [];
  let acc = 0;
  old.forEach((r, i) => {
    acc += toDay(r.end) - toDay(r.start) + 1;
    if (i < old.length - 1) ends.push(fromDay(s + Math.round((acc / oldTotal) * total) - 1));
  });
  return planFromEnds(start, target, ends);
}

/**
 * Builds and validates a plan from the boundaries the team chose: the end of Idea, Planning and
 * Building (Testing always ends on the closing date). Every stage keeps at least one day.
 */
export function planFromEnds(start: string, target: string, ends: Array<string | null | undefined>): PlanRow[] {
  const s = toDay(start);
  const t = toDay(target);
  if (t - s + 1 < MIN_PROJECT_DAYS) fail(400, "VALIDATION", `Give the project at least ${MIN_PROJECT_DAYS} days`, "targetDate");
  const out: PlanRow[] = [];
  let cursor = s;
  STAGES.forEach((stage, i) => {
    const last = i === STAGES.length - 1;
    const raw = last ? target : ends[i];
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) fail(400, "VALIDATION", "Each stage needs an end date", `plan.${stage}`);
    const end = toDay(raw as string);
    const maxEnd = t - (STAGES.length - 1 - i);
    if (end < cursor) fail(400, "VALIDATION", "Each stage needs at least one day", `plan.${stage}`);
    if (end > maxEnd) fail(400, "VALIDATION", "Leave at least one day for each stage after it", `plan.${stage}`);
    out.push({ stage, start: fromDay(cursor), end: fromDay(end) });
    cursor = end + 1;
  });
  return out;
}

export async function savePlan(projectId: number, plan: PlanRow[]) {
  for (const r of plan) {
    await db.execute(sql`
      INSERT INTO SideProjectStage (project_id, stage, planned_start, planned_end, updated_at)
      VALUES (${projectId}, ${r.stage}, ${r.start}, ${r.end}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE planned_start = VALUES(planned_start), planned_end = VALUES(planned_end), updated_at = UTC_TIMESTAMP()`);
  }
}

export async function loadPlan(projectId: number): Promise<PlanRow[]> {
  const rows = await many(sql`
    SELECT stage, ${ymd("planned_start")} AS start, ${ymd("planned_end")} AS end
    FROM SideProjectStage WHERE project_id = ${projectId}`);
  const order = (s: string) => STAGES.indexOf(s as Stage);
  return rows.filter((r) => order(r.stage) >= 0).sort((a, b) => order(a.stage) - order(b.stage)) as PlanRow[];
}

/** Closes the open stay and opens the next one. */
export async function recordStageChange(projectId: number, to: Status) {
  await db.execute(sql`UPDATE SideProjectStageLog SET left_at = UTC_TIMESTAMP() WHERE project_id = ${projectId} AND left_at IS NULL`);
  await db.execute(sql`INSERT INTO SideProjectStageLog (project_id, stage, entered_at) VALUES (${projectId}, ${to}, UTC_TIMESTAMP())`);
  await db.execute(sql`UPDATE SideProject SET stage_entered_at = UTC_TIMESTAMP() WHERE project_id = ${projectId}`);
}

/** Projects from before migration 131: rebuild their stays from created_at + STATUS events. */
export async function ensureStageLogs(ids: number[]) {
  if (!ids.length) return;
  const missing = await many(sql`
    SELECT sp.project_id AS id, sp.status, DATE_FORMAT(sp.created_at, '%Y-%m-%d %H:%i:%s') AS created
    FROM SideProject sp
    WHERE sp.project_id IN (${inList(ids)})
      AND NOT EXISTS (SELECT 1 FROM SideProjectStageLog l WHERE l.project_id = sp.project_id)`);
  for (const p of missing) {
    const events = await many(sql`
      SELECT from_value AS f, to_value AS t, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS at
      FROM SideProjectEvent
      WHERE project_id = ${p.id} AND type IN ('STATUS', 'CORRECTION') AND to_value IS NOT NULL
      ORDER BY created_at, event_id`);
    let stage: string = events[0]?.f || p.status;
    let entered: string = p.created;
    for (const e of events) {
      await db.execute(sql`INSERT INTO SideProjectStageLog (project_id, stage, entered_at, left_at) VALUES (${p.id}, ${stage}, ${entered}, ${e.at})`);
      stage = e.t;
      entered = e.at;
    }
    await db.execute(sql`INSERT INTO SideProjectStageLog (project_id, stage, entered_at, left_at) VALUES (${p.id}, ${stage}, ${entered}, NULL)`);
  }
}

export interface StageView {
  stage: Stage;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedDays: number | null;
  actualDays: number;
  state: "done" | "current" | "upcoming" | "skipped";
  enteredAt: string | null;
  daysIn: number | null;
  daysLeft: number | null;
  overrunDays: number;
}

export interface PeriodView {
  stages: StageView[];
  onHoldDays: number;
  currentStage: Stage | "COMPLETED";
  paused: boolean;
  totalDays: number | null;
  daysLeftProject: number | null;
  elapsedPct: number | null;
  /** Set when the project has no start date: the day the stage plan is drawn from (provisional). */
  assumedStart: string | null;
}

/**
 * No start date yet: draw a provisional stage plan from the day the project was created (or
 * started) to its closing date, so the overview never says "no plan" while stages and a closing
 * date exist. Nothing is stored; saving dates in the plan editor replaces it.
 */
export function provisionalPlan(
  p: { start_date: string | null; target_date: string | null; created_at: string; started_at?: string | null },
  plan: PlanRow[],
): { plan: PlanRow[]; assumedStart: string | null } {
  if (p.start_date) return { plan, assumedStart: null };
  if (plan.length) return { plan, assumedStart: plan[0].start };
  if (!p.target_date) return { plan, assumedStart: null };
  const start = (p.started_at || p.created_at).slice(0, 10);
  if (daysBetween(start, p.target_date) + 1 < MIN_PROJECT_DAYS) return { plan, assumedStart: null };
  return { plan: defaultPlan(start, p.target_date), assumedStart: start };
}

/** Everything the drawer shows about time. Pure apart from the inputs. */
export function periodView(
  p: { status: Status; paused_from: Status | null; start_date: string | null; target_date: string | null; created_at: string },
  plan: PlanRow[],
  logs: Array<{ stage: string; entered_at: string; left_at: string | null }>,
  now: Date,
  assumedStart: string | null = null,
): PeriodView {
  const nowMs = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const current = pathStage(p.status, p.paused_from);
  const curIdx = current === "COMPLETED" ? STAGES.length : STAGES.indexOf(current as Stage);
  const ms = (l: { entered_at: string; left_at: string | null }) =>
    Math.max(0, (l.left_at ? Date.parse(l.left_at) : nowMs) - Date.parse(l.entered_at));
  const openLog = logs.find((l) => !l.left_at) ?? null;
  const planBy = new Map(plan.map((r) => [r.stage, r]));
  const stages: StageView[] = STAGES.map((stage, i) => {
    const pr = planBy.get(stage) ?? null;
    const actual = logs.filter((l) => l.stage === stage).reduce((acc, l) => acc + ms(l), 0) / DAY;
    const isCurrent = i === curIdx;
    let state: StageView["state"] = i < curIdx ? (actual > 0 ? "done" : "skipped") : isCurrent ? "current" : "upcoming";
    if (current === "COMPLETED") state = actual > 0 ? "done" : "skipped";
    const daysLeft = pr && (isCurrent || state === "upcoming") ? daysBetween(today, pr.end) : null;
    let overrun = 0;
    if (pr) {
      if (isCurrent && today > pr.end) overrun = daysBetween(pr.end, today);
      else if (state === "done") overrun = Math.max(0, Math.round(actual - (daysBetween(pr.start, pr.end) + 1)));
    }
    const enteredAt = isCurrent && openLog && (openLog.stage === stage || p.status === "ON_HOLD") ? (logs.filter((l) => l.stage === stage).slice(-1)[0]?.entered_at ?? null) : null;
    return {
      stage,
      plannedStart: pr?.start ?? null,
      plannedEnd: pr?.end ?? null,
      plannedDays: pr ? daysBetween(pr.start, pr.end) + 1 : null,
      actualDays: Math.round(actual * 10) / 10,
      state,
      enteredAt,
      daysIn: isCurrent && enteredAt ? Math.floor((nowMs - Date.parse(enteredAt)) / DAY) : null,
      daysLeft,
      overrunDays: overrun,
    };
  });
  const onHold = logs.filter((l) => l.stage === "ON_HOLD").reduce((acc, l) => acc + ms(l), 0) / DAY;
  const start = p.start_date ?? assumedStart ?? p.created_at.slice(0, 10);
  const total = p.target_date ? daysBetween(start, p.target_date) + 1 : null;
  const elapsed = daysBetween(start, today);
  return {
    stages,
    onHoldDays: Math.round(onHold * 10) / 10,
    currentStage: current === "COMPLETED" ? "COMPLETED" : (current as Stage),
    paused: p.status === "ON_HOLD",
    totalDays: total,
    daysLeftProject: p.target_date ? daysBetween(today, p.target_date) : null,
    elapsedPct: total ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : null,
    assumedStart,
  };
}

export async function loadLogs(projectId: number) {
  return many(sql`
    SELECT stage, DATE_FORMAT(entered_at, '%Y-%m-%dT%H:%i:%sZ') AS entered_at, ${iso("left_at")} AS left_at
    FROM SideProjectStageLog WHERE project_id = ${projectId} ORDER BY entered_at, log_id`) as Promise<Array<{ stage: string; entered_at: string; left_at: string | null }>>;
}
