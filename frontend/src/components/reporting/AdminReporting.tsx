import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  BookOpen,
  BarChart2,
  UserX,
  Filter,
  RefreshCw,
  Calendar as CalendarIcon,
  Users,
  MoreHorizontal,
  X,
  RotateCcw,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import {
  reportsApi,
  InstructorReport,
  AdminDashboardStats,
  InstructorCompliance,
  AdminLessonReport,
  AdminMentorshipLog,
  SubjectCoverageItem,
  CategorySummaryItem,
  ValidationStatus,
} from "../../api/reports";
import { useMetadata } from "../../contexts/MetadataContext";
import { useUser } from "../../contexts/UserContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import { Grade, Subject, ClassGroup, subjectsApi, classGroupsApi } from "../../api/academics";
import { LessonReportsPanel, MentorshipLogsPanel } from "./AdminReportList";
import AdminReportDashboard from "./AdminReportDashboard";
import AdminMissingReports from "./AdminMissingReports";
import ReportDetailsModal from "./ReportDetailsModal";
import AdminMentoringLogView from "./AdminMentoringLogView";
import AdminMentorAssignments from "./AdminMentorAssignments";
import AdminMentorshipDashboard from "./AdminMentorshipDashboard";
import { Permissions } from "../../constants/permissions";

type MainTab = "lesson" | "mentorship" | "dashboard" | "missing" | "mentoring-log" | "mentorship-dashboard" | "mentor-assignments";
type PresetType = "today" | "week" | "month" | "all" | "custom";

const AdminReporting: React.FC = () => {
  // `?tab=` lets other pages (Home) open a specific tab directly.
  const [activeTab,      setActiveTab]      = useState<MainTab>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const known: MainTab[] = ["lesson", "mentorship", "dashboard", "missing", "mentoring-log", "mentorship-dashboard"];
    return known.includes(tab as MainTab) ? (tab as MainTab) : "lesson";
  });

  // Data states
  const [reports,         setReports]         = useState<InstructorReport[]>([]);
  const [missingReports,  setMissingReports]  = useState<any[]>([]);
  const [adminStats,      setAdminStats]      = useState<AdminDashboardStats | null>(null);
  const [complianceData,  setComplianceData]  = useState<InstructorCompliance[]>([]);
  const [lessonLogs,      setLessonLogs]      = useState<AdminLessonReport[]>([]);
  const [mentorshipLogs,  setMentorshipLogs]  = useState<AdminMentorshipLog[]>([]);
  const [subjectCoverage, setSubjectCoverage] = useState<SubjectCoverageItem[]>([]);
  const [supportRequestSummary, setSupportRequestSummary] = useState<CategorySummaryItem[]>([]);
  const [challengeSummary,      setChallengeSummary]      = useState<CategorySummaryItem[]>([]);

  const [loading,    setLoading]    = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const [availableGrades, setAvailableGrades] = useState<Grade[]>([]);
  const [allSubjects,     setAllSubjects]     = useState<Subject[]>([]);
  const [allClassGroups,  setAllClassGroups]  = useState<ClassGroup[]>([]);

  const [activePreset, setActivePreset] = useState<PresetType>("month");
  const [dateRange,    setDateRange]    = useState({ start: "", end: "" });
  const [filters,      setFilters]      = useState({
    program_id:        "",
    grade_id:          "",
    subject_id:        "",
    class_group_id:    "",
  });

  const { user }                   = useUser();
  const { showToast }              = useToast();
  const { programs, getGrades }    = useMetadata();
  const { selectedYearId, selectedTermId, selectedYear, selectedTerm } =
    useAcademicPeriod();
  const initializedRef             = useRef(false);
  const lastFetchKey               = useRef<string | null>(null);

  // ── Tab overflow ("More ▾") ─────────────────────────────────────────────
  // Tabs no longer wrap onto a second row; once they stop fitting on one
  // line, the trailing ones collapse behind a "More" button with a dropdown.
  // Widths are measured off-screen (same markup/classes as the real tabs) so
  // the cutoff tracks font/zoom/viewport changes via ResizeObserver instead
  // of a hardcoded breakpoint-based tab count.
  const tabsRowRef      = useRef<HTMLDivElement>(null);
  const measureRowRef   = useRef<HTMLDivElement>(null);
  const moreMeasureRef  = useRef<HTMLButtonElement>(null);
  const moreMenuRef     = useRef<HTMLDivElement>(null);
  const [visibleTabCount, setVisibleTabCount] = useState<number>(Infinity);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // ── Preset → date range ────────────────────────────────────────────────────
  useEffect(() => {
    if (activePreset !== "custom") {
      const now = new Date();
      let start = "";
      let end   = "";
      switch (activePreset) {
        case "today":
          start = format(startOfDay(now), "yyyy-MM-dd");
          end   = format(endOfDay(now), "yyyy-MM-dd");
          break;
        case "week":
          start = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
          end   = format(endOfWeek(now,   { weekStartsOn: 1 }), "yyyy-MM-dd");
          break;
        case "month":
          start = format(startOfMonth(now), "yyyy-MM-dd");
          end   = format(endOfMonth(now),   "yyyy-MM-dd");
          break;
        case "all":
          start = "";
          end   = "";
          break;
      }
      setDateRange({ start, end });
    }
  }, [activePreset]);

  // ── Default filters from user profile (program/grade only — the academic
  // year/term are governed by the global academic period selector) ─────────
  useEffect(() => {
    if (user && !initializedRef.current && programs.length > 0) {
      const defaultProgId  = user.assignedPrograms?.[0]?.program_id?.toString() ?? "";
      const defaultGradeId = user.assignedGrades?.[0]?.grade_id?.toString() ?? "";
      setFilters((prev) => ({
        ...prev,
        program_id: defaultProgId,
        grade_id:   defaultGradeId,
      }));
      initializedRef.current = true;
    }
  }, [user, programs]);

  // ── Main data load ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const params = {
      start_date:       dateRange.start || undefined,
      end_date:         dateRange.end   || undefined,
      academic_year_id: selectedYearId ?? undefined,
      academic_term_id: selectedTermId ?? undefined,
      program_id:       filters.program_id        ? parseInt(filters.program_id)       : undefined,
      grade_id:         filters.grade_id          ? parseInt(filters.grade_id)         : undefined,
      subject_id:       filters.subject_id        ? parseInt(filters.subject_id)       : undefined,
      class_group_id:   filters.class_group_id    ? parseInt(filters.class_group_id)   : undefined,
    };

    const fetchKey = JSON.stringify({ ...params, activeTab });
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;

    // Mentoring log / Mentor Assignments tabs are self-contained — no heavy fetch needed here
    if (activeTab === "mentoring-log" || activeTab === "mentor-assignments" || activeTab === "mentorship-dashboard") return;

    setLoading(true);
    try {
      if (activeTab === "missing") {
        if (!params.start_date || !params.end_date) { setMissingReports([]); return; }
        const res  = await reportsApi.getMissingAdminReports(params as any);
        setMissingReports((res as any).data?.data ?? (res as any).data ?? []);
        return;
      }

      if (activeTab === "mentorship") {
        const r = await reportsApi.getAdminMentorshipLogs({
          start_date:     params.start_date,
          end_date:       params.end_date,
          subject_id:     params.subject_id,
          class_group_id: params.class_group_id,
          program_id:     params.program_id,
          grade_id:       params.grade_id,
        });
        setMentorshipLogs((r as any).data?.data ?? []);
        return;
      }

      // "lesson" + "dashboard" both need the weekly reports list fresh
      const reportsRes = await reportsApi.getAllAdminReports(params);
      setReports((reportsRes as any).data?.data ?? (reportsRes as any).data ?? []);

      if (activeTab === "dashboard") {
        // Fetch aggregated stats, compliance, subject coverage, and the
        // categorized Support Needed / Challenges rankings, in parallel
        const [statsRes, complianceRes, coverageRes, supportRes, challengeRes] = await Promise.all([
          reportsApi.getAdminDashboardStats({
            start_date:       params.start_date,
            end_date:         params.end_date,
            academic_term_id: params.academic_term_id,
            subject_id:       params.subject_id,
            class_group_id:   params.class_group_id,
          }),
          params.start_date && params.end_date
            ? reportsApi.getComplianceReport({
                start_date:       params.start_date,
                end_date:         params.end_date,
                academic_term_id: params.academic_term_id,
                subject_id:       params.subject_id,
                class_group_id:   params.class_group_id,
              })
            : Promise.resolve(null),
          reportsApi.getSubjectCoverage({
            academic_term_id: params.academic_term_id,
            start_date:       params.start_date,
            end_date:         params.end_date,
            subject_id:       params.subject_id,
            class_group_id:   params.class_group_id,
          }),
          reportsApi.getSupportRequestSummary({
            start_date:     params.start_date,
            end_date:       params.end_date,
            subject_id:     params.subject_id,
            class_group_id: params.class_group_id,
          }),
          reportsApi.getChallengeSummary({
            start_date:     params.start_date,
            end_date:       params.end_date,
            subject_id:     params.subject_id,
            class_group_id: params.class_group_id,
          }),
        ]);
        setAdminStats((statsRes as any).data?.data ?? null);
        setComplianceData((complianceRes as any)?.data?.data ?? []);
        setSubjectCoverage((coverageRes as any).data?.data ?? []);
        setSupportRequestSummary((supportRes as any).data?.data ?? []);
        setChallengeSummary((challengeRes as any).data?.data ?? []);
      }

      if (activeTab === "lesson") {
        const r = await reportsApi.getAdminLessonReports({
          start_date:     params.start_date,
          end_date:       params.end_date,
          subject_id:     params.subject_id,
          class_group_id: params.class_group_id,
          program_id:     params.program_id,
          grade_id:       params.grade_id,
        });
        setLessonLogs((r as any).data?.data ?? []);
      }
    } catch (err) {
      console.error("Failed to load admin reporting data", err);
      lastFetchKey.current = null;
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters, selectedYearId, selectedTermId, activeTab]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset fetch key so switching tabs always refetches
  const handleTabChange = (tab: MainTab) => {
    lastFetchKey.current = null;
    setActiveTab(tab);
  };

  const canApproveReports = Boolean(
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.MANAGE_REPORTS || perm.name === Permissions.ALL_SUBMITTED_REPORTS || perm.name === Permissions.ADMIN,
      ),
    ),
  );

  const handleApproveLesson = async (id: number, validation_status: ValidationStatus, validation_comment?: string) => {
    try {
      await reportsApi.adminUpdateLessonReportApproval(id, { validation_status, validation_comment });
      setLessonLogs((prev) => prev.map((l) => (l.lesson_report_id === id ? { ...l, validation_status, validation_comment: validation_comment ?? null } : l)));
      showToast(validation_status === "APPROVED" ? "Lesson report approved" : validation_status === "REJECTED" ? "Lesson report rejected" : "Lesson report updated", "success");
    } catch {
      showToast("Failed to update lesson report", "error");
    }
  };

  const handleApproveMentorship = async (id: number, validation_status: ValidationStatus, validation_comment?: string) => {
    try {
      await reportsApi.adminUpdateMentorshipSessionApproval(id, { validation_status, validation_comment });
      setMentorshipLogs((prev) => prev.map((l) => (l.mentorship_id === id ? { ...l, validation_status, validation_comment: validation_comment ?? null } : l)));
      showToast(validation_status === "APPROVED" ? "Mentorship log approved" : validation_status === "REJECTED" ? "Mentorship log rejected" : "Mentorship log updated", "success");
    } catch {
      showToast("Failed to update mentorship log", "error");
    }
  };

  // ── Cascade filter resets ──────────────────────────────────────────────────
  useEffect(() => {
    if (filters.program_id) getGrades(parseInt(filters.program_id)).then(setAvailableGrades);
    else setAvailableGrades([]);
  }, [filters.program_id, getGrades]);

  // Subject / class-group filter option lists — loaded once, independent of
  // the program/grade cascade (a subject or class group can span programs).
  useEffect(() => {
    subjectsApi.getAll().then((res: any) => setAllSubjects(res.data?.data ?? res.data ?? [])).catch(() => setAllSubjects([]));
    classGroupsApi.getAll().then((res: any) => setAllClassGroups(res.data?.data ?? res.data ?? [])).catch(() => setAllClassGroups([]));
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "program_id") next.grade_id = "";
      return next;
    });
    lastFetchKey.current = null;
  };

  const handleResetFilters = () => {
    setFilters({ program_id: "", grade_id: "", subject_id: "", class_group_id: "" });
    setActivePreset("month");
    lastFetchKey.current = null;
  };

  const activeFilterCount =
    [filters.program_id, filters.grade_id, filters.subject_id, filters.class_group_id].filter(Boolean).length +
    (activePreset !== "month" ? 1 : 0);

  const handleApplyFilters = () => {
    lastFetchKey.current = null;
    loadData();
    setShowFiltersModal(false);
  };

  const canManageMentorAssignments = Boolean(
    user?.roles?.some((role) =>
      role.permissions?.some(
        (perm) => perm.name === Permissions.MANAGE_MENTOR_ASSIGNMENTS || perm.name === Permissions.ADMIN,
      ),
    ),
  );

  // Color language: the two primary report streams (Lesson/Mentorship) each
  // get a distinct accent that carries through their whole tab (badges,
  // buttons, export modal); every auxiliary/tool tab shares one neutral
  // accent so it doesn't compete with — or get confused for — either stream.
  const mainTabs = [
    { id: "lesson"        as MainTab, label: "Lesson",              icon: <BookOpen className="w-4 h-4" />, accent: "blue"    as const },
    { id: "mentorship"    as MainTab, label: "Mentorship",          icon: <Users    className="w-4 h-4" />, accent: "emerald" as const },
    { id: "dashboard"     as MainTab, label: "Dashboard View",      icon: <BarChart2 className="w-4 h-4" />, accent: "neutral" as const },
    { id: "missing"       as MainTab, label: "Missing Submissions", icon: <UserX    className="w-4 h-4" />, accent: "neutral" as const },
    { id: "mentoring-log" as MainTab, label: "NGA Mentoring Log",   icon: <Users    className="w-4 h-4" />, accent: "neutral" as const },
    { id: "mentorship-dashboard" as MainTab, label: "Mentorship Dashboard", icon: <BarChart2 className="w-4 h-4" />, accent: "neutral" as const },
    ...(canManageMentorAssignments
      ? [{ id: "mentor-assignments" as MainTab, label: "Mentor Assignments", icon: <Users className="w-4 h-4" />, accent: "neutral" as const }]
      : []),
  ];

  const tabAccentClass = (accent: (typeof mainTabs)[number]["accent"]) =>
    accent === "blue"    ? "bg-blue-600    text-white shadow-blue-500/20" :
    accent === "emerald" ? "bg-emerald-600 text-white shadow-emerald-500/20" :
                            "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-transparent shadow-sm";

  const visibleTabs  = mainTabs.slice(0, visibleTabCount);
  const overflowTabs = mainTabs.slice(visibleTabCount);
  const activeTabIsOverflowed = overflowTabs.some((t) => t.id === activeTab);

  // Recompute how many tabs fit on one line vs. collapse behind "More".
  useLayoutEffect(() => {
    const container = tabsRowRef.current;
    const measureRow = measureRowRef.current;
    if (!container || !measureRow) return;

    const GAP = 6; // gap-1.5 = 0.375rem

    const recalc = () => {
      const containerWidth = container.clientWidth;
      const tabEls = Array.from(measureRow.children) as HTMLElement[];
      const widths = tabEls.map((el) => el.getBoundingClientRect().width);
      const moreWidth = moreMeasureRef.current?.getBoundingClientRect().width ?? 0;

      let total = 0;
      let count = widths.length;
      for (let i = 0; i < widths.length; i++) {
        const nextTotal = total + widths[i] + (i > 0 ? GAP : 0);
        const hasMoreAfter = i < widths.length - 1;
        const budget = containerWidth - (hasMoreAfter ? moreWidth + GAP : 0);
        if (nextTotal > budget) {
          count = i;
          break;
        }
        total = nextTotal;
      }
      setVisibleTabCount(Math.max(1, count));
    };

    recalc();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recalc);
    observer.observe(container);
    return () => observer.disconnect();
  }, [mainTabs.length]);

  // Close the "More" dropdown on outside click.
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMoreMenu]);

  return (
    <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-500 p-4 md:p-6 bg-gray-50/30 dark:bg-black/20 rounded-3xl">
      {/* Header */}
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              Admin Reporting
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-black rounded-full uppercase tracking-widest border border-blue-200 dark:border-blue-800">
                Live Analytics
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">
              Monitoring instructor performance and curriculum progress.
            </p>
          </div>
          {canManageMentorAssignments && (
            <button
              onClick={() => handleTabChange("mentor-assignments")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${
                activeTab === "mentor-assignments"
                  ? "bg-slate-700 text-white shadow-md"
                  : "bg-white dark:bg-gray-800/50 text-slate-700 dark:text-gray-200 border border-slate-200 dark:border-gray-700/50 hover:bg-slate-50 dark:hover:bg-gray-800 shadow-sm"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Mentor Assignments
            </button>
          )}
        </div>

        <div ref={tabsRowRef} className="relative flex items-center gap-1.5 bg-white dark:bg-gray-800/30 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700/30 w-full">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center space-x-2 px-5 py-2 rounded-full transition-all duration-300 font-bold text-xs uppercase tracking-wider whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? `${tabAccentClass(tab.accent)} shadow-md`
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}

          {overflowTabs.length > 0 && (
            <div ref={moreMenuRef} className="relative shrink-0">
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all duration-300 font-bold text-xs uppercase tracking-wider whitespace-nowrap ${
                  activeTabIsOverflowed
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white border border-slate-200 dark:border-transparent shadow-sm"
                    : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>More</span>
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg py-1.5 z-20 animate-in fade-in zoom-in-95 duration-150">
                  {overflowTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { handleTabChange(tab.id); setShowMoreMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition-colors hover:bg-blue-600 hover:text-white ${
                        activeTab === tab.id
                          ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Off-screen measurement row — identical markup/classes to the
              visible tabs so ResizeObserver-driven width math above matches
              real rendered widths (font, padding, icon size, etc). */}
          <div ref={measureRowRef} className="absolute flex items-center gap-1.5 opacity-0 pointer-events-none" style={{ top: -9999, left: -9999 }} aria-hidden="true">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                tabIndex={-1}
                className="flex items-center space-x-2 px-5 py-2 rounded-full font-bold text-xs uppercase tracking-wider whitespace-nowrap"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <button
            ref={moreMeasureRef}
            tabIndex={-1}
            className="absolute flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider whitespace-nowrap opacity-0 pointer-events-none"
            style={{ top: -9999, left: -9999 }}
            aria-hidden="true"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>More</span>
          </button>
        </div>
      </div>

      {/* Filters trigger bar — not relevant to the Mentor Assignments / Mentorship Dashboard tabs (no date/subject/class-group scoping there) */}
      {activeTab !== "mentor-assignments" && activeTab !== "mentorship-dashboard" && (
      <div className="flex items-center justify-between gap-2 flex-wrap bg-white dark:bg-gray-800/50 px-4 py-3 rounded-full border border-gray-100 dark:border-gray-700/30">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFiltersModal(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold transition-all shadow-blue-500/20 active:scale-95"
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-white text-blue-600 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Academic Period:{" "}
            <span className="text-blue-600 dark:text-blue-400 font-bold">
              {selectedYear?.name || "—"} / {selectedTerm?.name || "—"}
            </span>{" "}
            <span className="text-gray-400 hidden sm:inline">(change in the top bar)</span>
          </span>
        </div>

        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-tighter transition-all duration-500 ${
          loading
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30 text-blue-600 dark:text-blue-400"
            : "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/30 text-gray-400 dark:text-gray-600"
        }`}>
          <span className={`w-2 h-2 rounded-full ${loading ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`} />
          {loading ? "Updating Data..." : "Live Data Source"}
        </div>
      </div>
      )}

      {/* Advanced Filtering modal */}
      {showFiltersModal && (
        <div
          className="fixed -top-8 inset-x-0 bottom-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowFiltersModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 dark:text-white">Advanced Filtering</h3>
                  <p className="text-xs text-gray-400">
                    Academic Period: <span className="text-blue-600 dark:text-blue-400 font-bold">{selectedYear?.name || "—"} / {selectedTerm?.name || "—"}</span>{" "}
                    <span className="hidden sm:inline">(change in the top bar)</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFiltersModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Date range presets */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Date Range Preset</label>
                <div className="flex p-1 bg-gray-50 dark:bg-gray-800/30 rounded-full border border-gray-100 dark:border-gray-700/30 w-full overflow-x-auto no-scrollbar">
                  {(["today", "week", "month", "custom"] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setActivePreset(preset)}
                      className={`flex-1 min-w-[70px] px-3 py-2 rounded-full text-[10px] font-black uppercase transition-all ${
                        activePreset === preset
                          ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {activePreset === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Start Date</label>
                    <div className="relative group">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                        className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">End Date</label>
                    <div className="relative group">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                        className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Program */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Program</label>
                  <select
                    name="program_id"
                    value={filters.program_id}
                    onChange={handleFilterChange}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
                  >
                    <option value="">All Programs</option>
                    {programs.map((p) => (
                      <option key={p.program_id} value={p.program_id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Grade */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Grade</label>
                  <select
                    name="grade_id"
                    value={filters.grade_id}
                    onChange={handleFilterChange}
                    disabled={!filters.program_id}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none disabled:opacity-50"
                  >
                    <option value="">All Grades</option>
                    {availableGrades.map((g) => (
                      <option key={g.grade_id} value={g.grade_id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Subject</label>
                  <select
                    name="subject_id"
                    value={filters.subject_id}
                    onChange={handleFilterChange}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
                  >
                    <option value="">All Subjects</option>
                    {allSubjects.map((s) => (
                      <option key={s.subject_id} value={s.subject_id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Class Group */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">Class Group</label>
                  <select
                    name="class_group_id"
                    value={filters.class_group_id}
                    onChange={handleFilterChange}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
                  >
                    <option value="">All Class Groups</option>
                    {allClassGroups.map((c) => (
                      <option key={c.class_group_id} value={c.class_group_id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={handleApplyFilters}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold transition-all shadow-blue-500/20 active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {activeTab === "lesson" && (
          <LessonReportsPanel
            reports={reports}
            lessonLogs={lessonLogs}
            loading={loading}
            canApprove={canApproveReports}
            onViewDetails={(r) => { setSelectedReport(r); setShowDetails(true); }}
            onApprove={handleApproveLesson}
            exportParams={{
              start_date: dateRange.start || undefined,
              end_date:   dateRange.end   || undefined,
              academic_term_id:   selectedTermId ?? undefined,
              academic_term_name: selectedTerm?.name,
              subject_id:     filters.subject_id     ? parseInt(filters.subject_id)     : undefined,
              class_group_id: filters.class_group_id ? parseInt(filters.class_group_id) : undefined,
            }}
          />
        )}
        {activeTab === "mentorship" && (
          <MentorshipLogsPanel
            logs={mentorshipLogs}
            loading={loading}
            canApprove={canApproveReports}
            onApprove={handleApproveMentorship}
            exportParams={{
              start_date: dateRange.start || undefined,
              end_date:   dateRange.end   || undefined,
              academic_term_id:   selectedTermId ?? undefined,
              academic_term_name: selectedTerm?.name,
              subject_id:     filters.subject_id     ? parseInt(filters.subject_id)     : undefined,
              class_group_id: filters.class_group_id ? parseInt(filters.class_group_id) : undefined,
            }}
          />
        )}
        {activeTab === "dashboard" && (
          <AdminReportDashboard
            reports={reports}
            loading={loading}
            adminStats={adminStats}
            complianceData={complianceData}
            subjectCoverage={subjectCoverage}
            supportRequestSummary={supportRequestSummary}
            challengeSummary={challengeSummary}
          />
        )}
        {activeTab === "missing" && (
          <AdminMissingReports missing={missingReports} loading={loading} />
        )}
        {activeTab === "mentoring-log" && (
          <AdminMentoringLogView />
        )}
        {activeTab === "mentorship-dashboard" && (
          <AdminMentorshipDashboard />
        )}
        {activeTab === "mentor-assignments" && (
          <AdminMentorAssignments />
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedReport && (
        <ReportDetailsModal
          reportId={selectedReport.report_id}
          onClose={() => { setShowDetails(false); setSelectedReport(null); }}
          isAdminView={true}
        />
      )}
    </div>
  );
};

export default AdminReporting;
