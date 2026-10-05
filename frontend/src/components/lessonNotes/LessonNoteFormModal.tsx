import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  PencilLine,
  FileUp,
  UploadCloud,
  X,
  Lock,
  Trash2,
  GraduationCap,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import Modal from "../ui/Modal";
import { myAssignedSubjectsApi, MyAssignedSubject } from "../../api/academics";
import { competenciesApi, SubjectCompetency } from "../../api/curriculum";
import CurriculumPicker from "./CurriculumPicker";
import {
  lessonNotesApi,
  AINoteGenerationStatus,
  LessonNoteDetail,
  isPdfBackedNote,
} from "../../api/lessonNotes";
import { useDeleteLessonNote } from "./useDeleteLessonNote";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import SelectField from "../ui/SelectField";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialSubjectId?: number;
  /** Edit mode: the same form, pre-filled from this note — subject, class, coverage, title,
   *  and (for a PDF note) the file. The body itself is still edited in the editor. */
  noteId?: number;
  /** Edit mode: called with the refreshed note after a successful save. */
  onSaved?: (note: LessonNoteDetail) => void;
  /** Edit mode: offers "Delete note" in the form; called once the note is gone. */
  onDeleted?: () => void;
}

/** How an existing note's body came to be — shown where create mode asks "how". */
const SOURCE_TEXT: Record<string, string> = {
  MANUAL: "Written in the editor",
  AI_GENERATED: "Generated with AI",
  AI_ASSISTED: "Written with AI help",
};

/** Criteria ids are unique, so equal length + containment is set equality. */
const sameIds = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

const POLL_INTERVAL_MS = 1200;

// The three ways a note can come into being. Each ends in the same place — a DRAFT the
// teacher reviews and publishes — they only differ in where the content comes from.
type CreateMode = "blank" | "ai" | "pdf";

const CREATE_MODES: { mode: CreateMode; label: string; hint: string; Icon: React.FC<{ className?: string }> }[] = [
  { mode: "blank", label: "Write myself", hint: "Start blank in the editor", Icon: PencilLine },
  { mode: "ai", label: "Generate with AI", hint: "Drafted from the chosen topic", Icon: Sparkles },
  { mode: "pdf", label: "Upload a PDF", hint: "Use a file you already prepared", Icon: FileUp },
];

const PDF_MAX_MB = 25;

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const LessonNoteFormModal: React.FC<Props> = ({ isOpen, onClose, initialSubjectId, noteId, onSaved, onDeleted }) => {
  const editing = noteId != null;
  const navigate = useNavigate();
  const location = useLocation();
  const deleteNote = useDeleteLessonNote();
  const { showToast } = useToast();
  const { selectedTermId } = useAcademicPeriod();

  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [classGroupId, setClassGroupId] = useState<number | "">("");
  // The subject's curriculum tree (Learning Outcomes -> performance criteria) and the
  // criteria this note will cover. Criteria that already have a note are flagged in the
  // picker so a teacher can see coverage gaps at a glance instead of duplicating work.
  const [competencies, setCompetencies] = useState<SubjectCompetency[]>([]);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<number[]>([]);
  const [coveredCriteriaIds, setCoveredCriteriaIds] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  // Once the teacher edits the title we stop suggesting one from the curriculum selection.
  const [titleTouched, setTitleTouched] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [jobStatus, setJobStatus] = useState<AINoteGenerationStatus | null>(null);
  const [mode, setMode] = useState<CreateMode>("blank");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Edit mode: the note as saved (the baseline for "what changed"), and the coverage to
  // restore once its subject's curriculum is in the picker.
  const [original, setOriginal] = useState<LessonNoteDetail | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const initialCriteria = useRef<{ subjectId: number; ids: number[] } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSubjectId(initialSubjectId ?? "");
    setClassGroupId("");
    setCompetencies([]);
    setSelectedCriteriaIds([]);
    setCoveredCriteriaIds(new Set());
    setTitle("");
    setTitleTouched(false);
    setExtraInstructions("");
    setJobStatus(null);
    setMode("blank");
    setPdfFile(null);
    setPdfError(null);
    setDragOver(false);
    setUploadProgress(null);
    setOriginal(null);
    initialCriteria.current = null;
    myAssignedSubjectsApi
      .getAll(selectedTermId ?? undefined)
      .then((res) => setSubjects(res.data.data))
      .catch(() => showToast("Failed to load your assigned subjects", "error"));

    if (noteId == null) return;
    let cancelled = false;
    setNoteLoading(true);
    lessonNotesApi
      .get(noteId)
      .then((res) => {
        if (cancelled) return;
        const note = res.data.data;
        setOriginal(note);
        // Set before subjectId so the subject effect below restores this coverage instead
        // of clearing it.
        initialCriteria.current = { subjectId: note.subject_id, ids: note.curriculum_context?.criteria_ids ?? [] };
        setSubjectId(note.subject_id);
        setClassGroupId(note.class_group_id ?? "");
        setTitle(note.title);
        // The note already has a title — never replace it with a suggestion.
        setTitleTouched(true);
      })
      .catch((err: any) => {
        if (cancelled) return;
        showToast(err?.response?.data?.message || "Failed to load this lesson note", "error");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setNoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedTermId, initialSubjectId, noteId]);

  const isPdfNote = !!original && isPdfBackedNote(original);
  // A course is one subject + one class: a note on one can't move (the server refuses, 409).
  const placementLocked = !!original?.elearning;

  // Edit mode can open a note whose subject/class the teacher no longer has an assignment
  // for (another term, a past subject). They still have to show up as the selected option,
  // or the form would look like the note has no subject.
  const subjectOptions = useMemo(() => {
    if (!original || subjects.some((s) => s.subject_id === original.subject_id)) return subjects;
    return [
      ...subjects,
      { subject_id: original.subject_id, subject_name: original.subject_name || "Current subject", subject_code: null, grades: [] },
    ] as MyAssignedSubject[];
  }, [subjects, original]);

  const selectedSubject = subjectOptions.find((s) => s.subject_id === subjectId);

  const classOptions = useMemo(() => {
    const grades = (selectedSubject?.grades || []).map((g) => ({
      class_group_id: g.class_group_id,
      label: `${g.class_group_name} (${g.grade_name})`,
    }));
    // Same-id rows come from one class taught across years — list each class once.
    const unique = grades.filter((g, i) => grades.findIndex((x) => x.class_group_id === g.class_group_id) === i);
    if (
      original?.class_group_id &&
      subjectId === original.subject_id &&
      !unique.some((g) => g.class_group_id === original.class_group_id)
    ) {
      unique.push({ class_group_id: original.class_group_id, label: original.class_group_name || "Current class" });
    }
    return unique;
  }, [selectedSubject, original, subjectId]);

  useEffect(() => {
    // Moving to another subject drops the coverage (it was the old subject's curriculum);
    // the note's own subject gets its saved coverage back — applied here, before the
    // curriculum loads, so a failed load can't make "save" wipe it.
    const restore = initialCriteria.current?.subjectId === subjectId ? initialCriteria.current.ids : [];
    setCompetencies([]);
    setSelectedCriteriaIds(restore);
    setCoveredCriteriaIds(new Set());
    if (!subjectId) return;

    let cancelled = false;
    setCurriculumLoading(true);
    Promise.all([
      competenciesApi.getAll(Number(subjectId)),
      // Every note this teacher already has for the subject (any class/term): the union
      // of their criteria is what the picker flags as "has a note".
      lessonNotesApi.list({ subject_id: Number(subjectId) }),
    ])
      .then(([compRes, notesRes]) => {
        if (cancelled) return;
        const list: SubjectCompetency[] = compRes.data.data || [];
        setCompetencies(
          [...list]
            .sort((x, y) => x.sort_order - y.sort_order || x.element_number - y.element_number)
            .map((c) => ({
              ...c,
              criteria: [...(c.criteria || [])].sort((x, y) => x.sort_order - y.sort_order),
            })),
        );
        const covered = new Set<number>();
        (notesRes.data.data || [])
          // A note's own coverage isn't "another note already covers this".
          .filter((n) => n.note_id !== noteId)
          .forEach((n) => (n.criteria_ids || []).forEach((id) => covered.add(id)));
        setCoveredCriteriaIds(covered);
      })
      .catch(() => {
        if (!cancelled) setCompetencies([]);
      })
      .finally(() => {
        if (!cancelled) setCurriculumLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const selectedOutcomes = competencies.filter((c) =>
    c.criteria.some((cr) => selectedCriteriaIds.includes(cr.criteria_id)),
  );

  // Suggest a title from the selection while the teacher hasn't typed one: the outcome's
  // title for a single outcome, or "A & B" for several. Only ever fills an empty box.
  const suggestedTitle = selectedOutcomes.length
    ? selectedOutcomes.length === 1
      ? selectedOutcomes[0].title
      : selectedOutcomes.map((o) => o.title).join(" & ")
    : "";
  useEffect(() => {
    if (!titleTouched) setTitle(suggestedTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTitle]);

  const createBlank = async () => {
    if (!subjectId || !title.trim()) {
      showToast("Pick a subject and give the note a title", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await lessonNotesApi.create({
        subject_id: Number(subjectId),
        class_group_id: classGroupId ? Number(classGroupId) : undefined,
        academic_term_id: selectedTermId ?? undefined,
        title: title.trim(),
        criteria_ids: selectedCriteriaIds,
      });
      onClose();
      navigate(`/lesson-notes/${res.data.data.note_id}`);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to create note", "error");
    } finally {
      setCreating(false);
    }
  };

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await lessonNotesApi.getAIGenerateStatus(jobId);
        const status = res.data.data;
        setJobStatus(status);
        if (status.status === "done") {
          clearInterval(interval);
          showToast("Lesson note generated and saved as a draft — review it, then publish when ready.", "success");
          setTimeout(() => {
            onClose();
            navigate(`/lesson-notes/${status.noteId}`);
          }, 900);
        } else if (status.status === "error") {
          clearInterval(interval);
          showToast(status.error || "AI generation failed", "error");
          setCreating(false);
        }
      } catch {
        clearInterval(interval);
        setCreating(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const retryAfterError = () => {
    setJobStatus(null);
    setCreating(false);
  };

  const generateWithAI = async () => {
    if (selectedCriteriaIds.length === 0) {
      showToast("Pick at least one Learning Outcome or performance criterion to generate from", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await lessonNotesApi.startAIGenerate({
        subject_id: Number(subjectId),
        criteria_ids: selectedCriteriaIds,
        class_group_id: classGroupId ? Number(classGroupId) : undefined,
        academic_term_id: selectedTermId ?? undefined,
        extra_instructions: extraInstructions.trim() || undefined,
      });
      setJobStatus({ status: "loading", stepIndex: 1, totalSteps: 4, message: "Loading curriculum context..." });
      pollJob(res.data.data.jobId);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to start AI generation", "error");
      setCreating(false);
    }
  };

  const acceptPdf = (file: File | undefined) => {
    setPdfError(null);
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setPdfError("Only PDF files can be uploaded as a lesson note.");
      return;
    }
    if (file.size > PDF_MAX_MB * 1024 * 1024) {
      setPdfError(`That PDF is ${formatBytes(file.size)} — the maximum is ${PDF_MAX_MB} MB.`);
      return;
    }
    setPdfFile(file);
    // Most teachers name the file after the topic anyway — save them retyping it.
    if (!title.trim()) setTitle(file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
  };

  const createFromPdf = async () => {
    if (!subjectId || !pdfFile) {
      showToast("Pick a subject and choose a PDF file", "error");
      return;
    }
    if (!title.trim()) {
      showToast("Give the note a title", "error");
      return;
    }
    setCreating(true);
    setUploadProgress(0);
    try {
      const res = await lessonNotesApi.createFromPdf(
        {
          subject_id: Number(subjectId),
          class_group_id: classGroupId ? Number(classGroupId) : undefined,
          academic_term_id: selectedTermId ?? undefined,
          title: title.trim(),
          criteria_ids: selectedCriteriaIds,
        },
        pdfFile,
        setUploadProgress,
      );
      const { note_id, page_count, is_textless } = res.data.data;
      showToast(
        is_textless
          ? `PDF saved as a draft (${page_count} page${page_count === 1 ? "" : "s"}). No text could be read from it, so students' Ask AI won't work on this note.`
          : `PDF saved as a draft (${page_count} page${page_count === 1 ? "" : "s"}) — review it, then publish when ready.`,
        is_textless ? "warning" : "success",
      );
      onClose();
      navigate(`/lesson-notes/${note_id}`);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to upload the PDF", "error");
      setUploadProgress(null);
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------- edit mode

  /** Only what actually changed is sent — an unchanged subject/class is never a "move",
   *  so renaming a note that's on a course isn't refused. */
  const buildPatch = () => {
    const patch: Parameters<typeof lessonNotesApi.update>[1] = {};
    if (!original) return patch;
    if (title.trim() !== original.title) patch.title = title.trim();
    if (subjectId && subjectId !== original.subject_id) patch.subject_id = Number(subjectId);
    const nextClass = classGroupId === "" ? null : Number(classGroupId);
    if (nextClass !== (original.class_group_id ?? null)) patch.class_group_id = nextClass;
    if (!sameIds(selectedCriteriaIds, original.curriculum_context?.criteria_ids ?? [])) {
      patch.criteria_ids = selectedCriteriaIds;
    }
    return patch;
  };
  const editDirty = editing && (Object.keys(buildPatch()).length > 0 || !!pdfFile);

  const refreshOriginal = async () => {
    if (noteId == null) return;
    const fresh = (await lessonNotesApi.get(noteId)).data.data;
    setOriginal(fresh);
    initialCriteria.current = { subjectId: fresh.subject_id, ids: fresh.curriculum_context?.criteria_ids ?? [] };
    onSaved?.(fresh);
  };

  const saveEdit = async () => {
    if (!original || noteId == null) return;
    if (!subjectId || !title.trim()) {
      showToast("Pick a subject and give the note a title", "error");
      return;
    }
    const patch = buildPatch();
    setCreating(true);
    try {
      if (Object.keys(patch).length) await lessonNotesApi.update(noteId, patch);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to save your changes", "error");
      setCreating(false);
      return;
    }

    if (pdfFile) {
      setUploadProgress(0);
      try {
        const res = await lessonNotesApi.replacePdf(noteId, pdfFile, setUploadProgress);
        if (res.data.data.is_textless) {
          showToast("No text could be read from the new PDF, so students' Ask AI won't work on this note.", "warning");
        }
      } catch (err: any) {
        // The details are already saved — say so, keep the form open on the saved state.
        showToast(
          `Details saved, but the PDF wasn't replaced: ${err?.response?.data?.message || "upload failed"}`,
          "error",
        );
        setUploadProgress(null);
        await refreshOriginal().catch(() => undefined);
        setCreating(false);
        return;
      }
    }

    await refreshOriginal().catch(() => undefined);
    showToast("Lesson note updated", "success");
    setCreating(false);
    onClose();
  };

  const removeNote = async () => {
    if (!original) return;
    if (await deleteNote(original)) {
      onClose();
      onDeleted?.();
    }
  };

  const canSubmit = editing
    ? !creating && !!original && !!subjectId && !!title.trim() && editDirty
    : !creating &&
      !!subjectId &&
      (mode === "blank"
        ? !!title.trim()
        : mode === "ai"
          ? selectedCriteriaIds.length > 0
          : !!pdfFile && !!title.trim());

  const submitHint = editing
    ? !title.trim()
      ? "Give the note a title"
      : !editDirty
        ? "Nothing has changed yet"
        : undefined
    : mode === "ai" && selectedCriteriaIds.length === 0
      ? "Pick at least one Learning Outcome or performance criterion first"
      : mode === "pdf" && !pdfFile
        ? "Choose a PDF file first"
        : !title.trim() && mode !== "ai"
          ? "Give the note a title"
          : undefined;

  const submit = () => {
    if (editing) return saveEdit();
    if (mode === "blank") return createBlank();
    if (mode === "ai") return generateWithAI();
    return createFromPdf();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? "Edit Lesson Note" : "New Lesson Note"} size="lg">
      {editing && (noteLoading || !original) ? (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading the note…</p>
        </div>
      ) : uploadProgress !== null && creating ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center">
            <FileText className="w-7 h-7 text-rose-500" />
          </div>
          <div className="text-center">
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {uploadProgress < 1 ? "Uploading your PDF..." : "Reading the PDF..."}
            </p>
            <p className="text-xs text-gray-400 mt-1 truncate max-w-xs">{pdfFile?.name}</p>
          </div>
          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full bg-rose-500 transition-all duration-300 ${uploadProgress >= 1 ? "animate-pulse" : ""}`}
              style={{ width: `${Math.max(4, Math.round(uploadProgress * 100))}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-400">
            {uploadProgress < 1
              ? `${Math.round(uploadProgress * 100)}%`
              : "Extracting text so students can ask the AI about it"}
          </p>
        </div>
      ) : jobStatus ? (
        jobStatus.status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-100">Generation failed</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                {jobStatus.error || "Something went wrong while generating this note."}
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                Close
              </button>
              <button
                onClick={retryAfterError}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          </div>
        ) : jobStatus.status === "done" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-gray-800 dark:text-gray-100">Lesson note generated!</p>
            <p className="text-xs text-gray-400">Saved as a draft — opening it now...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-800 dark:text-gray-100">{jobStatus.message}</p>
              <p className="text-xs text-gray-400 mt-1">Step {jobStatus.stepIndex} of {jobStatus.totalSteps}</p>
            </div>
            <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${(jobStatus.stepIndex / jobStatus.totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Subject</label>
            <SelectField
              aria-label="Subject"
              value={subjectId}
              disabled={placementLocked}
              onChange={(e) => {
                setSubjectId(e.target.value ? Number(e.target.value) : "");
                setClassGroupId("");
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Select a subject you teach...</option>
              {subjectOptions.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_name}
                </option>
              ))}
            </SelectField>
          </div>

          {selectedSubject && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Class</label>
              <SelectField
                aria-label="Class"
                value={classGroupId}
                disabled={placementLocked}
                onChange={(e) => setClassGroupId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">{editing ? "No class" : "Select a class..."}</option>
                {classOptions.map((g) => (
                  <option key={g.class_group_id} value={g.class_group_id}>
                    {g.label}
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          {placementLocked && original?.elearning && (
            <p className="flex items-start gap-1.5 -mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              <GraduationCap className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>
                On the “{original.elearning.course_title}” e-learning course ({original.elearning.section_title}), so its
                subject and class are fixed. Remove it from that course to move it.
              </span>
            </p>
          )}

          {selectedSubject && (
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-300">
                  Curriculum coverage{" "}
                  <span className="text-gray-400 font-normal">
                    {mode === "ai" ? "(what the AI writes about)" : "(optional — what this note covers)"}
                  </span>
                </label>
              </div>
              <CurriculumPicker
                outcomes={competencies}
                loading={curriculumLoading}
                selectedIds={selectedCriteriaIds}
                onChange={setSelectedCriteriaIds}
                coveredIds={coveredCriteriaIds}
                accent={mode === "ai" ? "violet" : mode === "pdf" ? "rose" : "blue"}
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Tick a Learning Outcome to cover all of it, or open it and pick specific performance criteria — across as
                many outcomes as you need.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">Title</label>
            <input
              aria-label="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="e.g. Introduction to Graphic Design Basics"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          {/* Edit mode: where create asks "how do you want to create it?", show how it was
              created and what can change here. A written/AI note's body lives in the editor;
              a PDF note's body is its file, so the file is replaceable from this form. */}
          {editing && original && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1.5">Content</p>
              {isPdfNote ? (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    data-testid="replace-pdf-input"
                    onChange={(e) => {
                      acceptPdf(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                      pdfFile
                        ? "border-gray-200 dark:border-gray-700/50 opacity-60"
                        : "border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-900/10"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900/60 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-rose-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium text-gray-800 dark:text-gray-100 truncate ${pdfFile ? "line-through" : ""}`}>
                        {original.file_name || "Uploaded PDF"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {[
                          original.page_count ? `${original.page_count} page${original.page_count === 1 ? "" : "s"}` : null,
                          original.file_size ? formatBytes(original.file_size) : null,
                          pdfFile ? "will be replaced" : "current file",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {!pdfFile && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex-shrink-0"
                      >
                        <RefreshCw className="w-3 h-3" /> Replace PDF
                      </button>
                    )}
                  </div>
                  {pdfFile && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-900/10">
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900/60 flex items-center justify-center flex-shrink-0">
                        <FileUp className="w-4 h-4 text-rose-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{pdfFile.name}</p>
                        <p className="text-[11px] text-gray-400">{formatBytes(pdfFile.size)} · new file, uploaded when you save</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPdfFile(null)}
                        title="Keep the current PDF"
                        className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-white dark:hover:bg-gray-800 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {pdfError && <p className="text-xs text-red-600 dark:text-red-400">{pdfError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/50">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    {original.source === "MANUAL" ? (
                      <PencilLine className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {SOURCE_TEXT[original.source] || SOURCE_TEXT.MANUAL}
                    </p>
                    <p className="text-[11px] text-gray-400">The note's text is edited in the editor, where it autosaves.</p>
                  </div>
                  {location.pathname !== `/lesson-notes/${noteId}` && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/lesson-notes/${noteId}`);
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Open editor <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!editing && (
            <>
              {/* How the content comes into being. Cards instead of two competing footer buttons:
                  the choice is made first, so the rest of the form only shows what that choice needs. */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-1.5">How do you want to create it?</p>
                <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CREATE_MODES.map(({ mode: m, label, hint, Icon }) => {
                    const active = mode === m;
                    const accent =
                      m === "ai"
                        ? "border-violet-500 bg-violet-50/70 dark:bg-violet-900/20 ring-violet-500/30"
                        : m === "pdf"
                          ? "border-rose-500 bg-rose-50/70 dark:bg-rose-900/20 ring-rose-500/30"
                          : "border-blue-500 bg-blue-50/70 dark:bg-blue-900/20 ring-blue-500/30";
                    const iconColor =
                      m === "ai" ? "text-violet-600 dark:text-violet-400" : m === "pdf" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400";
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMode(m)}
                        className={`flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 text-left px-3 py-2.5 rounded-xl border transition-all ${
                          active
                            ? `${accent} ring-2 shadow-sm`
                            : "border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            active ? "bg-white dark:bg-gray-900/60" : "bg-gray-100 dark:bg-gray-800"
                          } ${active ? iconColor : "text-gray-400"}`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium ${active ? "text-gray-900 dark:text-gray-50" : "text-gray-700 dark:text-gray-200"}`}>
                            {label}
                          </span>
                          <span className="block text-[11px] text-gray-400 leading-snug">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode === "ai" && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-1">
                    Additional instructions for the AI <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value.slice(0, 2000))}
                    placeholder='e.g. "Include a short section on local Rwandan examples", "Keep it to shorter, simpler sentences for a P5 class", "Add a table comparing the two methods"'
                    rows={3}
                    maxLength={2000}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    These are extra constraints for the AI — they can't override the selected topic or its curriculum criteria.
                  </p>
                </div>
              )}

              {mode === "pdf" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      acceptPdf(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {pdfFile ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-900/10">
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-900/60 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-rose-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{pdfFile.name}</p>
                        <p className="text-[11px] text-gray-400">{formatBytes(pdfFile.size)} · PDF</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex-shrink-0"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfFile(null)}
                        title="Remove file"
                        className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-white dark:hover:bg-gray-800 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        acceptPdf(e.dataTransfer.files?.[0]);
                      }}
                      className={`w-full flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-xl border-2 border-dashed transition-colors ${
                        dragOver
                          ? "border-rose-400 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-700/60 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <UploadCloud className={`w-7 h-7 ${dragOver ? "text-rose-500" : "text-gray-300 dark:text-gray-600"}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        <span className="font-medium text-rose-600 dark:text-rose-400">Choose a PDF</span> or drag it here
                      </span>
                      <span className="text-[11px] text-gray-400">PDF only · up to {PDF_MAX_MB} MB</span>
                    </button>
                  )}
                  {pdfError && <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{pdfError}</p>}
                  <p className="flex items-start gap-1.5 text-xs text-gray-400 mt-2">
                    <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>
                      The PDF is used as-is and can't be edited here — replace the file to change it. It's saved as a
                      draft; students see it once you publish, and can still highlight text in it to ask the AI.
                    </span>
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            {editing && onDeleted && (
              <button
                type="button"
                onClick={removeNote}
                disabled={creating}
                className="mr-auto flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Delete note
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2.5 text-sm font-medium rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              title={submitHint}
              className={`flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === "ai"
                  ? "bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90"
                  : mode === "pdf"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editing ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : mode === "ai" ? (
                <Sparkles className="w-4 h-4" />
              ) : mode === "pdf" ? (
                <FileUp className="w-4 h-4" />
              ) : (
                <PencilLine className="w-4 h-4" />
              )}
              {editing
                ? "Save changes"
                : mode === "ai"
                  ? "Generate with AI"
                  : mode === "pdf"
                    ? "Upload as draft"
                    : "Create blank note"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default LessonNoteFormModal;
