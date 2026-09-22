import React from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleSlash,
  Clock,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { STATUS } from "../teacher/chartTheme";
import type { SchemeCard } from "./schemeProgress";

// One (subject, class group) and how much of the term it has planned. The unit
// is deliberately the pair, not the subject: a scheme of work belongs to a
// (subject, class group, term), so a subject taught to two classes has two
// schemes that can be at completely different stages. The old card grouped
// them behind one row and could show neither.

const TONE_TEXT: Record<SchemeCard["tone"], string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  good: "text-green-600 dark:text-green-400",
};

const TONE_ICON: Record<SchemeCard["tone"], React.ReactNode> = {
  critical: <CircleSlash className="h-3.5 w-3.5" />,
  warning: <AlertCircle className="h-3.5 w-3.5" />,
  good: <CheckCircle2 className="h-3.5 w-3.5" />,
};

/** The review verdict, which is a different axis from coverage. */
const ReviewBadge: React.FC<{ card: SchemeCard }> = ({ card }) => {
  if (card.status === "pending") return null;
  const map = {
    APPROVED: {
      label: "Approved",
      cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    REJECTED: {
      label: "Sent back",
      cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    PENDING: {
      label: "Awaiting review",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      icon: <Clock className="h-3 w-3" />,
    },
  } as const;
  const badge = map[card.validation_status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
    >
      {badge.icon}
      {badge.label}
    </span>
  );
};

const SchemeProgressCard: React.FC<{
  card: SchemeCard;
  isNavigating?: boolean;
  onOpen: () => void;
  onViewFeedback?: () => void;
}> = ({ card, isNavigating, onOpen, onViewFeedback }) => {
  const barColor = STATUS[card.tone];
  // With no term dates there is no target, so the bar shows what exists rather
  // than accusing the scheme of being behind something unknown.
  const width =
    card.target > 0
      ? Math.max(card.percent, card.planned > 0 ? 4 : 0)
      : card.planned > 0
        ? 100
        : 0;

  return (
    <div
      className={`group flex h-full flex-col rounded-2xl border border-border-light bg-card-light p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-border-dark/50 dark:bg-card-dark/30 dark:hover:border-blue-800/60 ${
        isNavigating ? "cursor-wait opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={isNavigating}
        className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
            {isNavigating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <BookOpen className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
              {card.subject_name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {card.subject_code && (
                <span className="rounded bg-surface-light px-1.5 py-0.5 font-mono text-[10px] text-text-secondary-light dark:bg-slate-800 dark:text-text-secondary-dark">
                  {card.subject_code}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                <GraduationCap className="h-3 w-3" />
                {[card.grade_name, card.class_group_name]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 -translate-x-1 text-text-secondary-light opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 dark:text-text-secondary-dark" />
        </div>

        {/* Coverage — the thing this page was missing entirely. */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums text-text-primary-light dark:text-text-primary-dark">
              {card.planned}
              {card.target > 0 && (
                <span className="text-sm font-normal text-text-secondary-light dark:text-text-secondary-dark">
                  /{card.target}
                </span>
              )}
            </span>
            <span className="text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
              {card.target > 0 ? "weeks planned" : "weeks"}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-light dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={card.planned}
            aria-valuemin={0}
            aria-valuemax={card.target || card.planned}
            aria-label={`${card.subject_name}, ${card.planned} of ${card.target || card.planned} weeks planned`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${width}%`, backgroundColor: barColor }}
            />
          </div>
          <p
            className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${TONE_TEXT[card.tone]}`}
          >
            {TONE_ICON[card.tone]}
            {card.statusLabel}
          </p>
        </div>
      </button>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-light pt-3 dark:border-border-dark/50">
        <ReviewBadge card={card} />
        {card.validation_comment && onViewFeedback && (
          <button
            type="button"
            onClick={onViewFeedback}
            className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Read feedback
          </button>
        )}
      </div>
    </div>
  );
};

export default SchemeProgressCard;
