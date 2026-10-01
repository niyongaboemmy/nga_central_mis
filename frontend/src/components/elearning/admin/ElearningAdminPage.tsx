import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Search } from "lucide-react";
import { apiService } from "../../../services/api";
import { useAcademicPeriod } from "../../../contexts/AcademicPeriodContext";
import { getToken } from "../../../utils/auth";
import { API_BASE_URL } from "../../../services/api";
import InsightsTab from "../builder/InsightsTab";
import AIUsagePanel from "./AIUsagePanel";
import CoveragePanel from "../builder/CoveragePanel";
import { elearningApi } from "../../../api/elearning";
import { ProgressBar, Skeleton } from "../ui/primitives";

interface RegisterRow {
  scheme_id: number;
  scheme_validation_status: string;
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_name: string;
  grade_name: string;
  program_name: string;
  term_name: string | null;
  teacher_name: string;
  course_id: number | null;
  course_status: string | null;
  sections: number;
  published_sections: number;
  published_pct: number;
  items: number;
  coverage_pct: number;
  active_students: number;
  completed_items: number;
  last_activity_at: string | null;
}
interface Register {
  kpis: { schemes: number; courses: number; courses_live: number; approved_schemes_with_live_course_pct: number; students_active_this_week: number; median_published_pct: number; median_coverage_pct: number };
  rows: RegisterRow[];
  scoped: boolean;
}

/** `/admin/elearning` — digital-delivery register: KPI row + table + drill-down (UX plan §3.4). Calm, no mascot. */
const ElearningAdminPage: React.FC = () => {
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const [data, setData] = useState<Register | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "live" | "draft" | "none">("all");
  const [open, setOpen] = useState<RegisterRow | null>(null);

  useEffect(() => {
    setData(undefined);
    apiService
      .get("/elearning/admin/courses", { params: { academic_year_id: selectedYearId || undefined, academic_term_id: selectedTermId || undefined } })
      .then((r) => setData(r.data.data))
      .catch(() => setData(null));
  }, [selectedYearId, selectedTermId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows || []).filter((r) => {
      if (status === "live" && r.course_status !== "PUBLISHED") return false;
      if (status === "draft" && r.course_status !== "DRAFT") return false;
      if (status === "none" && r.course_id) return false;
      if (!q) return true;
      return [r.subject_name, r.class_group_name, r.grade_name, r.program_name, r.teacher_name].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [data, query, status]);

  const exportUrl = `${API_BASE_URL}/elearning/admin/courses/export.csv?academic_year_id=${selectedYearId || ""}&academic_term_id=${selectedTermId || ""}&token=${getToken() || ""}`;

  if (open) {
    return (
      <div className="pt-6 pb-12">
        <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 min-h-[40px] text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><ArrowLeft className="w-4 h-4" /> Register</button>
        <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{open.subject_name} · {open.class_group_name}</h1>
        <p className="text-sm text-gray-500">{open.program_name} · {open.grade_name} · {open.term_name} · {open.teacher_name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={`${API_BASE_URL}${elearningApi.progressReportUrl(open.course_id!)}?token=${getToken() || ""}`} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-pill text-xs text-gray-600 dark:text-gray-300 el-chip hover:bg-gray-200 dark:hover:bg-white/[0.10]"><Download className="w-3.5 h-3.5" /> Student progress report (CSV)</a>
        </div>
        <h2 className="mt-6 text-sm font-semibold text-gray-800 dark:text-gray-100">Curriculum coverage</h2>
        <div className="mt-2"><CoveragePanel courseId={open.course_id!} basePath="/elearning/admin/courses" /></div>
        <h2 className="mt-8 text-sm font-semibold text-gray-800 dark:text-gray-100">Progress</h2>
        <InsightsTab courseId={open.course_id!} basePath="/elearning/admin/courses" readOnly />
      </div>
    );
  }

  return (
    <div className="pt-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-gray-900 dark:text-white">E-Learning oversight</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Which schemes have a live course, how much is published, and who is learning.{data?.scoped ? " Showing your programmes / classes only." : ""}</p>
        </div>
        <a href={exportUrl} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill text-sm text-gray-600 dark:text-gray-300 el-chip hover:bg-gray-200 dark:hover:bg-white/[0.10]"><Download className="w-4 h-4" /> Export CSV</a>
      </div>

      {data === undefined ? (
        <div className="mt-5 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>
      ) : data === null ? (
        <p className="mt-6 text-sm text-gray-500">Couldn't load the register.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              { label: "Courses live", value: `${data.kpis.courses_live} / ${data.kpis.schemes}`, hint: "of schemes this period" },
              { label: "Approved schemes with a live course", value: `${data.kpis.approved_schemes_with_live_course_pct}%` },
              { label: "Students active this week", value: data.kpis.students_active_this_week },
              { label: "Median weeks published", value: `${data.kpis.median_published_pct}%`, hint: "across live courses" },
              { label: "Median curriculum coverage", value: `${data.kpis.median_coverage_pct}%`, hint: "planned criteria with content" },
            ].map((k) => (
              <div key={k.label} className="el-card p-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{k.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
                {k.hint && <p className="text-[11px] text-gray-400">{k.hint}</p>}
              </div>
            ))}
          </div>

          <div className="mt-5 el-card">
            <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subject, class, teacher…" className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-500" aria-label="Search register" />
              </div>
              <div className="el-segment" role="radiogroup" aria-label="Filter by course status">
                {([["all", "All"], ["live", "Live"], ["draft", "Draft"], ["none", "No course"]] as const).map(([k, label]) => (
                  <button key={k} role="radio" aria-checked={status === k} onClick={() => setStatus(k)} className={`min-h-[32px] px-3 rounded-pill text-[11px] font-semibold ${status === k ? "el-segment-on" : "text-gray-500"}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Subject · class</th>
                    <th className="px-2 py-2 hidden lg:table-cell">Teacher</th>
                    <th className="px-2 py-2 hidden md:table-cell">Scheme</th>
                    <th className="px-2 py-2">Course</th>
                    <th className="px-2 py-2 w-40">Weeks live</th>
                    <th className="px-2 py-2 hidden xl:table-cell">Items</th>
                    <th className="px-2 py-2">Curriculum</th>
                    <th className="px-2 py-2 hidden md:table-cell">Active</th>
                    <th className="px-2 py-2 hidden xl:table-cell">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nothing matches.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.scheme_id} className={`border-t border-gray-100 dark:border-white/[0.06] ${r.course_id ? "hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" : ""}`} onClick={() => r.course_id && setOpen(r)}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-8 rounded-pill flex-shrink-0" style={{ background: r.subject_color || "#94a3b8" }} aria-hidden />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{r.subject_name}</p>
                            <p className="text-[11px] text-gray-500 truncate">{r.program_name} · {r.grade_name} · {r.class_group_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-gray-700 dark:text-gray-200 whitespace-nowrap hidden lg:table-cell">{r.teacher_name || "—"}</td>
                      <td className="px-2 py-2 hidden md:table-cell"><span className={`text-[11px] px-2 py-0.5 rounded-pill font-semibold ${r.scheme_validation_status === "APPROVED" ? "el-chip-success" : r.scheme_validation_status === "REJECTED" ? "el-chip-danger" : "el-chip text-gray-500"}`}>{r.scheme_validation_status}</span></td>
                      <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-pill font-semibold ${r.course_status === "PUBLISHED" ? "el-chip-success" : r.course_status ? "el-chip-warning" : "el-chip text-gray-400"}`}>{r.course_status === "PUBLISHED" ? "Live" : r.course_status ? "Draft" : "None"}</span></td>
                      <td className="px-2 py-2"><div className="flex items-center gap-2"><ProgressBar value={r.published_pct} className="flex-1" ariaLabel={`${r.published_sections} of ${r.sections} weeks live`} /><span className="text-[11px] text-gray-500 tabular-nums w-10">{r.published_sections}/{r.sections}</span></div></td>
                      <td className="px-2 py-2 tabular-nums text-gray-700 dark:text-gray-200 hidden xl:table-cell">{r.items || "—"}</td>
                      <td className="px-2 py-2">{r.course_id ? <span className={`text-[11px] px-2 py-0.5 rounded-pill font-semibold tabular-nums ${r.coverage_pct >= 80 ? "el-chip-success" : r.coverage_pct >= 40 ? "el-chip-warning" : "el-chip text-gray-500"}`}>{r.coverage_pct}%</span> : "—"}</td>
                      <td className="px-2 py-2 tabular-nums text-gray-700 dark:text-gray-200 hidden md:table-cell">{r.active_students || "—"}</td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap hidden xl:table-cell">{r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <AIUsagePanel />
        </>
      )}
    </div>
  );
};

export default ElearningAdminPage;
