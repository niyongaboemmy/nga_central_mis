import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Radio, Trophy } from "lucide-react";
import { useMotion } from "../../../design/motion";
import { ItemTypeIcon } from "../ui/primitives";
import type { CourseItemType } from "../../../api/elearning";
import { useCourseLive } from "./useCourseLive";
import LiveTopics from "./LiveTopics";

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};
/** How long this visit has lasted. Previously this read the lifetime `seconds_spent`, so
 *  a student who had opened the page for the first time always showed "just arrived",
 *  whatever they were actually doing. */
const dwell = (s: number) =>
  s < 60 ? "under a minute" : `${Math.round(s / 60)} min on this`;
/** When the pings stopped. A watcher inside the stale window but no longer pinging is
 *  away, not learning — saying otherwise is the whole complaint. */
const awayFor = (lastSeen: number) => {
  const s = Math.max(0, Math.round((Date.now() - lastSeen) / 1000));
  return s < 60 ? `away ${s}s` : `away ${Math.round(s / 60)}m`;
};
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

/**
 * Who is learning right now, and what just landed. Presence comes from the pings students
 * already send while an item is open, so it is accurate to about half a minute without
 * asking anything extra of their phones.
 */
const LiveNowPanel: React.FC<{
  courseId: number;
  enabled?: boolean;
  /**
   * The live stream, when the parent already subscribes to it. Two consumers
   * each calling useCourseLive would open two EventSource connections to the
   * same course; passing it down keeps it to one.
   */
  live?: ReturnType<typeof useCourseLive>;
}> = ({ courseId, enabled = true, live }) => {
  const m = useMotion();
  const own = useCourseLive(courseId, enabled && !live);
  const { watchers, topics, recent, connected } = live ?? own;

  return (
    <div className="el-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">
          Learning right now
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-pill ${
            watchers.length ? "el-chip-success" : "el-chip"
          }`}
          title={
            connected ? "Live updates connected" : "Updating every 15 seconds"
          }
        >
          <Radio
            className={`w-3 h-3 ${watchers.length ? "animate-pulse" : ""}`}
          />
          {watchers.length ? `${watchers.length} online` : "nobody online"}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {watchers.length === 0 ? (
          <motion.p
            {...m("fade")}
            className="mt-3 text-sm text-gray-500 dark:text-gray-400"
          >
            Nobody is in the course at the moment. Names appear here the second
            a student opens an item.
          </motion.p>
        ) : (
          <motion.ul {...m("fade")} className="mt-3 space-y-2">
            {watchers.map((w) => (
              <motion.li
                key={w.user_id}
                layout
                {...m("reveal")}
                className="flex items-center gap-3"
              >
                <span className="relative w-9 h-9 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                  {initials(w.name)}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success-500 ring-2 ring-white dark:ring-black"
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {w.name}
                  </span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                    {w.item_type && (
                      <ItemTypeIcon
                        type={w.item_type as CourseItemType}
                        className="w-3 h-3 flex-shrink-0"
                      />
                    )}
                    {w.item_title || "in the course"}
                    {w.section_title
                      ? ` · ${w.section_title.split(" — ")[0]}`
                      : ""}
                  </span>
                </span>
                <span className="flex flex-col items-end flex-shrink-0 text-[11px] tabular-nums">
                  <span className={w.active ? "text-gray-400" : "text-warning-700 dark:text-warning-500"}>
                    {w.active ? dwell(w.dwell_seconds) : awayFor(w.last_seen)}
                  </span>
                  {!w.active && (
                    <span className="text-[10px] text-gray-400">last seen here</span>
                  )}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <LiveTopics topics={topics} />

      {recent.length > 0 && (
        <>
          <p className="mt-4 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
            Just now
          </p>
          <ul className="mt-2 space-y-1.5">
            <AnimatePresence initial={false}>
              {recent.slice(0, 8).map((r) => (
                <motion.li
                  key={`${r.user_id}-${r.item_id}-${r.at}`}
                  {...m("reveal")}
                  className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-200"
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      r.verb === "completed"
                        ? "bg-success-500 text-white"
                        : r.verb === "scored"
                          ? "el-chip-brand"
                          : "el-chip"
                    }`}
                    aria-hidden
                  >
                    {r.verb === "completed" ? (
                      <Check className="w-3 h-3" strokeWidth={3} />
                    ) : r.verb === "scored" ? (
                      <Trophy className="w-3 h-3" />
                    ) : (
                      <ItemTypeIcon
                        type={r.item_type as CourseItemType}
                        className="w-3 h-3"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.name}</span>{" "}
                    {r.verb === "completed"
                      ? "finished"
                      : r.verb === "scored"
                        ? `scored ${Math.round(r.score_pct ?? 0)}% on`
                        : "started"}{" "}
                    <span className="text-gray-500 dark:text-gray-400">
                      {r.item_title}
                    </span>
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    {ago(r.at)}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </div>
  );
};

export default LiveNowPanel;
