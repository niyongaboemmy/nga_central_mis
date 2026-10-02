import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { studioRoutes } from "../../api/studio";
import {
  Plus,
  FileText,
  Sparkles,
  Trash2,
  Search,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  ChevronRight,
  Loader2,
  ExternalLink,
  CircleSlash,
  CheckCircle2,
  Archive,
  PenLine,
  Pencil,
  Layers,
} from "lucide-react";
import {
  lessonNotesApi,
  LessonNoteSummary,
  LessonNoteSubjectSummary,
  isPdfBackedNote,
} from "../../api/lessonNotes";
import { elearningApi, builderRoutes } from "../../api/elearning";
import { useToast } from "../../contexts/ToastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import LessonNoteFormModal from "./LessonNoteFormModal";
import { useDeleteLessonNote } from "./useDeleteLessonNote";
import LessonNoteStatusBadge from "./LessonNoteStatusBadge";
import LessonNoteShareBadge from "./LessonNoteShareBadge";

const sourceLabel: Record<string, { label: string; className: string }> = {
  MANUAL: { label: "Manual", className: "bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300" },
  AI_GENERATED: { label: "AI generated", className: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  AI_ASSISTED: { label: "AI assisted", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  PDF_UPLOAD: { label: "PDF", className: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" },
};

type StatusFilter = "ALL" | "DRAFT" | "PUBLISHED";
type ReachFilter = "ALL" | "ON_COURSE" | "OFF_COURSE";
type SubjectFilter = "ALL" | "WITH_NOTES" | "EMPTY";

/** A thin progress meter — how much of a subject's notes students can actually reach. */
const CoverageBar: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-500 dark:text-gray-400">On e-learning</span>
        <span
          className={`font-semibold ${
            pct === 100
              ? "text-emerald-600 dark:text-emerald-400"
              : pct === 0
                ? "text-gray-400 dark:text-gray-500"
                : "text-blue-600 dark:text-blue-400"
          }`}
        >
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct === 100 ? "bg-emerald-500" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/** How a note reaches students, or why it doesn't yet. This is the whole point of the
 *  e-learning link: PUBLISHED means shareable, but only a course item makes it part of
 *  what a student actually works through. */
const ElearningCell: React.FC<{
  note: LessonNoteSummary;
  canBuild: boolean;
  placing: boolean;
  onPlace: () => void;
}> = ({ note, canBuild, placing, onPlace }) => {
  const navigate = useNavigate();
  const placement = note.elearning;

  if (placement) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(builderRoutes.build(placement.course_id));
        }}
        title={`On "${placement.course_title}" → ${placement.section_title}`}
        className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-400/10 border border-emerald-200 dark:border-emerald-400/25 hover:bg-emerald-100 dark:hover:bg-emerald-400/20 transition-colors"
      >
        <GraduationCap className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{placement.section_title}</span>
        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
      </button>
    );
  }

  if (note.course_target && canBuild) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlace();
        }}
        disabled={placing}
        title={`Add this note to "${note.course_target.title}" so students can work through it`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-400/10 border border-dashed border-blue-300 dark:border-blue-400/30 hover:bg-blue-100 dark:hover:bg-blue-400/20 hover:border-solid transition-all disabled:opacity-60"
      >
        {placing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        Add to e-learning
      </button>
    );
  }

  return (
    <span
      title="No e-learning course exists for this subject and class group yet — create one from E-Learning."
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.06]"
    >
      <CircleSlash className="w-3 h-3" />
      Not on e-learning
    </span>
  );
};

const LessonNotesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canBuild = hasPermission("MANAGE_COURSE_CONTENT");
  // Subjects come from the teacher's assignments for the year the header is showing, rather
  // than whichever year happens to be flagged current on the server.
  const { selectedYearId } = useAcademicPeriod();

  // The chosen subject lives in the URL so Back returns to the subject picker rather than
  // leaving the page, and a teacher can bookmark the subject they work in every day.
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectIdParam = searchParams.get("subject");
  const selectedSubjectId = subjectIdParam ? parseInt(subjectIdParam, 10) : null;

  const [subjects, setSubjects] = useState<LessonNoteSubjectSummary[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("ALL");

  const [notes, setNotes] = useState<LessonNoteSummary[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reachFilter, setReachFilter] = useState<ReachFilter>("ALL");

  const [showNewModal, setShowNewModal] = useState(false);
  const [editNoteId, setEditNoteId] = useState<number | null>(null);
  const deleteNote = useDeleteLessonNote();
  const [placingNoteId, setPlacingNoteId] = useState<number | null>(null);

  const loadSubjects = () => {
    setSubjectsLoading(true);
    lessonNotesApi
      .subjects(selectedYearId ? { academic_year_id: selectedYearId } : undefined)
      .then((res) => setSubjects(res.data.data))
      .catch(() => showToast("Failed to load subjects", "error"))
      .finally(() => setSubjectsLoading(false));
  };

  const loadNotes = (subjectId: number) => {
    setNotesLoading(true);
    lessonNotesApi
      .list({ subject_id: subjectId })
      .then((res) => setNotes(res.data.data))
      .catch(() => showToast("Failed to load lesson notes", "error"))
      .finally(() => setNotesLoading(false));
  };

  useEffect(() => {
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId]);

  useEffect(() => {
    if (selectedSubjectId) {
      loadNotes(selectedSubjectId);
    } else {
      setNotes([]);
      setNoteQuery("");
      setStatusFilter("ALL");
      setReachFilter("ALL");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subject_id === selectedSubjectId) || null,
    [subjects, selectedSubjectId],
  );

  const visibleSubjects = useMemo(() => {
    const q = subjectQuery.trim().toLowerCase();
    return subjects.filter((s) => {
      if (subjectFilter === "WITH_NOTES" && s.note_count === 0) return false;
      if (subjectFilter === "EMPTY" && s.note_count > 0) return false;
      if (!q) return true;
      return (
        s.subject_name.toLowerCase().includes(q) ||
        (s.subject_code || "").toLowerCase().includes(q) ||
        (s.class_group_names || "").toLowerCase().includes(q)
      );
    });
  }, [subjects, subjectQuery, subjectFilter]);

  /** Totals across every subject the teacher teaches — the "how am I doing" line. */
  const totals = useMemo(
    () =>
      subjects.reduce(
        (acc, s) => ({
          notes: acc.notes + s.note_count,
          drafts: acc.drafts + s.draft_count,
          onCourse: acc.onCourse + s.on_course_count,
          started: acc.started + (s.note_count > 0 ? 1 : 0),
        }),
        { notes: 0, drafts: 0, onCourse: 0, started: 0 },
      ),
    [subjects],
  );

  const visibleNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    return notes.filter((n) => {
      if (statusFilter !== "ALL" && n.status !== statusFilter) return false;
      if (reachFilter === "ON_COURSE" && !n.elearning) return false;
      if (reachFilter === "OFF_COURSE" && n.elearning) return false;
      if (q && !n.title.toLowerCase().includes(q) && !(n.class_group_name || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [notes, noteQuery, statusFilter, reachFilter]);

  const onCourseCount = useMemo(() => notes.filter((n) => n.elearning).length, [notes]);

  const selectSubject = (subjectId: number | null) => {
    if (subjectId === null) setSearchParams({}, { replace: false });
    else setSearchParams({ subject: String(subjectId) }, { replace: false });
  };

  const handleDelete = async (note: LessonNoteSummary) => {
    if (!(await deleteNote(note))) return;
    setNotes((prev) => prev.filter((n) => n.note_id !== note.note_id));
    loadSubjects();
  };

  /** After an edit the note may have moved subject (then it leaves this list) or changed
   *  coverage/placement-relevant fields — re-read rather than patch locally. */
  const handleEdited = () => {
    if (selectedSubjectId) loadNotes(selectedSubjectId);
    loadSubjects();
  };

  const handlePlaceOnCourse = async (note: LessonNoteSummary) => {
    setPlacingNoteId(note.note_id);
    try {
      const res = await elearningApi.placeNoteOnCourse(note.note_id);
      const placed = res.data.data;
      showToast(
        placed.already_placed
          ? "This note is already on the course"
          : `Added to "${placed.section_title}" — students can work through it now`,
        "success",
      );
      // Re-read rather than patching locally: the server decides which section it lands in.
      if (selectedSubjectId) loadNotes(selectedSubjectId);
      loadSubjects();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Couldn't add this note to e-learning", "error");
    } finally {
      setPlacingNoteId(null);
    }
  };

  const filterPill = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
      active
        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
        : "text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.12]"
    }`;

  // ---------------------------------------------------------------- subject picker
  if (!selectedSubjectId) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Lesson Notes</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Your notes, grouped by the subjects you teach. Open one to write, generate with AI or
              upload a PDF — then put it on the e-learning course students work through.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-500/25 hover:shadow-md hover:shadow-blue-500/30 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all"
          >
            <Plus className="w-4 h-4" /> New Note
          </button>
        </div>

        {!subjectsLoading && subjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {[
              { icon: Layers, label: `${totals.started}/${subjects.length} subjects started` },
              { icon: FileText, label: `${totals.notes} note${totals.notes === 1 ? "" : "s"}` },
              ...(totals.drafts
                ? [{ icon: PenLine, label: `${totals.drafts} draft${totals.drafts === 1 ? "" : "s"}` }]
                : []),
              { icon: GraduationCap, label: `${totals.onCourse} on e-learning` },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06]"
              >
                <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                {label}
              </span>
            ))}
          </div>
        )}

        {!subjectsLoading && subjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {subjects.length > 4 && (
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={subjectQuery}
                  onChange={(e) => setSubjectQuery(e.target.value)}
                  placeholder="Find a subject or code…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-full bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["ALL", "WITH_NOTES", "EMPTY"] as SubjectFilter[]).map((f) => (
                <button key={f} onClick={() => setSubjectFilter(f)} className={filterPill(subjectFilter === f)}>
                  {f === "ALL" ? "All subjects" : f === "WITH_NOTES" ? "With notes" : "Not started"}
                </button>
              ))}
            </div>
          </div>
        )}

        {subjectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] animate-pulse"
              />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-6">
            <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-700 dark:text-gray-200 font-semibold">No subjects assigned to you</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              Lesson notes are grouped by the subjects you teach. Once an administrator assigns you
              a subject for this academic year, it appears here.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-500"
            >
              Start a note anyway
            </button>
          </div>
        ) : visibleSubjects.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subjectQuery
                ? `No subject matches “${subjectQuery}”.`
                : subjectFilter === "EMPTY"
                  ? "Every subject you teach already has notes."
                  : "None of your subjects have notes yet."}
            </p>
            <button
              onClick={() => {
                setSubjectQuery("");
                setSubjectFilter("ALL");
              }}
              className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-500"
            >
              Show all subjects
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleSubjects.map((s) => {
              const empty = s.note_count === 0;
              return (
              <div key={s.subject_id} className="flex flex-col gap-1.5">
              <button
                onClick={() => selectSubject(s.subject_id)}
                className={`group text-left rounded-2xl border p-4 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all ${
                  empty
                    ? "border-dashed border-gray-300 dark:border-white/15 bg-gray-50/60 dark:bg-white/[0.02] hover:border-blue-400 hover:bg-white dark:hover:bg-white/[0.05]"
                    : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-blue-300 dark:hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      empty
                        ? "bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-gray-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-400/10 group-hover:text-blue-600 dark:group-hover:text-blue-300"
                        : "bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-300"
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {s.subject_name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {s.subject_code ? `${s.subject_code} · ` : ""}
                      {s.class_group_names || "No class group"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  {!s.is_assigned && (
                    <span
                      title="You no longer teach this subject — its notes are kept here."
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-white/[0.07] dark:text-gray-400"
                    >
                      <Archive className="w-2.5 h-2.5" /> Past subject
                    </span>
                  )}
                  {empty ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                      No notes yet — start one
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300">
                        {s.note_count} note{s.note_count === 1 ? "" : "s"}
                      </span>
                      {s.published_count > 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300">
                          {s.published_count} published
                        </span>
                      )}
                      {s.draft_count > 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                          {s.draft_count} draft
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* A meter of 0/0 says nothing — a subject with no notes shows its last-touched
                    line instead, so the card still has a bottom edge that means something. */}
                {empty ? (
                  <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                    Open it to write the first note for this class.
                  </p>
                ) : (
                  <>
                    <CoverageBar done={s.on_course_count} total={s.note_count} />
                    {s.last_updated && (
                      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                        Last edited {new Date(s.last_updated).toLocaleDateString()}
                      </p>
                    )}
                  </>
                )}
              </button>
              {/* Lesson Studio shortcut: how many of this subject's e-learning weeks are live,
                  and one tap to draft the rest (a sibling of the card — never a nested button). */}
              {s.course_id && s.weeks_total > 0 && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                    E-learning: {s.weeks_live}/{s.weeks_total} weeks live
                  </span>
                  {s.weeks_live < s.weeks_total && (
                    <Link
                      to={studioRoutes.studio(s.course_id)}
                      className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/10"
                    >
                      <Sparkles className="w-3 h-3" /> Fill weeks with AI
                    </Link>
                  )}
                </div>
              )}
              </div>
              );
            })}
          </div>
        )}

        <LessonNoteFormModal
          isOpen={showNewModal}
          onClose={() => {
            setShowNewModal(false);
            loadSubjects();
          }}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------- notes for a subject
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={() => selectSubject(null)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 mb-3 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All subjects
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 truncate">
            {selectedSubject?.subject_name || "Lesson Notes"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {notes.length} note{notes.length === 1 ? "" : "s"}
            {selectedSubject?.class_group_names ? ` · ${selectedSubject.class_group_names}` : ""}
            {notes.length > 0 && (
              <>
                {" · "}
                <span
                  className={
                    onCourseCount === notes.length
                      ? "text-emerald-600 dark:text-emerald-400 font-medium"
                      : "text-gray-500 dark:text-gray-400"
                  }
                >
                  {onCourseCount} of {notes.length} on e-learning
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-500/25 hover:shadow-md hover:shadow-blue-500/30 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all"
        >
          <Plus className="w-4 h-4" /> New Note
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-full bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["ALL", "DRAFT", "PUBLISHED"] as StatusFilter[]).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)} className={filterPill(statusFilter === f)}>
              {f === "ALL" ? "All" : f === "DRAFT" ? "Drafts" : "Published"}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />
          {(["ALL", "ON_COURSE", "OFF_COURSE"] as ReachFilter[]).map((f) => (
            <button key={f} onClick={() => setReachFilter(f)} className={filterPill(reachFilter === f)}>
              {f === "ALL" ? "Any reach" : f === "ON_COURSE" ? "On e-learning" : "Not linked"}
            </button>
          ))}
        </div>
      </div>

      {notesLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] animate-pulse"
            />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No notes for this subject yet</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-500"
          >
            Create the first one
          </button>
        </div>
      ) : visibleNotes.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
          No note matches these filters.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleNotes.map((note) => {
            const source = sourceLabel[isPdfBackedNote(note) ? "PDF_UPLOAD" : note.source] || sourceLabel.MANUAL;
            return (
              <div
                key={note.note_id}
                onClick={() => navigate(`/lesson-notes/${note.note_id}`)}
                className="group cursor-pointer rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 hover:border-blue-300 dark:hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/lesson-notes/${note.note_id}`);
                        }}
                        className="text-left hover:text-blue-600 dark:hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded transition-colors"
                      >
                        {note.title}
                      </button>
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {note.class_group_name || "No class group"} · Updated{" "}
                      {new Date(note.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  {/* Always visible (not hover-only) so they work on touch screens too. */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditNoteId(note.note_id);
                      }}
                      title="Edit details — subject, class, coverage, title"
                      aria-label={`Edit ${note.title}`}
                      className="p-1.5 rounded-full text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(note);
                      }}
                      title="Delete this note"
                      aria-label={`Delete ${note.title}`}
                      className="p-1.5 rounded-full text-gray-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <LessonNoteStatusBadge status={note.status} />
                  {note.status === "PUBLISHED" && <LessonNoteShareBadge shareCount={note.share_count} />}
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${source.className}`}
                  >
                    {isPdfBackedNote(note) ? (
                      <FileText className="w-2.5 h-2.5" />
                    ) : (
                      note.source !== "MANUAL" && <Sparkles className="w-2.5 h-2.5" />
                    )}
                    {source.label}
                    {isPdfBackedNote(note) && note.page_count ? ` · ${note.page_count} p.` : ""}
                  </span>

                  {/* Wraps and lets the course chip truncate, so a long section title can't
                      push the card wider than a phone screen. */}
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0 max-w-full">
                    {note.elearning && note.status === "DRAFT" && (
                      <span
                        title="This note is on the course but still a draft — publish it so students can read it."
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                      >
                        Publish to make it readable
                      </span>
                    )}
                    <ElearningCell
                      note={note}
                      canBuild={canBuild}
                      placing={placingNoteId === note.note_id}
                      onPlace={() => handlePlaceOnCourse(note)}
                    />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!notesLoading && notes.length > 0 && onCourseCount === notes.length && (
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Every note for this subject is on the e-learning course.
        </p>
      )}

      <LessonNoteFormModal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          if (selectedSubjectId) loadNotes(selectedSubjectId);
          loadSubjects();
        }}
        initialSubjectId={selectedSubjectId ?? undefined}
      />

      <LessonNoteFormModal
        isOpen={editNoteId !== null}
        noteId={editNoteId ?? undefined}
        onClose={() => setEditNoteId(null)}
        onSaved={handleEdited}
        onDeleted={() => {
          setNotes((prev) => prev.filter((n) => n.note_id !== editNoteId));
          loadSubjects();
        }}
      />
    </div>
  );
};

export default LessonNotesListPage;
