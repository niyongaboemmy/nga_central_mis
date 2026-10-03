import { useCallback } from "react";
import { lessonNotesApi, LessonNotePlacement } from "../../api/lessonNotes";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";

export interface DeletableLessonNote {
  note_id: number;
  title: string;
  status?: "DRAFT" | "PUBLISHED";
  share_count?: number;
  elearning?: LessonNotePlacement | null;
}

/**
 * One delete flow for every place a note can be removed from (notes list, editor, edit
 * form): a confirm that names what goes with the note, then the API call and a toast.
 * Resolves true only when the note is actually gone, so callers just navigate/refresh.
 */
export const useDeleteLessonNote = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();

  return useCallback(
    async (note: DeletableLessonNote): Promise<boolean> => {
      const details: string[] = [];
      if (note.elearning) {
        details.push(
          `It is removed from the "${note.elearning.course_title}" e-learning course (${note.elearning.section_title}), along with students' progress on it.`,
        );
      }
      if (note.share_count) {
        details.push(
          `${note.share_count} active share${note.share_count === 1 ? "" : "s"} with students end${note.share_count === 1 ? "s" : ""}.`,
        );
      } else if (note.status === "PUBLISHED") {
        details.push("Students who can read it now lose access.");
      }
      details.push("Its version history and images are deleted too. This can't be undone.");

      const ok = await confirm({
        title: "Delete lesson note?",
        message: `"${note.title}" will be permanently deleted.`,
        details,
        confirmText: "Delete note",
        tone: "danger",
      });
      if (!ok) return false;

      try {
        await lessonNotesApi.remove(note.note_id);
        showToast(
          note.elearning ? "Lesson note deleted and removed from e-learning" : "Lesson note deleted",
          "success",
        );
        return true;
      } catch (err: any) {
        showToast(err?.response?.data?.message || "Failed to delete note", "error");
        return false;
      }
    },
    [confirm, showToast],
  );
};
