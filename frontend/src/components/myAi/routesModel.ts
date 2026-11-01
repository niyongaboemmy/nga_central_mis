import { matchPersonalRoute } from "../../vendor/nga-access";
import { APP_LABELS, TASK_LABELS, TASK_ORDER, type AiPersonalApp, type AiPersonalRoute, type AiTask, type MyAiCredential, type RouteInput } from "../../api/myAi";

/**
 * "What answers what" as an editable grid. A cell is (app | "*", task | "*"); an empty cell
 * inherits from the less specific ones the same way the server matches routes:
 * (app, task) > (app, *) > (*, task) > (*, *).
 */

export type CellApp = AiPersonalApp | "*";
export type CellTask = AiTask | "*";
export interface Cell {
  credentialId: number;
  model: string;
}
export interface Grid {
  cells: Record<string, Cell>;
  /** Per row (task): when my key fails, may the school's AI answer. */
  fallback: Record<string, "school" | "none">;
}

export const cellKey = (app: CellApp, task: CellTask) => `${app}|${task}`;
export const cellValue = (c: Cell | undefined) => (c ? `${c.credentialId}:${c.model}` : "");

/** "12:openai/gpt-4o:free" -> { credentialId: 12, model: "openai/gpt-4o:free" } (model ids may hold colons). */
export function parseCellValue(v: string): Cell | null {
  const i = v.indexOf(":");
  if (i < 1) return null;
  const credentialId = Number(v.slice(0, i));
  const model = v.slice(i + 1);
  return Number.isInteger(credentialId) && model ? { credentialId, model } : null;
}

export function gridFromRoutes(routes: readonly AiPersonalRoute[]): Grid {
  const cells: Record<string, Cell> = {};
  const fallback: Record<string, "school" | "none"> = {};
  for (const r of routes) {
    cells[cellKey(r.app, r.task)] = { credentialId: r.credentialId, model: r.model };
    // A row's fallback is "none" if any of its routes says so (the stricter wins).
    if (fallback[r.task] !== "none") fallback[r.task] = r.fallback === "none" ? "none" : "school";
  }
  return { cells, fallback };
}

export function routesFromGrid(g: Grid): RouteInput[] {
  return Object.entries(g.cells).map(([k, c]) => {
    const [app, task] = k.split("|") as [CellApp, CellTask];
    return { app, task, credentialId: c.credentialId, model: c.model, fallback: g.fallback[task] ?? "school" };
  });
}

/** What an empty cell falls back to, from the less specific cells (null: School AI). */
export function inheritedCell(g: Grid, app: CellApp, task: CellTask): Cell | null {
  const order: Array<[CellApp, CellTask]> = [
    [app, "*"],
    ["*", task],
    ["*", "*"],
  ];
  for (const [a, t] of order) {
    if (a === app && t === task) continue;
    const hit = g.cells[cellKey(a, t)];
    if (hit) return hit;
  }
  return null;
}

/** Short name of a key for people: "My OpenAI" or its label. */
export const keyName = (c: Pick<MyAiCredential, "label" | "providerLabel"> | undefined) =>
  c ? (c.label && c.label !== c.providerLabel ? c.label : `My ${c.providerLabel}`) : "a removed key";

/**
 * The status strip: which of my keys answers what in the MIS.
 * "School AI (free)" when nothing is mine, else "My OpenAI · gpt-4o for Writing & generators; School AI for everything else".
 */
export function statusSummary(routes: readonly AiPersonalRoute[], credentials: readonly MyAiCredential[], app: AiPersonalApp = "mis"): {
  mine: boolean;
  parts: Array<{ who: string; model?: string; tasks: string[]; attention: boolean }>;
  restSchool: boolean;
} {
  const groups = new Map<string, { who: string; model?: string; tasks: string[]; attention: boolean }>();
  let restSchool = false;
  for (const task of TASK_ORDER) {
    const r = matchPersonalRoute(routes, app, task);
    const cred = r ? credentials.find((c) => c.id === r.credentialId) : undefined;
    if (!r || (cred && !cred.allowedApps.includes(app))) {
      restSchool = true;
      continue;
    }
    const k = `${r.credentialId}:${r.model}`;
    const g = groups.get(k) ?? { who: keyName(cred), model: r.model, tasks: [], attention: !!cred && cred.status !== "active" };
    g.tasks.push(TASK_LABELS[task].name);
    groups.set(k, g);
  }
  return { mine: groups.size > 0, parts: [...groups.values()], restSchool };
}

export const appLabel = (a: CellApp) => (a === "*" ? "All apps" : APP_LABELS[a]);
export const taskLabel = (t: CellTask) => (t === "*" ? "Anything else" : TASK_LABELS[t].name);
