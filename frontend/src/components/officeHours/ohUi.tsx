import React from "react";
import { Loader2 } from "lucide-react";
import { shortDate, weekStartOf, type Availability, type AttendanceStatus, type SessionState, type StudentStats } from "../../api/officeHours";

/**
 * Small building blocks shared by the office-hours screens, in the house style
 * (rounded-3xl cards, slate palette, dark mode). Secondary text is
 * slate-600 / dark:slate-300 so it passes WCAG AA in both themes.
 */

export const Card: React.FC<React.PropsWithChildren<{ className?: string; as?: "section" | "div"; labelledBy?: string }>> = ({
  children,
  className = "",
  as = "section",
  labelledBy,
}) => {
  const Tag = as;
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-gray-700/30 dark:bg-gray-800/30 ${className}`}
    >
      {children}
    </Tag>
  );
};

export const CardTitle: React.FC<React.PropsWithChildren<{ id?: string; icon?: React.ReactNode; action?: React.ReactNode }>> = ({
  children,
  id,
  icon,
  action,
}) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-gray-300">
      {icon}
      {children}
    </h2>
    {action}
  </div>
);

export const Muted: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = "" }) => (
  <p className={`text-sm text-slate-600 dark:text-gray-300 ${className}`}>{children}</p>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = "Loading" }) => (
  <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-600 dark:text-gray-300">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
  </div>
);

export const EmptyState: React.FC<{ title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({
  title,
  body,
  action,
  icon,
}) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-8 text-center dark:border-gray-700/30">
    {icon && <div className="text-slate-400 dark:text-gray-500">{icon}</div>}
    <p className="font-semibold text-slate-800 dark:text-gray-100">{title}</p>
    {body && <Muted>{body}</Muted>}
    {action}
  </div>
);

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

export const SESSION_STATE_META: Record<SessionState, { label: string; cls: string }> = {
  upcoming: { label: "Upcoming", cls: "bg-slate-100 text-slate-700 dark:bg-gray-800/40 dark:text-gray-200" },
  running: { label: "Now", cls: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200" },
  unmarked: { label: "Register missing", cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" },
  held: { label: "Marked", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" },
};

export const SessionStatePill: React.FC<{ state: SessionState }> = ({ state }) => (
  <span className={`${pill} ${SESSION_STATE_META[state].cls}`}>{SESSION_STATE_META[state].label}</span>
);

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; key: string; cls: string; active: string }> = {
  PRESENT: {
    label: "Present",
    short: "P",
    key: "1",
    cls: "text-emerald-800 dark:text-emerald-200",
    active: "bg-emerald-700 text-white border-emerald-700",
  },
  LATE: {
    label: "Late",
    short: "L",
    key: "2",
    cls: "text-amber-800 dark:text-amber-200",
    active: "bg-amber-700 text-white border-amber-700",
  },
  ABSENT: {
    label: "Absent",
    short: "A",
    key: "3",
    cls: "text-rose-800 dark:text-rose-200",
    active: "bg-rose-700 text-white border-rose-700",
  },
  EXCUSED: {
    label: "Excused",
    short: "E",
    key: "4",
    cls: "text-sky-800 dark:text-sky-200",
    active: "bg-sky-700 text-white border-sky-700",
  },
};

export const AttendancePill: React.FC<{ status: AttendanceStatus | null }> = ({ status }) =>
  status ? (
    <span className={`${pill} bg-slate-100 dark:bg-gray-800/40 ${ATTENDANCE_META[status].cls}`}>{ATTENDANCE_META[status].label}</span>
  ) : (
    <span className={`${pill} bg-slate-100 text-slate-600 dark:bg-gray-800/40 dark:text-gray-300`}>Not marked</span>
  );

export const AvailabilityChip: React.FC<{ availability: Availability }> = ({ availability }) => {
  if (availability.status === "FREE") {
    return <span className={`${pill} bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200`}>Free</span>;
  }
  if (availability.status === "WITH_YOU") {
    return <span className={`${pill} bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200`}>With you</span>;
  }
  const h = availability.holders[0];
  // A weekly invitation names its week; a longer one only its days.
  const week = h?.from && h.to && weekStartOf(h.from) === weekStartOf(h.to) ? ` · wk ${shortDate(weekStartOf(h.from))}` : "";
  return (
    <span className={`${pill} bg-slate-200 text-slate-700 dark:bg-gray-700/50 dark:text-gray-200`} title={h ? `${h.title} · ${h.days_label}${week}` : undefined}>
      {h ? `With ${h.teacher_name ?? "another teacher"} · ${h.days_label}${week}` : "Taken"}
    </span>
  );
};

export const BAND_META: Record<StudentStats["band"], { label: string; cls: string }> = {
  CONSISTENT: { label: "Consistent", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
  WATCH: { label: "Watch", cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" },
  CHRONIC: { label: "Chronic", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" },
  TOO_FEW: { label: "Too few sessions", cls: "bg-slate-100 text-slate-700 dark:bg-gray-800/40 dark:text-gray-200" },
};

export const BandPill: React.FC<{ band: StudentStats["band"] }> = ({ band }) => (
  <span className={`${pill} ${BAND_META[band].cls}`}>{BAND_META[band].label}</span>
);

export const RatePill: React.FC<{ rate: number | null }> = ({ rate }) => (
  <span className="tabular-nums text-sm font-semibold text-slate-800 dark:text-gray-100">{rate === null ? "—" : `${Math.round(rate)}%`}</span>
);

export const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900";
export const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-100 dark:hover:bg-gray-700/50";
export const dangerBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/40 dark:bg-gray-800/40 dark:text-rose-200 dark:hover:bg-rose-500/10";
export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-100 dark:placeholder:text-gray-400";
export const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300";
