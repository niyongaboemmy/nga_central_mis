import React from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import DashboardCalendarWidget from "./calendar/DashboardCalendarWidget";
import { ScheduleHeader } from "./ScheduleHeader";

interface TeacherWelcomeProps {
  onLogout?: () => void;
}

/**
 * A teacher's Schedule (`/dashboard`): a greeting and this week's
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

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScheduleHeader
          firstName={user?.profile?.first_name?.trim() || user?.user?.username}
          termName={selectedTerm?.name}
          yearName={selectedYear?.name}
          actions={
            <Link
              to="/teacher-dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Open Teacher Dashboard
            </Link>
          }
        />

        <DashboardCalendarWidget />
      </main>
    </div>
  );
};

export default TeacherWelcome;
