import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Sparkles, Trash2, FileStack } from "lucide-react";
import { lessonNotesApi, LessonNoteSummary } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import NewLessonNoteModal from "./NewLessonNoteModal";
import ConfirmModal from "../ui/ConfirmModal";
import LessonNoteStatusBadge from "./LessonNoteStatusBadge";
import LessonNoteShareBadge from "./LessonNoteShareBadge";

const sourceLabel: Record<string, { label: string; className: string }> = {
  MANUAL: { label: "Manual", className: "bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300" },
  AI_GENERATED: { label: "AI generated", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  AI_ASSISTED: { label: "AI assisted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  PDF_UPLOAD: { label: "PDF", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

const LessonNotesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<LessonNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LessonNoteSummary | null>(null);

  const load = () => {
    setLoading(true);
    lessonNotesApi
      .list()
      .then((res) => setNotes(res.data.data))
      .catch(() => showToast("Failed to load lesson notes", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await lessonNotesApi.remove(deleteTarget.note_id);
      showToast("Lesson note deleted", "success");
      setNotes((prev) => prev.filter((n) => n.note_id !== deleteTarget.note_id));
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to delete note", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Lesson Notes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Write, generate with AI, or upload a PDF — then share notes with your students.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate("/lesson-notes/combined")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm"
          >
            <FileStack className="w-4 h-4" /> View All
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Note
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No lesson notes yet</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Create your first note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => {
            const source = sourceLabel[note.source] || sourceLabel.MANUAL;
            return (
              <div
                key={note.note_id}
                onClick={() => navigate(`/lesson-notes/${note.note_id}`)}
                className="group cursor-pointer rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 p-4 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/60 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{note.title}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(note);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {note.subject_name}
                  {note.class_group_name ? ` · ${note.class_group_name}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <LessonNoteStatusBadge status={note.status} />
                  {note.status === "PUBLISHED" && (
                    <LessonNoteShareBadge shareCount={note.share_count} />
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${source.className}`}>
                    {note.source === "PDF_UPLOAD" ? (
                      <FileText className="w-2.5 h-2.5" />
                    ) : (
                      note.source !== "MANUAL" && <Sparkles className="w-2.5 h-2.5" />
                    )}
                    {source.label}
                    {note.source === "PDF_UPLOAD" && note.page_count ? ` · ${note.page_count} p.` : ""}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-3">
                  Updated {new Date(note.updated_at).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <NewLessonNoteModal isOpen={showNewModal} onClose={() => { setShowNewModal(false); load(); }} />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete lesson note?"
        message={`"${deleteTarget?.title}" will be permanently deleted, including any shares with students.`}
        confirmText="Delete"
      />
    </div>
  );
};

export default LessonNotesListPage;
