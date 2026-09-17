import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Users, Layers, AlertTriangle } from "lucide-react";
import AcademicCalendar from "./AcademicCalendar";
import { useScopedGrades } from "../hooks/useScopedGrades";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { usePermissions } from "../hooks/usePermissions";
import { Permissions } from "../constants/permissions";

const Notice: React.FC<{
  icon: React.ElementType;
  title: string;
  message: string;
  tone?: "neutral" | "warning";
}> = ({ icon: Icon, title, message, tone = "neutral" }) => (
  <div className="pt-4 pb-10 px-4 md:px-6">
    <div className="max-w-3xl mx-auto text-center py-16 px-6 bg-white/90 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700/30">
      <div
        className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3 ${
          tone === "warning"
            ? "bg-amber-50 dark:bg-amber-900/20"
            : "bg-blue-50 dark:bg-blue-900/20"
        }`}
      >
        <Icon
          className={`w-7 h-7 ${
            tone === "warning" ? "text-amber-500" : "text-blue-500"
          }`}
        />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {title}
      </p>
      <p className="text-xs text-gray-400 mt-1">{message}</p>
    </div>
  </div>
);

/**
 * The class teacher's own weekly timetable.
 *
 * Deliberately the same grid as the school-wide Academic Calendar rather than
 * a parallel implementation -- it lands straight on the class group the
 * signed-in teacher is assigned to instead of opening on a picker. What they
 * can actually read is decided server-side by resolveUserScope; everything
 * here is presentation and guard rails.
 */
const ClassTeacherCalendarPage: React.FC = () => {
  const scope = useScopedGrades();
  const { hasPermission } = usePermissions();
  const { selectedYear, selectedTermId, loading } = useAcademicPeriod();

  const canView =
    hasPermission(Permissions.VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE) ||
    hasPermission(Permissions.VIEW_ACADEMIC_CALENDAR) ||
    hasPermission(Permissions.MANAGE_ACADEMIC_CALENDAR);

  const subtitle = useMemo(() => {
    if (!scope.isScoped) return "Every class group in the school";
    if (scope.classGroups.length > 0) {
      return scope.classGroups.map((c) => c.name).join(", ");
    }
    if (scope.grades.length > 0) {
      return scope.grades.map((g) => g.name).join(", ");
    }
    return "";
  }, [scope]);

  if (!canView) {
    return (
      <Notice
        icon={AlertTriangle}
        tone="warning"
        title="Access denied"
        message="You don't have permission to view a class calendar."
      />
    );
  }

  // The period selector drives every calendar query; without a term there is
  // nothing to fetch, so say so instead of rendering an empty week.
  if (!loading && !selectedTermId) {
    return (
      <Notice
        icon={Layers}
        tone="warning"
        title="No academic term selected"
        message="Pick an academic year and term from the top bar to load a timetable."
      />
    );
  }

  // A class teacher assigned to nothing in the selected year would otherwise
  // sit in front of a permanently empty grid with no explanation. Program
  // leads are scoped by grade rather than class group, so they are exempt.
  if (
    scope.isScoped &&
    scope.source === "grades" &&
    scope.classGroupIds.length === 0
  ) {
    return (
      <Notice
        icon={Users}
        tone="warning"
        title="No class group assigned"
        message={`You are not assigned to a class group${
          selectedYear?.name ? ` for ${selectedYear.name}` : ""
        }. Ask an administrator to assign you as a class teacher.`}
      />
    );
  }

  // One header, not two: the grid titles itself "Class Calendar" rather than
  // this page stacking a second heading above the component's own.
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AcademicCalendar title="Class Calendar" />
      {subtitle && (
        <p className="sr-only" data-testid="class-calendar-scope">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
};

export default ClassTeacherCalendarPage;
