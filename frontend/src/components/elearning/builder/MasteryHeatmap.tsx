import React, { useEffect, useState } from "react";
import { apiService } from "../../../services/api";
import { EmptyState, Skeleton } from "../ui/primitives";

interface Column {
  criteria_id: number;
  criteria_number: string;
  description: string;
  competency_id: number;
  aligned_items: number;
  covered_pct: number;
  demonstrated_pct: number;
}
interface Matrix {
  criteria_total: number;
  unaligned_criteria: number;
  elements: { competency_id: number; element_number: number; title: string; criteria: { criteria_id: number; criteria_number: string; description: string }[] }[];
  columns: Column[];
  students: { user_id: number; name: string; states: Record<number, "NOT_COVERED" | "COVERED" | "DEMONSTRATED">; covered: number; demonstrated: number }[];
}

// Sequential single-hue steps (light → dark) for magnitude, plus a neutral for "not covered".
const CELL: Record<string, { cls: string; label: string; glyph: string }> = {
  NOT_COVERED: { cls: "el-chip text-gray-400", label: "Not yet", glyph: "·" },
  COVERED: { cls: "bg-brand-100 text-brand-700", label: "Covered", glyph: "○" },
  DEMONSTRATED: { cls: "bg-brand-600 text-white", label: "Shown", glyph: "●" },
};

/** Class × criteria heat-map (plan Phase 4). Calm admin style: no mascot, glyph + colour, table semantics. */
const MasteryHeatmap: React.FC<{ courseId: number; basePath?: string }> = ({ courseId, basePath = "/elearning/courses" }) => {
  const [data, setData] = useState<Matrix | null | undefined>(undefined);
  useEffect(() => {
    apiService
      .get(`${basePath}/${courseId}/mastery`)
      .then((r) => setData(r.data.data))
      .catch(() => setData(null));
  }, [courseId, basePath]);

  if (data === undefined) return <Skeleton className="h-64" />;
  if (!data || data.criteria_total === 0) return <EmptyState pose="thinking" title="No curriculum criteria yet" body="Add the subject's curriculum and align items to it to see mastery." />;

  return (
    <div className="el-card">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100 dark:border-white/[0.06]">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mastery per criterion</h3>
        <span className="text-[11px] text-gray-500">{data.criteria_total} criteria{data.unaligned_criteria ? ` · ${data.unaligned_criteria} with no aligned item yet` : ""}</span>
        <span className="flex-1" />
        <ul className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300" aria-label="Legend">
          {Object.entries(CELL).map(([k, v]) => (
            <li key={k} className="inline-flex items-center gap-1"><span className={`w-4 h-4 rounded text-[10px] flex items-center justify-center ${v.cls}`} aria-hidden>{v.glyph}</span>{v.label}</li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0.5 p-2">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white dark:bg-[#0c1117] text-left px-2 py-1 text-gray-500 font-medium min-w-[140px]">Student</th>
              {data.elements.map((e) => (
                <th key={e.competency_id} colSpan={e.criteria.length} className="px-2 py-1 text-gray-600 dark:text-gray-300 font-semibold text-left truncate max-w-[220px]" title={e.title}>
                  E{e.element_number} · {e.title}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 bg-white dark:bg-[#0c1117] text-left px-2 py-1 text-gray-400 font-medium">class %</th>
              {data.columns.map((c) => (
                <th key={c.criteria_id} className="px-1 py-1 text-gray-500 font-medium tabular-nums text-center" title={`${c.criteria_number} ${c.description} — covered ${c.covered_pct}%, shown ${c.demonstrated_pct}%`}>
                  <span className="block">{c.criteria_number}</span>
                  <span className="block text-[10px] text-gray-400">{c.covered_pct}%</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.user_id}>
                <th scope="row" className="sticky left-0 bg-white dark:bg-[#0c1117] text-left px-2 py-1 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">
                  {s.name} <span className="text-gray-400 font-normal tabular-nums">{s.demonstrated}/{data.criteria_total}</span>
                </th>
                {data.columns.map((c) => {
                  const st = s.states[c.criteria_id] || "NOT_COVERED";
                  return (
                    <td key={c.criteria_id} className="p-0">
                      <span className={`flex items-center justify-center w-8 h-7 rounded-md ${CELL[st].cls}`} title={`${s.name} · ${c.criteria_number}: ${CELL[st].label}`} aria-label={`${c.criteria_number} ${CELL[st].label}`}>
                        {CELL[st].glyph}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MasteryHeatmap;
