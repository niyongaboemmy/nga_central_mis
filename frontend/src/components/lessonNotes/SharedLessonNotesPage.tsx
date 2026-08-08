import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ArrowRight, FileStack } from "lucide-react";
import { lessonNotesApi, SharedNoteSummary } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";

const SharedLessonNotesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<SharedNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lessonNotesApi
      .sharedWithMe()
      .then((res) => setNotes(res.data.data))
      .catch(() => showToast("Failed to load shared notes", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Notes Shared With Me</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Lesson notes your teachers have published and shared with you.
          </p>
        </div>
        {notes.length > 0 && (
          <button
            onClick={() => navigate("/shared-lesson-notes/combined")}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm flex-shrink-0"
          >
            <FileStack className="w-4 h-4" /> View All
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700/50">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No notes have been shared with you yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <button
              key={n.note_id}
              onClick={() => navigate(`/shared-lesson-notes/${n.note_id}`)}
              className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 hover:shadow-sm hover:border-blue-200 dark:hover:border-blue-800/60 transition-all text-left"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {n.subject_name} · {n.teacher_name}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SharedLessonNotesPage;
