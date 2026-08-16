import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { schemeOfWorkApi, SchemeEntry } from "../api/schemeOfWork";
import { useToast } from "../contexts/ToastContext";
import { lessonPlanApi, LessonPlan } from "../api/lessonPlan";
import {
  myAssignedSubjectsApi,
  MyAssignedSubject,
  academicTermsApi,
} from "../api/academics";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import RealCalendarView from "./RealCalendarView";
import SchemeOfWorkEntryModal from "./SchemeOfWorkEntryModal";
import LessonPlanModal from "./LessonPlanModal";
import LessonPlanPreviewModal from "./LessonPlanPreviewModal";
import SchemeOfWorkPreviewModal from "./SchemeOfWorkPreviewModal";
import SchemeReportPreviewModal from "./SchemeReportPreviewModal";
import {
  SchemeReportService,
  ReportMetadata,
} from "../services/SchemeReportService";
import { useUser } from "../contexts/UserContext";
import reportLogo1 from "../assets/report_image1.png";
import reportLogo2 from "../assets/report_image2.png";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  ArrowLeft,
  CloudUpload,
  FileText,
  Clock,
  Calendar as CalendarIcon,
  List,
  ChevronRight,
  Search,
  Filter,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Download,
  PenLine,
  Sparkles,
  ListChecks,
} from "lucide-react";
import SchemeManualEntry from "./SchemeManualEntry";
import SchemeAIGenerate from "./SchemeAIGenerate";

const SchemeOfWorkCalendar: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useUser();
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const [isPreviewReportOpen, setIsPreviewReportOpen] = useState(false);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);

  const subjectId = parseInt(searchParams.get("subject_id") || "0");
  const classGroupId = parseInt(searchParams.get("class_group_id") || "0");
  const academicTermId = parseInt(searchParams.get("academic_term_id") || "0");

  const [entries, setEntries] = useState<SchemeEntry[]>([]);
  const [lessonPlans, setLessonPlans] = useState<Record<number, LessonPlan[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isMatchingCriteria, setIsMatchingCriteria] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [subjectInfo, setSubjectInfo] = useState<{
    name: string;
    code: string;
    classGroupName: string;
    termName: string;
    academicYearName: string;
    academicYearId: number | null;
  } | null>(null);
  const [schemeMetadata, setSchemeMetadata] = useState<{
    validation_status: "PENDING" | "APPROVED" | "REJECTED";
    validation_comment: string | null;
    scheme_id: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"timeline" | "calendar">(
    "calendar",
  );
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [isPreviewLessonModalOpen, setIsPreviewLessonModalOpen] =
    useState(false);
  const [selectedLessonPlan, setSelectedLessonPlan] =
    useState<LessonPlan | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonPlan | undefined>();

  // Modal states for weekly entries
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SchemeEntry | null>(null);
  const [insertAfterEntryId, setInsertAfterEntryId] = useState<
    number | "start" | null
  >(null);

  // Timeline features
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "complete" | "incomplete" | "missing"
  >("all");
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(
    new Set(),
  );

  // Preview modal state
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<SchemeEntry | null>(null);

  // Entry mode for empty state
  const [entryMode, setEntryMode] = useState<"choose" | "manual" | "upload" | "ai">("choose");

  useEffect(() => {
    if (subjectId && classGroupId && academicTermId) {
      loadData();
    }
  }, [subjectId, classGroupId, academicTermId]);

  // Keep this page in sync with the global Academic Year/Term selector: if the
  // user switches term while viewing this page, reload it for the new term; if
  // they switch to a year this class group doesn't belong to, return to the list.
  //
  // prevSelectedYearIdRef guards against firing on the initial load: subjectInfo
  // (and its academicYearId) only populates after an async loadData() call, so
  // this effect's deps change once that resolves even though selectedYearId
  // itself never moved. Without tracking the previous value, opening a subject
  // from a year that simply doesn't match whatever the global picker happens to
  // show at that moment (e.g. it defaulted to the current year) bounced the
  // user straight back out before the page ever rendered -- not just on an
  // actual mid-visit year switch, which is the only case this should catch.
  const prevSelectedYearIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!subjectId || !classGroupId || selectedYearId == null) return;

    const prevSelectedYearId = prevSelectedYearIdRef.current;
    prevSelectedYearIdRef.current = selectedYearId;

    if (
      prevSelectedYearId != null &&
      prevSelectedYearId !== selectedYearId &&
      subjectInfo?.academicYearId != null &&
      selectedYearId !== subjectInfo.academicYearId
    ) {
      showToast(
        "Switched academic year — returning to your subject list.",
        "info",
      );
      navigate("/scheme-of-work");
      return;
    }

    if (selectedTermId && selectedTermId !== academicTermId) {
      navigate(
        `/scheme-of-work/calendar?subject_id=${subjectId}&class_group_id=${classGroupId}&academic_term_id=${selectedTermId}`,
        { replace: true },
      );
    }
  }, [selectedYearId, selectedTermId, subjectInfo?.academicYearId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await schemeOfWorkApi.getEntries(
        subjectId,
        classGroupId,
        academicTermId,
      );
      const { scheme } = (resp.data as any).data || {
        entries: [],
        scheme: null,
      };
      const rawData = (resp.data as any).data;
      const entryList = Array.isArray(rawData)
        ? rawData
        : rawData?.entries || [];

      setEntries(entryList);
      setSchemeMetadata(scheme);

      // Load subject info from assigned subjects
      try {
        const [subjectsResp, termResp] = await Promise.all([
          myAssignedSubjectsApi.getAll(),
          academicTermsApi.getAll().catch(() => null),
        ]);
        const subject = subjectsResp.data.data?.find(
          (s) => s.subject_id === subjectId,
        );
        const termRaw = termResp?.data as any;
        const allTerms = Array.isArray(termRaw) ? termRaw : termRaw?.data || [];
        const matchedTerm = allTerms.find(
          (t: any) => t.academic_term_id === academicTermId,
        );
        if (subject) {
          const gradeInfo = subject.grades.find(
            (g: MyAssignedSubject["grades"][number]) =>
              g.class_group_id === classGroupId,
          );
          setSubjectInfo({
            name: subject.subject_name,
            code: subject.subject_code || "",
            classGroupName: gradeInfo?.class_group_name || "",
            termName: matchedTerm?.name || `Term ${academicTermId}`,
            academicYearName: gradeInfo?.academic_year_name || "",
            academicYearId: gradeInfo?.academic_year_id ?? null,
          });
        }
      } catch (err) {
        console.error("Failed to load subject info", err);
      }

      // Fetch lesson plans for each entry
      const plansMap: Record<number, LessonPlan[]> = {};
      await Promise.all(
        entryList.map(async (entry: SchemeEntry) => {
          try {
            const plansResp = await lessonPlanApi.getByEntry(entry.entry_id);
            plansMap[entry.entry_id] = plansResp.data;
          } catch (err) {
            console.error(
              `Failed to load plans for entry ${entry.entry_id}`,
              err,
            );
            plansMap[entry.entry_id] = [];
          }
        }),
      );
      setLessonPlans(plansMap);
    } catch (error) {
      console.error("Failed to load scheme data:", error);
      showToast("Failed to load scheme data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject_id", subjectId.toString());
    formData.append("class_group_id", classGroupId.toString());
    formData.append("academic_term_id", academicTermId.toString());

    try {
      await schemeOfWorkApi.upload(formData);
      showToast("Scheme uploaded successfully", "success");
      setFile(null);
      loadData();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Upload failed", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const buildReportMetadata = (): ReportMetadata => {
    // Use the year the scheme's own class group belongs to, not whichever
    // year happens to be flagged "current" — a teacher can view/download a
    // report for a past term, and it must not be mislabeled with this year.
    const schemeYear = subjectInfo?.academicYearName || "N/A";

    return {
      teacherName: user?.profile?.first_name
        ? `${user.profile.first_name} ${user.profile.last_name || ""}`
        : user?.user?.username || "Instructor",
      subjectName: subjectInfo?.name || "Subject",
      subjectCode: subjectInfo?.code,
      classGroupName: subjectInfo?.classGroupName || `Class #${classGroupId}`,
      academicYear: schemeYear,
      academicTerm: subjectInfo?.termName || `Term #${academicTermId}`,
      sector: "ICT",
      trade: "Software Programming and Embedded Systems (SPEs)",
      qualificationTitle: "Software Programming and Embedded Systems (SPE)",
      rqfLevel: "Level 3",
      learningHours: "Total: 130",
      className: "Year One",
      schoolName: "NIYONGABO ACADEMY",
      moduleCode: subjectInfo?.code || "",
      logo1: reportLogo1,
      logo2: reportLogo2,
    };
  };

  const handlePreviewReport = () => {
    if (entries.length === 0) {
      showToast("No data to export", "warning");
      return;
    }
    const pdfUrl = SchemeReportService.generateSOWReportBlobUrl(
      entries,
      buildReportMetadata(),
    );
    setReportPdfUrl(pdfUrl);
    setIsPreviewReportOpen(true);
  };

  const handleActualDownload = () => {
    if (entries.length === 0) return;
    SchemeReportService.generateSOWReport(entries, buildReportMetadata());
    showToast("PDF Report downloaded", "success");
    setIsPreviewReportOpen(false);
  };

  const handleSaveEntry = async (
    data: Partial<SchemeEntry> & { criteria_ids?: number[] },
  ) => {
    const { criteria_ids, ...entryData } = data;
    try {
      let entryId: number | undefined = editingEntry?.entry_id;

      if (editingEntry) {
        await schemeOfWorkApi.updateEntry(editingEntry.entry_id, entryData);
        showToast("Entry updated", "success");
      } else if (insertAfterEntryId !== null) {
        const res = await schemeOfWorkApi.insertEntry({
          ...entryData,
          subject_id: subjectId,
          class_group_id: classGroupId,
          academic_term_id: academicTermId,
          after_entry_id:
            insertAfterEntryId === "start" ? null : insertAfterEntryId,
        });
        entryId = res.data.data.entry_id;
        showToast("Week inserted — following weeks rescheduled", "success");
      } else {
        const res = await schemeOfWorkApi.addEntry({
          ...entryData,
          subject_id: subjectId,
          class_group_id: classGroupId,
          academic_term_id: academicTermId,
        });
        entryId = res.data.data.entry_id;
        showToast("Entry added", "success");
      }

      if (entryId && criteria_ids) {
        await schemeOfWorkApi.updateEntryCriteria(entryId, criteria_ids);
      }

      loadData();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Save failed", "error");
    }
  };

  const openInsertModal = (afterEntryId: number | "start") => {
    setEditingEntry(null);
    setInsertAfterEntryId(afterEntryId);
    setIsModalOpen(true);
  };

  const handleHeaderUpload = async (f: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", f);
    formData.append("subject_id", subjectId.toString());
    formData.append("class_group_id", classGroupId.toString());
    formData.append("academic_term_id", academicTermId.toString());

    try {
      await schemeOfWorkApi.upload(formData);
      showToast("Scheme updated successfully", "success");
      loadData();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Upload failed", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleBulkMatchCriteria = async () => {
    if (!schemeMetadata?.scheme_id) return;
    setIsMatchingCriteria(true);
    try {
      const res = await schemeOfWorkApi.bulkSuggestCriteria(schemeMetadata.scheme_id);
      const { taggedCount, entriesProcessed } = res.data.data;
      if (entriesProcessed === 0) {
        showToast("Every entry already has performance criteria linked", "info");
      } else {
        showToast(
          `Matched ${taggedCount} performance criteria across ${entriesProcessed} entr${entriesProcessed === 1 ? "y" : "ies"}`,
          "success",
        );
        loadData();
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Could not match criteria",
        "error",
      );
    } finally {
      setIsMatchingCriteria(false);
    }
  };

  const handleRemoveEntry = async (id: number) => {
    if (window.confirm("Delete this week?")) {
      try {
        await schemeOfWorkApi.deleteEntry(id);
        showToast("Deleted", "success");
        loadData();
      } catch (error: any) {
        showToast("Delete failed", "error");
      }
    }
  };

  const handleDayClick = (date: Date, entryId: number | null) => {
    if (!entryId) {
      showToast("This day is not within a scheduled week.", "info");
      return;
    }
    const dateStr = date.toISOString().split("T")[0];
    setSelectedEntryId(entryId);
    setEditingLesson({ lesson_date: dateStr, entry_id: entryId } as any);
    setIsLessonModalOpen(true);
  };

  const handlePlanClick = (plan: LessonPlan) => {
    setSelectedEntryId(plan.entry_id);
    setEditingLesson(plan);
    setIsLessonModalOpen(true);
  };

  const handleEntryClick = (entry: SchemeEntry) => {
    setPreviewEntry(entry);
    setIsPreviewModalOpen(true);
  };

  const handlePreviewLessonPlanClick = (plan: LessonPlan) => {
    setIsPreviewModalOpen(false);
    setSelectedLessonPlan(plan);
    setIsPreviewLessonModalOpen(true);
  };

  const handleEditFromPreview = (plan: LessonPlan) => {
    setIsPreviewLessonModalOpen(false);
    setSelectedEntryId(plan.entry_id);
    setEditingLesson(plan);
    setIsLessonModalOpen(true);
  };

  const handleDeleteLessonPlan = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this lesson plan?"))
      return;

    try {
      await lessonPlanApi.delete(id);
      showToast("Lesson plan deleted", "success");
      loadData();
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete lesson plan",
        "error",
      );
    }
  };

  // Helper functions for timeline features
  const toggleExpanded = (entryId: number) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const getEntryStatus = (entry: SchemeEntry) => {
    const plans = lessonPlans[entry.entry_id] || [];
    const today = new Date();
    const endDate = new Date(entry.end_date);

    if (plans.length === 0) {
      return endDate < today ? "missing" : "incomplete";
    }

    // Check if there's at least one plan with content
    const hasCompletePlan = plans.some(
      (p) =>
        p.big_question ||
        (p.outcomes && p.outcomes.length > 0) ||
        (p.sections && p.sections.length > 0),
    );
    return hasCompletePlan ? "complete" : "incomplete";
  };

  // Filtered and searched entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Search filter
      const matchesSearch =
        entry.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.objective?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.week_number?.toString().includes(searchQuery);

      // Status filter
      const status = getEntryStatus(entry);
      const matchesStatus = filterStatus === "all" || status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [entries, searchQuery, filterStatus, lessonPlans]);

  // Calculate statistics
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

  const MissingPlansBanner = () => {
    if (stats.missing === 0 || schemeMetadata?.validation_status === "APPROVED")
      return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 p-1 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border border-red-500/20 rounded-2xl overflow-hidden"
      >
        <div className="flex flex-col md:flex-row items-center justify-between p-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center shadow-sm shadow-red-500/20 flex-shrink-0">
              <AlertTriangle className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                Action Required: Missing Lesson Plans
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md">
                We've detected{" "}
                <span className="font-bold text-red-500">
                  {stats.missing} entries
                </span>{" "}
                from past weeks that don't have a defined lesson plan yet.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveTab("timeline");
                setFilterStatus("missing");
                setSearchQuery("");
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-red-600/20 flex items-center gap-2"
            >
              Fix Missing Plans
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const ValidationBanner = () => {
    if (!schemeMetadata || schemeMetadata.validation_status === "PENDING")
      return null;

    const isApproved = schemeMetadata.validation_status === "APPROVED";
    const Icon = isApproved ? CheckCircle2 : AlertCircle;

    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-6 p-5 rounded-2xl border flex flex-col md:flex-row items-center gap-4 ${
          isApproved
            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
            : "bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800"
        }`}
      >
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isApproved
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600"
              : "bg-rose-100 dark:bg-rose-900/40 text-rose-600"
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>

        <div className="flex-1">
          <h3
            className={`text-lg font-bold ${isApproved ? "text-emerald-900 dark:text-emerald-400" : "text-rose-900 dark:text-rose-400"}`}
          >
            Scheme {isApproved ? "Approved" : "Rejected"}
          </h3>
          <p
            className={`text-sm ${isApproved ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500"}`}
          >
            {isApproved
              ? "This scheme of work has been approved and is now locked for editing."
              : "This scheme of work has been rejected. Please review the comments and update accordingly."}
          </p>
          {schemeMetadata.validation_comment && (
            <div
              className={`mt-2 p-3 rounded-lg text-sm italic ${
                isApproved
                  ? "bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-100/50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-300"
              }`}
            >
              "{schemeMetadata.validation_comment}"
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderTimelineUI = () => (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/20 rounded-2xl p-4"
      >
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search topics, objectives, or week number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="all">All Weeks</option>
              <option value="complete">Complete</option>
              <option value="incomplete">In Progress</option>
              <option value="missing">Missing Plans</option>
            </select>
          </div>
        </div>

        {/* Progress Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Total
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                {stats.total}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Complete
              </div>
              <div className="text-sm font-bold text-green-600 dark:text-green-400">
                {stats.complete}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                In Progress
              </div>
              <div className="text-sm font-bold text-yellow-600 dark:text-yellow-400">
                {stats.incomplete}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Missing
              </div>
              <div className="text-sm font-bold text-red-600 dark:text-red-400">
                {stats.missing}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Progress
              </div>
              <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {stats.progress}%
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-blue-500 to-blue-500"
            />
          </div>
        </div>
      </motion.div>

      {/* Timeline Entries */}
      <div className="relative">
        {/* Vertical Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-blue-200 to-blue-200 dark:from-blue-900 dark:via-blue-900 dark:to-blue-900 hidden md:block" />

        <AnimatePresence mode="popLayout">
          {filteredEntries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12 text-gray-500 dark:text-gray-400"
            >
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No entries found</p>
              <p className="text-xs mt-1">
                Try adjusting your search or filter
              </p>
            </motion.div>
          ) : (
            filteredEntries.map((entry, index) => {
              const status = getEntryStatus(entry);
              const plans = lessonPlans[entry.entry_id] || [];
              const isExpanded = expandedEntries.has(entry.entry_id);
              const canEditSchedule =
                schemeMetadata?.validation_status !== "APPROVED";

              const InsertDivider = ({
                afterEntryId,
              }: {
                afterEntryId: number | "start";
              }) => (
                <div className="relative h-6 md:ml-12 group/divider flex items-center">
                  <div className="w-full h-px bg-transparent group-hover/divider:bg-blue-200 dark:group-hover/divider:bg-blue-900 transition-colors" />
                  <button
                    onClick={() => openInsertModal(afterEntryId)}
                    className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-lg opacity-0 group-hover/divider:opacity-100 transition-opacity z-10"
                  >
                    <Plus className="w-3 h-3" />
                    Insert Week Here
                  </button>
                </div>
              );

              return (
                <React.Fragment key={entry.entry_id}>
                  {index === 0 && canEditSchedule && (
                    <InsertDivider afterEntryId="start" />
                  )}
                  <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative mb-4 md:ml-12"
                >
                  {/* Timeline Dot */}
                  <div className="absolute -left-[31px] top-1 hidden md:block">
                    <div
                      className={`w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                        status === "complete"
                          ? "bg-green-500"
                          : status === "missing"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                      }`}
                    />
                  </div>

                  <div className="group bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/30 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300">
                    {/* Main Content */}
                    <div className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start gap-5">
                        {/* Date/Week Column */}
                        <div className="flex-shrink-0 md:w-40">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
                              Week {entry.week_number}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {new Date(entry.start_date).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}{" "}
                            -{" "}
                            {new Date(entry.end_date).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="mt-2">
                            {status === "complete" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Complete
                              </span>
                            )}
                            {status === "incomplete" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3" />
                                In Progress
                              </span>
                            )}
                            {status === "missing" && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />
                                Missing
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Content Column */}
                        <div className="flex-grow">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h3
                              onClick={() => handleEntryClick(entry)}
                              className="text-sm font-normal text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              {entry.topic}
                            </h3>
                            <button
                              onClick={() => toggleExpanded(entry.entry_id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded transition-colors"
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
                              className={`text-sm text-gray-600 dark:text-gray-300 mb-4 ${!isExpanded && "line-clamp-2"}`}
                            >
                              {entry.objective}
                            </p>
                          )}

                          {/* Linked Curriculum Performance Criteria */}
                          {entry.criteria && entry.criteria.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mb-3">
                              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                <ListChecks className="w-3 h-3" />
                              </span>
                              {entry.criteria.map((c) => (
                                <span
                                  key={c.criteria_id}
                                  title={c.description}
                                  className="text-xs font-mono font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full"
                                >
                                  {c.criteria_number}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Lesson Plans List */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {plans.map((plan) => (
                              <button
                                key={plan.id}
                                onClick={() => handlePlanClick(plan)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800 hover:from-blue-100 hover:to-blue-100 dark:hover:from-blue-800/30 dark:hover:to-blue-800/30 transition-all shadow-sm hover:shadow"
                              >
                                <Clock className="w-3 h-3" />
                                {new Date(plan.lesson_date).toLocaleDateString(
                                  undefined,
                                  {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLessonPlan(plan.id!);
                                  }}
                                  className="ml-1 p-0.5 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </button>
                            ))}
                            {plans.length === 0 && (
                              <span className="text-xs text-gray-400 italic flex items-center gap-1">
                                <Circle className="w-3 h-3" />
                                No lesson plans yet
                              </span>
                            )}
                          </div>

                          {/* Plan Count */}
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              {plans.length}{" "}
                              {plans.length === 1 ? "plan" : "plans"}
                            </span>
                          </div>
                        </div>

                        {/* Actions Column */}
                        <div className="flex-shrink-0 flex md:flex-col gap-2 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-700 pt-3 md:pt-0 md:pl-4">
                          {schemeMetadata?.validation_status !== "APPROVED" && (
                            <button
                              onClick={() => {
                                setEditingEntry(entry);
                                setInsertAfterEntryId(null);
                                setIsModalOpen(true);
                              }}
                              className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all font-bold"
                              title="Edit Entry"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {schemeMetadata?.validation_status !== "APPROVED" &&
                            schemeMetadata?.validation_status !==
                              "REJECTED" && (
                              <button
                                onClick={() =>
                                  handleDayClick(new Date(), entry.entry_id)
                                }
                                className="text-gray-400 hover:text-green-600 dark:hover:text-green-400 p-1.5 rounded-full hover:bg-green-50 dark:hover:bg-green-900/20 transition-all font-bold"
                                title="Add Lesson"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          {schemeMetadata?.validation_status !== "APPROVED" && (
                            <button
                              onClick={() => handleRemoveEntry(entry.entry_id)}
                              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all font-bold"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
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
                            {entry.sub_topic && (
                              <div>
                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                  <Target className="w-3 h-3" />
                                  Sub-Topic
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {entry.sub_topic}
                                </p>
                              </div>
                            )}
                            {entry.methodology && (
                              <div>
                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" />
                                  Methodology
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {entry.methodology}
                                </p>
                              </div>
                            )}
                            {entry.resources && (
                              <div>
                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" />
                                  Resources
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {entry.resources}
                                </p>
                              </div>
                            )}
                            {entry.evaluation && (
                              <div>
                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Evaluation
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {entry.evaluation}
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  </motion.div>
                  {canEditSchedule && (
                    <InsertDivider afterEntryId={entry.entry_id} />
                  )}
                </React.Fragment>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-sm text-gray-500 font-medium">Loading scheme...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8">
        {/* Breadcrumb / Nav */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/scheme-of-work")}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Subjects
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Calendar
          </span>
        </div>

        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white mb-2 flex flex-col md:flex-row md:items-center gap-2">
              <span className="bg-blue-600 text-white px-3 py-1 rounded-xl text-sm font-bold uppercase tracking-wider">
                {subjectInfo?.code || "SOW"}
              </span>
              <span>{subjectInfo?.name || "Scheme of Work"}</span>
              {subjectInfo?.classGroupName && (
                <span className="text-gray-400 dark:text-gray-500 font-light hidden md:inline">
                  —
                </span>
              )}
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                {subjectInfo?.classGroupName}
              </span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 max-w-2xl text-sm leading-relaxed font-light">
              Management for {subjectInfo?.termName || "current term"}. Plan
              weekly topics and daily lesson plans.
            </p>
          </div>
        </div>
        <div className="flex flex-row items-center gap-2 mb-4">
          {entries.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Upload Action */}
              <input
                type="file"
                id="header-upload"
                className="hidden"
                accept=".docx"
                onChange={(e) => {
                  if (e.target.files?.[0])
                    handleHeaderUpload(e.target.files[0]);
                }}
              />
              <button
                onClick={() =>
                  document.getElementById("header-upload")?.click()
                }
                disabled={
                  isUploading ||
                  schemeMetadata?.validation_status === "APPROVED"
                }
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>Update Scheme</span>
              </button>

              {/* Download PDF Action */}
              <button
                onClick={handlePreviewReport}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 rounded-full hover:bg-blue-100 dark:hover:bg-blue-800/40 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>

              {/* Bulk AI Criteria Matching — for schemes/curricula that already existed before
                  generation-time auto-tagging shipped, or entries that were never covered */}
              <button
                onClick={handleBulkMatchCriteria}
                disabled={isMatchingCriteria}
                title="Match every entry against this subject's Curriculum Performance Criteria using AI"
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-violet-500 transition-all shadow-sm disabled:opacity-50"
              >
                {isMatchingCriteria ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isMatchingCriteria ? "Matching..." : "Match with AI"}</span>
              </button>

              {/* View Switcher */}
              <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeTab === "timeline"
                      ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <List className="w-4 h-4" />
                  Timeline
                </button>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeTab === "calendar"
                      ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <CalendarIcon className="w-4 h-4" />
                  Calendar
                </button>
              </div>
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <AnimatePresence mode="wait">
            {entryMode === "choose" && (
              <motion.div
                key="choose"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Hero prompt */}
                <div className="text-center mb-8">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                    <BookOpen className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    No Scheme of Work Yet
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    Choose how you'd like to create your scheme — manually is easier and faster.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                  {/* Manual entry — featured */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setEntryMode("manual")}
                    className="relative group text-left p-6 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-600/25 hover:shadow-blue-600/40 transition-all overflow-hidden"
                  >
                    {/* Glow */}
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
                    <div className="absolute top-3 right-3 bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Recommended
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                      <PenLine className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-bold mb-1">Build Manually</h4>
                    <p className="text-sm text-white/80 leading-relaxed mb-4">
                      Use our spreadsheet-style editor. Add weeks, dates, and topics row by row. Auto-fill dates from a start date.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["No file needed", "Auto-date fill", "Instant save"].map((tag) => (
                        <span key={tag} className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm font-semibold">
                      Open Editor <ArrowRight className="w-4 h-4" />
                    </div>
                  </motion.button>

                  {/* AI generate */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setEntryMode("ai")}
                    className="relative group text-left p-6 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-xl shadow-violet-600/25 hover:shadow-violet-600/40 transition-all overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
                    <div className="absolute top-3 right-3 bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      New
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <h4 className="text-lg font-bold mb-1">Generate with AI</h4>
                    <p className="text-sm text-white/80 leading-relaxed mb-4">
                      Upload your curriculum and AI will analyze it and build the full weekly scheme for you.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["DOCX / PDF / TXT", "Auto-saved"].map((tag) => (
                        <span key={tag} className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm font-semibold">
                      Generate Now <ArrowRight className="w-4 h-4" />
                    </div>
                  </motion.button>

                  {/* Upload DOCX */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setEntryMode("upload")}
                    className="group text-left p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg transition-all"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 flex items-center justify-center mb-4 transition-colors">
                      <CloudUpload className="w-6 h-6 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      Import from DOCX
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                      Already have a DOCX scheme file? Upload it and we'll extract weeks and topics automatically.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["Requires .docx file", "Auto-parsed"].map((tag) => (
                        <span key={tag} className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 px-2.5 py-0.5 rounded-full font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      Upload File <ArrowRight className="w-4 h-4" />
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            )}

            {entryMode === "manual" && (
              <SchemeManualEntry
                key="manual"
                subjectId={subjectId}
                classGroupId={classGroupId}
                academicTermId={academicTermId}
                subjectName={subjectInfo?.name}
                classGroupName={subjectInfo?.classGroupName}
                termName={subjectInfo?.termName}
                onComplete={() => { setEntryMode("choose"); loadData(); }}
                onCancel={() => setEntryMode("choose")}
              />
            )}

            {entryMode === "ai" && (
              <SchemeAIGenerate
                key="ai"
                subjectId={subjectId}
                classGroupId={classGroupId}
                academicTermId={academicTermId}
                subjectName={subjectInfo?.name}
                classGroupName={subjectInfo?.classGroupName}
                termName={subjectInfo?.termName}
                onComplete={() => { loadData(); }}
                onCancel={() => setEntryMode("choose")}
              />
            )}

            {entryMode === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-md mx-auto"
              >
                <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-5">
                    <CloudUpload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                    Upload DOCX Scheme
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs mb-6">
                    We'll extract weeks and topics from your file automatically.
                  </p>
                  {!file ? (
                    <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm">
                      <FileText className="w-4 h-4" />
                      Select DOCX File
                      <input type="file" accept=".docx" className="hidden" onChange={handleFileChange} />
                    </label>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full px-6">
                      <div className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-sm text-blue-700 dark:text-blue-300 font-medium truncate">{file.name}</span>
                      </div>
                      <button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                        {isUploading ? "Uploading..." : "Start Import"}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setEntryMode("choose")}
                    className="mt-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    ← Back to options
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <div className="animate-in fade-in duration-300">
            <ValidationBanner />
            <MissingPlansBanner />
            {activeTab === "timeline" ? (
              renderTimelineUI()
            ) : (
              <RealCalendarView
                entries={entries}
                lessonPlans={lessonPlans}
                onDayClick={handleDayClick}
                onPlanClick={handlePlanClick}
                onDeletePlan={handleDeleteLessonPlan}
              />
            )}
          </div>
        )}

        {/* Modals */}
        <SchemeOfWorkEntryModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setInsertAfterEntryId(null);
          }}
          onSave={handleSaveEntry}
          initialData={editingEntry}
          title={
            editingEntry
              ? "Edit Week"
              : insertAfterEntryId !== null
                ? "Insert Week"
                : "Add Week"
          }
          isInsertMode={!editingEntry && insertAfterEntryId !== null}
          subjectId={subjectId}
          subjectName={subjectInfo?.name}
        />

        {selectedEntryId && (
          <LessonPlanModal
            isOpen={isLessonModalOpen}
            onClose={() => setIsLessonModalOpen(false)}
            entryId={selectedEntryId || 0}
            onSaved={loadData}
            initialData={editingLesson}
            entryTopic={entries.find((e) => e.entry_id === selectedEntryId)?.topic}
            entryWeekLabel={entries.find((e) => e.entry_id === selectedEntryId)?.week_number}
          />
        )}

        <LessonPlanPreviewModal
          isOpen={isPreviewLessonModalOpen}
          onClose={() => setIsPreviewLessonModalOpen(false)}
          plan={selectedLessonPlan}
          onEdit={handleEditFromPreview}
          onDelete={handleDeleteLessonPlan}
        />

        <SchemeOfWorkPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          entry={previewEntry}
          lessonPlans={previewEntry ? lessonPlans[previewEntry.entry_id] : []}
          onLessonPlanClick={handlePreviewLessonPlanClick}
          onEdit={(entry) => {
            setIsPreviewModalOpen(false);
            setEditingEntry(entry);
            setInsertAfterEntryId(null);
            setIsModalOpen(true);
          }}
          onDelete={(id) => {
            setIsPreviewModalOpen(false);
            handleRemoveEntry(id);
          }}
        />

        <SchemeReportPreviewModal
          isOpen={isPreviewReportOpen}
          onClose={() => setIsPreviewReportOpen(false)}
          pdfUrl={reportPdfUrl}
          onDownload={handleActualDownload}
        />
      </div>
    </div>
  );
};

export default SchemeOfWorkCalendar;
