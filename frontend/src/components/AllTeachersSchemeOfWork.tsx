import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  List,
  FileText,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Users,
  Lock,
  Download,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";
import { Grade } from "../api/academics";
import { schemeOfWorkApi, TeacherWithSchemes } from "../api/schemeOfWork";
import { useUser } from "../contexts/UserContext";
import { useToast } from "../contexts/ToastContext";
import { useMetadata } from "../contexts/MetadataContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import AllTeachersSOW_Dashboard from "./AllTeachersSOW_Dashboard";
import AllTeachersSOW_List from "./AllTeachersSOW_List";
import { exportSowReportPdf, exportSowReportExcel } from "../utils/sowReportExport";

const PERMISSION = "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST";

type TabType = "dashboard" | "list";
type StatusFilter =
  | "all"
  | "submitted"
  | "pending"
  | "partial"
  | "validated"
  | "not_validated";

const AllTeachersSchemeOfWork: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();

  // Permission check
  const hasPermission = user?.roles?.some((r) =>
    r.permissions?.some((p) => p.name === PERMISSION),
  );

  // Selectors state
  // Metadata from context
  const { programs, getGrades } = useMetadata();
  const { selectedYearId, selectedTermId, selectedYear, selectedTerm } =
    useAcademicPeriod();
  const [grades, setGrades] = useState<Grade[]>([]);

  // Helpers for extracting auth constraints
  const getAuthProgramId = () => {
    for (const r of user?.roles || []) {
      const pId = (r as any).program_id;
      if (pId) return pId;
    }
    return null;
  };

  const getAuthGradeId = () => {
    for (const r of user?.roles || []) {
      const gId = (r as any).grade_id;
      if (gId) return gId;
    }
    return null;
  };

  const authProgramId = getAuthProgramId();
  const authGradeId = getAuthGradeId();

  // Load persisted filters or fallback to auth constraint / defaults
  const getInitialValue = (key: string, defaultValue: any) => {
    try {
      const saved = sessionStorage.getItem(`allTeachersSow_${key}`);
      if (!saved || saved === "undefined" || saved === "null") return defaultValue;
      const parsed = JSON.parse(saved);
      return parsed ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [selectedProgram, setSelectedProgram] = useState<number | "">(
    authProgramId || getInitialValue("program", ""),
  );
  const [selectedGrade, setSelectedGrade] = useState<number | "">(
    authGradeId || getInitialValue("grade", ""),
  );
  const [selectedRole, setSelectedRole] = useState(
    getInitialValue("role", "TEACHER"),
  );

  // Data
  const [teachers, setTeachers] = useState<TeacherWithSchemes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState<TabType>(
    getInitialValue("tab", "dashboard"),
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    getInitialValue("status", "all"),
  );
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const reportContext = {
    programName: programs.find((p) => p.program_id === selectedProgram)?.name || "All Programs",
    gradeName: grades.find((g) => g.grade_id === selectedGrade)?.name || "All Grades",
    roleLabel: selectedRole,
    yearName: selectedYear?.name || "—",
    termName: selectedTerm?.name || "—",
  };

  const handleExportPdf = () => {
    exportSowReportPdf(teachers, reportContext);
    setExportMenuOpen(false);
  };

  const handleExportExcel = () => {
    exportSowReportExcel(teachers, reportContext);
    setExportMenuOpen(false);
  };

  // Load grades when program changes
  useEffect(() => {
    if (!selectedProgram) {
      setGrades([]);
      setSelectedGrade("");
      return;
    }
    getGrades(selectedProgram as number).then((data) => {
      setGrades(data);
    });
  }, [selectedProgram, getGrades]);

  const canLoad = Boolean(
    selectedYearId && selectedTermId && selectedProgram && selectedGrade,
  );

  const loadTeachers = useCallback(
    async (force = false) => {
      if (!canLoad) return;
      setLoading(true);
      setError(null);
      try {
        const cacheKey = `allTeachers_${selectedYearId}_${selectedTermId}_${selectedProgram}_${selectedGrade}_${selectedRole}`;
        const cached = sessionStorage.getItem(cacheKey);

        if (cached && !force) {
          try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < 5 * 60 * 1000) {
              setTeachers(data || []);
              setHasLoaded(true);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error("Cache parse error", e);
            sessionStorage.removeItem(cacheKey);
          }
        }

        const res = await schemeOfWorkApi.getAllTeachers({
          academic_year_id: selectedYearId as number,
          academic_term_id: selectedTermId as number,
          program_id: selectedProgram as number,
          grade_id: selectedGrade as number,
          role: selectedRole,
        });
        const data = (res.data as any)?.data || [];
        setTeachers(data);
        setHasLoaded(true);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ timestamp: Date.now(), data }),
        );
      } catch (e: any) {
        const msg = e.response?.data?.message || "Failed to load data";
        setError(msg);
        showToast(msg, "error");
      } finally {
        setLoading(false);
      }
    },
    [
      canLoad,
      selectedYearId,
      selectedTermId,
      selectedProgram,
      selectedGrade,
      selectedRole,
      showToast,
    ],
  );

  const clearSowCache = () => {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (
        key.startsWith("allTeachersSow_") ||
        key.startsWith("sow_details_") ||
        key.startsWith("teacher_subjects_") ||
        key.startsWith("allTeachers_")
      ) {
        sessionStorage.removeItem(key);
      }
    });
    showToast("Cache cleared", "success");
    window.location.reload();
  };

  // Load teachers when filters change and are valid
  useEffect(() => {
    if (canLoad) {
      loadTeachers();
    }
  }, [canLoad, loadTeachers]);

  // Persist selections (year/term are governed by the global academic period)
  useEffect(() => {
    if (selectedProgram)
      sessionStorage.setItem(
        "allTeachersSow_program",
        JSON.stringify(selectedProgram),
      );
    if (selectedGrade)
      sessionStorage.setItem(
        "allTeachersSow_grade",
        JSON.stringify(selectedGrade),
      );
    if (selectedRole)
      sessionStorage.setItem(
        "allTeachersSow_role",
        JSON.stringify(selectedRole),
      );
  }, [selectedProgram, selectedGrade, selectedRole]);

  // Persist tab and status filter
  useEffect(() => {
    sessionStorage.setItem("allTeachersSow_tab", JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem(
      "allTeachersSow_status",
      JSON.stringify(statusFilter),
    );
  }, [statusFilter]);

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/30 rounded-3xl flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Access Restricted
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm">
          You don't have permission to view all teachers' scheme of work.
          Contact your administrator.
        </p>
      </div>
    );
  }

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "list", label: "List", icon: List },
  ];

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3 h-3" />
            Admin View
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <FileText className="h-4 w-4 text-white" />
            </div>
            Teachers' Scheme of Work
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Monitor all submitted and pending scheme of works across teachers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={!hasLoaded || teachers.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 text-xs font-semibold transition-all"
              title="Export progress report"
            >
              <Download className="w-3.5 h-3.5" />
              Export Report
            </button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 mt-2 w-48 z-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden"
                >
                  <button
                    onClick={handleExportPdf}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5 text-rose-500" />
                    Download as PDF
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-t border-gray-50 dark:border-gray-800"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Download as Excel
                  </button>
                </motion.div>
              </>
            )}
          </div>
          <button
            onClick={clearSowCache}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-all"
            title="Clean all local session cache"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Clean Cache
          </button>
          <button
            onClick={() => loadTeachers(true)}
            disabled={!canLoad || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-md shadow-blue-500/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            Filter by Context
          </p>
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Academic Period:{" "}
            <span className="text-blue-600 dark:text-blue-400 font-bold">
              {selectedYear?.name || "—"} / {selectedTerm?.name || "—"}
            </span>{" "}
            <span className="text-gray-400">(change in the top bar)</span>
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Program */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Program
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(Number(e.target.value) || "");
                if (!authGradeId) setSelectedGrade("");
              }}
              disabled={!!authProgramId}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select Program</option>
              {programs.map((p) => (
                <option key={p.program_id} value={p.program_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grade */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Grade / Level
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(Number(e.target.value) || "")}
              disabled={!selectedProgram || !!authGradeId}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select Grade</option>
              {grades.map((g) => (
                <option key={g.grade_id} value={g.grade_id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              User Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="TEACHER">Teacher</option>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>

        {!canLoad && (
          <p className="mt-3 text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Please select all filters to load data.
          </p>
        )}
      </motion.div>

      {/* Tabs */}
      {hasLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="border-b border-gray-200 dark:border-gray-800"
        >
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === tab.key
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}
                >
                  {teachers.length}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <div className="relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm rounded-2xl">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mb-4"
            />
            <p className="text-sm text-gray-700 dark:text-gray-300 font-semibold shadow-sm">
              Loading teacher data...
            </p>
          </div>
        )}

        {!canLoad ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 mt-4">
            <Users className="w-14 h-14 text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">
              Select all filters above to view teachers
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-200 dark:border-rose-800 mt-4">
            <AlertCircle className="w-12 h-12 text-rose-400 mb-3" />
            <p className="text-rose-600 dark:text-rose-400 font-medium">
              {error}
            </p>
          </div>
        ) : hasLoaded ? (
          <div
            className={`mt-4 transition-opacity duration-300 ${loading ? "opacity-30" : "opacity-100"}`}
          >
            <AnimatePresence mode="wait">
              {activeTab === "dashboard" ? (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AllTeachersSOW_Dashboard
                    teachers={teachers}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AllTeachersSOW_List
                    teachers={teachers}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AllTeachersSchemeOfWork;
