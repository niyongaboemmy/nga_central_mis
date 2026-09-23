import type { TopicPresence } from "./useCourseLive";

// ─── Per-topic engagement ───────────────────────────────────────────────────
//
// The analytics payload already counts, per item, how many students opened it,
// how many finished it, how long they spent and what they scored — but it was
// only ever rendered inside a collapsed `<details>` table, one section at a
// time, so the numbers could not be compared across the course. Comparison is
// the whole value: the topic everyone opens and nobody finishes is the one the
// next lesson has to revisit.
//
// Pure on purpose — ranking and drop-off are the interesting part and should be
// testable without a chart.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyticsItem {
  item_id: number;
  title: string;
  item_type: string;
  is_required: boolean;
  viewed: number;
  completed: number;
  avg_seconds: number;
  avg_score: number | null;
  viewed_pct: number;
  completed_pct: number;
}

export interface AnalyticsSection {
  section_id: number;
  title: string;
  items: AnalyticsItem[];
}

export interface TopicStat extends AnalyticsItem {
  section_id: number;
  section_title: string;
  /** "Week 3", from "Week 3 — Data Types". */
  week_label: string;
  /** Students who opened it but never finished, as a share of those who opened. */
  dropoff_pct: number;
  /** How many are on this page at this moment. */
  live_viewers: number;
}

export type TopicSort =
  "attention" | "visits" | "completion" | "time" | "order";

export const TOPIC_SORT_LABEL: Record<TopicSort, string> = {
  attention: "Needs attention",
  visits: "Most visited",
  completion: "Least completed",
  time: "Longest to read",
  order: "Course order",
};

/**
 * Flatten every published section's items into one comparable list, with the
 * live reader count folded in.
 */
export const buildTopicStats = (
  sections: AnalyticsSection[],
  topics: TopicPresence[] = [],
): TopicStat[] => {
  const liveByItem = new Map<number, number>();
  for (const topic of topics) {
    if (topic.item_id !== null) liveByItem.set(topic.item_id, topic.viewers);
  }

  return sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      section_id: section.section_id,
      section_title: section.title,
      week_label: section.title.split(" — ")[0],
      // Of the students who opened it, how many walked away unfinished. An item
      // nobody opened has no drop-off — reporting 100% there would invent a
      // problem out of an absence of data.
      dropoff_pct:
        item.viewed > 0
          ? Math.round(((item.viewed - item.completed) / item.viewed) * 100)
          : 0,
      live_viewers: liveByItem.get(item.item_id) ?? 0,
    })),
  );
};

export const sortTopics = (
  stats: TopicStat[],
  sort: TopicSort,
): TopicStat[] => {
  const list = [...stats];
  switch (sort) {
    case "visits":
      return list.sort((a, b) => b.viewed - a.viewed);
    case "completion":
      return list.sort((a, b) => a.completed_pct - b.completed_pct);
    case "time":
      return list.sort((a, b) => b.avg_seconds - a.avg_seconds);
    case "order":
      return list;
    default:
      // Attention = the biggest wall. Opened by many, finished by few; a topic
      // nobody has opened yet is not yet a problem, so drop-off is weighted by
      // how many actually hit it.
      return list.sort(
        (a, b) =>
          b.dropoff_pct * b.viewed - a.dropoff_pct * a.viewed ||
          b.viewed - a.viewed,
      );
  }
};

export interface TopicSummary {
  topics: number;
  /** The single topic losing the most students. */
  worst: TopicStat | null;
  /** Average completion across every topic anyone has opened. */
  avgCompletion: number | null;
  totalVisits: number;
  liveNow: number;
}

export const summariseTopics = (stats: TopicStat[]): TopicSummary => {
  const opened = stats.filter((s) => s.viewed > 0);
  const ranked = sortTopics(stats, "attention");
  return {
    topics: stats.length,
    worst: ranked.find((s) => s.dropoff_pct > 0) ?? null,
    avgCompletion: opened.length
      ? Math.round(
          opened.reduce((n, s) => n + s.completed_pct, 0) / opened.length,
        )
      : null,
    totalVisits: stats.reduce((n, s) => n + s.viewed, 0),
    liveNow: stats.reduce((n, s) => n + s.live_viewers, 0),
  };
};
