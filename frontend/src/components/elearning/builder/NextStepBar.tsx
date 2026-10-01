import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2, type LucideIcon } from "lucide-react";
import { useMotion } from "../../../design/motion";

export interface NextStep {
  /** Stable id so the bar can animate between steps. */
  id: string;
  title: string;
  detail?: string;
  action?: { label: string; icon?: LucideIcon; onClick: () => void; busy?: boolean };
  secondary?: { label: string; onClick: () => void };
  /** Further quiet choices, shown before the secondary one (e.g. "Add it myself"). */
  more?: { label: string; onClick: () => void }[];
  tone?: "do" | "done";
}

/**
 * One instruction at a time. The whole builder reduces to "here is the single next thing to
 * do, here is the button that does it" — the Apple pattern of a primary action with a plain
 * sentence, instead of a dashboard of competing panels. When nothing is left it says so
 * quietly and gets out of the way.
 */
const NextStepBar: React.FC<{ step: NextStep }> = ({ step }) => {
  const m = useMotion();
  const done = step.tone === "done";
  const Icon = step.action?.icon;
  return (
    <motion.div
      key={step.id}
      {...m("reveal")}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl border ${
        done
          ? "bg-success-100/60 dark:bg-success-700/10 border-success-500/30"
          : "bg-brand-50/70 dark:bg-brand-700/10 border-brand-200/70 dark:border-brand-700/40"
      }`}
      role="status"
    >
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-success-500 text-white" : "bg-brand-500 text-white"}`}
        aria-hidden
      >
        {done ? <Check className="w-4 h-4" strokeWidth={3} /> : <ArrowRight className="w-4 h-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{step.title}</p>
        {step.detail && <p className="text-[13px] text-gray-600 dark:text-gray-300 mt-0.5">{step.detail}</p>}
      </div>
      {(step.action || step.secondary) && (
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {step.more?.map((x) => (
            <button key={x.label} onClick={x.onClick} className="min-h-[40px] px-3 rounded-pill text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/5">
              {x.label}
            </button>
          ))}
          {step.secondary && (
            <button onClick={step.secondary.onClick} className="min-h-[40px] px-3 rounded-pill text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/5">
              {step.secondary.label}
            </button>
          )}
          {step.action && (
            <motion.button
              {...m("tap")}
              onClick={step.action.onClick}
              disabled={step.action.busy}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-60 focus:outline-none focus-visible:shadow-glow"
            >
              {step.action.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
              {step.action.label}
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default NextStepBar;
