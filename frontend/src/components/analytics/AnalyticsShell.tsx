import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowLeft } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";
import { RefreshBar } from "./Skeleton";
import { ANALYTICS_TABS } from "./nav";
import { useLegacyPermission } from "./useLegacyPermission";

export { ANALYTICS_TABS } from "./nav";
export type { AnalyticsTab } from "./nav";

/**
 * Back navigation for drill-down pages: returns to wherever the viewer came from
 * (keeping that page's filters), or to `fallback` when the page was opened directly.
 */
export const BackButton: React.FC<{ fallback: string; label?: string; className?: string }> = ({ fallback, label = "Back", className = "" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== "default" && typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
      className={`group inline-flex items-center gap-1.5 rounded-xl border border-border-light dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 pl-2 pr-3 py-1.5 text-sm font-medium text-text-primary-light dark:text-text-primary-dark hover:bg-white dark:hover:bg-slate-800 hover:shadow-soft transition-all ${className}`}
    >
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
      {label}
    </button>
  );
};

export const AnalyticsShell: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: string[];
  /** Drill-down pages: show a back button (to `fallback` when opened directly). */
  back?: { fallback: string; label?: string };
  /** Hide the section tabs (drill-down pages and My activity). */
  hideTabs?: boolean;
  /** Data on screen is being refreshed. */
  refreshing?: boolean;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, tabs, back, hideTabs, refreshing = false, eyebrow, children }) => {
  const { can } = useAccess();
  const hasPerm = useLegacyPermission();
  const visible = ANALYTICS_TABS.filter((t) => (!tabs || tabs.includes(t.to)) && (can(t.caps) || hasPerm(t.perms)));
  return (
    <div className="space-y-4 max-w-[1500px] mx-auto pt-5 sm:pt-7 pb-10">
      {back && <BackButton fallback={back.fallback} label={back.label} />}
      <header className="flex flex-wrap items-start justify-between gap-3 an-rise">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
            {eyebrow ?? (
              <>
                <Activity className="w-3.5 h-3.5" aria-hidden /> Usage &amp; Monitoring
              </>
            )}
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary-light dark:text-text-primary-dark">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {!hideTabs && visible.length > 1 && (
        <nav aria-label="Usage & Monitoring sections" className="overflow-x-auto -mx-1 px-1">
          <ul className="flex gap-1 min-w-max border-b border-border-light dark:border-slate-700">
            {visible.map((t) => (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  end={t.to === "/analytics"}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px rounded-t-lg transition-colors ${
                      isActive
                        ? "border-brand-600 text-text-primary-light dark:text-text-primary-dark bg-white/60 dark:bg-slate-800/60"
                        : "border-transparent text-slate-600 dark:text-slate-300 hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-white/40 dark:hover:bg-slate-800/40"
                    }`
                  }
                >
                  <t.icon className="w-3.5 h-3.5" aria-hidden />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <RefreshBar active={refreshing} className="-mt-3" />
      {children}
    </div>
  );
};
