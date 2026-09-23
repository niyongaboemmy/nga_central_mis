import React, { useMemo, useState } from "react";
import { Radio, TrendingDown } from "lucide-react";
import { ItemTypeIcon } from "../ui/primitives";
import type { CourseItemType } from "../../../api/elearning";
import type { TopicPresence } from "./useCourseLive";
import {
  buildTopicStats,
  sortTopics,
  summariseTopics,
  TOPIC_SORT_LABEL,
  type AnalyticsSection,
  type TopicSort,
} from "./topicStats";

// ─── Topic engagement ───────────────────────────────────────────────────────
//
// Per-item counts already existed in the analytics payload, but only inside a
// collapsed table nested under each week — so a teacher could read one week's
// numbers and never compare them. This ranks every topic in the course on one
// scale, pairs each with the live reader count, and defaults to the ordering
// that answers the useful question: which page is losing the most students.
//
// One measure per bar, one hue. The opened/finished pair is a part-to-whole on
// the same track (finished is a subset of opened), so it is drawn as one bar
// with a filled portion rather than two competing series.
// ─────────────────────────────────────────────────────────────────────────────

const TOP_N = 8;

const mins = (seconds: number) => {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m < 1 ? "<1m" : `${m}m`;
};

const TopicEngagement: React.FC<{
  sections: AnalyticsSection[];
  topics?: TopicPresence[];
  members: number;
}> = ({ sections, topics = [], members }) => {
  const [sort, setSort] = useState<TopicSort>("attention");
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(
    () => buildTopicStats(sections, topics),
    [sections, topics],
  );
  const summary = useMemo(() => summariseTopics(stats), [stats]);
  const ranked = useMemo(() => sortTopics(stats, sort), [stats, sort]);
  const shown = showAll ? ranked : ranked.slice(0, TOP_N);

  if (stats.length === 0) {
    return (
      <div className="el-card p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Topic engagement
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No published topics yet. Numbers appear as soon as a week goes live.
        </p>
      </div>
    );
  }

  return (
    <div className="el-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Topic engagement
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {summary.topics} topics · {summary.totalVisits} visits
            {summary.avgCompletion !== null &&
              ` · ${summary.avgCompletion}% average completion`}
            {summary.liveNow > 0 && ` · ${summary.liveNow} reading now`}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as TopicSort)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100"
          >
            {(
              [
                "attention",
                "visits",
                "completion",
                "time",
                "order",
              ] as TopicSort[]
            ).map((value) => (
              <option key={value} value={value}>
                {TOPIC_SORT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {summary.worst && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-warning-100/70 px-2 py-1 text-[11px] font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
          <TrendingDown className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            {summary.worst.dropoff_pct}% who opened “{summary.worst.title}”
            didn’t finish it
          </span>
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {shown.map((topic) => {
          // Opened and finished share one track: finished is a subset of
          // opened, so two separate bars would imply they compete.
          const openedPct = members
            ? Math.round((topic.viewed / members) * 100)
            : 0;
          const finishedPct = members
            ? Math.round((topic.completed / members) * 100)
            : 0;
          return (
            <li key={topic.item_id}>
              <div className="flex items-center gap-2">
                <ItemTypeIcon
                  type={topic.item_type as CourseItemType}
                  className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800 dark:text-gray-100">
                  {topic.title}
                  <span className="text-gray-500 dark:text-gray-400">
                    {" · "}
                    {topic.week_label}
                  </span>
                </span>
                {topic.live_viewers > 0 && (
                  <span
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-pill bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-500"
                    title={`${topic.live_viewers} reading this right now`}
                  >
                    <Radio className="w-2.5 h-2.5 animate-pulse motion-reduce:animate-none" />
                    {topic.live_viewers}
                  </span>
                )}
                <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {mins(topic.avg_seconds)}
                </span>
              </div>

              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]"
                role="img"
                aria-label={`${topic.title}: opened by ${topic.viewed} of ${members}, finished by ${topic.completed}`}
              >
                <div
                  className="h-full rounded-full bg-brand-200 dark:bg-brand-500/30"
                  style={{ width: `${openedPct}%` }}
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                    style={{
                      width: openedPct
                        ? `${(finishedPct / openedPct) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>

              <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                {topic.viewed} opened · {topic.completed} finished
                {topic.viewed > 0 && topic.dropoff_pct > 0 && (
                  <span className="text-warning-700 dark:text-warning-500">
                    {" · "}
                    {topic.dropoff_pct}% dropped off
                  </span>
                )}
                {topic.avg_score !== null &&
                  ` · avg score ${Math.round(topic.avg_score)}%`}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center gap-3">
        {ranked.length > TOP_N && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-200"
          >
            {showAll ? "Show top 8" : `Show all ${ranked.length}`}
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-full bg-brand-200 dark:bg-brand-500/30" />
            opened
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-full bg-brand-500" />
            finished
          </span>
        </span>
      </div>
    </div>
  );
};

export default TopicEngagement;
