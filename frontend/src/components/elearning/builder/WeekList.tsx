import React from "react";
import { Check, ChevronRight, Circle, EyeOff, Clock } from "lucide-react";
import type { CourseSection } from "../../../api/elearning";

/**
 * Weeks as one quiet, scannable list — a single line each, the state carried by one small
 * glyph rather than a status pill, a date and an item count. On phones it is the whole
 * screen; on desktop it is the left column. No drag handles, no badges competing for
 * attention: choosing a week is navigation, not configuration.
 */
const stateOf = (s: CourseSection) => {
  if (s.status === "HIDDEN") return { icon: EyeOff, cls: "text-gray-400", label: "Skipped" };
  if (s.status === "PUBLISHED") return { icon: Check, cls: "text-success-500", label: "Live for students" };
  return { icon: Clock, cls: "text-gray-400", label: "Not live yet" };
};

const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

const WeekList: React.FC<{
  sections: CourseSection[];
  selected: number | null;
  onSelect: (sectionId: number) => void;
  todayIso: string;
  /** Pointer/keyboard focus moved to a row — the parent shows the hover preview. */
  onPeek?: (section: CourseSection | null, rect: DOMRect | null) => void;
}> = ({ sections, selected, onSelect, todayIso, onPeek }) => (
  <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]" role="list">
    {sections.map((s) => {
      const st = stateOf(s);
      const Icon = st.icon;
      const isNow = !!s.start_date && !!s.end_date && s.start_date <= todayIso && s.end_date >= todayIso;
      const topic = s.title.split(" — ").slice(1).join(" — ");
      const gaps = s.criteria.filter((c) => !s.items.some((i) => i.criteria.some((x) => x.criteria_id === c.criteria_id))).length;
      return (
        <li key={s.section_id}>
          <button
            onClick={() => onSelect(s.section_id)}
            onMouseEnter={(e) => onPeek?.(s, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => onPeek?.(null, null)}
            onFocus={(e) => onPeek?.(s, e.currentTarget.getBoundingClientRect())}
            onBlur={() => onPeek?.(null, null)}
            aria-current={selected === s.section_id ? "true" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 text-left min-h-[60px] transition-colors ${
              selected === s.section_id ? "bg-brand-50 dark:bg-brand-500/[0.12]" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
            }`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${st.cls}`} aria-label={st.label} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-900 dark:text-white whitespace-nowrap">{s.week_number || "Week"}</span>
                {isNow && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-pill bg-brand-500 text-white">Now</span>}
                <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">{fmt(s.start_date)}</span>
              </span>
              <span className={`block text-[13px] truncate ${topic ? "text-gray-600 dark:text-gray-300" : "text-gray-400 italic"}`}>
                {topic || "No topic yet"}
              </span>
            </span>
            <span className="flex items-center gap-2 flex-shrink-0 text-[11px] text-gray-400 tabular-nums">
              {gaps > 0 && s.status !== "HIDDEN" && (
                <span className="inline-flex items-center gap-1 text-warning-700 dark:text-warning-500" title={`${gaps} planned criteri${gaps === 1 ? "on" : "a"} with no content yet`}>
                  <Circle className="w-2 h-2 fill-current" /> {gaps}
                </span>
              )}
              <span>{s.items.length}</span>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);

export default WeekList;
