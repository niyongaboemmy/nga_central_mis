import React from "react";
import { useUser } from "../contexts/UserContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import DashboardCalendarWidget from "./calendar/DashboardCalendarWidget";
import { ScheduleHeader } from "./ScheduleHeader";

interface DashboardProps {
  onLogout?: () => void;
}

/**
 * Schedule (`/dashboard`) for everyone but teachers (TeacherWelcome): this week's
 * timetable under a one-line header. The welcome banner and the year / term / role
 * cards that used to sit on top repeated what the top bar already shows.
 */
const Dashboard: React.FC<DashboardProps> = ({}) => {
  const { user } = useUser();
  const { selectedTerm, selectedYear } = useAcademicPeriod();

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScheduleHeader
          firstName={user?.profile?.first_name?.trim() || user?.user?.username}
          termName={selectedTerm?.name}
          yearName={selectedYear?.name}
        />
        <DashboardCalendarWidget />
      </main>
    </div>
  );
};

export default Dashboard;
