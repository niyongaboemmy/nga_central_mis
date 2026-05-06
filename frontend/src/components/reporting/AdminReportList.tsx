import React, { useState, useMemo } from "react";
import {
  FileText,
  User as UserIcon,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  BookOpen,
  Users,
  Briefcase,
  Download,
  X,
  CalendarRange,
  Filter,
  FileDown,
  Eye,
  Target,
  MessageSquare,
  ChevronDown,
  Tag,
} from "lucide-react";
import AdminStudentSupportModal from "./AdminStudentSupportModal";
import {
  AdminLessonReport,
  AdminMentorshipLog,
  AdminProjectUpdate,
  ExportCategory,
  ExportFormat,
  reportsApi,
} from "../../api/reports";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListCategory = "reports" | "lessons" | "mentorship" | "projects";

interface AdminReportListProps {
  reports:        any[];
  lessonLogs:     AdminLessonReport[];
  mentorshipLogs: AdminMentorshipLog[];
  projectLogs:    AdminProjectUpdate[];
  loading:        boolean;
  onViewDetails:  (report: any) => void;
  category:       ListCategory;
  onCategoryChange: (c: ListCategory) => void;
  exportParams?: { start_date?: string; end_date?: string; instructor_id?: number };
}

// ─── Export Modal ─────────────────────────────────────────────────────────────

interface ExportModalProps {
  onClose:      () => void;
  defaultParams?: { start_date?: string; end_date?: string };
}

const ExportModal: React.FC<ExportModalProps> = ({ onClose, defaultParams = {} }) => {
  const [exportCategory, setExportCategory] = useState<ExportCategory>("lessons");
  const [exportFormat,   setExportFormat]   = useState<ExportFormat>("csv");
  const [periodMode, setPeriodMode]         = useState<"weekly" | "monthly" | "custom">("monthly");
  const [customStart, setCustomStart]       = useState(defaultParams.start_date ?? "");
  const [customEnd,   setCustomEnd]         = useState(defaultParams.end_date   ?? "");
  const [generating,  setGenerating]        = useState(false);

  const today = new Date();

  const getDateRange = (): { start: string; end: string } => {
    if (periodMode === "custom") return { start: customStart, end: customEnd };
    if (periodMode === "weekly") {
      const day = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((day + 6) % 7));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { start: mon.toISOString().split("T")[0], end: sun.toISOString().split("T")[0] };
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  };

  const handleDownload = () => {
    const { start, end } = getDateRange();
    const url = reportsApi.getExportUrl({
      category:   exportCategory,
      format:     exportFormat,
      start_date: start || undefined,
      end_date:   end   || undefined,
    });

    if (exportFormat === "html") {
      setGenerating(true);
      setTimeout(() => {
        window.open(url, "_blank");
        setGenerating(false);
        onClose();
      }, 300);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.click();
      onClose();
    }
  };

  const categories: { id: ExportCategory; label: string; icon: React.ReactNode }[] = [
    { id: "lessons",    label: "Lesson Reports",  icon: <BookOpen  className="w-4 h-4" /> },
    { id: "mentorship", label: "Mentorship Logs", icon: <Users     className="w-4 h-4" /> },
    { id: "projects",   label: "Project Updates", icon: <Briefcase className="w-4 h-4" /> },
    { id: "unified",    label: "All (Unified)",   icon: <FileDown  className="w-4 h-4" /> },
  ];

  const periods = [
    { id: "weekly"  as const, label: "This Week"   },
    { id: "monthly" as const, label: "This Month"  },
    { id: "custom"  as const, label: "Custom Range" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-800/50">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-white">Download Report</h2>
              <p className="text-[11px] text-gray-400 font-medium">Export data as CSV or print-ready PDF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Format */}
          <div>
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">
              Export Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportFormat("csv")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-[10px] font-black uppercase tracking-tight transition-all ${
                  exportFormat === "csv"
                    ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20 shadow-md"
                    : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                }`}
              >
                <FileText className="w-4 h-4" />
                CSV File
              </button>
              <button
                onClick={() => setExportFormat("html")}
                className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-[10px] font-black uppercase tracking-tight transition-all ${
                  exportFormat === "html"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/20 shadow-md"
                    : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                }`}
              >
                <FileDown className="w-4 h-4" />
                PDF (Print)
              </button>
            </div>
            {exportFormat === "html" && (
              <p className="text-[9px] text-indigo-500 font-bold mt-1.5 ml-1">
                Opens in a new tab — use browser Print → Save as PDF
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">
              Data Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setExportCategory(cat.id)}
                  className={`flex items-center gap-2 p-3 rounded-2xl border text-[10px] font-black uppercase tracking-tight transition-all ${
                    exportCategory === cat.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20 shadow-md"
                      : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">
              Period
            </label>
            <div className="flex gap-2">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodMode(p.id)}
                  className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all ${
                    periodMode === p.id
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                      : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {periodMode === "custom" && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">From</label>
                <div className="relative">
                  <CalendarRange className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-9 pr-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">To</label>
                <div className="relative">
                  <CalendarRange className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-2xl pl-9 pr-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-200"
                  />
                </div>
              </div>
            </div>
          )}

          {periodMode !== "custom" && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700/30">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                {(() => { const { start, end } = getDateRange(); return `${start} → ${end}`; })()}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-gray-100 dark:border-gray-800/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={generating}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold shadow-md active:scale-95 transition-all ${
              exportFormat === "html"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {generating ? (
              <span className="animate-pulse">Generating…</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {exportFormat === "html" ? "Open PDF View" : "Download CSV"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Plan vs Reality Drawer ───────────────────────────────────────────────────

const PlanVsRealityDrawer: React.FC<{ log: AdminLessonReport; onClose: () => void }> = ({ log, onClose }) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
    <div
      className="w-full max-w-lg bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl border-l border-gray-100 dark:border-gray-800 animate-in slide-in-from-right duration-300"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drawer header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
            <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white">Plan vs Reality</h2>
            <p className="text-[10px] text-gray-400 font-medium">{log.instructor_name} · {log.delivery_date}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <ScheduleBadge flag={log.schedule_flag} />
          <StatusDot status={log.status} />
          <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{log.status}</span>
          {log.subject_name && (
            <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-[9px] font-black uppercase border border-blue-100/50">
              {log.subject_name}
            </span>
          )}
        </div>

        {/* The Plan */}
        <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30 p-5 space-y-3">
          <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> The Plan
          </p>
          {log.module_name && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Module</p>
              <p className="text-xs font-bold text-gray-800 dark:text-white">
                {log.module_code ? `[${log.module_code}] ` : ""}{log.module_name}
              </p>
            </div>
          )}
          {log.topic && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Topic</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{log.topic}</p>
            </div>
          )}
          {log.sub_topic && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Sub-topic</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{log.sub_topic}</p>
            </div>
          )}
          {log.big_question && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Big Question</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 italic font-medium">"{log.big_question}"</p>
            </div>
          )}
          {log.objective && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Objective</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium leading-relaxed">{log.objective}</p>
            </div>
          )}
          {!log.module_name && !log.topic && !log.big_question && !log.objective && (
            <p className="text-xs text-gray-400 italic">No structured lesson plan linked to this report.</p>
          )}
        </div>

        {/* The Reality */}
        <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/50 dark:border-emerald-800/30 p-5 space-y-3">
          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> The Reality
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-emerald-100/30 text-center">
              <p className="text-xl font-black text-gray-900 dark:text-white">{log.attendance_count ?? "—"}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mt-0.5">Attendance</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-emerald-100/30 text-center">
              <p className="text-xl font-black text-gray-900 dark:text-white">
                {log.completion_rate != null ? `${log.completion_rate}%` : "—"}
              </p>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mt-0.5">Completion</p>
            </div>
          </div>
          {log.reflection_notes ? (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-1.5">Instructor Reflection</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 rounded-xl p-3 border border-emerald-100/30">
                {log.reflection_notes}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No reflection notes submitted.</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

// ─── Category Tab Bar ─────────────────────────────────────────────────────────

const TABS: { id: ListCategory; label: string; icon: React.ReactNode }[] = [
  { id: "reports",    label: "Weekly Reports", icon: <FileText  className="w-4 h-4" /> },
  { id: "lessons",    label: "Lesson Logs",    icon: <BookOpen  className="w-4 h-4" /> },
  { id: "mentorship", label: "Mentorship",     icon: <Users     className="w-4 h-4" /> },
  { id: "projects",   label: "Projects",       icon: <Briefcase className="w-4 h-4" /> },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 px-6 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-2xl">
      <FileText className="w-8 h-8 text-gray-400" />
    </div>
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No {label} found</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">Try adjusting your filters.</p>
    </div>
  </div>
);

const ScheduleBadge: React.FC<{ flag: string }> = ({ flag }) => {
  const map: Record<string, string> = {
    AHEAD:   "bg-blue-50   dark:bg-blue-900/20   text-blue-600   dark:text-blue-400   border-blue-100/50   dark:border-blue-800/30",
    ON_TIME: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-800/30",
    BEHIND:  "bg-amber-50  dark:bg-amber-900/20  text-amber-600  dark:text-amber-400  border-amber-100/50  dark:border-amber-800/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${map[flag] ?? map["ON_TIME"]}`}>
      {flag.replace("_", " ")}
    </span>
  );
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    DELIVERED: "bg-emerald-500",
    PARTIAL:   "bg-amber-400",
    MISSED:    "bg-red-400",
    ON_TRACK:  "bg-emerald-500",
    AHEAD:     "bg-blue-500",
    BEHIND:    "bg-amber-400",
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-400"}`} />;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminReportList: React.FC<AdminReportListProps> = ({
  reports,
  lessonLogs,
  mentorshipLogs,
  projectLogs,
  loading,
  onViewDetails,
  category,
  onCategoryChange,
  exportParams,
}) => {
  const [showExport,      setShowExport]      = useState(false);
  const [subjectFilter,   setSubjectFilter]   = useState<string>("");
  const [showSubjectMenu, setShowSubjectMenu] = useState(false);
  const [selectedLesson,  setSelectedLesson]  = useState<AdminLessonReport | null>(null);
  const [studentProfile,  setStudentProfile]  = useState<{ id: number; name: string } | null>(null);

  // Unique subjects derived from loaded lesson logs
  const subjectOptions = useMemo(() => {
    const map = new Map<number, string>();
    lessonLogs.forEach((l) => {
      if (l.subject_id != null && l.subject_name) map.set(l.subject_id, l.subject_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [lessonLogs]);

  const filteredLessons = useMemo(() => {
    if (!subjectFilter) return lessonLogs;
    return lessonLogs.filter((l) => String(l.subject_id) === subjectFilter);
  }, [lessonLogs, subjectFilter]);

  const skeleton = (
    <div className="space-y-4 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-6 h-24" />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Category tabs */}
        <div className="flex items-center gap-1 p-1.5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800/30 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onCategoryChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                category === tab.id
                  ? "bg-blue-600 text-white shadow-blue-500/20 shadow-sm"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Subject filter — only shown in Lesson Logs tab */}
          {category === "lessons" && subjectOptions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSubjectMenu((p) => !p)}
                className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{subjectFilter ? subjectOptions.find((s) => String(s.id) === subjectFilter)?.name ?? "Subject" : "All Subjects"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {showSubjectMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => { setSubjectFilter(""); setShowSubjectMenu(false); }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${!subjectFilter ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                  >
                    All Subjects
                  </button>
                  {subjectOptions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSubjectFilter(String(s.id)); setShowSubjectMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${subjectFilter === String(s.id) ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Export button */}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
      </div>

      {/* List content */}
      {category === "reports" && (
        <>
          {loading && reports.length === 0 ? skeleton : reports.length === 0 ? (
            <EmptyState label="weekly reports" />
          ) : (
            <LegacyReportList reports={reports} onViewDetails={onViewDetails} />
          )}
        </>
      )}

      {category === "lessons" && (
        <>
          {loading && lessonLogs.length === 0 ? skeleton : filteredLessons.length === 0 ? (
            <EmptyState label="lesson reports" />
          ) : (
            <LessonLogList logs={filteredLessons} onSelect={setSelectedLesson} />
          )}
        </>
      )}

      {category === "mentorship" && (
        <>
          {loading && mentorshipLogs.length === 0 ? skeleton : mentorshipLogs.length === 0 ? (
            <EmptyState label="mentorship logs" />
          ) : (
            <MentorshipLogList
              logs={mentorshipLogs}
              onStudentClick={(id, name) => setStudentProfile({ id, name })}
            />
          )}
        </>
      )}

      {category === "projects" && (
        <>
          {loading && projectLogs.length === 0 ? skeleton : projectLogs.length === 0 ? (
            <EmptyState label="project updates" />
          ) : (
            <ProjectLogList logs={projectLogs} />
          )}
        </>
      )}

      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} defaultParams={exportParams} />
      )}

      {selectedLesson && (
        <PlanVsRealityDrawer log={selectedLesson} onClose={() => setSelectedLesson(null)} />
      )}

      {studentProfile && (
        <AdminStudentSupportModal
          studentId={studentProfile.id}
          studentName={studentProfile.name}
          onClose={() => setStudentProfile(null)}
        />
      )}
    </div>
  );
};

// ─── Legacy weekly report list ────────────────────────────────────────────────

const LegacyReportList: React.FC<{ reports: any[]; onViewDetails: (r: any) => void }> = ({
  reports,
  onViewDetails,
}) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <div
          key={report.report_id}
          onClick={() => onViewDetails(report)}
          className="group bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-4 hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer relative overflow-hidden"
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-center space-x-4 lg:w-1/4">
              <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50 group-hover:scale-105 transition-transform duration-300 flex-shrink-0">
                <UserIcon className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-white truncate text-base">{report.instructor_name}</h3>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-black flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  Instructor
                </div>
              </div>
            </div>
            <div className="hidden lg:block w-px h-10 bg-gray-100 dark:bg-gray-800" />
            <div className="flex-1 min-w-0">
              <span className="px-2.5 py-1 bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-tight border border-blue-100/30 dark:border-blue-800/20">
                {report.grade_name}
              </span>
            </div>
            <div className="lg:w-1/6 flex flex-col justify-center">
              <div className="flex items-center text-xs font-bold text-gray-700 dark:text-gray-200 gap-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>{report.start_date}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tighter">
                {report.academic_year_name} <span className="text-gray-200 dark:text-gray-800">/</span> {report.academic_term_name}
              </div>
            </div>
            <div className="flex items-center gap-4 lg:w-1/6">
              <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-800/30 text-center">
                <div className="text-base font-black text-gray-900 dark:text-white leading-none">{report.lessons_delivered_count}</div>
                <div className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase mt-1 tracking-tighter">Lessons</div>
              </div>
              <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-800/30 text-center">
                <div className="text-base font-black text-gray-900 dark:text-white leading-none">{report.mentorship_sessions_count}</div>
                <div className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase mt-1 tracking-tighter">Mentor</div>
              </div>
            </div>
            <div className="lg:w-1/6 flex items-center justify-between lg:justify-end gap-3">
              <span className={`inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                report.progress_status === "ON_TRACK" || report.progress_status === "AHEAD"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-800/30"
                  : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-800/30"
              }`}>
                {report.progress_status === "ON_TRACK" || report.progress_status === "AHEAD"
                  ? <CheckCircle2 className="w-3 h-3" />
                  : <AlertCircle  className="w-3 h-3" />}
                <span>{report.progress_status.replace("_", " ")}</span>
              </span>
              <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 text-gray-300 dark:text-gray-600 flex items-center justify-center border border-gray-100 dark:border-gray-700 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all duration-300">
                <ChevronRight className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center" />
        </div>
      ))}
    </div>
    <ListFooter count={reports.length} label="Reports" />
  </div>
);

// ─── Lesson Log List ──────────────────────────────────────────────────────────

const LessonLogList: React.FC<{ logs: AdminLessonReport[]; onSelect: (l: AdminLessonReport) => void }> = ({ logs, onSelect }) => (
  <div className="space-y-3">
    {logs.map((log) => (
      <div
        key={log.lesson_report_id}
        onClick={() => onSelect(log)}
        className="group bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-4 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-800/50 hover:shadow-sm transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Instructor */}
          <div className="flex items-center gap-3 sm:w-1/4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{log.instructor_name}</p>
              <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {log.delivery_date}
              </p>
            </div>
          </div>

          {/* Module / Topic */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
              {log.module_code ? `[${log.module_code}] ` : ""}{log.module_name ?? "—"}
            </p>
            {log.topic && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5">{log.topic}</p>
            )}
            {log.subject_name && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-[8px] font-black uppercase border border-blue-100/30">
                {log.subject_name}
              </span>
            )}
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-3 sm:justify-end">
            {log.attendance_count !== null && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-300">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                {log.attendance_count}
              </div>
            )}
            {log.completion_rate !== null && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                {log.completion_rate}%
              </div>
            )}
          </div>

          {/* Status + CTA */}
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <StatusDot status={log.status} />
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{log.status}</span>
            </div>
            <ScheduleBadge flag={log.schedule_flag} />
            <div className="w-7 h-7 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
              <Eye className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-white" />
            </div>
          </div>
        </div>
      </div>
    ))}
    <ListFooter count={logs.length} label="Lesson Reports" />
  </div>
);

// ─── Mentorship Log List ──────────────────────────────────────────────────────

const WELLBEING_EMOJI_ADMIN: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED:  "😟",
  NEUTRAL:    "😐",
  GOOD:       "🙂",
  EXCELLENT:  "😄",
};

const MentorshipLogList: React.FC<{
  logs: AdminMentorshipLog[];
  onStudentClick: (studentId: number, studentName: string) => void;
}> = ({ logs, onStudentClick }) => (
  <div className="space-y-3">
    {logs.map((log) => (
      <div
        key={log.mentorship_id}
        className="bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 sm:w-1/4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50 flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{log.instructor_name}</p>
              <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {log.session_date}
              </p>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Student name — clickable if student_id is available */}
            {log.student_id ? (
              <button
                onClick={() => onStudentClick(log.student_id!, log.student_name ?? "Student")}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1 text-left"
                title="View student support profile"
              >
                <UserIcon className="w-3 h-3 flex-shrink-0" />
                {log.student_name || "View Profile"}
              </button>
            ) : (
              <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
                {log.student_name ?? "Student not specified"}
              </p>
            )}
            {/* Topic badge */}
            {log.topic && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full font-bold mt-1">
                <Tag className="w-2.5 h-2.5" />
                {log.topic}
              </span>
            )}
            {!log.topic && log.notes && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5">{log.notes}</p>
            )}
          </div>

          <div className="flex items-center gap-3 sm:flex-shrink-0 text-[10px] font-bold text-gray-600 dark:text-gray-300">
            {log.duration_minutes && (
              <span className="px-2 py-1 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/30">
                {log.duration_minutes} min
              </span>
            )}
            {log.wellbeing_status && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-800/30">
                {WELLBEING_EMOJI_ADMIN[log.wellbeing_status] ?? ""} {log.wellbeing_status}
              </span>
            )}
            {log.follow_up_required === 1 && (
              <span className="flex items-center gap-1 text-amber-600 font-black text-[9px] uppercase">
                <AlertCircle className="w-3 h-3" /> Follow-up
              </span>
            )}
          </div>
        </div>
      </div>
    ))}
    <ListFooter count={logs.length} label="Mentorship Sessions" />
  </div>
);

// ─── Project Log List ─────────────────────────────────────────────────────────

const ProjectLogList: React.FC<{ logs: AdminProjectUpdate[] }> = ({ logs }) => (
  <div className="space-y-3">
    {logs.map((log) => (
      <div
        key={log.project_update_id}
        className="bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50 p-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 sm:w-1/4">
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800/50 flex-shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{log.instructor_name}</p>
              {log.role && (
                <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">{log.role}</p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{log.project_name ?? "Unnamed Project"}</p>
            {log.work_completed && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5">{log.work_completed}</p>
            )}
          </div>
          {log.status && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex-shrink-0 ${
              log.status === "COMPLETED"
                ? "bg-emerald-50 text-emerald-600 border-emerald-100/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/30"
                : log.status === "ON_TRACK"
                ? "bg-blue-50 text-blue-600 border-blue-100/50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30"
                : "bg-amber-50 text-amber-600 border-amber-100/50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30"
            }`}>
              <StatusDot status={log.status} />
              {log.status.replace("_", " ")}
            </span>
          )}
        </div>
      </div>
    ))}
    <ListFooter count={logs.length} label="Project Updates" />
  </div>
);

// ─── Footer ───────────────────────────────────────────────────────────────────

const ListFooter: React.FC<{ count: number; label: string }> = ({ count, label }) => (
  <div className="bg-white/50 dark:bg-gray-900/50 px-8 py-4 rounded-2xl flex items-center justify-between backdrop-blur-sm">
    <div className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
      Found <span className="text-blue-600 dark:text-blue-400 mx-1">{count}</span> {label}
    </div>
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-tighter border border-white dark:border-gray-700">
      Verified Data Summary
    </div>
  </div>
);

export default AdminReportList;
