import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, GraduationCap } from "lucide-react";
import { learnerRoutes } from "../../../api/elearning";
import type { StudentNotePlacement } from "../../../api/lessonNotes";

/**
 * Shown when a student opens a course note outside its course (a bookmark, a link a
 * classmate sent, "Just read the note"): reading here earns nothing, so say where it
 * counts and take them there in one tap. Says "done" instead when it already is.
 */
const CourseLinkBanner: React.FC<{ placement: StudentNotePlacement | null | undefined }> = ({ placement }) => {
  if (!placement) return null;
  const week = placement.section_title.split(" — ")[0];
  const done = placement.progress === "COMPLETED";
  return (
    <div
      data-testid="course-link-banner"
      className={`mx-auto max-w-3xl mt-4 mb-1 px-4 print:hidden`}
    >
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
          done
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-400/10"
            : "border-blue-200 bg-blue-50 dark:border-blue-400/25 dark:bg-blue-400/10"
        }`}
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <GraduationCap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-300" aria-hidden />
        )}
        <p className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">
          {done ? (
            <>
              You finished this in <span className="font-semibold">{week}</span> of {placement.course_title}.
            </>
          ) : (
            <>
              Part of <span className="font-semibold">{week}</span> in {placement.course_title} — open it there so it
              counts towards your progress.
            </>
          )}
        </p>
        <Link
          to={learnerRoutes.item(placement.course_id, placement.item_id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            done
              ? "text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-400/15"
              : "bg-blue-600 text-white hover:bg-blue-500"
          }`}
        >
          {done ? "Go to the week" : "Open in my course"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
};

export default CourseLinkBanner;
