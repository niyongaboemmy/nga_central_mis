import UserAvatar from "../ui/UserAvatar";
import React, { useEffect, useState } from "react";
import { Users, GraduationCap, UserCheck, Trash2 } from "lucide-react";
import Modal from "../ui/Modal";
import { lessonNotesApi, LessonNoteShare, LessonNoteDetail } from "../../api/lessonNotes";
import { myAssignedSubjectsApi, EnrolledStudent } from "../../api/academics";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  note: LessonNoteDetail;
  /** Keeps the editor's "Shared / Not shared" state in step as shares are added or revoked. */
  onShareCountChange?: (count: number) => void;
}

const ShareLessonNoteModal: React.FC<Props> = ({ isOpen, onClose, note, onShareCountChange }) => {
  const { showToast } = useToast();
  const { selectedYearId } = useAcademicPeriod();

  const [shares, setShares] = useState<LessonNoteShare[]>([]);
  const [filterType, setFilterType] = useState<"class_group" | "subject_enrolled" | "specific_students">("class_group");
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    lessonNotesApi
      .listShares(note.note_id)
      .then((res) => {
        setShares(res.data.data);
        onShareCountChange?.(res.data.data.length);
      })
      // A failed load previously left the modal looking like "no shares yet", which invites
      // a duplicate share; say so instead.
      .catch(() => showToast("Couldn't load who this note is shared with", "error"));
  }, [isOpen, note.note_id]);

  // Only fetch the enrolled-students roster once the teacher actually picks
  // "Specific students" — most shares are "whole class", and eagerly requesting
  // this on open surfaced a permission-error toast for teachers who never
  // needed the roster in the first place.
  useEffect(() => {
    if (!isOpen || filterType !== "specific_students" || !selectedYearId) return;
    myAssignedSubjectsApi
      .getEnrolledStudents(note.subject_id, selectedYearId)
      .then((res) => setStudents(res.data.data))
      .catch(() => setStudents([]));
  }, [isOpen, filterType, note.subject_id, selectedYearId]);

  const submit = async () => {
    if (note.status !== "PUBLISHED") {
      showToast("Publish the note before sharing it with students", "error");
      return;
    }
    let filterIds: number[] = [];
    if (filterType === "class_group") {
      if (!note.class_group_id) {
        showToast("This note isn't linked to a class — pick 'Specific students' instead", "error");
        return;
      }
      filterIds = [note.class_group_id];
    } else if (filterType === "subject_enrolled") {
      filterIds = [note.subject_id];
    } else {
      if (selectedStudentIds.length === 0) {
        showToast("Select at least one student", "error");
        return;
      }
      filterIds = selectedStudentIds;
    }

    setSaving(true);
    try {
      const res = await lessonNotesApi.share(note.note_id, { filter_type: filterType, filter_ids: filterIds });
      showToast("Lesson note shared", "success");
      setShares((prev) => {
        const next = [{ share_id: res.data.data.share_id, note_id: note.note_id, filter_type: filterType, filter_ids: filterIds, permission: "VIEW" as const, expires_at: null, created_at: new Date().toISOString() }, ...prev];
        onShareCountChange?.(next.length);
        return next;
      });
      setSelectedStudentIds([]);
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to share note", "error");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (shareId: number) => {
    try {
      await lessonNotesApi.revokeShare(note.note_id, shareId);
      setShares((prev) => {
        const next = prev.filter((s) => s.share_id !== shareId);
        onShareCountChange?.(next.length);
        return next;
      });
    } catch {
      showToast("Failed to revoke share", "error");
    }
  };

  const describeShare = (s: LessonNoteShare) => {
    if (s.filter_type === "class_group") return "Whole class";
    if (s.filter_type === "subject_enrolled") return "Everyone enrolled in the subject";
    return `${s.filter_ids.length} student${s.filter_ids.length === 1 ? "" : "s"}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Lesson Note" size="lg">
      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-2">Share with</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => setFilterType("class_group")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-full border text-xs font-medium transition-colors ${
                filterType === "class_group"
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              }`}
            >
              <Users className="w-4 h-4" /> Whole class
            </button>
            <button
              onClick={() => setFilterType("subject_enrolled")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-full border text-xs font-medium transition-colors ${
                filterType === "subject_enrolled"
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              }`}
            >
              <GraduationCap className="w-4 h-4" /> All enrolled
            </button>
            <button
              onClick={() => setFilterType("specific_students")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-full border text-xs font-medium transition-colors ${
                filterType === "specific_students"
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              }`}
            >
              <UserCheck className="w-4 h-4" /> Specific students
            </button>
          </div>
        </div>

        {filterType === "specific_students" && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/50 divide-y divide-gray-100 dark:divide-gray-700/40">
            {students.length === 0 ? (
              <p className="text-xs text-gray-400 p-3">No enrolled students found for this year.</p>
            ) : (
              students.map((s) => (
                <label key={s.user_id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(s.user_id)}
                    onChange={(e) =>
                      setSelectedStudentIds((prev) =>
                        e.target.checked ? [...prev, s.user_id] : prev.filter((id) => id !== s.user_id),
                      )
                    }
                  />
                  <UserAvatar decorative userId={s.user_id} name={`${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "?"} size={24} />
                  {s.first_name} {s.last_name}
                  <span className="text-gray-400 text-xs ml-auto">{s.class_group_name}</span>
                </label>
              ))
            )}
          </div>
        )}

        <button
          onClick={submit}
          disabled={saving}
          className="self-start px-4 py-2 text-sm font-medium rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Sharing..." : "Share"}
        </button>

        {shares.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-300 mb-2">Currently shared with</label>
            <div className="flex flex-col gap-1.5">
              {shares.map((s) => (
                <div
                  key={s.share_id}
                  className="flex items-center justify-between px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-800/40"
                >
                  <span className="text-gray-700 dark:text-gray-300">{describeShare(s)}</span>
                  <button onClick={() => revoke(s.share_id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShareLessonNoteModal;
