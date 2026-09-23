import React from "react";
import { motion } from "framer-motion";
import { Radio, X } from "lucide-react";
import { ItemTypeIcon } from "../ui/primitives";
import type { CourseItemType } from "../../../api/elearning";
import type { Watcher } from "./useCourseLive";

// ─── Following one student ──────────────────────────────────────────────────
//
// The live panel could say a student was "on the Video". It could not say
// whether they had watched any of it, or were parked at the top of a page they
// opened ten minutes ago. This follows one student: the page they are on, how
// far down it they have read, the section heading they are under, and whether
// they are still moving.
//
// Read-only by design. This is a teacher noticing that someone is stuck, not a
// remote-control session — nothing here can change what the student sees.
// ─────────────────────────────────────────────────────────────────────────────

/** No ping for this long and we stop claiming to know where they are. */
const STALE_MS = 90_000;

const mins = (seconds: number) => {
  if (seconds < 60) return "<1 min";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const FollowStudent: React.FC<{
  watcher: Watcher | undefined;
  onClose: () => void;
}> = ({ watcher, onClose }) => {
  if (!watcher) {
    return (
      <div className="mt-3 rounded-2xl border border-gray-200 p-3 dark:border-white/[0.08]">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] text-gray-600 dark:text-gray-300">
            That student has left the course.
          </p>
          <button
            onClick={onClose}
            aria-label="Stop following"
            className="rounded-pill p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const position = watcher.position ?? null;
  const fresh = position ? Date.now() - position.at < STALE_MS : false;
  const pct = position?.scroll_pct ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-2xl border border-brand-300 bg-brand-50/60 p-3 dark:border-brand-500/40 dark:bg-brand-500/10"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-white">
            <Radio className="w-3.5 h-3.5 flex-shrink-0 animate-pulse text-brand-600 motion-reduce:animate-none dark:text-brand-200" />
            Following {watcher.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-600 dark:text-gray-300">
            {watcher.item_type && (
              <ItemTypeIcon
                type={watcher.item_type as CourseItemType}
                className="w-3 h-3 flex-shrink-0"
              />
            )}
            {watcher.item_title || "in the course"}
            {watcher.section_title
              ? ` · ${watcher.section_title.split(" — ")[0]}`
              : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Stop following"
          className="rounded-pill p-1 text-gray-400 hover:bg-white/60 dark:hover:bg-white/[0.08]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {position ? (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px] text-gray-600 dark:text-gray-300">
              {position.heading || "Top of the page"}
            </span>
            <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {pct}%
            </span>
          </div>
          {/* A page-shaped track: the marker is where their viewport sits. */}
          <div
            className="relative mt-1 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-black/30"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${watcher.name} is ${pct}% down the page`}
          >
            <motion.div
              className="h-full rounded-full bg-brand-500"
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {mins(watcher.seconds_spent)} on this page ·{" "}
            {fresh ? "moving now" : "no movement recently"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          Waiting for their reader to report a position. Items that aren’t
          scrollable pages — a link or a quiz — don’t report one.
        </p>
      )}
    </motion.div>
  );
};

export default FollowStudent;
