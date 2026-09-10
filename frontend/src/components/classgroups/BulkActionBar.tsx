import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  variant?: "primary" | "neutral" | "danger";
  disabled?: boolean;
  loading?: boolean;
}

interface BulkActionBarProps {
  count: number;
  /** e.g. "student" -> "3 students selected". */
  noun: string;
  actions: BulkAction[];
  onClear: () => void;
  /** Extra copy shown before the actions, e.g. a staged enrollment diff. */
  detail?: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white",
  neutral:
    "bg-white/10 hover:bg-white/20 text-white border border-white/20 dark:bg-slate-700/60 dark:hover:bg-slate-700",
  danger: "bg-red-600 hover:bg-red-700 text-white",
};

/**
 * One contextual action bar shared by every lens. It slides up on the first
 * selection and stays tied to it: the count is announced politely, and
 * "Clear" is always the last resort out.
 */
const BulkActionBar: React.FC<BulkActionBarProps> = ({
  count,
  noun,
  actions,
  onClear,
  detail,
}) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="sticky bottom-3 z-30 mx-3 mt-3"
      >
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-700/60 shadow-2xl px-3 py-2">
          <span
            aria-live="polite"
            className="text-sm font-semibold text-white px-1 tabular-nums"
          >
            {count} {noun}
            {count === 1 ? "" : "s"} selected
          </span>

          {detail && (
            <span className="text-xs text-slate-300 border-l border-slate-700 pl-2">
              {detail}
            </span>
          )}

          <div className="flex-1" />

          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  variantClasses[action.variant ?? "neutral"]
                }`}
              >
                {action.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  Icon && <Icon className="w-3.5 h-3.5" />
                )}
                {action.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default BulkActionBar;
