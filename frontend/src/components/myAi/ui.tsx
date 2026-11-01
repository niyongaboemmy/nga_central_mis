import React from "react";
import { STATUS_META, type CredentialStatus } from "../../api/myAi";

/** An on/off switch with an accessible name (same look as Settings). */
export const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }> = ({
  on,
  onChange,
  label,
  disabled,
  id,
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative h-6 w-11 flex-none rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900 ${on ? "bg-success-500" : "bg-slate-300 dark:bg-gray-600"}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
  </button>
);

export const StatusDot: React.FC<{ status: CredentialStatus }> = ({ status }) => {
  const m = STATUS_META[status] ?? STATUS_META.unreachable;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${m.text}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
};

export const Badge: React.FC<React.PropsWithChildren<{ tone?: "green" | "blue" | "amber" | "slate" }>> = ({ children, tone = "slate" }) => {
  const cls = {
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
    slate: "bg-slate-100 text-slate-700 dark:bg-gray-800/60 dark:text-gray-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
};

export const relTime = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
};
