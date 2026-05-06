import React, { useState, useEffect } from "react";
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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (editingCompetency) {
        setFormData({
          element_number: editingCompetency.element_number,
          title: editingCompetency.title,
          description: editingCompetency.description || "",
        });
      } else {
        setFormData({ element_number: 1, title: "", description: "" });
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
      let res: any;
      if (editingCompetency) {
        res = await competenciesApi.update(
          subjectId,
          editingCompetency.competency_id,
          formData,
        );
      } else {
        res = await competenciesApi.create(subjectId, formData);
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
      title={editingCompetency ? "Edit Element of Competency" : "Add Element of Competency"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            className="w-24 px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          {errors.element_number && (
            <p className="text-xs text-red-500 mt-1">{errors.element_number}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. Design a Web Page"
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          {errors.title && (
            <p className="text-xs text-red-500 mt-1">{errors.title}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Brief description of this competency element..."
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
          >
            {saving ? "Saving..." : editingCompetency ? "Save Changes" : "Add Element"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CompetencyFormModal;
