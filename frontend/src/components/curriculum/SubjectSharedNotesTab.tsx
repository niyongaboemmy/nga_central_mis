import React from "react";
import { useNavigate } from "react-router-dom";
import { Library } from "lucide-react";
import { SharedNoteSummary } from "../../api/lessonNotes";
import { EmptyState, Skeleton } from "../elearning/ui/primitives";
import NoteCard from "../lessonNotes/library/NoteCard";

interface Props {
  /** null while loading. */
  notes: SharedNoteSummary[] | null;
  subjectName: string;
}

/**
 * The student's own lesson notes for this subject.
 *
 * The existing "Notes" tab is the teacher's authoring surface and is gated on
 * MANAGE_LESSON_NOTES, so a student opening their subject saw no notes at all —
 * even though the notes their teacher shared are the most useful thing on the
 * page. This reads from the same library list the Shared Notes page uses, so it
 * needs no new endpoint and no new permission, and it reuses the library's card
 * so a note looks identical wherever it is met.
 */
const SubjectSharedNotesTab: React.FC<Props> = ({ notes, subjectName }) => {
  const navigate = useNavigate();

  if (notes === null) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        pose="sleepy"
        title="No lesson notes yet"
        body={`When your teacher publishes a note for ${subjectName}, it will appear here and in your library.`}
        action={{ label: "Go to my library", onClick: () => navigate("/shared-lesson-notes") }}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <strong className="font-semibold text-gray-700 dark:text-gray-200">{notes.length}</strong>{" "}
          {notes.length === 1 ? "note" : "notes"} shared with you in this subject
        </p>
        <button
          onClick={() => navigate("/shared-lesson-notes")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill px-3 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-500/10"
        >
          <Library className="h-3.5 w-3.5" /> All subjects
        </button>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {notes.map((n) => (
          <NoteCard
            key={n.note_id}
            note={n}
            tokens={[]}
            onOpen={(id) => navigate(`/shared-lesson-notes/${id}`)}
          />
        ))}
      </div>
    </>
  );
};

export default SubjectSharedNotesTab;
