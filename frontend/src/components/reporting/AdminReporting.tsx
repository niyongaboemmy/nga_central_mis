import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  BarChart2,
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
} from "lucide-react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import { reportsApi, InstructorReport } from "../../api/reports";
import { useMetadata } from "../../contexts/MetadataContext";
import { useUser } from "../../contexts/UserContext";
import { AcademicTerm, Grade } from "../../api/academics";
import AdminReportList from "./AdminReportList";
import AdminReportDashboard from "./AdminReportDashboard";
import AdminMissingReports from "./AdminMissingReports";
import ReportDetailsModal from "./ReportDetailsModal";
import { UserX } from "lucide-react";

const AdminReporting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"list" | "dashboard" | "missing">(
    "list",
  );
  const [reports, setReports] = useState<InstructorReport[]>([]);
  const [missingReports, setMissingReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // Sub-metadata states
  const [availableTerms, setAvailableTerms] = useState<AcademicTerm[]>([]);
  const [availableGrades, setAvailableGrades] = useState<Grade[]>([]);

  type PresetType = "today" | "week" | "month" | "custom";
  const [activePreset, setActivePreset] = useState<PresetType>("week");

  // Filters
  const [dateRange, setDateRange] = useState({
    start: "",
    end: "",
  });

  const [filters, setFilters] = useState({
    academic_year_id: "",
    academic_term_id: "",
    program_id: "",
    grade_id: "",
  });

  const { user } = useUser();
  const { years, programs, getTerms, getGrades } = useMetadata();
  const initializedRef = useRef(false);
  const lastFetchKey = useRef<string | null>(null);

  // Handle Preset Changes
  useEffect(() => {
    if (activePreset !== "custom") {
      const now = new Date();
      let start = "";
      let end = "";

      switch (activePreset) {
        case "today":
          start = format(startOfDay(now), "yyyy-MM-dd");
          end = format(endOfDay(now), "yyyy-MM-dd");
          break;
        case "week":
          start = format(subDays(now, 7), "yyyy-MM-dd");
          end = format(now, "yyyy-MM-dd");
          break;
        case "month":
          start = format(startOfMonth(now), "yyyy-MM-dd");
          end = format(endOfMonth(now), "yyyy-MM-dd");
          break;
      }

      if (start && end) {
        setDateRange({ start, end });
      }
    }
  }, [activePreset]);

  // Set default filters based on user profile
  useEffect(() => {
    if (
      user &&
      !initializedRef.current &&
      years.length > 0 &&
      programs.length > 0
    ) {
      const defaultYearId =
        user.currentAcademicYear?.academic_year_id?.toString() || "";
      const activeTerm =
        user.currentAcademicTerms?.find((t) => t.is_current === 1) ||
        user.currentAcademicTerms?.[0];
      const defaultTermId = activeTerm?.academic_term_id?.toString() || "";
      const defaultProgramId =
        user.assignedPrograms?.[0]?.program_id?.toString() || "";
      const defaultGradeId =
        user.assignedGrades?.[0]?.grade_id?.toString() || "";

      setFilters({
        academic_year_id: defaultYearId,
        academic_term_id: defaultTermId,
        program_id: defaultProgramId,
        grade_id: defaultGradeId,
      });

      initializedRef.current = true;
    }
  }, [user, years, programs]);

  const loadReports = useCallback(async () => {
    const params = {
      start_date: dateRange.start || undefined,
      end_date: dateRange.end || undefined,
      academic_year_id: filters.academic_year_id
        ? parseInt(filters.academic_year_id)
        : undefined,
      academic_term_id: filters.academic_term_id
        ? parseInt(filters.academic_term_id)
        : undefined,
      program_id: filters.program_id
        ? parseInt(filters.program_id)
        : undefined,
      grade_id: filters.grade_id ? parseInt(filters.grade_id) : undefined,
    };

    const fetchKey = JSON.stringify({ ...params, activeTab });
    if (lastFetchKey.current === fetchKey) return;

    setLoading(true);
    lastFetchKey.current = fetchKey;

    try {
      if (activeTab === "missing") {
        if (!params.start_date || !params.end_date) {
          setMissingReports([]);
          return;
        }
        const res = await reportsApi.getMissingAdminReports(params as any);
        const data = (res as any).data?.data || (res as any).data || [];
        setMissingReports(data);
      } else {
        const res = await reportsApi.getAllAdminReports(params);
        const data = (res as any).data?.data || (res as any).data || [];
        setReports(data);
      }
    } catch (error) {
      console.error("Failed to load admin data", error);
      lastFetchKey.current = null;
    } finally {
      setLoading(false);
    }
  }, [dateRange, filters, activeTab]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Load terms when year changes
  useEffect(() => {
    if (filters.academic_year_id) {
      getTerms(parseInt(filters.academic_year_id)).then(setAvailableTerms);
    } else {
      setAvailableTerms([]);
    }
  }, [filters.academic_year_id, getTerms]);

  // Load grades when program changes
  useEffect(() => {
    if (filters.program_id) {
      getGrades(parseInt(filters.program_id)).then(setAvailableGrades);
    } else {
      setAvailableGrades([]);
    }
  }, [filters.program_id, getGrades]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      // Cascading clear only on manual change
      if (name === "academic_year_id") next.academic_term_id = "";
      if (name === "program_id") next.grade_id = "";
      return next;
    });
  };

  const handleViewDetails = (report: any) => {
    setSelectedReport(report);
    setShowDetails(true);
  };

  const tabs = [
    {
      id: "list",
      label: "Reports List",
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: "dashboard",
      label: "Dashboard View",
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      id: "missing",
      label: "Missing Submissions",
      icon: <UserX className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-500 p-4 md:p-6 bg-gray-50/30 dark:bg-black/20 rounded-3xl">
      {/* Header section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            Admin Reporting
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-black rounded-full uppercase tracking-widest border border-blue-200 dark:border-blue-800">
              Review
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">
            Monitoring instructor performance and curriculum progress.
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-white dark:bg-gray-900 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-800/30 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-5 py-2 rounded-xl transition-all duration-300 font-bold text-xs uppercase tracking-wider ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-blue-500/20"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/30 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Advanced Filtering
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {/* Range Presets */}
          <div className="lg:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
              Date Range Preset
            </label>
            <div className="flex p-1 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/30 w-full overflow-x-auto no-scrollbar">
              {(["today", "week", "month", "custom"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setActivePreset(preset)}
                  className={`flex-1 min-w-[70px] px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                    activePreset === preset
                      ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {activePreset === "custom" && (
            <>
              <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
                  Start Date
                </label>
                <div className="relative group">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, start: e.target.value }))
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200"
                  />
                </div>
              </div>

              <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
                  End Date
                </label>
                <div className="relative group">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200"
                  />
                </div>
              </div>
            </>
          )}

          {/* Academic Year */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
              Academic Year
            </label>
            <select
              name="academic_year_id"
              value={filters.academic_year_id}
              onChange={handleFilterChange}
              className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y.academic_year_id} value={y.academic_year_id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          {/* Academic Term */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
              Academic Term
            </label>
            <select
              name="academic_term_id"
              value={filters.academic_term_id}
              onChange={handleFilterChange}
              className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
              disabled={!filters.academic_year_id}
            >
              <option value="">All Terms</option>
              {availableTerms.map((t) => (
                <option key={t.academic_term_id} value={t.academic_term_id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Program */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
              Program
            </label>
            <select
              name="program_id"
              value={filters.program_id}
              onChange={handleFilterChange}
              className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.program_id} value={p.program_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grade */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-tighter block ml-1">
              Grade
            </label>
            <select
              name="grade_id"
              value={filters.grade_id}
              onChange={handleFilterChange}
              className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-200 appearance-none"
              disabled={!filters.program_id}
            >
              <option value="">All Grades</option>
              {availableGrades.map((g) => (
                <option key={g.grade_id} value={g.grade_id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-800/30">
          <div className="flex items-center gap-4">
            <button
              onClick={loadReports}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-blue-500/20 active:scale-95"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Apply Filters
            </button>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-tighter transition-all duration-500 ${
            loading 
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30 text-blue-600 dark:text-blue-400" 
              : "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/30 text-gray-400 dark:text-gray-600"
          }`}>
            <span className={`w-2 h-2 rounded-full ${loading ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`}></span>
            {loading ? "Updating Data..." : "Live Data Source"}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {activeTab === "list" && (
          <AdminReportList
            reports={reports}
            loading={loading}
            onViewDetails={handleViewDetails}
          />
        )}
        {activeTab === "dashboard" && (
          <AdminReportDashboard reports={reports} loading={loading} />
        )}
        {activeTab === "missing" && (
          <AdminMissingReports missing={missingReports} loading={loading} />
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedReport && (
        <ReportDetailsModal
          reportId={selectedReport.report_id}
          onClose={() => {
            setShowDetails(false);
            setSelectedReport(null);
          }}
          isAdminView={true}
        />
      )}
    </div>
  );
};

export default AdminReporting;
