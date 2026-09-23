import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { OpenedItem } from "../../../api/elearning";
import { copy } from "../copy";
import { ItemTypeIcon } from "../ui/primitives";

/**
 * The end of a step: say it plainly, then offer the one thing to do next. Replaces a lesson
 * that simply stopped, leaving the reader to find a chevron in the floating bar.
 */
const EndOfLesson: React.FC<{ opened: OpenedItem; onNext?: () => void; onBack: () => void }> = ({
  opened,
  onNext,
  onBack,
}) => {
  const next = opened.next;
  const canGoNext = !!next && !next.locked && !!onNext;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-10 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] p-5"
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
        {copy.course.endOfLesson}
      </p>
      {canGoNext ? (
        <button
          onClick={onNext}
          className="mt-3 w-full group flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 hover:border-brand-300 dark:hover:border-brand-500/40 hover:shadow-soft focus:outline-none focus-visible:shadow-glow transition-all text-left"
        >
          <span className="w-10 h-10 rounded-xl el-subtle flex items-center justify-center text-brand-600 dark:text-brand-200 flex-shrink-0">
            <ItemTypeIcon type={next!.item_type} className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-400">
              {copy.course.upNextLabel}
            </span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
              {next!.title}
            </span>
          </span>
          <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-brand-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
        </button>
      ) : (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 flex-1">
            <CheckCircle2 className="w-4 h-4 text-success-500 flex-shrink-0" />
            {copy.course.lastInWeek}
          </span>
          <button
            onClick={onBack}
            className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow inline-flex items-center justify-center gap-1.5"
          >
            {copy.course.weekDoneCta}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default EndOfLesson;
