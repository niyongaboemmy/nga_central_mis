import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Users,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  List,
  ArrowRight,
  MessageSquare,
  Eye,
  RefreshCw,
  X,
  Download,
} from "lucide-react";
import { schemeOfWorkApi, SchemeEntry } from "../api/schemeOfWork";
import { lessonPlanApi, LessonPlan } from "../api/lessonPlan";
import { useToast } from "../contexts/ToastContext";
import { useUser } from "../contexts/UserContext";
import RealCalendarView from "./RealCalendarView";
import LessonPlanPreviewModal from "./LessonPlanPreviewModal";
import SchemeOfWorkPreviewModal from "./SchemeOfWorkPreviewModal";
import SchemeReportPreviewModal from "./SchemeReportPreviewModal";
import { SchemeReportService } from "../services/SchemeReportService";
import SelectField from "./ui/SelectField";

type ViewTab = "timeline" | "calendar";
type StatusFilter = "all" | "complete" | "incomplete" | "missing";

const SchemeDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const subjectId = parseInt(searchParams.get("subject_id") || "0");
  const classGroupId = parseInt(searchParams.get("class_group_id") || "0");
  const academicTermId = parseInt(searchParams.get("academic_term_id") || "0");
  const teacherName = decodeURIComponent(searchParams.get("name") || "");
  const subjectName = decodeURIComponent(
    searchParams.get("subject_name") || "",
  );

  const [isPreviewReportOpen, setIsPreviewReportOpen] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [entries, setEntries] = useState<SchemeEntry[]>([]);
  const [lessonPlans, setLessonPlans] = useState<Record<number, LessonPlan[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ViewTab>("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(
    new Set(),
  );

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<SchemeEntry | null>(null);
  const [isPreviewLessonModalOpen, setIsPreviewLessonModalOpen] =
    useState(false);
  const [selectedLessonPlan, setSelectedLessonPlan] =
    useState<LessonPlan | null>(null);

  // For when missing specific parameters, we need to fetch the teacher's subjects
  const userId = searchParams.get("user_id");
  const { user } = useUser();
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Validation form state
  const [validating, setValidating] = useState(false);
  const [validationComment, setValidationComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [validationStatus, setValidationStatus] = useState<
    "APPROVED" | "REJECTED"
  >("APPROVED");

  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<number>>(
    new Set(),
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (
      subjectId &&
      classGroupId &&
      academicTermId &&
      !initializedRef.current
    ) {
      loadData();
      initializedRef.current = true;
    } else if (!subjectId && userId && !initializedRef.current) {
      loadTeacherSubjects();
      initializedRef.current = true;
    }
  }, [subjectId, classGroupId, academicTermId, userId]);

  const loadTeacherSubjects = async () => {
    setLoadingSubjects(true);
    try {
      // We can fetch the teacher's configured subjects from the same endpoint used by the dashboard
      // by retrieving all and filtering, or by implementing a targeted query. Since the dashboard state
      // might be lost on direct navigation, we'll use the API.
      const yearStr = sessionStorage.getItem("allTeachersSow_year");
      const termStr = sessionStorage.getItem("allTeachersSow_term");

      // Check cache first
      const cacheKey = `teacher_subjects_${userId}_${yearStr}_${termStr}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          // 5 minutes cache
          setTeacherSubjects(data);
          setLoadingSubjects(false);
          return;
        }
      }

      const payload: any = { role: "TEACHER" };
      if (yearStr) payload.academic_year_id = parseInt(JSON.parse(yearStr));
      if (termStr) payload.academic_term_id = parseInt(JSON.parse(termStr));

      const res = await schemeOfWorkApi.getAllTeachers(payload);
      const allTeachers: any[] = (res.data as any)?.data || [];
      const teacher = allTeachers.find((t) => t.user_id.toString() === userId);

      if (teacher && teacher.schemes) {
        setTeacherSubjects(teacher.schemes);
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            timestamp: Date.now(),
            data: teacher.schemes,
          }),
        );
      }
    } catch (error) {
      // showToast("Failed to load teacher subjects", "error");
      console.log("Failed to load teacher subjects", error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Check cache first
      const cacheKey = `sow_details_${subjectId}_${classGroupId}_${academicTermId}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            // 5 minutes cache
            setEntries(data?.entries || []);
            setLessonPlans(data?.lessonPlans || {});
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error("Cache parse error in loadData", e);
          sessionStorage.removeItem(cacheKey);
        }
      }

      const resp = await schemeOfWorkApi.getEntries(
        subjectId,
        classGroupId,
        academicTermId,
      );
      const rawData = (resp.data as any).data;
      const entryList = Array.isArray(rawData)
        ? rawData
        : rawData?.entries || [];
      setEntries(entryList);

      const plansMap: Record<number, LessonPlan[]> = {};
      await Promise.all(
        entryList.map(async (entry: SchemeEntry) => {
          try {
            const plansResp = await lessonPlanApi.getByEntry(entry.entry_id);
            plansMap[entry.entry_id] = plansResp.data;
          } catch {
            plansMap[entry.entry_id] = [];
          }
        }),
      );
      setLessonPlans(plansMap);
      setSelectedEntryIds(
        new Set(entryList.map((e: SchemeEntry) => e.entry_id)),
      );

      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          data: { entries: entryList, lessonPlans: plansMap },
        }),
      );
    } catch (e) {
      console.error("Failed to load scheme data", e);
      showToast("Failed to load scheme data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    const cacheKey = `sow_details_${subjectId}_${classGroupId}_${academicTermId}`;
    sessionStorage.removeItem(cacheKey);
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith("teacher_subjects_")) {
        sessionStorage.removeItem(key);
      }
    });
    showToast("Local cache cleared", "success");
    loadData();
    if (userId) loadTeacherSubjects();
  };

  const handlePreviewReport = async () => {
    const schemeId = entries[0]?.scheme_id;
    if (!schemeId) {
      showToast("No data to export", "warning");
      return;
    }
    try {
      setIsGeneratingReport(true);
      const pdfUrl = await SchemeReportService.getPreviewBlobUrl(schemeId);
      setReportPdfUrl(pdfUrl);
      setIsPreviewReportOpen(true);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to generate PDF report",
        "error",
      );
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleActualDownload = async () => {
    const schemeId = entries[0]?.scheme_id;
    if (!schemeId) return;
    try {
      await SchemeReportService.downloadPdf(
        schemeId,
        `Scheme_of_Work_${subjectName || schemeId}`,
      );
      showToast("PDF Report downloaded", "success");
      setIsPreviewReportOpen(false);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to download PDF report",
        "error",
      );
    }
  };

  const handleValidate = async (status: "APPROVED" | "REJECTED") => {
    if (status === "REJECTED" && !validationComment.trim()) {
      setValidationError("Please provide a reason for rejection.");
      return;
    }

    if (selectedEntryIds.size === 0) {
      setValidationError("Please select at least one entry to validate.");
      return;
    }

    setValidating(true);
    setValidationError(null); // Clear previous errors
    try {
      await schemeOfWorkApi.validateScheme(
        Array.from(selectedEntryIds),
        status,
        validationComment,
      );
      showToast(
        `Selected entries ${status.toLowerCase()} successfully`,
        "success",
      );

      // Clear caches and reload data so changes reflect everywhere (e.g. Dashboard, List)
      const cacheKey = `sow_details_${subjectId}_${classGroupId}_${academicTermId}`;
      sessionStorage.removeItem(cacheKey);
      const keys = Object.keys(sessionStorage);
      keys.forEach((key) => {
        if (
          key.startsWith("teacher_subjects_") ||
          key.startsWith("sow_details_")
        ) {
          sessionStorage.removeItem(key);
        }
      });
      loadData();
      if (userId) loadTeacherSubjects();

      setSelectedEntryIds(new Set());
      setIsValidationModalOpen(false);
    } catch (error: any) {
      setValidationError(error.response?.data?.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const currentSchemeRecord = useMemo(() => {
    return teacherSubjects.find(
      (s) =>
        s.subject_id === subjectId &&
        s.class_group_id === classGroupId &&
        s.academic_term_id === academicTermId,
    );
  }, [teacherSubjects, subjectId, classGroupId, academicTermId]);

  const schemeStatus = useMemo(() => {
    if (entries.length > 0) {
      return entries[0].validation_status || "PENDING";
    }
    return currentSchemeRecord?.validation_status || "PENDING";
  }, [entries, currentSchemeRecord]);

  const schemeComment = useMemo(() => {
    if (entries.length > 0) {
      return entries[0].validation_comment || "";
    }
    return currentSchemeRecord?.validation_comment || "";
  }, [entries, currentSchemeRecord]);

  const hasValidatePermission = useMemo(() => {
    return user?.permissions?.includes("VALIDATE_SCHEME_OF_WORK");
  }, [user]);

  const getEntryStatus = (entry: SchemeEntry) => {
    const plans = lessonPlans[entry.entry_id] || [];
    const today = new Date();
    const endDate = new Date(entry.end_date);
    if (plans.length === 0) return endDate < today ? "missing" : "incomplete";
    const hasComplete = plans.some(
      (p) =>
        p.big_question ||
        (p.outcomes && p.outcomes.length > 0) ||
        (p.sections && p.sections.length > 0),
    );
    return hasComplete ? "complete" : "incomplete";
  };

  const stats = useMemo(() => {
    const total = entries.length;
    const complete = entries.filter(
      (e) => getEntryStatus(e) === "complete",
    ).length;
    const incomplete = entries.filter(
      (e) => getEntryStatus(e) === "incomplete",
    ).length;
    const missing = entries.filter(
      (e) => getEntryStatus(e) === "missing",
    ).length;
    const progress = total > 0 ? Math.round((complete / total) * 100) : 0;
    return { total, complete, incomplete, missing, progress };
  }, [entries, lessonPlans]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.objective?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.week_number?.toString().includes(searchQuery);
      const status = getEntryStatus(entry);
      const matchesStatus = filterStatus === "all" || status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [entries, searchQuery, filterStatus, lessonPlans]);

  const toggleExpanded = (id: number) => {
    const s = new Set(expandedEntries);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedEntries(s);
  };

  const handlePreviewLessonPlan = (plan: LessonPlan) => {
    setSelectedLessonPlan(plan);
    setIsPreviewLessonModalOpen(true);
  };

  if (!subjectId || !classGroupId || !academicTermId) {
    return (
      <div className="p-5 max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleClearCache}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold transition-all border border-gray-200 dark:border-gray-700"
              title="Refresh from Server"
            >
              <RefreshCw className="w-4 h-4" />
              Clear Cache
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
              {teacherName ? teacherName.slice(0, 2).toUpperCase() : "??"}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">
                {teacherName || "Instructor"}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Select a subject to view the scheme of work
              </p>
            </div>
          </div>
        </motion.div>

        {loadingSubjects ? (
          <div className="flex flex-col items-center justify-center py-20">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full mb-3"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading assigned subjects...
            </p>
          </div>
        ) : teacherSubjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            <AlertCircle className="w-12 h-12 text-rose-400 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              No active subjects
            </h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium text-center max-w-sm px-4">
              {teacherName || "This instructor"} hasn't been assigned or hasn't
              started configuring a scheme of work for any context yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teacherSubjects.map((scheme, idx) => (
              <motion.div
                key={`${scheme.subject_id}-${scheme.class_group_id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() =>
                  navigate(
                    `/all-teachers-sow/details?user_id=${userId}&subject_id=${scheme.subject_id}&class_group_id=${scheme.class_group_id}&academic_term_id=${scheme.academic_term_id}&name=${encodeURIComponent(teacherName)}&subject_name=${encodeURIComponent(scheme.subject_name)}`,
                  )
                }
                className="group cursor-pointer bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-blue-300 hover:shadow-lg transition-all p-5"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                      {scheme.subject_name}
                      {scheme.subject_code && (
                        <span className="text-gray-400 ml-1">
                          ({scheme.subject_code})
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {scheme.class_group_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{" "}
                        {scheme.academic_term_name}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      scheme.status === "submitted"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
                        : "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800"
                    }`}
                  >
                    {scheme.status === "submitted" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {scheme.status === "submitted" ? "Submitted" : "Pending"}
                  </span>

                  <div className="flex items-center gap-3">
                    {scheme.entries_count > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                        <FileText className="w-3 h-3" /> {scheme.entries_count}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Overview
          </button>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-all"
            title="Refresh from Server"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Clear Cache
          </button>
        </div>

        {/* Teacher / Subject Info Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm">
              {teacherName ? teacherName.slice(0, 2).toUpperCase() : "??"}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-base font-extrabold text-gray-900 dark:text-white">
                  {teacherName || "Instructor"}
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
                  Teacher
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  {subjectName}
                </span>
                <span className="text-gray-300 dark:text-gray-700">•</span>
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Class Group #{classGroupId}
                </span>
                <span className="text-gray-300 dark:text-gray-700">•</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Term #{academicTermId}
                </span>
              </div>
            </div>

            {/* Quick stats */}
            {!loading && (
              <div className="flex gap-2 flex-shrink-0">
                {[
                  {
                    label: "Weeks",
                    value: stats.total,
                    color: "text-gray-700 dark:text-gray-300",
                  },
                  {
                    label: "Done",
                    value: stats.complete,
                    color: "text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    label: "Missing",
                    value: stats.missing,
                    color: "text-rose-600 dark:text-rose-400",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="text-center bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5"
                  >
                    <div className={`text-base font-black leading-tight ${s.color}`}>
                      {s.value}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress bar */}
          {!loading && (
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                <span>Lesson Plan Progress</span>
                <span className="font-bold">{stats.progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.progress}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Validation Section (Only for Admins) */}
        {!loading &&
          subjectId > 0 &&
          (currentSchemeRecord || hasValidatePermission) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 overflow-hidden relative"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      currentSchemeRecord?.validation_status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                        : currentSchemeRecord?.validation_status === "REJECTED"
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                      Scheme Approval Status
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md border ${
                          schemeStatus === "APPROVED"
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-800 dark:text-emerald-400"
                            : schemeStatus === "REJECTED"
                              ? "bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-900/10 dark:border-rose-800 dark:text-rose-400"
                              : "bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-900/10 dark:border-amber-800 dark:text-amber-400"
                        }`}
                      >
                        {schemeStatus}
                      </span>
                      {schemeStatus !== "PENDING" &&
                        currentSchemeRecord?.updated_at && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            Updated{" "}
                            {new Date(
                              currentSchemeRecord.updated_at,
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                    </div>
                  </div>
                </div>

                {hasValidatePermission && (
                  <div className="flex items-center gap-2">
                    {schemeStatus === "PENDING" ? (
                      <button
                        onClick={() => {
                          setValidationStatus("APPROVED");
                          setValidationComment("");
                          setSelectedEntryIds(
                            new Set(entries.map((e) => e.entry_id)),
                          );
                          setValidationError(null);
                          setIsValidationModalOpen(true);
                        }}
                        className="px-5 py-2 bg-blue-600 text-white rounded-full font-bold text-xs hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25 active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        Validate Scheme
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsDetailsModalOpen(true)}
                          className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full font-semibold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                        <button
                          onClick={() => {
                            setValidationStatus(
                              (schemeStatus as any) || "APPROVED",
                            );
                            setValidationComment(schemeComment || "");

                            // Auto-select all entries for update
                            setSelectedEntryIds(
                              new Set(entries.map((e) => e.entry_id)),
                            );

                            setValidationError(null);
                            setIsValidationModalOpen(true);
                          }}
                          className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-semibold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Update Validation
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
      </motion.div>

      {/* Missing Plans Banner */}
      <AnimatePresence>
        {!loading && stats.missing > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 px-4 py-2.5 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl"
          >
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <p className="text-xs text-rose-600 dark:text-rose-400">
              <span className="font-bold">
                {stats.missing} week{stats.missing !== 1 ? "s" : ""}
              </span>{" "}
              from past periods have no lesson plan defined.
            </p>
            <button
              onClick={() => {
                setActiveTab("timeline");
                setFilterStatus("missing");
              }}
              className="ml-auto flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors"
            >
              View <ArrowRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 flex justify-between items-center pr-2">
        <div className="flex gap-1">
          {(
            [
              {
                key: "calendar" as ViewTab,
                label: "Calendar View",
                icon: Calendar,
              },
              {
                key: "timeline" as ViewTab,
                label: "Timeline View",
                icon: List,
              },
            ] as { key: ViewTab; label: string; icon: React.ElementType }[]
          ).map((tab) => (
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
            </button>
          ))}
        </div>

        {/* Download Button moved here */}
        <button
          onClick={handlePreviewReport}
          disabled={isGeneratingReport}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-all disabled:opacity-60"
          title="Download PDF Report"
        >
          <Download className="w-3.5 h-3.5" />
          {isGeneratingReport ? "Generating..." : "Download PDF"}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full mb-3"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading scheme data...
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <FileText className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            No scheme of work submitted yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            This teacher has not uploaded a scheme of work for this subject.
          </p>
        </div>
      ) : activeTab === "calendar" ? (
        /* ── Calendar View - render via RealCalendarView ── */
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <RealCalendarView
            entries={entries}
            lessonPlans={lessonPlans}
            onDayClick={() => {}} // read-only for admin
            onPlanClick={handlePreviewLessonPlan}
            onDeletePlan={() => {}} // read-only
          />
        </div>
      ) : (
        /* ── Timeline View ── */
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/30 rounded-xl p-3.5 space-y-3.5">
            <div className="flex flex-col lg:flex-row gap-2.5">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search topics, objectives..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                <SelectField
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value as StatusFilter)
                  }
                  className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  <option value="all">All Weeks</option>
                  <option value="complete">Complete</option>
                  <option value="incomplete">In Progress</option>
                  <option value="missing">Missing Plans</option>
                </SelectField>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                {
                  label: "Total",
                  value: stats.total,
                  icon: BookOpen,
                  color: "text-blue-600 dark:text-blue-400",
                  bg: "bg-blue-50 dark:bg-blue-900/20",
                },
                {
                  label: "Complete",
                  value: stats.complete,
                  icon: CheckCircle2,
                  color: "text-emerald-600 dark:text-emerald-400",
                  bg: "bg-emerald-50 dark:bg-emerald-900/20",
                },
                {
                  label: "In Progress",
                  value: stats.incomplete,
                  icon: Clock,
                  color: "text-yellow-600 dark:text-yellow-400",
                  bg: "bg-yellow-50 dark:bg-yellow-900/20",
                },
                {
                  label: "Missing",
                  value: stats.missing,
                  icon: AlertCircle,
                  color: "text-rose-600 dark:text-rose-400",
                  bg: "bg-rose-50 dark:bg-rose-900/20",
                },
                {
                  label: "Progress",
                  value: `${stats.progress}%`,
                  icon: TrendingUp,
                  color: "text-blue-600 dark:text-blue-400",
                  bg: "bg-blue-50 dark:bg-blue-900/20",
                },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center`}
                  >
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {s.label}
                    </div>
                    <div className={`text-sm font-bold ${s.color}`}>
                      {s.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-blue-500 to-blue-500"
              />
            </div>
          </div>

          {/* Entries */}
          <div className="relative">
            {/* Vertical Timeline Line — centered on the same w-6 rail column each dot sits in, so
                the two can never drift out of alignment the way separate magic-number offsets could. */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-gray-200 via-gray-200 to-transparent dark:from-gray-700 dark:via-gray-800 dark:to-transparent hidden md:block" />
            <AnimatePresence mode="popLayout">
              {filteredEntries.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 text-gray-500"
                >
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-medium">No entries found</p>
                </motion.div>
              ) : (
                filteredEntries.map((entry, index) => {
                  const status = getEntryStatus(entry);
                  const plans = lessonPlans[entry.entry_id] || [];
                  const isExpanded = expandedEntries.has(entry.entry_id);

                  return (
                    <motion.div
                      key={entry.entry_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.04 }}
                      className="relative mb-4 flex md:gap-4"
                    >
                      {/* Timeline dot — centered in the same w-6 rail column the connecting line
                          runs through, via flex, instead of a hand-tuned negative-left offset. */}
                      <div className="hidden md:flex flex-col items-center w-6 flex-shrink-0">
                        <span
                          className={`mt-6 w-3 h-3 rounded-full ring-4 ring-white dark:ring-gray-950 shadow-sm ${
                            status === "complete"
                              ? "bg-emerald-500"
                              : status === "missing"
                                ? "bg-rose-500"
                                : "bg-amber-500"
                          }`}
                        />
                      </div>

                      <div className="group flex-1 min-w-0 bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/30 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300">
                        <div className="p-5">
                          <div className="flex flex-col md:flex-row md:items-start gap-4">
                            {/* Week + date */}
                            <div className="flex-shrink-0 md:w-40">
                              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
                                {entry.week_number}
                              </span>
                              <div className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                                {new Date(entry.start_date).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )}
                                {" – "}
                                {new Date(entry.end_date).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )}
                              </div>
                              <div className="mt-1.5">
                                {status === "complete" && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />{" "}
                                    Complete
                                  </span>
                                )}
                                {status === "incomplete" && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                                    <Clock className="w-3 h-3" /> In Progress
                                  </span>
                                )}
                                {status === "missing" && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full">
                                    <AlertCircle className="w-3 h-3" /> Missing
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Topic + plans */}
                            <div className="flex-grow">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h3
                                  onClick={() => {
                                    setPreviewEntry(entry);
                                    setIsPreviewModalOpen(true);
                                  }}
                                  className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  {entry.topic || (
                                    <em className="text-gray-400">
                                      No topic specified
                                    </em>
                                  )}
                                </h3>
                                <button
                                  onClick={() => toggleExpanded(entry.entry_id)}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                              </div>

                              {entry.objective && (
                                <p
                                  className={`text-sm text-gray-600 dark:text-gray-300 mb-3 ${!isExpanded && "line-clamp-2"}`}
                                >
                                  {entry.objective}
                                </p>
                              )}

                              {/* Lesson plan chips */}
                              <div className="flex flex-wrap gap-2">
                                {plans.map((plan) => (
                                  <button
                                    key={plan.id}
                                    onClick={() =>
                                      handlePreviewLessonPlan(plan)
                                    }
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-all"
                                  >
                                    <Clock className="w-3 h-3" />
                                    {new Date(
                                      plan.lesson_date,
                                    ).toLocaleDateString(undefined, {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </button>
                                ))}

                                {entry.validation_status && (
                                  <span
                                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border ${
                                      entry.validation_status === "APPROVED"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                                        : entry.validation_status === "REJECTED"
                                          ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                                          : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                                    }`}
                                  >
                                    {entry.validation_status === "APPROVED" ? (
                                      <CheckCircle2 className="w-3 h-3" />
                                    ) : entry.validation_status ===
                                      "REJECTED" ? (
                                      <AlertCircle className="w-3 h-3" />
                                    ) : (
                                      <Clock className="w-3 h-3" />
                                    )}
                                    {entry.validation_status}
                                  </span>
                                )}

                                {plans.length === 0 && (
                                  <span className="text-xs text-gray-400 italic flex items-center gap-1">
                                    No lesson plans yet
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                {plans.length} lesson plan
                                {plans.length !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden"
                            >
                              <div className="p-5 space-y-3">
                                {[
                                  {
                                    label: "Sub-Topic",
                                    value: entry.sub_topic,
                                    icon: Target,
                                  },
                                  {
                                    label: "Methodology",
                                    value: entry.methodology,
                                    icon: BookOpen,
                                  },
                                  {
                                    label: "Resources",
                                    value: entry.resources,
                                    icon: BookOpen,
                                  },
                                  {
                                    label: "Evaluation",
                                    value: entry.evaluation,
                                    icon: CheckCircle2,
                                  },
                                ]
                                  .filter((x) => x.value)
                                  .map((x) => (
                                    <div key={x.label}>
                                      <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                        <x.icon className="w-3 h-3" />
                                        {x.label}
                                      </h4>
                                      <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {x.value}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Lesson Plan Preview Modal */}
      {selectedLessonPlan && (
        <LessonPlanPreviewModal
          isOpen={isPreviewLessonModalOpen}
          onClose={() => setIsPreviewLessonModalOpen(false)}
          plan={selectedLessonPlan}
          onEdit={() => {}} // read-only for admin
          onDelete={() => {}} // read-only
        />
      )}

      {/* Scheme Entry Preview Modal */}
      {previewEntry && (
        <SchemeOfWorkPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          entry={previewEntry}
          lessonPlans={lessonPlans[previewEntry.entry_id] || []}
          onLessonPlanClick={handlePreviewLessonPlan}
        />
      )}

      {/* Validation Modal */}
      <AnimatePresence>
        {isValidationModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 bg-blue-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-tight">
                      Validate Scheme of Work
                    </h3>
                    <p className="text-xs text-white/80">
                      {subjectName} • {teacherName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsValidationModalOpen(false)}
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2.5">
                    Set Validation Status
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setValidationStatus("APPROVED")}
                      className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${
                        validationStatus === "APPROVED"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20 shadow-sm shadow-emerald-500/10"
                          : "bg-gray-50 border-transparent text-gray-500 dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                      }`}
                    >
                      <CheckCircle2
                        className={`w-6 h-6 ${validationStatus === "APPROVED" ? "text-emerald-500" : "text-gray-300"}`}
                      />
                      <span className="font-bold text-xs uppercase tracking-wide">
                        Approve
                      </span>
                    </button>
                    <button
                      onClick={() => setValidationStatus("REJECTED")}
                      className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${
                        validationStatus === "REJECTED"
                          ? "bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-900/20 shadow-sm shadow-rose-500/10"
                          : "bg-gray-50 border-transparent text-gray-500 dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                      }`}
                    >
                      <AlertCircle
                        className={`w-6 h-6 ${validationStatus === "REJECTED" ? "text-rose-500" : "text-gray-300"}`}
                      />
                      <span className="font-bold text-xs uppercase tracking-wide">
                        Reject
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2.5">
                    Comment / Feedback{" "}
                    {validationStatus === "REJECTED" && (
                      <span className="text-rose-500">*</span>
                    )}
                  </label>
                  <textarea
                    placeholder={
                      validationStatus === "REJECTED"
                        ? "Please provide a reason for rejection..."
                        : "Add any feedback or notes (optional)..."
                    }
                    value={validationComment}
                    onChange={(e) => setValidationComment(e.target.value)}
                    className="w-full h-24 p-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-none"
                  />
                </div>

                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl flex items-center gap-2.5 text-rose-600 dark:text-rose-400 text-xs font-medium"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {validationError}
                  </motion.div>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => setIsValidationModalOpen(false)}
                    className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm font-bold transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleValidate(validationStatus)}
                    disabled={
                      validating ||
                      (validationStatus === "REJECTED" &&
                        !validationComment.trim())
                    }
                    className="flex-[2] py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold shadow-md shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {validating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm Validation
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {isDetailsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div
                className={`p-5 flex items-center justify-between ${
                  schemeStatus === "APPROVED" ? "bg-emerald-600" : "bg-rose-600"
                } text-white`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold">Validation Details</h3>
                </div>
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                      schemeStatus === "APPROVED"
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                        : "bg-rose-100 dark:bg-rose-900/30 text-rose-600"
                    }`}
                  >
                    {schemeStatus === "APPROVED" ? (
                      <CheckCircle2 className="w-7 h-7" />
                    ) : (
                      <AlertCircle className="w-7 h-7" />
                    )}
                  </div>
                  <h4
                    className={`text-lg font-black uppercase tracking-tighter ${
                      schemeStatus === "APPROVED"
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {schemeStatus}
                  </h4>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                    Scheme was validated manually by Administrator
                  </p>
                </div>

                {schemeComment && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2 mb-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Administrator Comment
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 italic text-sm leading-relaxed">
                      "{schemeComment}"
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-sm font-bold transition-all active:scale-95"
                >
                  Close View
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF Preview Modal */}
      <SchemeReportPreviewModal
        isOpen={isPreviewReportOpen}
        onClose={() => setIsPreviewReportOpen(false)}
        pdfUrl={reportPdfUrl}
        onDownload={handleActualDownload}
      />
    </div>
  );
};

export default SchemeDetails;
