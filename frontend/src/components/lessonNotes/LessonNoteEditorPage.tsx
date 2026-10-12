import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Share2,
  History,
  Loader2,
  CheckCircle2,
  BookOpen,
  Maximize2,
  Minimize2,
  AlertCircle,
  FileDown,
  FileText,
  ChevronDown,
  GraduationCap,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { lessonNotesApi, LessonNoteDetail, isPdfBackedNote } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import LessonNoteRichEditor from "./LessonNoteRichEditor";
import ShareLessonNoteModal from "./ShareLessonNoteModal";
import VersionHistoryModal from "./VersionHistoryModal";
import LessonNoteStatusBadge from "./LessonNoteStatusBadge";
import LessonNoteShareBadge from "./LessonNoteShareBadge";
import PdfNoteWorkspace from "./pdf/PdfNoteWorkspace";
import LessonNoteFormModal from "./LessonNoteFormModal";
import { useDeleteLessonNote } from "./useDeleteLessonNote";
import {
  attachImageTokenToJson,
  attachImageTokenToHtml,
} from "../../utils/lessonNoteImages";
import { useConfirm } from "../../contexts/ConfirmContext";
import { usePermissions } from "../../hooks/usePermissions";
import { elearningApi, type NoteElearning } from "../../api/elearning";
import NoteReachChip from "./elearning/NoteReachChip";
import NoteElearningPanel from "./elearning/NoteElearningPanel";

const AUTOSAVE_DELAY_MS = 1500;

// Mirrors the backend's hasVisibleContent check (lessonNoteController.ts) — kept in sync
// so the Publish button disables itself before the teacher ever hits the server-side 400.
const hasVisibleContent = (html: string | null | undefined): boolean =>
  !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

const LessonNoteEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const noteId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const askConfirm = useConfirm();
  const deleteNote = useDeleteLessonNote();
  const { hasPermission } = usePermissions();
  const canBuild = hasPermission("MANAGE_COURSE_CONTENT");
  // Where "back" goes: the exact list the teacher opened this note from (subject, search,
  // filters), else that subject's notes — never the bare subject picker.
  const backTo = (location.state as { backTo?: string } | null)?.backTo;
  const [elearning, setElearning] = useState<NoteElearning | null>(null);
  const [showElearning, setShowElearning] = useState(false);

  const [note, setNote] = useState<LessonNoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [showShare, setShowShare] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  // Remounts the PDF viewer after the file is replaced from "Edit details" (same storage path).
  const [pdfKey, setPdfKey] = useState(0);

  const pendingContent = useRef<{ json: any; html: string } | null>(null);
  const pendingAIPrompt = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lessonNotesApi
      .get(noteId)
      .then((res) => {
        setNote(res.data.data);
        setTitle(res.data.data.title);
        // A PDF note is publishable as soon as its file exists — even a scanned PDF with
        // no extractable text is something students can read (mirrors isPublishable()).
        setHasContent(
          isPdfBackedNote(res.data.data)
            ? !!res.data.data.file_path
            : hasVisibleContent(res.data.data.content_html),
        );
      })
      .catch((err: any) => {
        showToast(
          err?.response?.data?.message || "Failed to load lesson note",
          "error",
        );
        navigate("/lesson-notes", { replace: true });
      });
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const flushSave = useCallback(
    async (
      extra?: Partial<{ title: string; status: "DRAFT" | "PUBLISHED" }>,
    ) => {
      if (!pendingContent.current && !extra) return;
      setSaveState("saving");
      try {
        await lessonNotesApi.update(noteId, {
          ...(pendingContent.current
            ? {
                content_json: pendingContent.current.json,
                content_html: pendingContent.current.html,
              }
            : {}),
          ...(pendingAIPrompt.current
            ? { snapshot_prompt: pendingAIPrompt.current }
            : {}),
          ...extra,
        });
        pendingContent.current = null;
        pendingAIPrompt.current = null;
        setSaveState("saved");
      } catch (err: any) {
        // Keep pendingContent/pendingAIPrompt intact (not cleared) so the next edit — or
        // an explicit "Retry" click — resends the same unsaved change instead of losing it.
        // A plain toast alone is easy to miss; "error" persists visibly next to the title
        // until a save actually succeeds.
        setSaveState("error");
        showToast(
          err?.response?.data?.message ||
            "Failed to save — your last change wasn't stored",
          "error",
        );
      }
    },
    [noteId, showToast],
  );

  const scheduleAutosave = useCallback(
    (immediate = false) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      if (immediate) {
        flushSave();
        return;
      }
      autosaveTimer.current = setTimeout(() => flushSave(), AUTOSAVE_DELAY_MS);
    },
    [flushSave],
  );

  const handleContentChange = (json: any, html: string) => {
    pendingContent.current = { json, html };
    setHasContent(hasVisibleContent(html));
    scheduleAutosave();
  };

  const handleAIEditAccepted = (instruction: string) => {
    pendingAIPrompt.current = instruction;
    // AI-applied edits are saved right away (not debounced) so the pre-edit
    // snapshot lands before the teacher makes any further manual changes.
    scheduleAutosave(true);
  };

  const saveTitle = async () => {
    if (!note || title === note.title) return;
    if (!title.trim()) {
      // An empty title is refused by the server; put the saved one back instead.
      setTitle(note.title);
      return;
    }
    setNote((prev) => (prev ? { ...prev, title } : prev));
    await lessonNotesApi.update(noteId, { title }).catch(() => showToast("Failed to save title", "error"));
  };

  const handleTitleBlur = () => {
    saveTitle();
  };

  /** Everything typed so far is saved before the details form reads the note. */
  const openEditDetails = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    await Promise.all([saveTitle(), flushSave()]);
    setShowEditDetails(true);
  };

  const handleDetailsSaved = (fresh: LessonNoteDetail) => {
    // Body fields stay as the editor has them; only the details the form owns are taken.
    setNote((prev) =>
      prev
        ? {
            ...prev,
            title: fresh.title,
            subject_id: fresh.subject_id,
            subject_name: fresh.subject_name,
            class_group_id: fresh.class_group_id,
            class_group_name: fresh.class_group_name,
            scheme_entry_id: fresh.scheme_entry_id,
            scheme_context: fresh.scheme_context,
            curriculum_context: fresh.curriculum_context,
            elearning: fresh.elearning,
            file_path: fresh.file_path,
            file_name: fresh.file_name,
            file_size: fresh.file_size,
            page_count: fresh.page_count,
            content_html: isPdfBackedNote(fresh) ? fresh.content_html : prev.content_html,
            updated_at: fresh.updated_at,
          }
        : prev,
    );
    setTitle(fresh.title);
    if (isPdfBackedNote(fresh) && fresh.updated_at !== note?.updated_at) setPdfKey((k) => k + 1);
  };

  const handleDelete = async () => {
    if (!note) return;
    // Write any pending edit first: if the delete is cancelled nothing is lost, and if it
    // goes ahead no autosave fires afterwards against a note that no longer exists.
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    await flushSave();
    if (!(await deleteNote(note))) return;
    pendingContent.current = null;
    navigate(`/lesson-notes?subject=${note.subject_id}`, { replace: true });
  };

  useEffect(() => {
    if (!canBuild || !noteId) return;
    elearningApi
      .noteElearning(noteId)
      .then((res) => setElearning(res.data.data))
      .catch(() => setElearning(null));
  }, [noteId, canBuild]);

  /** Publishing from the e-learning panel goes through the editor's save, so unsaved edits go too. */
  const publishFromPanel = async () => {
    if (!note || note.status === "PUBLISHED") return;
    if (!hasContent) {
      showToast("Add some content before publishing this note.", "error");
      throw new Error("empty");
    }
    await flushSave({ status: "PUBLISHED" });
    setNote((prev) => (prev ? { ...prev, status: "PUBLISHED" } : prev));
  };

  const handlePublishToggle = async () => {
    if (!note) return;
    const nextStatus = note.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    if (nextStatus === "PUBLISHED" && !hasContent) {
      showToast("Add some content before publishing this note.", "error");
      return;
    }
    await flushSave({ status: nextStatus });
    setNote((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    if (canBuild) elearningApi.noteElearning(noteId).then((res) => setElearning(res.data.data)).catch(() => {});
    showToast(
      nextStatus === "PUBLISHED"
        ? "Note published — your students can now see it"
        : "Note unpublished",
      "success",
    );
  };

  // Images are embedded directly into the note as base64 data URIs (like pasting an
  // image into Google Docs or Word) rather than uploaded to server-side storage —
  // no network round-trip, no auth token to manage, and it self-contains the note
  // so PDF export and shared views render it with zero extra requests.
  const handleUploadImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });

  const handleRequestAIEdit = async (
    instruction: string,
    selectionHtml?: string,
    wholeNoteHtml?: string,
  ): Promise<string> => {
    const res = await lessonNotesApi.proposeAIEdit(noteId, {
      instruction,
      selection_html: selectionHtml,
      whole_note_html: wholeNoteHtml,
    });
    return res.data.data.html;
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // pendingContent is only non-null between an edit and its autosave (debounced
      // ~1.5s) or after a save failure — closing/reloading the tab in that window would
      // otherwise silently drop the teacher's last change with no warning at all.
      if (pendingContent.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const handleBackToNotes = async () => {
    if (pendingContent.current) {
      const leave = await askConfirm({
        title: "Leave without saving?",
        message: "This note has edits that haven't been written yet.",
        confirmText: "Leave",
        cancelText: "Stay and save",
        tone: "warning",
      });
      if (!leave) return;
    }
    navigate(backTo || (note ? `/lesson-notes?subject=${note.subject_id}` : "/lesson-notes"));
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const handleExportPdf = async () => {
    if (!hasContent) {
      showToast("Add some content before exporting this note.", "error");
      return;
    }
    setExportingPdf(true);
    try {
      const res = await lessonNotesApi.exportPdf(noteId);
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "lesson-note"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      // responseType:"blob" means an error body also comes back as a Blob, not parsed
      // JSON — read it as text first so the real backend message (e.g. "add content
      // before exporting") surfaces instead of a generic fallback.
      let message = "Failed to export PDF";
      const errData = err?.response?.data;
      if (errData instanceof Blob) {
        try {
          message = JSON.parse(await errData.text())?.message || message;
        } catch {
          // keep fallback
        }
      } else if (errData?.message) {
        message = errData.message;
      }
      showToast(message, "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleVersionRestored = (contentJson: any) => {
    setNote((prev) => (prev ? { ...prev, content_json: contentJson } : prev));
    setEditorKey((k) => k + 1);
  };

  if (!note) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const isPdfNote = isPdfBackedNote(note);

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-white dark:bg-gray-900 px-4 sm:px-8 py-4 flex flex-col"
          : "max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-5rem)]"
      }
    >
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-64">
          <button
            onClick={handleBackToNotes}
            title={`Back to ${note.subject_name || "your"} notes`}
            aria-label={`Back to ${note.subject_name || "your"} notes`}
            className="group flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.12] flex-shrink-0 max-w-[14rem] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline truncate">{note.subject_name || "Notes"}</span>
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="flex-1 min-w-[6rem] text-lg font-semibold bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-gray-100 truncate"
          />
          <LessonNoteStatusBadge status={note.status} />
          {isPdfNote && (
            <span
              title="Created from an uploaded PDF — read-only"
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
            >
              <FileText className="w-2.5 h-2.5" /> PDF
            </span>
          )}
          {note.status === "PUBLISHED" && (
            <LessonNoteShareBadge shareCount={note.share_count} />
          )}
          {elearning && (
            <span className="hidden md:inline-flex min-w-0">
              <NoteReachChip
                reach={elearning.reach}
                placement={
                  elearning.placement && elearning.course
                    ? { ...elearning.placement, course_id: elearning.course.course_id, course_title: elearning.course.title }
                    : null
                }
                hasCourse={!!elearning.course}
                onClick={() => setShowElearning(true)}
                size="md"
              />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <span className="text-xs hidden sm:flex items-center gap-1">
            {saveState === "saving" && (
              <span className="text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving
              </span>
            )}
            {saveState === "saved" && (
              <span className="text-gray-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" /> Saved
              </span>
            )}
            {saveState === "error" && (
              <button
                onClick={() => flushSave()}
                className="text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline"
                title="Your last change wasn't saved — click to retry"
              >
                <AlertCircle className="w-3 h-3" /> Not saved — retry
              </button>
            )}
          </span>
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          {elearning && (
            <button
              onClick={() => setShowElearning(true)}
              title="On e-learning"
              aria-label="On e-learning"
              className="md:hidden p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <GraduationCap className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={openEditDetails}
            title="Edit details — subject, class, curriculum coverage, title"
            className="px-3 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden md:inline">Details</span>
          </button>
          {!isPdfNote && (
            <button
              onClick={() => setShowVersions(true)}
              title="Version history"
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || !hasContent}
            title={
              isPdfNote
                ? "Download the original PDF"
                : hasContent
                  ? "Export as PDF"
                  : "Add some content before exporting"
            }
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
          >
            {exportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setShowShare(true)}
            disabled={note.status !== "PUBLISHED"}
            title={
              note.status !== "PUBLISHED"
                ? "Publish first — publishing already lets this note's class read it"
                : "Share beyond this note's class — hand-picked students, another class, or an expiry"
            }
            className="px-3 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
          <button
            onClick={handleDelete}
            title="Delete this note"
            aria-label="Delete this note"
            className="p-2 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-300 dark:hover:bg-red-400/10"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={handlePublishToggle}
            disabled={note.status !== "PUBLISHED" && !hasContent}
            title={
              note.status !== "PUBLISHED" && !hasContent
                ? "Add some content before publishing"
                : undefined
            }
            className={`px-3 py-1.5 text-xs font-semibold rounded-full disabled:opacity-40 disabled:cursor-not-allowed ${
              note.status === "PUBLISHED"
                ? "bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {note.status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* Curriculum coverage: the Learning Outcomes / performance criteria this note is for.
          Collapsed to one line so the editor keeps its space; expand to read the criteria. */}
      {note.curriculum_context && note.curriculum_context.outcomes.length > 0 && (
        <div className="mb-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
          <button
            type="button"
            onClick={() => setCoverageOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
            aria-expanded={coverageOpen}
          >
            <GraduationCap className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-800 dark:text-blue-300 min-w-0 flex-1 truncate">
              <span className="font-semibold">
                {note.curriculum_context.criteria_ids.length} performance{" "}
                {note.curriculum_context.criteria_ids.length === 1 ? "criterion" : "criteria"}
              </span>{" "}
              across {note.curriculum_context.outcomes.length} learning{" "}
              {note.curriculum_context.outcomes.length === 1 ? "outcome" : "outcomes"}
              <span className="opacity-80">
                {" "}
                — {note.curriculum_context.outcomes.map((o) => `LO ${o.element_number}: ${o.title}`).join(" · ")}
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-blue-400 flex-shrink-0 transition-transform ${coverageOpen ? "rotate-180" : ""}`}
            />
          </button>
          {coverageOpen && (
            <div className="px-4 pb-3 grid gap-2 sm:grid-cols-2">
              {note.curriculum_context.outcomes.map((o) => (
                <div key={o.competency_id} className="rounded-lg bg-white/70 dark:bg-gray-900/40 px-3 py-2">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    LO {o.element_number}: {o.title}
                    <span className="ml-1.5 font-normal text-blue-600/70 dark:text-blue-300/70">
                      {o.criteria.length >= o.total_criteria ? "whole outcome" : `${o.criteria.length} of ${o.total_criteria}`}
                    </span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {o.criteria.map((c) => (
                      <li key={c.criteria_id} className="text-[11px] text-blue-800/90 dark:text-blue-300/90 leading-snug">
                        <span className="font-medium mr-1">{c.criteria_number}</span>
                        {c.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {note.scheme_context && !note.curriculum_context && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <span className="font-semibold">
              {note.scheme_context.entry.week_number}:{" "}
              {note.scheme_context.entry.topic}
            </span>
            {note.scheme_context.entry.objective && (
              <span className="opacity-80">
                {" "}
                — {note.scheme_context.entry.objective}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
        {isPdfNote ? (
          <PdfNoteWorkspace
            key={pdfKey}
            note={note}
            onReplaced={(patch) => {
              setNote((prev) => (prev ? { ...prev, ...patch } : prev));
              setHasContent(true);
            }}
          />
        ) : (
          <LessonNoteRichEditor
            key={editorKey}
            initialContent={
              note.content_json
                ? attachImageTokenToJson(note.content_json)
                : attachImageTokenToHtml(note.content_html || "")
            }
            editable
            onChange={handleContentChange}
            onUploadImage={handleUploadImage}
            onRequestAIEdit={handleRequestAIEdit}
            onAIEditAccepted={handleAIEditAccepted}
            isFullscreen={isFullscreen}
          />
        )}
      </div>

      <ShareLessonNoteModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        note={note}
        onShareCountChange={(count) =>
          setNote((prev) => (prev ? { ...prev, share_count: count } : prev))
        }
      />
      <LessonNoteFormModal
        isOpen={showEditDetails}
        noteId={noteId}
        onClose={() => setShowEditDetails(false)}
        onSaved={handleDetailsSaved}
        onDeleted={() => {
          pendingContent.current = null;
          navigate(`/lesson-notes?subject=${note.subject_id}`, { replace: true });
        }}
      />
      <NoteElearningPanel
        noteId={showElearning ? noteId : null}
        onClose={() => setShowElearning(false)}
        onChanged={(d) => {
          setElearning(d);
          setNote((prev) => (prev ? { ...prev, status: d.note.status } : prev));
        }}
        onPublishNote={publishFromPanel}
      />
      <VersionHistoryModal
        isOpen={showVersions}
        onClose={() => setShowVersions(false)}
        noteId={noteId}
        onRestored={handleVersionRestored}
      />
    </div>
  );
};

export default LessonNoteEditorPage;
