import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  User as UserIcon,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  BookOpen,
  Users,
  Download,
  X,
  CalendarRange,
  FileDown,
  Eye,
  Target,
  MessageSquare,
  Tag,
  Check,
  ThumbsDown,
  Clock3,
  XCircle,
  Sparkles,
  UserCircle2,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";
import AdminStudentSupportModal from "./AdminStudentSupportModal";
import {
  AdminLessonReport,
  AdminMentorshipLog,
  ExportCategory,
  ExportFormat,
  ValidationStatus,
  reportsApi,
} from "../../api/reports";
import { useToast } from "../../contexts/ToastContext";
import { LessonReportRollupService } from "../../services/LessonReportRollupService";

// ─── Shared validation-status badge ────────────────────────────────────────────

export const VALIDATION_BADGE: Record<ValidationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending Review",
    className: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100/50 dark:border-amber-800/30",
    icon: <Clock3 className="w-3 h-3" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-800/30",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100/50 dark:border-red-800/30",
    icon: <XCircle className="w-3 h-3" />,
  },
};

const ValidationBadge: React.FC<{ status: ValidationStatus }> = ({ status }) => {
  const badge = VALIDATION_BADGE[status] ?? VALIDATION_BADGE.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${badge.className}`}>
      {badge.icon}
      {badge.label}
    </span>
  );
};

// ─── Validation-status filter tabs (shared by Lesson Logs + Mentorship lists) ──

type StatusFilter = "ALL" | ValidationStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL",      label: "All" },
  { value: "PENDING",  label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const StatusFilterTabs: React.FC<{
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  items: { validation_status: ValidationStatus }[];
}> = ({ value, onChange, items }) => {
  const counts: Record<StatusFilter, number> = {
    ALL:      items.length,
    PENDING:  items.filter((i) => i.validation_status === "PENDING").length,
    APPROVED: items.filter((i) => i.validation_status === "APPROVED").length,
    REJECTED: items.filter((i) => i.validation_status === "REJECTED").length,
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STATUS_FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
            value === f.value
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {f.label} ({counts[f.value]})
        </button>
      ))}
    </div>
  );
};

// ─── Approval review modal (shared by Lesson + Mentorship panels) ─────────────

interface ApprovalTarget {
  id: number;
  title: string;
  subtitle: string;
  validation_status: ValidationStatus;
  validation_comment: string | null;
}

interface ApprovalModalProps {
  target: ApprovalTarget;
  accent: "blue" | "emerald";
  onClose: () => void;
  onSubmit: (status: ValidationStatus, comment?: string) => Promise<void>;
}

const ApprovalModal: React.FC<ApprovalModalProps> = ({ target, accent, onClose, onSubmit }) => {
  const [rejectMode, setRejectMode] = useState(false);
  const [comment, setComment] = useState(target.validation_comment ?? "");
  const [busy, setBusy] = useState(false);

  const accentBtn = accent === "blue"
    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20";

  const submit = async (status: ValidationStatus) => {
    if (status === "REJECTED" && !comment.trim()) { setRejectMode(true); return; }
    setBusy(true);
    try {
      await onSubmit(status, comment.trim() || undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed -top-8 inset-x-0 bottom-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800/95 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700/50">
          <div className="min-w-0">
            <h2 className="text-base font-black text-gray-900 dark:text-white truncate">{target.title}</h2>
            <p className="text-[11px] text-gray-400 font-medium truncate">{target.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <ValidationBadge status={target.validation_status} />
          <div>
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">
              Review Comment {rejectMode && <span className="text-red-500 normal-case font-bold">(required to reject)</span>}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional note for approval, required note for rejection..."
              rows={3}
              className={`w-full text-sm border rounded-2xl p-3 bg-gray-50 dark:bg-gray-800/40 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all ${
                rejectMode ? "border-red-200 dark:border-red-800/50 focus:ring-red-500" : "border-gray-100 dark:border-gray-700/30 focus:ring-blue-500"
              }`}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-gray-100 dark:border-gray-700/50">
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => submit("REJECTED")}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold text-red-600 border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-60"
          >
            <ThumbsDown className="w-4 h-4" />
            {rejectMode ? "Confirm Reject" : "Reject"}
          </button>
          <button
            disabled={busy}
            onClick={() => submit("APPROVED")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-60 ${accentBtn}`}
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Inline approval actions strip (card footer) ───────────────────────────────

const ApprovalActions: React.FC<{
  status: ValidationStatus;
  canApprove: boolean;
  onReview: () => void;
}> = ({ status, canApprove, onReview }) => (
  <div className="flex items-center gap-2">
    <ValidationBadge status={status} />
    {canApprove && (
      <button
        onClick={(e) => { e.stopPropagation(); onReview(); }}
        className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        {status === "PENDING" ? "Review" : "Change"}
      </button>
    )}
  </div>
);

// ─── Export Modal ─────────────────────────────────────────────────────────────

type LocalExportFormat = ExportFormat | "rollup-pdf";

interface ExportModalProps {
  onClose: () => void;
  fixedCategory: Extract<ExportCategory, "lessons" | "mentorship">;
  allowRollup?: boolean;
  defaultParams?: {
    start_date?: string;
    end_date?: string;
    academic_term_id?: number;
    academic_term_name?: string;
    subject_id?: number;
    class_group_id?: number;
  };
}

const ExportModal: React.FC<ExportModalProps> = ({ onClose, fixedCategory, allowRollup, defaultParams = {} }) => {
  const { showToast } = useToast();
  const [exportFormat, setExportFormat] = useState<LocalExportFormat>("csv");
  const [periodMode, setPeriodMode]     = useState<"weekly" | "monthly" | "custom">("monthly");
  const [customStart, setCustomStart]   = useState(defaultParams.start_date ?? "");
  const [customEnd,   setCustomEnd]     = useState(defaultParams.end_date   ?? "");
  const [generating,  setGenerating]    = useState(false);
  const [rollupError, setRollupError]   = useState<string | null>(null);

  const today = new Date();
  const accent = fixedCategory === "lessons" ? "blue" : "emerald";

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

  const handleDownload = async () => {
    const { start, end } = getDateRange();

    if (exportFormat === "rollup-pdf") {
      if (!defaultParams.academic_term_id) {
        setRollupError("Select an academic term (top bar) before generating the rollup.");
        return;
      }
      setRollupError(null);
      setGenerating(true);
      try {
        const res = await reportsApi.getLessonReportsRollup({
          start_date: start,
          end_date: end,
          academic_term_id: defaultParams.academic_term_id,
          subject_id: defaultParams.subject_id,
          class_group_id: defaultParams.class_group_id,
        });
        const rollup = (res as any).data?.data ?? (res as any).data;
        LessonReportRollupService.generate(rollup, {
          schoolName: "NGA Coding Academy",
          academicTermName: defaultParams.academic_term_name ?? "",
          generatedBy: "",
        });
        onClose();
      } catch {
        setRollupError("Failed to generate the rollup. Please try again.");
      } finally {
        setGenerating(false);
      }
      return;
    }

    setGenerating(true);
    try {
      const res = await reportsApi.exportBlob({
        category:   fixedCategory,
        format:     exportFormat,
        start_date: start || undefined,
        end_date:   end   || undefined,
      });
      const blobUrl = URL.createObjectURL(res.data);
      if (exportFormat === "html") {
        window.open(blobUrl, "_blank");
        // Give the new tab time to load the blob before revoking it.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${fixedCategory}-report-${start || "all"}-to-${end || "all"}.csv`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
      onClose();
    } catch {
      showToast("Failed to generate the export. Please try again.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const periods = [
    { id: "weekly"  as const, label: "This Week"   },
    { id: "monthly" as const, label: "This Month"  },
    { id: "custom"  as const, label: "Custom Range" },
  ];

  return (
    <div className="fixed -top-8 inset-x-0 bottom-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800/95 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${accent === "blue" ? "bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800/50" : "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800/50"}`}>
              <Download className={`w-5 h-5 ${accent === "blue" ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"}`} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 dark:text-white">
                Download {fixedCategory === "lessons" ? "Lesson" : "Mentorship"} Report
              </h2>
              <p className="text-[11px] text-gray-400 font-medium">Export data as CSV or print-ready PDF</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
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
                    ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20 shadow-md"
                    : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                }`}
              >
                <FileDown className="w-4 h-4" />
                PDF (Print)
              </button>
              {allowRollup && (
                <button
                  onClick={() => { setExportFormat("rollup-pdf"); setRollupError(null); }}
                  className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-[10px] font-black uppercase tracking-tight transition-all ${
                    exportFormat === "rollup-pdf"
                      ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20 shadow-md"
                      : "bg-gray-50 dark:bg-gray-800/40 text-gray-400 border-gray-100 dark:border-gray-700/30 hover:text-gray-600"
                  }`}
                >
                  <Target className="w-4 h-4" />
                  Rollup PDF
                </button>
              )}
            </div>
            {exportFormat === "html" && (
              <p className="text-[9px] text-blue-500 font-bold mt-1.5 ml-1">
                Opens in a new tab — use browser Print → Save as PDF
              </p>
            )}
            {exportFormat === "rollup-pdf" && (
              <p className="text-[9px] text-blue-500 font-bold mt-1.5 ml-1">
                Grouped by Subject → Class Group → Week — matches the Academic Term/Subject/Class Group filters above
              </p>
            )}
            {rollupError && <p className="text-[9px] text-red-500 font-bold mt-1.5 ml-1">{rollupError}</p>}
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">
              Period
            </label>
            <div className="flex gap-2">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodMode(p.id)}
                  className={`flex-1 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-tight border transition-all ${
                    periodMode === p.id
                      ? "bg-slate-700 text-white border-slate-700"
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

        <div className="flex items-center gap-3 p-6 border-t border-gray-100 dark:border-gray-700/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-bold shadow-md active:scale-95 transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="animate-pulse">Generating…</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {exportFormat === "html" ? "Open PDF View" : exportFormat === "rollup-pdf" ? "Generate Rollup PDF" : "Download CSV"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Plan vs Reality Drawer ───────────────────────────────────────────────────

const DrawerStat: React.FC<{ icon: React.ReactNode; label: string; value: string | null }> = ({ icon, label, value }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-3.5 border border-emerald-100/60 dark:border-emerald-800/30 text-center hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-colors">
    <div className="flex items-center justify-center gap-1.5 text-emerald-500 dark:text-emerald-400 mb-1">{icon}</div>
    {value != null ? (
      <p className="text-xl font-black text-gray-900 dark:text-white leading-none">{value}</p>
    ) : (
      <p className="text-xs font-bold text-gray-300 dark:text-gray-600 italic leading-none">Not recorded</p>
    )}
    <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mt-1.5">{label}</p>
  </div>
);

const PlanVsRealityDrawer: React.FC<{
  log: AdminLessonReport;
  canApprove: boolean;
  onClose: () => void;
  onReview: () => void;
}> = ({ log, canApprove, onClose, onReview }) => (
  <div className="fixed -top-8 inset-x-0 bottom-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
    <motion.div
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      className="w-full sm:max-w-lg bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl border-l border-gray-100 dark:border-gray-800 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 sm:px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-gray-900 dark:text-white tracking-tight">Plan vs Reality</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1.5 truncate">
                <UserCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{log.instructor_name}</span>
                <span className="text-gray-200 dark:text-gray-700">·</span>
                {log.delivery_date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-4 flex items-center gap-2 flex-wrap">
          <ScheduleBadge flag={log.schedule_flag} />
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
            <StatusDot status={log.status} />
            {log.status}
          </span>
          <ValidationBadge status={log.validation_status} />
          {log.subject_name && (
            <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-[9px] font-black uppercase border border-blue-100 dark:border-blue-800/50">
              {log.subject_name}
            </span>
          )}
          {log.class_group_name && (
            <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-full text-[9px] font-black uppercase border border-sky-100 dark:border-sky-800/50">
              {log.class_group_name}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-5 sm:p-6 space-y-5">
        {log.validation_comment && (
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200/70 dark:border-amber-800/40 p-4">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" /> Reviewer Comment
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 font-medium leading-relaxed">{log.validation_comment}</p>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 p-5 space-y-3">
          <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> The Plan
          </p>
          {log.module_name && (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-0.5">Module</p>
              <p className="text-xs font-bold text-gray-800 dark:text-white">
                {log.module_code ? `[${log.module_code}] ` : ""}{log.module_name}
              </p>
            </div>
          )}
          {log.topic && (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-0.5">Topic</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{log.topic}</p>
            </div>
          )}
          {log.sub_topic && (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-0.5">Sub-topic</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{log.sub_topic}</p>
            </div>
          )}
          {log.big_question && (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-0.5">Big Question</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 italic font-medium">"{log.big_question}"</p>
            </div>
          )}
          {log.objective && (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-0.5">Objective</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium leading-relaxed">{log.objective}</p>
            </div>
          )}
          {!log.module_name && !log.topic && !log.big_question && !log.objective && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No structured lesson plan linked to this report.</p>
          )}
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 p-5 space-y-4">
          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> The Reality
          </p>
          <div className="grid grid-cols-2 gap-3">
            <DrawerStat icon={<Users className="w-3.5 h-3.5" />} label="Attendance" value={log.attendance_count != null ? String(log.attendance_count) : null} />
            <DrawerStat icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Completion" value={log.completion_rate != null ? `${log.completion_rate}%` : null} />
          </div>
          {log.reflection_notes ? (
            <div>
              <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-1.5">Instructor Reflection</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 rounded-xl p-3.5 border border-emerald-100/60 dark:border-emerald-800/30">
                {log.reflection_notes}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No reflection notes submitted.</p>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      {canApprove && (
        <div className="sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-100 dark:border-gray-800 p-4 sm:p-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Close
          </button>
          <button
            onClick={onReview}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            {log.validation_status === "PENDING" ? "Review & Decide" : "Change Decision"}
          </button>
        </div>
      )}
    </motion.div>
  </div>
);

// ─── Mentorship Session Drawer ─────────────────────────────────────────────────

const MentorshipSessionDrawer: React.FC<{
  log: AdminMentorshipLog;
  canApprove: boolean;
  onClose: () => void;
  onReview: () => void;
}> = ({ log, canApprove, onClose, onReview }) => (
  <div className="fixed -top-8 inset-x-0 bottom-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
    <motion.div
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      className="w-full sm:max-w-lg bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl border-l border-gray-100 dark:border-gray-800 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 sm:px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-gray-900 dark:text-white tracking-tight">Mentorship Session</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1.5 truncate">
                <UserCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{log.instructor_name}</span>
                <span className="text-gray-200 dark:text-gray-700">·</span>
                {log.session_date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-4 flex items-center gap-2 flex-wrap">
          <ValidationBadge status={log.validation_status} />
          {log.session_status && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
              {log.session_status}
            </span>
          )}
          {log.wellbeing_status && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-800/30">
              {WELLBEING_EMOJI_ADMIN[log.wellbeing_status] ?? ""} {log.wellbeing_status}
            </span>
          )}
          {log.follow_up_required === 1 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-800/30">
              <AlertCircle className="w-3 h-3" /> Follow-up
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-5 sm:p-6 space-y-5">
        {log.validation_comment && (
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200/70 dark:border-amber-800/40 p-4">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" /> Reviewer Comment
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 font-medium leading-relaxed">{log.validation_comment}</p>
          </div>
        )}

        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 p-5 space-y-4">
          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5" /> Student
          </p>
          <p className="text-xs font-bold text-gray-800 dark:text-white">{log.student_name ?? "Student not specified"}</p>

          <div className="grid grid-cols-2 gap-3">
            <DrawerStat icon={<Clock3 className="w-3.5 h-3.5" />} label="Duration" value={log.duration_minutes != null ? `${log.duration_minutes} min` : null} />
            <DrawerStat icon={<Tag className="w-3.5 h-3.5" />} label="Topic" value={log.topic ?? null} />
          </div>
        </div>

        <div>
          <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-1.5">Session Notes</p>
          {log.notes ? (
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 rounded-xl p-3.5 border border-gray-100 dark:border-gray-700/50">
              {log.notes}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No session notes submitted.</p>
          )}
        </div>

        <div>
          <p className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter mb-1.5">Action Items</p>
          {log.action_items ? (
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 rounded-xl p-3.5 border border-gray-100 dark:border-gray-700/50">
              {log.action_items}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No action items recorded.</p>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      {canApprove && (
        <div className="sticky bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-100 dark:border-gray-800 p-4 sm:p-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Close
          </button>
          <button
            onClick={onReview}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            {log.validation_status === "PENDING" ? "Review & Decide" : "Change Decision"}
          </button>
        </div>
      )}
    </motion.div>
  </div>
);

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
    UNPLANNED: "bg-sky-400",
    ON_TRACK:  "bg-emerald-500",
    AHEAD:     "bg-blue-500",
    BEHIND:    "bg-amber-400",
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-400"}`} />;
};

const ListFooter: React.FC<{ count: number; label: string }> = ({ count, label }) => (
  <div className="bg-white/50 dark:bg-gray-800/50 px-8 py-4 rounded-2xl flex items-center justify-between backdrop-blur-sm">
    <div className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
      Found <span className="text-blue-600 dark:text-blue-400 mx-1">{count}</span> {label}
    </div>
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-tighter border border-white dark:border-gray-700">
      Verified Data Summary
    </div>
  </div>
);

const skeleton = (
  <div className="space-y-4 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="bg-white dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-6 h-24" />
    ))}
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// LESSON PANEL — Weekly Reports + Lesson Logs, with approve/reject on logs
// ═════════════════════════════════════════════════════════════════════════════

type LessonSubTab = "weekly" | "lessons";

interface LessonReportsPanelProps {
  reports:    any[];
  lessonLogs: AdminLessonReport[];
  loading:    boolean;
  canApprove: boolean;
  onViewDetails: (report: any) => void;
  onApprove: (id: number, status: ValidationStatus, comment?: string) => Promise<void>;
  exportParams?: ExportModalProps["defaultParams"];
}

export const LessonReportsPanel: React.FC<LessonReportsPanelProps> = ({
  reports, lessonLogs, loading, canApprove, onViewDetails, onApprove, exportParams,
}) => {
  const [subTab, setSubTab] = useState<LessonSubTab>("lessons");
  const [showExport, setShowExport] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<AdminLessonReport | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdminLessonReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const subTabs: { id: LessonSubTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "lessons", label: "Lesson Logs",    icon: <BookOpen className="w-4 h-4" />, count: lessonLogs.length },
    { id: "weekly",  label: "Weekly Reports", icon: <FileText className="w-4 h-4" />, count: reports.length },
  ];

  const filteredLessonLogs = statusFilter === "ALL"
    ? lessonLogs
    : lessonLogs.filter((l) => l.validation_status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 p-1.5 bg-white dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/30">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                subTab === tab.id
                  ? "bg-blue-600 text-white shadow-blue-500/20 shadow-sm"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${subTab === tab.id ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"}`}>{tab.count}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full text-xs font-bold transition-all shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download Report
        </button>
      </div>

      {subTab === "lessons" && (
        <>
          {lessonLogs.length > 0 && (
            <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} items={lessonLogs} />
          )}
          {loading && lessonLogs.length === 0 ? skeleton : filteredLessonLogs.length === 0 ? (
            <EmptyState label={lessonLogs.length === 0 ? "lesson reports" : "reports matching this filter"} />
          ) : (
            <LessonLogList logs={filteredLessonLogs} canApprove={canApprove} onSelect={setSelectedLesson} onReview={setReviewTarget} />
          )}
        </>
      )}

      {subTab === "weekly" && (
        loading && reports.length === 0 ? skeleton : reports.length === 0 ? (
          <EmptyState label="weekly reports" />
        ) : (
          <LegacyReportList reports={reports} onViewDetails={onViewDetails} />
        )
      )}

      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} fixedCategory="lessons" allowRollup defaultParams={exportParams} />
      )}

      {selectedLesson && (
        <PlanVsRealityDrawer
          log={selectedLesson}
          canApprove={canApprove}
          onClose={() => setSelectedLesson(null)}
          onReview={() => { setReviewTarget(selectedLesson); setSelectedLesson(null); }}
        />
      )}

      {reviewTarget && (
        <ApprovalModal
          accent="blue"
          target={{
            id: reviewTarget.lesson_report_id,
            title: reviewTarget.instructor_name,
            subtitle: `${reviewTarget.module_name ?? reviewTarget.topic ?? "Lesson"} · ${reviewTarget.delivery_date}`,
            validation_status: reviewTarget.validation_status,
            validation_comment: reviewTarget.validation_comment,
          }}
          onClose={() => setReviewTarget(null)}
          onSubmit={async (status, comment) => {
            await onApprove(reviewTarget.lesson_report_id, status, comment);
            setReviewTarget(null);
          }}
        />
      )}
    </div>
  );
};

// ─── Legacy weekly report list ────────────────────────────────────────────────

const LegacyReportList: React.FC<{ reports: any[]; onViewDetails: (r: any) => void }> = ({ reports, onViewDetails }) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-4">
      {reports.map((report) => (
        <div
          key={report.report_id}
          onClick={() => onViewDetails(report)}
          className="group bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 hover:shadow-blue-500/5 hover:border-blue-200 dark:hover:border-blue-800/50 transition-all duration-300 cursor-pointer relative overflow-hidden"
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
              <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-700/30 text-center">
                <div className="text-base font-black text-gray-900 dark:text-white leading-none">{report.lessons_delivered_count}</div>
                <div className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase mt-1 tracking-tighter">Lessons</div>
              </div>
              <div className="flex-1 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl p-2.5 border border-gray-100/50 dark:border-gray-700/30 text-center">
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

const LessonLogList: React.FC<{
  logs: AdminLessonReport[];
  canApprove: boolean;
  onSelect: (l: AdminLessonReport) => void;
  onReview: (l: AdminLessonReport) => void;
}> = ({ logs, canApprove, onSelect, onReview }) => (
  <div className="space-y-3">
    {logs.map((log) => (
      <div
        key={log.lesson_report_id}
        className="group bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 hover:border-blue-200 dark:hover:border-blue-800/50 hover:shadow-sm transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div onClick={() => onSelect(log)} className="flex items-center gap-3 sm:w-1/4 cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50 flex-shrink-0">
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

          <div onClick={() => onSelect(log)} className="flex-1 min-w-0 cursor-pointer">
            <p className="text-xs font-bold text-gray-800 dark:text-white truncate">
              {log.status === "UNPLANNED"
                ? "Unscheduled activity"
                : `${log.module_code ? `[${log.module_code}] ` : ""}${log.module_name ?? "—"}`}
            </p>
            {log.topic && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5">{log.topic}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {log.subject_name && (
                <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-[8px] font-black uppercase border border-blue-100/30">
                  {log.subject_name}
                </span>
              )}
              {log.class_group_name && (
                <span className="inline-block px-2 py-0.5 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-full text-[8px] font-black uppercase border border-sky-100/30">
                  {log.class_group_name}
                </span>
              )}
            </div>
          </div>

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

          <div className="flex items-center gap-2 sm:flex-shrink-0 flex-wrap justify-end">
            <div className="flex items-center gap-1.5">
              <StatusDot status={log.status} />
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{log.status}</span>
            </div>
            <ScheduleBadge flag={log.schedule_flag} />
            <ApprovalActions status={log.validation_status} canApprove={canApprove} onReview={() => onReview(log)} />
            <button
              onClick={() => onSelect(log)}
              className="w-7 h-7 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    ))}
    <ListFooter count={logs.length} label="Lesson Reports" />
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// MENTORSHIP PANEL — Mentorship session logs, with approve/reject
// ═════════════════════════════════════════════════════════════════════════════

interface MentorshipLogsPanelProps {
  logs:       AdminMentorshipLog[];
  loading:    boolean;
  canApprove: boolean;
  onApprove:  (id: number, status: ValidationStatus, comment?: string) => Promise<void>;
  exportParams?: ExportModalProps["defaultParams"];
}

export const MentorshipLogsPanel: React.FC<MentorshipLogsPanelProps> = ({
  logs, loading, canApprove, onApprove, exportParams,
}) => {
  const [showExport, setShowExport] = useState(false);
  const [studentProfile, setStudentProfile] = useState<{ id: number; name: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdminMentorshipLog | null>(null);
  const [selectedSession, setSelectedSession] = useState<AdminMentorshipLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filteredLogs = statusFilter === "ALL"
    ? logs
    : logs.filter((l) => l.validation_status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/30">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            Mentorship Session Logs
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-black">
            {logs.length}
          </span>
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-full text-xs font-bold transition-all shadow-sm"
        >
          <Download className="w-4 h-4" />
          Download Report
        </button>
      </div>

      {logs.length > 0 && (
        <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} items={logs} />
      )}

      {loading && logs.length === 0 ? skeleton : filteredLogs.length === 0 ? (
        <EmptyState label={logs.length === 0 ? "mentorship logs" : "logs matching this filter"} />
      ) : (
        <MentorshipLogList
          logs={filteredLogs}
          canApprove={canApprove}
          onStudentClick={(id, name) => setStudentProfile({ id, name })}
          onSelect={setSelectedSession}
          onReview={setReviewTarget}
        />
      )}

      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} fixedCategory="mentorship" defaultParams={exportParams} />
      )}

      {studentProfile && (
        <AdminStudentSupportModal
          studentId={studentProfile.id}
          studentName={studentProfile.name}
          onClose={() => setStudentProfile(null)}
        />
      )}

      {selectedSession && (
        <MentorshipSessionDrawer
          log={selectedSession}
          canApprove={canApprove}
          onClose={() => setSelectedSession(null)}
          onReview={() => { setReviewTarget(selectedSession); setSelectedSession(null); }}
        />
      )}

      {reviewTarget && (
        <ApprovalModal
          accent="emerald"
          target={{
            id: reviewTarget.mentorship_id,
            title: reviewTarget.instructor_name,
            subtitle: `${reviewTarget.student_name ?? "Session"} · ${reviewTarget.session_date}`,
            validation_status: reviewTarget.validation_status,
            validation_comment: reviewTarget.validation_comment,
          }}
          onClose={() => setReviewTarget(null)}
          onSubmit={async (status, comment) => {
            await onApprove(reviewTarget.mentorship_id, status, comment);
            setReviewTarget(null);
          }}
        />
      )}
    </div>
  );
};

const WELLBEING_EMOJI_ADMIN: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED:  "😟",
  NEUTRAL:    "😐",
  GOOD:       "🙂",
  EXCELLENT:  "😄",
};

const MentorshipLogList: React.FC<{
  logs: AdminMentorshipLog[];
  canApprove: boolean;
  onStudentClick: (studentId: number, studentName: string) => void;
  onSelect: (log: AdminMentorshipLog) => void;
  onReview: (log: AdminMentorshipLog) => void;
}> = ({ logs, canApprove, onStudentClick, onSelect, onReview }) => (
  <div className="space-y-3">
    {logs.map((log) => (
      <div
        key={log.mentorship_id}
        className="group bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div onClick={() => onSelect(log)} className="flex items-center gap-3 sm:w-1/4 cursor-pointer">
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

          <div onClick={() => onSelect(log)} className="flex-1 min-w-0 cursor-pointer">
            {log.student_id ? (
              <button
                onClick={(e) => { e.stopPropagation(); onStudentClick(log.student_id!, log.student_name ?? "Student"); }}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline truncate flex items-center gap-1 text-left"
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
            {log.topic && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full font-bold mt-1">
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
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-800/30">
                {WELLBEING_EMOJI_ADMIN[log.wellbeing_status] ?? ""} {log.wellbeing_status}
              </span>
            )}
            {log.follow_up_required === 1 && (
              <span className="flex items-center gap-1 text-amber-600 font-black text-[9px] uppercase">
                <AlertCircle className="w-3 h-3" /> Follow-up
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:flex-shrink-0">
            <ApprovalActions status={log.validation_status} canApprove={canApprove} onReview={() => onReview(log)} />
            <button
              onClick={() => onSelect(log)}
              className="w-7 h-7 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all"
              title="Preview session details"
            >
              <Eye className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    ))}
    <ListFooter count={logs.length} label="Mentorship Sessions" />
  </div>
);
