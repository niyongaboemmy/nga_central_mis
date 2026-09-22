import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { builderRoutes, elearningApi, MyCourseRow } from "../../../api/elearning";
import { copy } from "../copy";
import { EmptyState, ProgressBar, Skeleton, SubjectCover } from "../ui/primitives";

/** `/elearning/courses` — every course the teacher can build, one card each. */
const MyCoursesPage: React.FC = () => {
  const [rows, setRows] = useState<MyCourseRow[] | null>(null);
  useEffect(() => {
    elearningApi.myBuiltCourses().then((r) => setRows(r.data.data)).catch(() => setRows([]));
  }, []);
  return (
    <div className="pb-12">
      <h1 className="text-display text-gray-900 dark:text-white">E-Learning</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-lg">{copy.builder.setUpBody} Open a scheme of work and choose <strong>Course</strong> to set one up.</p>
      {rows === null ? (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : rows.length === 0 ? (
        <EmptyState pose="book" title="No courses yet" body="Open one of your schemes of work and click Course to build the first one." action={{ label: "Go to Scheme of Work", onClick: () => (window.location.href = "/scheme-of-work") }} />
      ) : (
        <ul className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((c) => (
            <li key={c.course_id}>
              <Link to={builderRoutes.build(c.course_id)} className="block">
                <SubjectCover name={c.subject_name} code={c.subject_code} color={c.cover_color || c.subject_color} icon={c.icon} className="border shadow-soft hover:shadow-float transition-shadow">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.subject_name}</p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">{c.class_group_name} · {c.term_name} · <span className={c.status === "PUBLISHED" ? "text-success-700 font-semibold" : "text-gray-500"}>{c.status === "PUBLISHED" ? copy.builder.published : copy.builder.draft}</span></p>
                  <ProgressBar value={c.section_count ? (c.published_sections / c.section_count) * 100 : 0} className="mt-3" ariaLabel={`${c.published_sections} of ${c.section_count} weeks live`} />
                  <p className="mt-1 text-[11px] text-gray-500 flex items-center justify-between">{c.published_sections}/{c.section_count} weeks live <ArrowRight className="w-3.5 h-3.5" /></p>
                </SubjectCover>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyCoursesPage;
