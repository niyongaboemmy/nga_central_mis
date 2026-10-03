import React, { useEffect, useState } from "react";
import { Grid3X3 } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { apiError, DAY_SHORT, officeHoursApi, type CoverageReport } from "../../../api/officeHours";
import { Card, CardTitle, EmptyState, Muted, Spinner } from "../ohUi";
import { pct } from "../reports/exports";

/**
 * Coverage (plan §11): class group × weekday heatmap of students in office
 * hours, and -- for one class -- who has none, to target support.
 */
const shade = (n: number, max: number) => {
  if (!n) return "bg-slate-50 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400";
  const t = n / Math.max(1, max);
  if (t > 0.66) return "bg-blue-700 text-white";
  if (t > 0.33) return "bg-blue-400 text-slate-900";
  return "bg-blue-100 text-slate-900 dark:bg-blue-500/30 dark:text-slate-100";
};

const CoverageTab: React.FC<{ termId: number | null }> = ({ termId }) => {
  const { showToast } = useToast();
  const [data, setData] = useState<CoverageReport | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    officeHoursApi
      .coverage(termId, selected)
      .then((r) => setData(r.data.data))
      .catch((e) => {
        setData({ term_id: termId ?? 0, class_groups: [], students_without: [] });
        showToast(apiError(e, "Couldn't load coverage"), "error");
      });
  }, [termId, selected, showToast]);
  if (!data) return <Spinner />;
  const max = Math.max(1, ...data.class_groups.flatMap((g) => Object.values(g.days)));
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card labelledBy="oh-coverage" className="lg:col-span-3">
        <CardTitle id="oh-coverage" icon={<Grid3X3 className="h-4 w-4" aria-hidden />}>Students in office hours, by day</CardTitle>
        {data.class_groups.length === 0 ? (
          <EmptyState title="No classes in your area" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  <th scope="col" className="py-2 pr-3 text-left">Class</th>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <th key={d} scope="col" className="px-1 py-2 text-center">{DAY_SHORT[d]}</th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right">Covered</th>
                </tr>
              </thead>
              <tbody>
                {data.class_groups.map((g) => (
                  <tr key={g.class_group_id} className={selected === g.class_group_id ? "bg-blue-50/60 dark:bg-blue-500/10" : ""}>
                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-slate-900 dark:text-slate-100">
                      <button type="button" className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setSelected(g.class_group_id)} aria-pressed={selected === g.class_group_id}>
                        {g.name}
                      </button>
                    </th>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <td key={d} className="px-1 py-1">
                        <span className={`block rounded-md py-1 text-center text-xs font-semibold tabular-nums ${shade(g.days[d] ?? 0, max)}`} aria-label={`${g.name} ${DAY_SHORT[d]}: ${g.days[d] ?? 0} students`}>
                          {g.days[d] ?? 0}
                        </span>
                      </td>
                    ))}
                    <td className="py-1 pl-3 text-right text-xs tabular-nums text-slate-800 dark:text-slate-100">
                      {g.covered}/{g.students} · {pct(g.coverage_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card labelledBy="oh-without" className="lg:col-span-2">
        <CardTitle id="oh-without">Without office hours</CardTitle>
        {!selected ? (
          <Muted>Choose a class to see which students have no office hours this term.</Muted>
        ) : data.students_without.length === 0 ? (
          <Muted>Every student in this class has office hours (or your access hides names).</Muted>
        ) : (
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-slate-800">
            {data.students_without.map((s) => (
              <li key={s.student_id} className="py-1.5 text-slate-800 dark:text-slate-100">{s.name}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default CoverageTab;
