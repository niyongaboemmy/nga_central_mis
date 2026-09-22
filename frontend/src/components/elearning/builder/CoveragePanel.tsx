import React, { useEffect, useState } from "react";
import { CourseCoverage, elearningApi } from "../../../api/elearning";
import { EmptyState, ProgressBar, Skeleton } from "../ui/primitives";

/**
 * Curriculum coverage, element by element: planned by the scheme → has content → live for
 * students. Shared by the builder's Curriculum tab and the admin drill-down (calm style).
 */
const CoveragePanel: React.FC<{ courseId: number; basePath?: string; onJumpToWeek?: (sectionId: number) => void; refreshKey?: number }> = ({ courseId, basePath = "/elearning/courses", onJumpToWeek, refreshKey = 0 }) => {
  const [data, setData] = useState<CourseCoverage | null | undefined>(undefined);
  useEffect(() => {
    elearningApi
      .coverage(courseId, basePath)
      .then((r) => setData(r.data.data))
      .catch(() => setData(null));
  }, [courseId, basePath, refreshKey]);

  if (data === undefined) return <Skeleton className="h-48" />;
  if (!data || data.curriculum_total === 0) return <EmptyState pose="thinking" title="No curriculum yet" body="Import or write the subject's curriculum first — the course follows it week by week." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Planned targets covered", value: `${data.coverage_pct}%`, hint: `${data.targets_covered} of ${data.targets_total} criteria the scheme planned` },
          { label: "Whole curriculum", value: `${data.curriculum_pct}%`, hint: `${data.curriculum_covered} of ${data.curriculum_total} criteria have content` },
          { label: "Weeks with gaps", value: data.sections.filter((s) => s.gaps.length > 0).length, hint: "targets without any item" },
          { label: "Weeks without a check", value: data.weeks_without_check, hint: "no quick check or quiz" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
            <p className="text-[11px] text-gray-400">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft divide-y divide-gray-100 dark:divide-gray-800">
        {data.elements.map((e) => (
          <div key={e.competency_id} className="p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">Element {e.element_number} · {e.title}</p>
              <span className="text-[11px] text-gray-500 tabular-nums">{e.covered}/{e.total} with content · {e.live} live</span>
            </div>
            <ProgressBar value={e.total ? (e.covered / e.total) * 100 : 0} className="mt-2" ariaLabel={`Element ${e.element_number}: ${e.covered} of ${e.total} criteria covered`} />
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {e.criteria.map((c) => {
                const week = data.sections.find((s) => s.targets.some((t) => t.criteria_id === c.criteria_id));
                const cls = c.live ? "bg-success-100 text-success-700" : c.covered ? "bg-brand-50 dark:bg-brand-700/20 text-brand-700 dark:text-brand-200" : c.planned ? "bg-warning-100 text-warning-700" : "bg-gray-100 dark:bg-gray-800 text-gray-400";
                const label = c.live ? "live for students" : c.covered ? "has content (not live yet)" : c.planned ? "planned in the scheme, no content" : "not in the scheme";
                return (
                  <li key={c.criteria_id}>
                    <button
                      type="button"
                      disabled={!week || !onJumpToWeek}
                      onClick={() => week && onJumpToWeek?.(week.section_id)}
                      title={`${c.criteria_number} ${c.description} — ${label}${week ? ` · ${week.title.split(" — ")[0]}` : ""}`}
                      className={`text-[11px] px-2 py-1 rounded-pill font-medium ${cls} ${week && onJumpToWeek ? "hover:shadow-glow" : "cursor-default"}`}
                    >
                      {c.criteria_number}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-3 text-[11px] text-gray-600 dark:text-gray-300" aria-label="Legend">
        <li><span className="inline-block w-3 h-3 rounded-sm bg-success-100 border border-success-500 mr-1 align-middle" />live</li>
        <li><span className="inline-block w-3 h-3 rounded-sm bg-brand-50 border border-brand-500 mr-1 align-middle" />has content</li>
        <li><span className="inline-block w-3 h-3 rounded-sm bg-warning-100 border border-warning-500 mr-1 align-middle" />planned, no content</li>
        <li><span className="inline-block w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 mr-1 align-middle" />not in the scheme</li>
      </ul>
    </div>
  );
};

export default CoveragePanel;
