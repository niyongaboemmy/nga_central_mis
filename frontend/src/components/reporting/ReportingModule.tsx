import React, { useState, useEffect, useRef, useCallback } from "react";
import { Calendar, FileText, BarChart2, BookCheck, Users } from "lucide-react";
import ReportingCalendar from "./ReportingCalendar";
import SubmittedReports from "./SubmittedReports";
import ReportingDashboard from "./ReportingDashboard";
import ReportForm from "./ReportForm";
import ReportDetailsModal from "./ReportDetailsModal";
import LessonReportingCalendar from "./LessonReportingCalendar";
import MentoringHub from "./MentoringHub";
import { reportsApi } from "../../api/reports";
import { academicTermsApi } from "../../api/academics";
import { format, startOfMonth, endOfMonth } from "date-fns";

const ReportingModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "calendar" | "lesson-reports" | "mentoring" | "submitted" | "dashboard"
  >("calendar");

  const [currentTermId, setCurrentTermId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reportedDates, setReportedDates] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const calendarHasFetched = useRef<string | null>(null);

  // Lifted states for Submitted Reports
  const [submittedReports, setSubmittedReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const lastReportsKey = useRef<string | null>(null);

  // Lifted states for Dashboard
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const lastDashboardKey = useRef<string | null>(null);

  // Resolve current academic term once on mount
  useEffect(() => {
    academicTermsApi.getAll().then((res: any) => {
      const terms: any[] = (res as any).data?.data ?? (res as any).data ?? [];
      const current = Array.isArray(terms) ? terms.find((t: any) => t.is_current) : null;
      if (current) setCurrentTermId(current.academic_term_id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMonthReports();
  }, [currentDate]);

  const fetchMonthReports = async (force = false) => {
    // Basic guard to prevent double execution in Strict Mode on initial mount
    // or if already loading for the same period.
    const periodKey = format(currentDate, "yyyy-MM");
    if (!force && calendarHasFetched.current === periodKey) return;

    setCalendarLoading(true);
    calendarHasFetched.current = periodKey;

    try {
      const start = format(startOfMonth(currentDate), "yyyy-MM-dd");
      const end = format(endOfMonth(currentDate), "yyyy-MM-dd");
      const response = await reportsApi.getAll({
        start_date: start,
        end_date: end,
      });
      if (response.data.success) {
        setReportedDates(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch reports", error);
      calendarHasFetched.current = null;
    } finally {
      setCalendarLoading(false);
    }
  };

  const loadSubmittedReports = useCallback(
    async (params?: { start_date?: string; end_date?: string; key: string }) => {
      if (params?.key && lastReportsKey.current === params.key) return;

      setReportsLoading(true);
      if (params?.key) lastReportsKey.current = params.key;

      try {
        const res = await reportsApi.getAll(
          params?.start_date && params?.end_date
            ? { start_date: params.start_date, end_date: params.end_date }
            : undefined,
        );
        const data = (res as any).data?.data || (res as any).data || [];
        setSubmittedReports(data);
      } catch (error) {
        console.error("Failed to load submitted reports", error);
        lastReportsKey.current = null;
      } finally {
        setReportsLoading(false);
      }
    },
    [],
  );

  const loadDashboardStats = useCallback(
    async (params?: { start_date?: string; end_date?: string }) => {
      const paramKey = JSON.stringify(params || "default");
      if (lastDashboardKey.current === paramKey) return;

      setStatsLoading(true);
      lastDashboardKey.current = paramKey;

      try {
        const res = await reportsApi.getDashboardStats(params);
        setDashboardStats((res as any).data?.data || (res as any).data);
      } catch (error) {
        console.error("Failed to load dashboard stats", error);
        lastDashboardKey.current = null;
      } finally {
        setStatsLoading(false);
      }
    },
    [],
  );

  const handleDateClick = (
    start: string,
    end: string,
    existingReport?: any,
  ) => {
    setSelectedDateRange({ start, end });
    setSelectedReport(existingReport || null);
    if (existingReport) {
      setShowDetails(true);
    } else {
      setShowForm(true);
    }
  };

  const handleEdit = () => {
    setShowDetails(false);
    setShowForm(true);
  };

  const tabs = [
    {
      id: "calendar",
      label: "Reporting",
      icon: <Calendar className="w-4 h-4" />,
    },
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
      id: "submitted",
      label: "Submitted Reports",
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <BarChart2 className="w-4 h-4" />,
    },
  ];

  return (
    <>
      <div className="flex flex-col h-full space-y-3 animate-in fade-in duration-500 p-3 md:p-6">
        {/* Header & Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-0 bg-white dark:bg-gray-900 p-1 rounded-full border border-gray-100 dark:border-gray-800 w-fit text-sm">
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
          {activeTab === "calendar" && (
            <div className="bg-white dark:bg-gray-900/80 rounded-3xl p-6 border-gray-100 dark:border-gray-700 h-full">
              <ReportingCalendar
                onDateClick={handleDateClick}
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                reportedDates={reportedDates}
                loading={calendarLoading}
              />
            </div>
          )}

          {activeTab === "lesson-reports" && (
            <div className="bg-white dark:bg-gray-900/80 rounded-3xl p-6 border-gray-100 dark:border-gray-700 h-full">
              <LessonReportingCalendar academicTermId={currentTermId} />
            </div>
          )}

          {activeTab === "mentoring" && (
            <div className="bg-white dark:bg-gray-900/80 rounded-3xl p-6 border-gray-100 dark:border-gray-700 h-full">
              <MentoringHub academicTermId={currentTermId} />
            </div>
          )}

          {activeTab === "submitted" && (
            <div className="bg-white dark:bg-gray-900/80 rounded-3xl p-6 border-gray-100 dark:border-gray-700 h-full">
              <SubmittedReports
                reports={submittedReports}
                loading={reportsLoading}
                onLoad={loadSubmittedReports}
                onViewDetails={(report) => {
                  setSelectedReport(report);
                  setShowDetails(true);
                }}
              />
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="h-full">
              <ReportingDashboard
                stats={dashboardStats}
                loading={statsLoading}
                onLoad={loadDashboardStats}
              />
            </div>
          )}
        </div>

        {/* Full Screen Form Modal */}
        {showForm && (
          <div className="fixed -top-3 inset-0 z-[100] bg-gray-50 dark:bg-black overflow-y-auto animate-in slide-in-from-bottom duration-500">
            <ReportForm
              onClose={() => {
                setShowForm(false);
                setSelectedReport(null);
                fetchMonthReports(true);
                // Also force refresh for lists and dashboard
                lastReportsKey.current = null;
                lastDashboardKey.current = null;
              }}
              initialRange={selectedDateRange}
              existingReport={selectedReport}
            />
          </div>
        )}
      </div>
      {showDetails && selectedReport && (
        <ReportDetailsModal
          reportId={selectedReport.report_id}
          onClose={() => {
            setShowDetails(false);
            setSelectedReport(null);
          }}
          onEdit={handleEdit}
        />
      )}
    </>
  );
};

export default ReportingModule;
