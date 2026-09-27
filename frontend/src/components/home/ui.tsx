import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CircleAlert, ListChecks } from "lucide-react";
import type { Tier } from "./contract";

// Small building blocks shared by the Home sections. They follow the Teacher
// Dashboard's visual language (rounded-3xl cards, surface tokens, severity
// carried by an icon as well as a colour) so the two pages read as one app.

export const Card: React.FC<{ className?: string; children: React.ReactNode; "aria-labelledby"?: string }> = ({
  className = "",
  children,
  ...rest
}) => (
  <section
    {...rest}
    className={`bg-card-light dark:bg-card-dark/30 rounded-3xl border border-border-light dark:border-border-dark/50 shadow-sm ${className}`}
  >
    {children}
  </section>
);

export const CardHeader: React.FC<{
  id?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ id, icon, title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
    <div className="flex items-center gap-3 min-w-0">
      <span className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-2xl bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {action}
  </div>
);

/** Severity is never colour alone -- each tier ships its own icon. */
export const TIER_ICON: Record<Tier, React.ReactNode> = {
  blocking: <CircleAlert className="w-4 h-4" aria-hidden />,
  slipping: <AlertTriangle className="w-4 h-4" aria-hidden />,
  tidy: <ListChecks className="w-4 h-4" aria-hidden />,
};

export const TIER_TEXT: Record<Tier, string> = {
  blocking: "text-red-600 dark:text-red-400",
  slipping: "text-amber-600 dark:text-amber-400",
  tidy: "text-slate-500 dark:text-slate-400",
};

export const TIER_DOT: Record<Tier, string> = {
  blocking: "bg-red-500",
  slipping: "bg-amber-500",
  tidy: "bg-slate-400",
};

export const Chip: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({
  children,
  className = "",
  title,
}) => (
  <span
    title={title}
    className={`inline-flex items-center max-w-full truncate rounded-full border border-border-light dark:border-border-dark/60 bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 ${className}`}
  >
    {children}
  </span>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-pulse motion-reduce:animate-none rounded-2xl bg-surface-light dark:bg-surface-dark ${className}`} aria-hidden />
);

export const SOURCE_LABEL: Record<string, string> = {
  mis: "MIS",
  taskmentor: "Task Mentor",
  attendance: "Attendance",
  tupo: "Tupo",
};

/**
 * A call-to-action that stays in the MIS (router link) or opens another app
 * in a new tab (its own SSO takes over there).
 */
export const CtaLink: React.FC<{ href: string; external?: boolean; className?: string; children: React.ReactNode }> = ({
  href,
  external,
  className,
  children,
}) =>
  external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
