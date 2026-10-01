import React from "react";
import { NavLink } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";

/**
 * Header and section navigation for Usage & Monitoring. A tab only shows when the
 * viewer holds the capability its page needs (the server enforces it regardless).
 */
export interface AnalyticsTab {
  to: string;
  label: string;
  caps: string[];
}

export const ANALYTICS_TABS: AnalyticsTab[] = [
  { to: "/analytics", label: "Overview", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/realtime", label: "Realtime", caps: ["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"] },
  { to: "/analytics/access", label: "Access & logins", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/audience", label: "Audience", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/visitors", label: "Visitors", caps: ["ANALYTICS_USER_VIEW"] },
  { to: "/analytics/engagement", label: "Engagement", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/apps", label: "Apps", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/retention", label: "Retention", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/locations", label: "Locations", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/technology", label: "Technology", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/explore", label: "Explore", caps: ["ANALYTICS_VIEW"] },
  { to: "/analytics/watchlist", label: "Watchlist", caps: ["ANALYTICS_USER_CONTROL"] },
  { to: "/analytics/settings", label: "Settings", caps: ["ANALYTICS_CONFIGURE"] },
];

export const AnalyticsShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: string[];
  children: React.ReactNode;
}> = ({ title, subtitle, actions, tabs, children }) => {
  const { can } = useAccess();
  const visible = ANALYTICS_TABS.filter((t) => (!tabs || tabs.includes(t.to)) && can(t.caps));
  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" aria-hidden /> Usage &amp; Monitoring
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary-light dark:text-text-primary-dark">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <nav aria-label="Usage & Monitoring sections" className="overflow-x-auto">
        <ul className="flex gap-1 min-w-max border-b border-border-light dark:border-slate-700">
          {visible.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === "/analytics"}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? "border-brand-600 text-text-primary-light dark:text-text-primary-dark"
                      : "border-transparent text-slate-600 dark:text-slate-300 hover:text-text-primary-light dark:hover:text-text-primary-dark"
                  }`
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
};
