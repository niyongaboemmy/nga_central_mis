import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { SEVERITY_LABEL, type ActionItem, type Severity } from "./urgency";

// ─── Needs your attention ───────────────────────────────────────────────────
//
// What this panel used to do wrong, and what replaced it:
//
//   • The subtitle spelled out "0 blocking · 2 slipping · 1 to tidy" directly
//     above chips reading "All 3 / Slipping 2 / Tidy up 1" — the same three
//     numbers, twice, including a tier with nothing in it. The subtitle now
//     says something the counts don't.
//   • The tier chips were three differently-coloured pills with a blue active
//     state, a fourth colour fighting the severity palette. They are one
//     segmented control now: identical shapes, a neutral raised active state,
//     severity carried by a small leading dot.
//   • Every row encoded severity three times over (tinted fill + coloured
//     border + coloured rail). Only the blocking tier is tinted now; the rest
//     carry a severity icon and nothing else, so the one row that matters is
//     the one that stands out.
//   • The affected subjects were a comma-joined sentence that truncated
//     mid-item ("…L3. Class A ..."). They are chips, with an overflow count.
//   • The action appeared on hover only, so on any touch device the rows had
//     no visible affordance at all. It is always rendered.
// ─────────────────────────────────────────────────────────────────────────────

/** Severity is never colour alone — each tier ships its own icon. */
const SEVERITY_ICON: Record<Severity, React.ReactNode> = {
  blocking: <CircleAlert className="w-4 h-4" />,
  slipping: <AlertTriangle className="w-4 h-4" />,
  tidy: <ListChecks className="w-4 h-4" />,
};

const SEVERITY_STYLE: Record<
  Severity,
  { badge: string; dot: string; row: string }
> = {
  blocking: {
    badge: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    dot: "bg-red-500",
    // The only tier allowed a tinted row: it is the one that is stopping
    // someone else.
    row: "border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40",
  },
  slipping: {
    badge:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    dot: "bg-amber-500",
    row: "border-border-light dark:border-border-dark/50 hover:bg-surface-light dark:hover:bg-slate-800/50",
  },
  tidy: {
    badge:
      "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-300",
    dot: "bg-slate-400",
    row: "border-border-light dark:border-border-dark/50 hover:bg-surface-light dark:hover:bg-slate-800/50",
  },
};

const MAX_CHIPS = 2;

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block max-w-[15rem] truncate rounded-full bg-surface-light dark:bg-slate-800/70 px-2 py-0.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
    {children}
  </span>
);

const AttentionRow: React.FC<{ item: ActionItem }> = ({ item }) => {
  const style = SEVERITY_STYLE[item.severity];
  const shown = item.entities.slice(0, MAX_CHIPS);
  const overflow = item.entities.length - shown.length;

  return (
    <Link
      to={item.to}
      className={`group flex gap-3 rounded-2xl border p-3 transition-colors ${style.row}`}
    >
      <span
        className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl ${style.badge}`}
        aria-hidden
      >
        {SEVERITY_ICON[item.severity]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug text-text-primary-light dark:text-text-primary-dark">
            {item.title}
          </p>
          {/* Always rendered: a hover-only action is invisible on touch. */}
          <span className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 transition-colors group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30">
            {item.cta}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary-light dark:text-text-secondary-dark">
          {item.why}
        </p>

        {shown.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {shown.map((entity) => (
              <Chip key={entity}>{entity}</Chip>
            ))}
            {overflow > 0 && (
              <span className="text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                +{overflow} more
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};

const AttentionPanel: React.FC<{
  items: ActionItem[];
  counts: Record<Severity, number>;
}> = ({ items, counts }) => {
  const [filter, setFilter] = useState<Severity | "all">("all");

  const present = (["blocking", "slipping", "tidy"] as const).filter((tier) =>
    items.some((item) => item.severity === tier),
  );
  // One tier is nothing to choose between — the control would be decoration.
  const showFilter = present.length > 1;
  const visible =
    filter === "all" ? items : items.filter((i) => i.severity === filter);

  const blocking = counts.blocking;
  const total = counts.blocking + counts.slipping + counts.tidy;

  return (
    <section className="flex flex-col rounded-3xl border border-border-light dark:border-border-dark/50 bg-card-light dark:bg-card-dark/30 shadow-sm">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span
          className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl ${
            blocking > 0
              ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
              : "bg-surface-light text-text-secondary-light dark:bg-surface-dark dark:text-text-secondary-dark"
          }`}
        >
          {blocking > 0 ? (
            <CircleAlert className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary-light dark:text-text-primary-dark">
              Needs your attention
            </h3>
            {total > 0 && (
              <span className="rounded-full bg-surface-light px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary-light dark:bg-slate-800 dark:text-text-secondary-dark">
                {total}
              </span>
            )}
          </div>
          {/* Says what the counts can't: whether anyone is waiting on you. */}
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark">
            {total === 0
              ? "Nothing outstanding"
              : blocking > 0
                ? `${blocking} ${blocking === 1 ? "item is" : "items are"} holding someone else up`
                : "Nothing blocking — these can be picked up in your own time"}
          </p>
        </div>
      </div>

      {showFilter && (
        <div className="px-5 pt-3">
          <div className="inline-flex rounded-full bg-surface-light dark:bg-slate-800/70 p-0.5">
            {(["all", ...present] as const).map((tier) => {
              const active = filter === tier;
              const count = tier === "all" ? total : counts[tier];
              return (
                <button
                  key={tier}
                  onClick={() => setFilter(tier)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-card-light text-text-primary-light shadow-sm dark:bg-slate-700 dark:text-text-primary-dark"
                      : "text-text-secondary-light hover:text-text-primary-light dark:text-text-secondary-dark dark:hover:text-text-primary-dark"
                  }`}
                >
                  {tier !== "all" && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLE[tier].dot}`}
                      aria-hidden
                    />
                  )}
                  {tier === "all" ? "All" : SEVERITY_LABEL[tier]} {count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 px-5 pb-5 pt-3">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center py-10 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-green-50 text-green-600 dark:bg-green-900/25 dark:text-green-400">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                You're all caught up
              </p>
              <p className="mt-0.5 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                Schemes, notes and courses are all in order.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <li key={item.key}>
                <AttentionRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default AttentionPanel;
