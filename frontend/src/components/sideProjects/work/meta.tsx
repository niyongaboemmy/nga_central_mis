import React from "react";
import {
  Ban, CheckCircle2, CircleDashed, CircleDot, ClipboardList, Code2, Eye, FileText, FlaskConical, Inbox, LineChart, Loader, OctagonAlert, Palette, Search, ShieldCheck, Star, UserRound,
} from "lucide-react";
import type { PlanStatus, Priority, RoleKey, TaskStatus } from "../../../api/sideProjects";

/**
 * Plan / task vocabulary (SIDE_PROJECTS_TEAMS_PLAN_TASKS_IMPLEMENTATION_PLAN.md §2). Status hues
 * follow the shared status palette (neutral -> blue -> amber -> red -> green) and always come
 * with an icon and a label. Every class has its dark-mode pair.
 */

type Meta = { label: string; icon: React.ElementType; chip: string; dot: string; hint: string };

export const TASK_META: Record<TaskStatus, Meta> = {
  TODO: { label: "To do", icon: CircleDashed, chip: "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200", dot: "bg-slate-400 dark:bg-gray-500", hint: "Not started" },
  IN_PROGRESS: { label: "In progress", icon: Loader, chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", dot: "bg-blue-600 dark:bg-blue-400", hint: "Being worked on" },
  IN_REVIEW: { label: "In review", icon: Eye, chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", dot: "bg-amber-500 dark:bg-amber-400", hint: "Waiting for a check" },
  BLOCKED: { label: "Blocked", icon: OctagonAlert, chip: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-600 dark:bg-red-400", hint: "Can't move on" },
  DONE: { label: "Done", icon: CheckCircle2, chip: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300", dot: "bg-green-600 dark:bg-green-400", hint: "Finished" },
  CANCELLED: { label: "Cancelled", icon: Ban, chip: "bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400", dot: "bg-slate-300 dark:bg-gray-600", hint: "Not needed any more" },
};
export const TASK_FLOW: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];

export const PLAN_META: Record<PlanStatus, Meta> = {
  BACKLOG: { label: "Backlog", icon: Inbox, chip: "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300", dot: "bg-slate-300 dark:bg-gray-600", hint: "An idea, not committed" },
  PLANNED: { label: "Planned", icon: CircleDot, chip: "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200", dot: "bg-slate-400 dark:bg-gray-500", hint: "Committed, not started" },
  IN_PROGRESS: { label: "In progress", icon: Loader, chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", dot: "bg-blue-600 dark:bg-blue-400", hint: "Work has started" },
  IN_REVIEW: { label: "In review", icon: Eye, chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", dot: "bg-amber-500 dark:bg-amber-400", hint: "Being checked" },
  BLOCKED: { label: "Blocked", icon: OctagonAlert, chip: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-600 dark:bg-red-400", hint: "Something stops it" },
  DONE: { label: "Done", icon: CheckCircle2, chip: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300", dot: "bg-green-600 dark:bg-green-400", hint: "Delivered" },
  CANCELLED: { label: "Cancelled", icon: Ban, chip: "bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400", dot: "bg-slate-300 dark:bg-gray-600", hint: "Dropped" },
};
export const PLAN_FLOW: PlanStatus[] = ["BACKLOG", "PLANNED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"];

export const PRIORITY_META: Record<Priority, { label: string; bars: number; cls: string }> = {
  LOW: { label: "Low", bars: 1, cls: "text-slate-500 dark:text-gray-400" },
  MEDIUM: { label: "Medium", bars: 2, cls: "text-blue-600 dark:text-blue-400" },
  HIGH: { label: "High", bars: 3, cls: "text-orange-600 dark:text-orange-400" },
  CRITICAL: { label: "Critical", bars: 4, cls: "text-red-600 dark:text-red-400" },
};
export const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const ROLE_META: Record<RoleKey, { label: string; icon: React.ElementType }> = {
  LEAD: { label: "Team lead", icon: Star },
  DEVELOPER: { label: "Developer", icon: Code2 },
  DESIGNER: { label: "Designer", icon: Palette },
  TESTER: { label: "Tester", icon: FlaskConical },
  RESEARCHER: { label: "Researcher", icon: Search },
  ANALYST: { label: "Analyst", icon: LineChart },
  DOCUMENTER: { label: "Documenter", icon: FileText },
  OTHER: { label: "Member", icon: UserRound },
};
export const ROLE_KEYS: RoleKey[] = ["LEAD", "DEVELOPER", "DESIGNER", "TESTER", "RESEARCHER", "ANALYST", "DOCUMENTER", "OTHER"];

/** Common positions on a project; any custom title is allowed too. */
export const POSITION_SUGGESTIONS = [
  "Project manager",
  "Frontend developer",
  "Backend developer",
  "Full-stack developer",
  "Mobile developer",
  "UI/UX designer",
  "QA tester",
  "Data analyst",
  "Hardware engineer",
  "Researcher",
  "Technical writer",
  "Scrum master",
];

/** The role family a position belongs to (drives the icon and insights grouping). */
export function roleKeyFor(title: string, fallback: RoleKey = "OTHER"): RoleKey {
  const t = title.toLowerCase();
  if (/(lead|manager|scrum|owner|coordinator|head)/.test(t)) return "LEAD";
  if (/(design|ui|ux|artist|illustrat)/.test(t)) return "DESIGNER";
  if (/(test|qa|quality)/.test(t)) return "TESTER";
  if (/(research)/.test(t)) return "RESEARCHER";
  if (/(analy|data|business)/.test(t)) return "ANALYST";
  if (/(writer|document|content)/.test(t)) return "DOCUMENTER";
  if (/(develop|engineer|program|coder|devops|frontend|backend|full-stack|fullstack|mobile|hardware|embedded)/.test(t)) return "DEVELOPER";
  return fallback;
}

export const StatusChip: React.FC<{ meta: Meta; size?: "sm" | "md"; className?: string }> = ({ meta, size = "sm", className = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${meta.chip} ${className}`}>
    <meta.icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
    {meta.label}
  </span>
);

/** Signal bars: how urgent. Shape + label, never colour alone. */
export const PriorityMark: React.FC<{ priority: Priority; withLabel?: boolean }> = ({ priority, withLabel }) => {
  const m = PRIORITY_META[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${m.cls}`} title={`${m.label} priority`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={`w-[3px] rounded-sm ${b <= m.bars ? "bg-current" : "bg-slate-200 dark:bg-gray-700"}`} style={{ height: `${b * 3}px` }} />
        ))}
      </span>
      {withLabel ? m.label : <span className="sr-only">{m.label} priority</span>}
    </span>
  );
};

export const fmtDay = (d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" }) : "";
export const todayYmd = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};

/** Icons re-used by the plan header. */
export const PlanIcons = { ClipboardList, ShieldCheck };
