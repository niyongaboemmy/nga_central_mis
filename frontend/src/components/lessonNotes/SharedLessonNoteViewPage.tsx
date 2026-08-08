import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { lessonNotesApi, SharedNoteDetail } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";
import { attachImageTokenToHtml } from "../../utils/lessonNoteImages";

const SharedLessonNoteViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [note, setNote] = useState<SharedNoteDetail | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lessonNotesApi
      .getShared(Number(id))
      .then((res) => setNote(res.data.data))
      .catch(() => showToast("This lesson note is not available", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // The teacher's editor renders $...$ as live KaTeX via a decoration plugin, but this
    // page renders raw saved HTML (no Tiptap instance) — without this pass, a student
    // would just see the literal "$E=mc^2$" text instead of a rendered formula.
    if (!note || !contentRef.current) return;
    renderMathInElement(contentRef.current, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });
  }, [note]);

  if (!note) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate("/shared-lesson-notes")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Shared notes
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{note.title}</h1>
      <p className="text-xs text-gray-400 mt-1 mb-6">
        {note.subject_name} · Updated {new Date(note.updated_at).toLocaleDateString()}
      </p>

      <div
        ref={contentRef}
        className="lesson-note-preview prose prose-sm dark:prose-invert max-w-none rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-gray-900/40 px-6 py-5"
        dangerouslySetInnerHTML={{ __html: attachImageTokenToHtml(note.content_html) }}
      />
    </div>
  );
};

export default SharedLessonNoteViewPage;
