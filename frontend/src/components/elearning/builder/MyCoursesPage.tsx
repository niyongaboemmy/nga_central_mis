import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Wand2 } from "lucide-react";
import {
  builderRoutes,
  elearningApi,
  MyCourseRow,
  MySchemeRow,
} from "../../../api/elearning";
import { useAcademicPeriod } from "../../../contexts/AcademicPeriodContext";
import { useToast } from "../../../contexts/ToastContext";
import { copy } from "../copy";
import Mascot from "../ui/Mascot";
import {
  EmptyState,
  ProgressBar,
  Skeleton,
  SubjectCover,
} from "../ui/primitives";

/**
 * `/elearning/courses` — the teacher's courses, plus every scheme of theirs that has no course
 * yet with a one-click "Set up course" — the page is the starting point, not a detour.
 */
const MyCoursesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedYearId } = useAcademicPeriod();
  const [rows, setRows] = useState<MyCourseRow[] | null>(null);
  const [schemes, setSchemes] = useState<MySchemeRow[] | null>(null);
  const [creating, setCreating] = useState<number | null>(null);

  const load = () => {
    elearningApi
      .myBuiltCourses()
      .then((r) => setRows(r.data.data))
      .catch(() => setRows([]));
    elearningApi
      .mySchemes(selectedYearId)
      .then((r) => setSchemes(r.data.data))
      .catch(() => setSchemes([]));
  };
  useEffect(load, [selectedYearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setUp = async (scheme: MySchemeRow) => {
    setCreating(scheme.scheme_id);
    try {
      const r = await elearningApi.createFromScheme(scheme.scheme_id);
      navigate(builderRoutes.build(r.data.data.course.course_id));
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.generic, "error");
      setCreating(null);
    }
  };

  const pending = (schemes || []).filter((s) => !s.course_id);
  const loading = rows === null || schemes === null;

  return (
    <div className="pt-6 pb-12">
      <h1 className="text-display text-gray-900 dark:text-white">E-Learning</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
        {copy.builder.setUpBody}
      </p>

      {loading ? (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {rows.length > 0 && (
            <section className="mt-6">
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                Your courses
              </h2>
              <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map((c) => (
                  <li key={c.course_id}>
                    <Link
                      to={builderRoutes.build(c.course_id)}
                      className="block"
                    >
                      <SubjectCover
                        name={c.subject_name}
                        code={c.subject_code}
                        color={c.cover_color || c.subject_color}
                        icon={c.icon}
                        className="border shadow-soft hover:shadow-float transition-shadow"
                      >
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {c.subject_name}
                        </p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300">
                          {c.class_group_name} · {c.term_name} ·{" "}
                          <span
                            className={
                              c.status === "PUBLISHED"
                                ? "text-success-700 dark:text-success-500 font-semibold"
                                : "text-gray-500"
                            }
                          >
                            {c.status === "PUBLISHED"
                              ? copy.builder.published
                              : copy.builder.draft}
                          </span>
                        </p>
                        <ProgressBar
                          value={
                            c.section_count
                              ? (c.published_sections / c.section_count) * 100
                              : 0
                          }
                          className="mt-3"
                          ariaLabel={`${c.published_sections} of ${c.section_count} weeks live`}
                        />
                        <p className="mt-1 text-[11px] text-gray-500 flex items-center justify-between">
                          {c.published_sections}/{c.section_count} weeks live{" "}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </p>
                      </SubjectCover>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pending.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                {rows.length
                  ? "Schemes without a course yet"
                  : "Start from one of your schemes of work"}
              </h2>
              <ul className="mt-3 space-y-2">
                {pending.map((s) => (
                  <li
                    key={s.scheme_id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 el-card"
                  >
                    <span
                      className="w-2 h-10 rounded-pill flex-shrink-0 hidden sm:block"
                      style={{ background: s.subject_color || "#3b6cff" }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {s.subject_name}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {s.class_group_name} · {s.term_name} · {s.entries} week
                        {s.entries === 1 ? "" : "s"}
                        {s.validation_status !== "APPROVED" && (
                          <span className="ml-1 text-warning-700 dark:text-warning-500">
                            · scheme {s.validation_status.toLowerCase()}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => setUp(s)}
                      disabled={creating !== null || s.entries === 0}
                      title={
                        s.entries === 0
                          ? "Add weekly entries to this scheme first"
                          : copy.builder.setUpBody
                      }
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-50"
                    >
                      {creating === s.scheme_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}{" "}
                      {copy.builder.setUp}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rows.length === 0 && pending.length === 0 && (
            <EmptyState
              pose="book"
              title="No scheme of work for this year yet"
              body="A course is built on a scheme of work. Create your scheme first and come back — the weeks will be waiting."
              action={{
                label: "Go to Scheme of Work",
                onClick: () => navigate("/scheme-of-work"),
              }}
            />
          )}
          {rows.length === 0 && pending.length > 0 && (
            <div className="mt-8 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <Mascot pose="hello" size={40} /> Pick a scheme above — its weeks
              arrive pre-filled with your notes and materials.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyCoursesPage;
