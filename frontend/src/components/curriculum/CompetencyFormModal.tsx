import React, { useState, useEffect } from "react";
import { Hash, Clock, BookOpen, AlignLeft, ListTree, Loader2, Check } from "lucide-react";
import Modal from "../ui/Modal";
import { competenciesApi, SubjectCompetency } from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";

interface CompetencyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (competency: SubjectCompetency) => void;
  subjectId: number;
  editingCompetency?: SubjectCompetency | null;
}

const fieldClass =
  "w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500/60 outline-none transition-all";

const textareaClass =
  "w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-2xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500/60 outline-none transition-all leading-relaxed";

const labelClass =
  "flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5";

const CompetencyFormModal: React.FC<CompetencyFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  subjectId,
  editingCompetency,
}) => {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    element_number: 1,
    title: "",
    description: "",
    learning_hours: "" as string | number,
    indicative_content: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (editingCompetency) {
        setFormData({
          element_number: editingCompetency.element_number,
          title: editingCompetency.title,
          description: editingCompetency.description || "",
          learning_hours: editingCompetency.learning_hours ?? "",
          indicative_content: editingCompetency.indicative_content || "",
        });
      } else {
        setFormData({
          element_number: 1,
          title: "",
          description: "",
          learning_hours: "",
          indicative_content: "",
        });
      }
      setErrors({});
    }
  }, [isOpen, editingCompetency]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.title.trim()) e.title = "Title is required";
    if (formData.element_number < 1 || formData.element_number > 99)
      e.element_number = "Element number must be between 1 and 99";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        element_number: formData.element_number,
        title: formData.title,
        description: formData.description,
        learning_hours:
          formData.learning_hours === "" ? null : Number(formData.learning_hours),
        indicative_content: formData.indicative_content,
      };
      let res: any;
      if (editingCompetency) {
        res = await competenciesApi.update(
          subjectId,
          editingCompetency.competency_id,
          payload,
        );
      } else {
        res = await competenciesApi.create(subjectId, payload);
      }
      onSaved(res.data.data);
      showToast(
        editingCompetency ? "Competency updated" : "Competency created",
        "success",
      );
      onClose();
    } catch {
      showToast("Failed to save competency", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span>
            {editingCompetency ? "Edit Element of Competency" : "Add Element of Competency"}
          </span>
        </div>
      }
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <Hash className="w-3.5 h-3.5" />
              Element Number
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={formData.element_number}
              onChange={(e) =>
                setFormData({ ...formData, element_number: parseInt(e.target.value) || 1 })
              }
              className={fieldClass}
            />
            {errors.element_number && (
              <p className="text-xs text-red-500 mt-1">{errors.element_number}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              <Clock className="w-3.5 h-3.5" />
              Learning Hours
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              min={0}
              value={formData.learning_hours}
              onChange={(e) =>
                setFormData({ ...formData, learning_hours: e.target.value })
              }
              placeholder="e.g. 40"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            <BookOpen className="w-3.5 h-3.5" />
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Design a Web Page"
            className={fieldClass}
          />
          {errors.title && (
            <p className="text-xs text-red-500 mt-1">{errors.title}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>
            <AlignLeft className="w-3.5 h-3.5" />
            Description
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Brief description of this competency element..."
            className={`${textareaClass} resize-none`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={`${labelClass} mb-0`}>
              <ListTree className="w-3.5 h-3.5" />
              Indicative Content
              <span className="text-gray-400 font-normal">
                (optional, one topic per line)
              </span>
            </label>
            {formData.indicative_content.trim() && (
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/60 px-2 py-0.5 rounded-full">
                {
                  formData.indicative_content
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean).length
                }{" "}
                lines
              </span>
            )}
          </div>
          <textarea
            rows={8}
            value={formData.indicative_content}
            onChange={(e) =>
              setFormData({ ...formData, indicative_content: e.target.value })
            }
            placeholder={"e.g.\nGraphic design career description\nBasic graphic design tools description"}
            className={`${textareaClass} resize-y font-mono text-xs`}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800/60 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-full transition-colors shadow-sm shadow-blue-600/20"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {saving ? "Saving..." : editingCompetency ? "Save Changes" : "Add Element"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CompetencyFormModal;
