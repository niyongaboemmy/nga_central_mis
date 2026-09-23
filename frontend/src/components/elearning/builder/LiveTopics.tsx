import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Compass, Hourglass } from "lucide-react";
import { useMotion } from "../../../design/motion";
import { ItemTypeIcon } from "../ui/primitives";
import type { CourseItemType } from "../../../api/elearning";
import type { TopicPresence } from "./useCourseLive";

// ─── Where the class is right now ───────────────────────────────────────────
//
// The live panel listed names. That answers "who is here" but not "where has
// the class got to", which is the question a teacher asks mid-lesson: are they
// all still on the video, has anyone reached the quiz, is somebody stuck on one
// page. This is the same presence data grouped by page, with a bar per topic so
// the shape of the class is readable at a glance, and each row expandable to
// name the students on that exact page.
// ─────────────────────────────────────────────────────────────────────────────

/** Somebody sitting this long on one page is the signal worth surfacing. */
export const STUCK_SECONDS = 15 * 60;

const dwell = (seconds: number) => {
  if (seconds < 60) return "<1 min";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const LiveTopics: React.FC<{ topics: TopicPresence[] }> = ({ topics }) => {
  const m = useMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  if (topics.length === 0) return null;

  const total = topics.reduce((n, t) => n + t.viewers, 0);
  const busiest = Math.max(...topics.map((t) => t.viewers), 1);

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
      <div className="flex items-center gap-1.5">
        <Compass className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Where they are
        </h4>
        <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">
          {topics.length} {topics.length === 1 ? "page" : "pages"} · {total}{" "}
          {total === 1 ? "reader" : "readers"}
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        <AnimatePresence initial={false}>
          {topics.map((topic) => {
            const key =
              topic.item_id === null ? "browsing" : String(topic.item_id);
            const open = openId === key;
            const stuck = topic.max_seconds >= STUCK_SECONDS;
            const share = Math.round((topic.viewers / busiest) * 100);

            return (
              <motion.li key={key} layout {...m("reveal")}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : key)}
                  aria-expanded={open}
                  className="group w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    {topic.item_type ? (
                      <ItemTypeIcon
                        type={topic.item_type as CourseItemType}
                        className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
                      />
                    ) : (
                      <Compass className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">
                      {topic.item_title || "Browsing the course"}
                      {topic.section_title && (
                        <span className="font-normal text-gray-500 dark:text-gray-400">
                          {" · "}
                          {topic.section_title.split(" — ")[0]}
                        </span>
                      )}
                    </span>
                    {stuck && (
                      <span
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-pill bg-warning-100 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-500"
                        title={`Longest on this page: ${dwell(topic.max_seconds)}`}
                      >
                        <Hourglass className="w-2.5 h-2.5" />
                        {dwell(topic.max_seconds)}
                      </span>
                    )}
                    <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                      {topic.viewers}
                    </span>
                    <ChevronDown
                      className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </div>
                  {/* Bar is relative to the busiest page, so the shape of the
                      class reads at a glance rather than as a column of 1s. */}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                    <motion.div
                      layout
                      className={`h-full rounded-full ${stuck ? "bg-warning-500" : "bg-brand-500"}`}
                      style={{ width: `${Math.max(share, 6)}%` }}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul
                      {...m("reveal")}
                      className="ml-6 mt-1 space-y-0.5 border-l border-gray-100 pl-3 dark:border-white/[0.08]"
                    >
                      {topic.readers.map((reader) => (
                        <li
                          key={reader.user_id}
                          className="flex items-center gap-2 py-0.5 text-[11px]"
                        >
                          <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                            {reader.name}
                          </span>
                          <span
                            className={`flex-shrink-0 tabular-nums ${
                              reader.seconds_spent >= STUCK_SECONDS
                                ? "font-semibold text-warning-700 dark:text-warning-500"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {dwell(reader.seconds_spent)}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
};

export default LiveTopics;
