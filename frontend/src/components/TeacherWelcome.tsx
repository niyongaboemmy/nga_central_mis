import React from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import DashboardCalendarWidget from "./calendar/DashboardCalendarWidget";

interface TeacherWelcomeProps {
  onLogout?: () => void;
}

/**
 * A teacher's landing page (`/dashboard`): a greeting and this week's
 * timetable, nothing else.
 *
 * The figures that used to sit above the grid (assigned subjects, students,
 * class groups) were the only thing here that needed a second request, and
 * they answered a question nobody opens this page to ask. They now live on
 * the Teacher Dashboard (`/teacher-dashboard`) alongside the rest of the
 * teacher's day, which is what the header link points at.
 */
const TeacherWelcome: React.FC<TeacherWelcomeProps> = ({}) => {
  const { user } = useUser();
  const { selectedTerm, selectedYear } = useAcademicPeriod();

  const firstName =
    user?.profile?.first_name?.trim() || user?.user?.username || "there";

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
              {greeting}, {firstName}
            </h2>
            <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
              {todayLabel}
              {selectedTerm?.name ? ` · ${selectedTerm.name}` : ""}
              {selectedYear?.name ? ` · ${selectedYear.name}` : ""}
            </p>
          </div>

          <Link
            to="/teacher-dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            Open Teacher Dashboard
          </Link>
        </div>

        <DashboardCalendarWidget />
      </main>
    </div>
  );
};

export default TeacherWelcome;
