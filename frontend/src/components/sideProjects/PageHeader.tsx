import React from "react";
import { motion } from "framer-motion";

export interface HeaderStat {
  label: string;
  value: React.ReactNode | undefined;
  icon?: React.ElementType;
  /** highlight a number that needs attention */
  tone?: "default" | "attention";
}

/**
 * The one header every side-projects page uses (My projects, Assigned projects, All projects):
 * a quiet surface that follows the theme, an icon tile, the title and one line of context, the
 * page's actions on the right, an optional row of key numbers and an optional tab row. No
 * gradients, no shadows, no accent strips.
 */
const PageHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: HeaderStat[];
  tabs?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, actions, stats, tabs, children }) => (
  <motion.header
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2 }}
    className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-gray-700/40 dark:bg-gray-800/30"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {stats && stats.length > 0 && (
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Key numbers">
        {stats.map((s) => (
          <li key={s.label} className="flex min-w-[6.5rem] items-center gap-2.5 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-gray-800/50">
            {s.icon && <s.icon className={`h-4 w-4 shrink-0 ${s.tone === "attention" && s.value ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-gray-500"}`} aria-hidden />}
            <div className="min-w-0">
              <p className={`text-base font-bold leading-tight tabular-nums ${s.tone === "attention" && s.value ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-white"}`}>
                {s.value === undefined ? <span className="inline-block h-4 w-6 animate-pulse rounded bg-slate-200 align-middle dark:bg-gray-700" /> : s.value}
              </p>
              <p className="truncate text-[11px] font-medium text-slate-500 dark:text-gray-400">{s.label}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
    {children}
    {tabs && <div className="mt-4">{tabs}</div>}
  </motion.header>
);

/** Tabs for a PageHeader: pills, the active one solid blue. */
export const HeaderTabs: React.FC<{ items: Array<{ key: string; label: string; icon?: React.ElementType; count?: number }>; value: string; onChange: (k: string) => void; label: string }> = ({ items, value, onChange, label }) => (
  <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label={label}>
    {items.map((t) => {
      const on = t.key === value;
      return (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onChange(t.key)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            on ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:hover:text-white"
          }`}
        >
          {t.icon && <t.icon className="h-4 w-4" aria-hidden />}
          {t.label}
          {t.count !== undefined && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-blue-800" : "bg-slate-100 dark:bg-gray-700/60"}`}>{t.count}</span>}
        </button>
      );
    })}
  </nav>
);

export default PageHeader;
