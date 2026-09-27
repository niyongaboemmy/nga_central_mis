import React, { useState, useCallback, useRef } from "react";
import { BarChart2, BookCheck, Users } from "lucide-react";
import ReportingDashboard from "./ReportingDashboard";
import LessonReportingCalendar from "./LessonReportingCalendar";
import MentoringHub from "./MentoringHub";
import MentorshipDashboardWidgets from "./MentorshipDashboardWidgets";
import { reportsApi } from "../../api/reports";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useUser } from "../../contexts/UserContext";

// Phase 5 (decommission legacy InstructorReport flow): the "Reporting"
// calendar/form tab and "Submitted Reports" tab (ReportingCalendar,
// ReportForm, SubmittedReports) are removed from active navigation here.
// Audit before removing (2026-07-30): mentorship logging already has its
// own fully decoupled entry point (MentoringHub.tsx / mentorshipController.ts,
// a completely separate flow from ReportForm.tsx, which has zero
// mentorship-related fields). Project updates have no active write path
// anywhere in the codebase today (only admin read-views + orphaned
// pre-migration-035 historical rows) — removing ReportForm.tsx does not
// remove a live capability there, since one didn't exist. The legacy
// components themselves are intentionally left on disk (not deleted) per
// the Phase 5 rollback plan — a git revert of this change restores the tabs.
const ReportingModule: React.FC = () => {
  // `?tab=` lets other pages (Home) open a specific tab directly.
  const [activeTab, setActiveTab] = useState<
    "lesson-reports" | "mentoring" | "dashboard"
  >(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "mentoring" || tab === "dashboard" ? tab : "lesson-reports";
  });
  const [dashboardSubTab, setDashboardSubTab] = useState<"lesson" | "mentorship">("lesson");

  const {
    selectedYearId: currentYearId,
    selectedTermId: currentTermId,
    selectedTerm,
  } = useAcademicPeriod();
  const { user } = useUser();
  const instructorName = user?.profile?.first_name && user?.profile?.last_name
    ? `${user.profile.first_name} ${user.profile.last_name}`
    : user?.user?.username ?? "";

  // Lifted state for the instructor's own Dashboard tab
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const lastDashboardKey = useRef<string | null>(null);

  const loadDashboardStats = useCallback(
    async (params?: { start_date?: string; end_date?: string }) => {
      const paramKey = `${JSON.stringify(params || "default")}-${currentYearId ?? "all"}-${currentTermId ?? "all"}`;
      if (lastDashboardKey.current === paramKey) return;

      setStatsLoading(true);
      lastDashboardKey.current = paramKey;

      try {
        const res = await reportsApi.getDashboardStats({
          ...params,
          academic_year_id: currentYearId ?? undefined,
          academic_term_id: currentTermId ?? undefined,
        });
        setDashboardStats((res as any).data?.data || (res as any).data);
      } catch (error) {
        console.error("Failed to load dashboard stats", error);
        lastDashboardKey.current = null;
      } finally {
        setStatsLoading(false);
      }
    },
    [currentYearId, currentTermId],
  );

  const tabs = [
    {
      id: "lesson-reports",
      label: "Lesson Reports",
      icon: <BookCheck className="w-4 h-4" />,
    },
    {
      id: "mentoring",
      label: "Mentoring",
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <BarChart2 className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex flex-col h-full space-y-3 animate-in fade-in duration-500 p-3 md:p-6">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-0 bg-white dark:bg-gray-800/30 p-1 rounded-full border border-gray-100 dark:border-gray-700/20 w-fit text-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-full transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-blue-200 dark:shadow-none"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-[600px]">
        {activeTab === "lesson-reports" && (
          <div className="bg-white dark:bg-gray-800/30 rounded-3xl p-6 border-gray-100 dark:border-gray-700/20 h-full">
            <LessonReportingCalendar
              academicTermId={currentTermId}
              termStartDate={selectedTerm?.start_date ?? null}
              termEndDate={selectedTerm?.end_date ?? null}
            />
          </div>
        )}

        {activeTab === "mentoring" && (
          <div className="bg-white dark:bg-gray-800/30 rounded-3xl p-6 border-gray-100 dark:border-gray-700/20 h-full">
            <MentoringHub />
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="h-full space-y-4">
            <div className="flex p-1 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm w-fit">
              {(
                [
                  { id: "lesson", label: "Lesson", icon: <BookCheck className="w-3.5 h-3.5" /> },
                  { id: "mentorship", label: "Mentorship", icon: <Users className="w-3.5 h-3.5" /> },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDashboardSubTab(tab.id)}
                  aria-pressed={dashboardSubTab === tab.id}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 ${
                    dashboardSubTab === tab.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {dashboardSubTab === "lesson" ? (
              <ReportingDashboard
                stats={dashboardStats}
                loading={statsLoading}
                onLoad={loadDashboardStats}
                academicTermId={currentTermId}
                academicTermName={selectedTerm?.name ?? ""}
                instructorName={instructorName}
              />
            ) : (
              <MentorshipDashboardWidgets />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportingModule;
