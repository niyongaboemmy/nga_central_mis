import React, { useEffect, useState } from "react";
import { History, Sparkles, User, RotateCcw } from "lucide-react";
import Modal from "../ui/Modal";
import { lessonNotesApi, LessonNoteVersion } from "../../api/lessonNotes";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  noteId: number;
  onRestored: (contentJson: any) => void;
}

const VersionHistoryModal: React.FC<Props> = ({ isOpen, onClose, noteId, onRestored }) => {
  const { showToast } = useToast();
  const [versions, setVersions] = useState<LessonNoteVersion[]>([]);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    lessonNotesApi.listVersions(noteId).then((res) => setVersions(res.data.data)).catch(() => {});
  }, [isOpen, noteId]);

  const restore = async (versionId: number) => {
    setRestoringId(versionId);
    try {
      const res = await lessonNotesApi.restoreVersion(noteId, versionId);
      onRestored(res.data.data.content_json);
      showToast("Version restored", "success");
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to restore version", "error");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Version History" size="md">
      {versions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
          <History className="w-8 h-8" />
          <p className="text-sm">No saved versions yet — one is kept automatically before every AI edit you accept.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {versions.map((v) => (
            <div
              key={v.version_id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700/50"
            >
              <div className="flex items-start gap-2 min-w-0">
                {v.created_by === "AI" ? (
                  <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-200 truncate">
                    {v.prompt_text || (v.created_by === "AI" ? "AI edit" : "Saved version")}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(v.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button
                onClick={() => restore(v.version_id)}
                disabled={restoringId === v.version_id}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default VersionHistoryModal;
