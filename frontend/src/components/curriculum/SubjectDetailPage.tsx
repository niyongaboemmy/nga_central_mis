import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FolderOpen,
  LayoutGrid,
  FileText,
  Loader2,
  Target,
  Users,
  PencilLine,
} from "lucide-react";
import {
  subjectDetailApi,
  SubjectDetail,
  myEnrolledSubjectsApi,
} from "../../api/curriculum";
import { myAssignedSubjectsApi } from "../../api/academics";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import usePermissions from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import CurriculumTab from "./CurriculumTab";
import SubjectMaterialsTab from "./SubjectMaterialsTab";
import EnrolledStudentsTab from "./EnrolledStudentsTab";
import SubjectLessonNotesTab from "./SubjectLessonNotesTab";
import SubjectSharedNotesTab from "./SubjectSharedNotesTab";
import { lessonNotesApi, SharedNoteSummary } from "../../api/lessonNotes";
import SubjectIcon from "../elearning/ui/subjectIcons";
import SubjectElearningLink from "./SubjectElearningLink";

type Tab = "overview" | "curriculum" | "materials" | "students" | "lessonNotes" | "myNotes";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "curriculum", label: "Curriculum", icon: BookOpen },
  { id: "materials", label: "Materials", icon: FolderOpen },
  { id: "myNotes", label: "Lesson notes", icon: BookOpen },
  { id: "lessonNotes", label: "Notes", icon: PencilLine },
  { id: "students", label: "Students", icon: Users },
];

const SubjectDetailPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  /** The student's own library, narrowed to this subject. null while loading. */
  const [myNotes, setMyNotes] = useState<SharedNoteSummary[] | null>(null);

  const id = parseInt(subjectId || "0");

  // A teacher lands here from their assigned-subjects list, a student from
  // their enrolled-subjects list — "back" and the term/year-switch redirect
  // below need to return each to the list that actually applies to them.
  const isTeacherView = hasPermission(Permissions.VIEW_MY_ASSIGNED_SUBJECTS);
  const isStudentView = hasPermission(Permissions.VIEW_MY_ENROLLED_SUBJECTS);
  const backPath = isTeacherView
    ? "/my-subjects"
    : isStudentView
      ? "/my-enrolled-subjects"
      : "/dashboard";

  // The class roster is only for whoever teaches/administers the subject —
  // hide the tab entirely rather than let a student land on an empty/403'd
  // "Students" view.
  const canViewStudents = hasPermission(
    Permissions.VIEW_SUBJECT_ENROLLED_STUDENTS,
  );
  // Lesson Notes is a teacher-authoring surface — a student has their own
  // cross-subject "Shared Notes" page instead of a per-subject tab here.
  const canManageLessonNotes = hasPermission(Permissions.MANAGE_LESSON_NOTES);
  // A student gets the read-only "Lesson notes" tab instead of the authoring one.
  const canReadSharedNotes = hasPermission(Permissions.VIEW_SHARED_LESSON_NOTES);
  const visibleTabs = tabs.filter(
    (tab) =>
      (tab.id !== "students" || canViewStudents) &&
      (tab.id !== "lessonNotes" || canManageLessonNotes) &&
      (tab.id !== "myNotes" || canReadSharedNotes),
  );

  /** Counts beside the tab labels, so it is obvious where the content is. */
  const tabCount = (tab: Tab): number | null => {
    if (!subject) return null;
    if (tab === "curriculum") return subject.competency_count;
    if (tab === "materials") return subject.document_count;
    if (tab === "myNotes") return myNotes?.length ?? null;
    return null;
  };

  useEffect(() => {
    if (!id) return;
    loadSubject();
  }, [id]);

  useEffect(() => {
    if (!canReadSharedNotes || !subject) return;
    lessonNotesApi
      .sharedWithMe()
      .then((res) =>
        setMyNotes((res.data.data || []).filter((n) => n.subject_name === subject.name)),
      )
      .catch(() => setMyNotes([])); // an empty notes tab beats an error here
  }, [canReadSharedNotes, subject]);

  // The Subject itself (and its Curriculum/Materials data) is year-independent,
  // but which subjects a teacher is assigned to is scoped to the selected
  // academic term, and which subjects a student is enrolled in is scoped to
  // the selected academic year. If the user switches term/year while viewing
  // a subject they no longer have access to for that period, send them back
  // to their list instead of leaving them stranded on a subject that no
  // longer applies.
  const { selectedTermId, selectedYearId } = useAcademicPeriod();
  const prevTermIdRef = useRef<number | null>(null);
  const prevYearIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id || selectedTermId == null || !isTeacherView) return;
    const prevTermId = prevTermIdRef.current;
    prevTermIdRef.current = selectedTermId;
    if (prevTermId == null || prevTermId === selectedTermId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await myAssignedSubjectsApi.getAll(selectedTermId);
        const assigned = res.data.data ?? [];
        const stillAssigned = assigned.some((s) => s.subject_id === id);
        if (!cancelled && !stillAssigned) {
          showToast(
            "Switched academic period — returning to your subject list.",
            "info",
          );
          navigate(backPath);
        }
      } catch {
        // Don't block the page on a failed assignment check.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTermId, id, isTeacherView]);

  useEffect(() => {
    if (!id || selectedYearId == null || isTeacherView || !isStudentView)
      return;
    const prevYearId = prevYearIdRef.current;
    prevYearIdRef.current = selectedYearId;
    if (prevYearId == null || prevYearId === selectedYearId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await myEnrolledSubjectsApi.getAll(selectedYearId);
        const enrolled = res.data.data ?? [];
        const stillEnrolled = enrolled.some((s) => s.subject_id === id);
        if (!cancelled && !stillEnrolled) {
          showToast(
            "Switched academic year — returning to your subject list.",
            "info",
          );
          navigate(backPath);
        }
      } catch {
        // Don't block the page on a failed enrollment check.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYearId, id, isTeacherView, isStudentView]);

  const loadSubject = async () => {
    try {
      const res = await subjectDetailApi.get(id);
      setSubject(res.data.data);
    } catch {
      showToast("Failed to load subject details", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FileText className="w-12 h-12 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">Subject not found</p>
        <button
          onClick={() => navigate(backPath)}
          className="text-blue-600 hover:underline text-sm"
        >
          Back to My Subjects
        </button>
      </div>
    );
  }

  return (
    // Bleeds past the shell's fullWidth padding so the sticky header runs
    // edge to edge, flush against the sidebar; inner containers pad themselves.
    // min-h is viewport minus the 64px navbar -- min-h-screen inside a pt-16
    // main adds a navbar's worth of empty scroll at the bottom.
    <div className="-mx-4 min-h-[calc(100vh-4rem)] bg-gray-50 pb-12 dark:bg-black md:-mx-6">
      {/* Top bar */}
      <div className="bg-white/80 dark:bg-gray-800/30 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/20 sticky top-0 z-10">
        <div className="w-full mx-auto px-4 sm:px-6">
          {/* Breadcrumb + back */}
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => navigate(backPath)}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              My Subjects
            </button>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {subject.name}
            </span>
          </div>

          {/* Subject header */}
          <div className="flex items-start gap-4 pb-4">
            {/* The subject's own icon, not a generic book on a colour block —
                same glyph it carries on the subject list and in the library. */}
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm"
              style={{
                background: `color-mix(in oklab, ${subject.color || "#3b6cff"} 18%, transparent)`,
                color: subject.color || "#3b6cff",
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${subject.color || "#3b6cff"} 28%, transparent)`,
              }}
            >
              <SubjectIcon subjectName={subject.name} className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {subject.name}
                </h1>
                {subject.code && (
                  <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-md">
                    {subject.code}
                  </span>
                )}
                {subject.category_name && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                    {subject.category_name}
                  </span>
                )}
              </div>
              {subject.description && (
                <p className="max-w-3xl text-sm leading-relaxed text-gray-500 line-clamp-2 dark:text-gray-400">
                  {subject.description}
                </p>
              )}
              {/* Stats chips */}
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.competency_count}
                  </span>{" "}
                  competenc{subject.competency_count === 1 ? "y" : "ies"}
                </span>
                <span className="text-gray-300 dark:text-gray-600 text-xs">
                  •
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.document_count}
                  </span>{" "}
                  document{subject.document_count === 1 ? "" : "s"}
                </span>
                <span className="text-gray-300 dark:text-gray-600 text-xs">
                  •
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {subject.category_count}
                  </span>{" "}
                  categor{subject.category_count === 1 ? "y" : "ies"}
                </span>
                {canReadSharedNotes && myNotes !== null && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600 text-xs">•</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {myNotes.length}
                      </span>{" "}
                      lesson {myNotes.length === 1 ? "note" : "notes"}
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* Straight across to the same material as a course. */}
            <div className="flex-shrink-0 self-center">
              <SubjectElearningLink subjectId={id} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tabCount(tab.id) !== null && (
                    <span
                      className={`rounded-pill px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        active
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
                      }`}
                    >
                      {tabCount(tab.id)}
                    </span>
                  )}
                  {active && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="w-full mx-auto px-4 sm:px-6 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "overview" && (
              <OverviewTab
                subject={subject}
                onTabChange={setActiveTab}
                noteCount={myNotes?.length ?? null}
                showNotes={canReadSharedNotes}
              />
            )}
            {activeTab === "curriculum" && (
              <CurriculumTab subjectId={id} subjectName={subject?.name} />
            )}
            {activeTab === "materials" && (
              <SubjectMaterialsTab subjectId={id} />
            )}
            {activeTab === "myNotes" && (
              <SubjectSharedNotesTab notes={myNotes} subjectName={subject?.name || ""} />
            )}
            {activeTab === "lessonNotes" && (
              <SubjectLessonNotesTab subjectId={id} />
            )}
            {activeTab === "students" && (
              <EnrolledStudentsTab subjectId={id} subjectName={subject.name} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

interface OverviewTabProps {
  subject: SubjectDetail;
  onTabChange: (tab: Tab) => void;
  noteCount: number | null;
  showNotes: boolean;
}

/** One route into the subject: a number, what it is, and where it goes. */
const OverviewCard: React.FC<{
  icon: React.ReactNode;
  value: number | null;
  label: string;
  hint: string;
  onClick: () => void;
  accent?: boolean;
}> = ({ icon, value, label, hint, onClick, accent }) => (
  <button
    onClick={onClick}
    className="el-card el-card-hover group flex flex-col p-5 text-left focus:outline-none focus-visible:shadow-glow"
  >
    <span
      className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${
        accent
          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-200"
          : "el-chip"
      }`}
    >
      {icon}
    </span>
    <span className="text-3xl font-bold leading-none tabular-nums text-gray-900 dark:text-white">
      {value === null ? "—" : value}
    </span>
    <span className="mt-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
    <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</span>
    <span className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-200">
      Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </span>
  </button>
);

const OverviewTab: React.FC<OverviewTabProps> = ({
  subject,
  onTabChange,
  noteCount,
  showNotes,
}) => (
  <div className="space-y-5">
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {showNotes && (
        <OverviewCard
          accent
          icon={<BookOpen className="h-5 w-5" />}
          value={noteCount}
          label="Lesson notes"
          hint="Shared with you by your teacher"
          onClick={() => onTabChange("myNotes")}
        />
      )}
      <OverviewCard
        icon={<Target className="h-5 w-5" />}
        value={subject.competency_count}
        label="Learning outcomes"
        hint="What you are expected to master"
        onClick={() => onTabChange("curriculum")}
      />
      <OverviewCard
        icon={<FileText className="h-5 w-5" />}
        value={subject.document_count}
        label="Materials"
        hint="Files uploaded for this subject"
        onClick={() => onTabChange("materials")}
      />
      <OverviewCard
        icon={<FolderOpen className="h-5 w-5" />}
        value={subject.category_count}
        label="Categories"
        hint="How those materials are filed"
        onClick={() => onTabChange("materials")}
      />
    </div>

    {subject.description && (
      <div className="el-card p-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          About this subject
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {subject.description}
        </p>
      </div>
    )}
  </div>
);

export default SubjectDetailPage;
