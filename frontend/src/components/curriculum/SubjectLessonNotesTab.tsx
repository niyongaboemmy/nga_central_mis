import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Sparkles } from "lucide-react";
import { lessonNotesApi, LessonNoteSummary, isPdfBackedNote } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import LessonNoteFormModal from "../lessonNotes/LessonNoteFormModal";
import LessonNoteStatusBadge from "../lessonNotes/LessonNoteStatusBadge";
import LessonNoteShareBadge from "../lessonNotes/LessonNoteShareBadge";

interface Props {
  subjectId: number;
}

const sourceLabel: Record<string, { label: string; className: string }> = {
  MANUAL: { label: "Manual", className: "bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300" },
  AI_GENERATED: { label: "AI generated", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  AI_ASSISTED: { label: "AI assisted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  PDF_UPLOAD: { label: "PDF", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

const SubjectLessonNotesTab: React.FC<Props> = ({ subjectId }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<LessonNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = () => {
    setLoading(true);
    lessonNotesApi
      .list({ subject_id: subjectId })
      .then((res) => setNotes(res.data.data))
      .catch(() => showToast("Failed to load lesson notes", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Lesson Notes</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Notes you've written or generated with AI for this subject.
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 shadow-sm flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> New Note
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No lesson notes for this subject yet</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Create your first note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => {
            const source = sourceLabel[isPdfBackedNote(note) ? "PDF_UPLOAD" : note.source] || sourceLabel.MANUAL;
            return (
              <div
                key={note.note_id}
                onClick={() => navigate(`/lesson-notes/${note.note_id}`)}
                className="cursor-pointer rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 p-4 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/60 transition-all"
              >
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{note.title}</h4>
                {note.class_group_name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{note.class_group_name}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <LessonNoteStatusBadge status={note.status} />
                  {note.status === "PUBLISHED" && (
                    <LessonNoteShareBadge shareCount={note.share_count} />
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${source.className}`}>
                    {isPdfBackedNote(note) ? (
                      <FileText className="w-2.5 h-2.5" />
                    ) : (
                      note.source !== "MANUAL" && <Sparkles className="w-2.5 h-2.5" />
                    )}
                    {source.label}
                    {isPdfBackedNote(note) && note.page_count ? ` · ${note.page_count} p.` : ""}
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

      <LessonNoteFormModal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          load();
        }}
        initialSubjectId={subjectId}
      />
    </div>
  );
};

export default SubjectLessonNotesTab;
