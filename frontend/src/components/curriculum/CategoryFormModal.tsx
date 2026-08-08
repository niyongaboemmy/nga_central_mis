import React, { useState, useEffect } from "react";
import { Tag, AlignLeft, Palette, Check, Loader2, FolderOpen } from "lucide-react";
import Modal from "../ui/Modal";
import { subjectDocCategoriesApi, SubjectDocCategory } from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (category: SubjectDocCategory) => void;
  subjectId: number;
  editingCategory?: SubjectDocCategory | null;
}

const PRESET_COLORS = [
  { color: "#3B82F6", label: "Blue" },
  { color: "#10B981", label: "Green" },
  { color: "#F59E0B", label: "Amber" },
  { color: "#EF4444", label: "Red" },
  { color: "#8B5CF6", label: "Purple" },
  { color: "#EC4899", label: "Pink" },
  { color: "#06B6D4", label: "Cyan" },
  { color: "#6B7280", label: "Gray" },
];

const fieldClass =
  "w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500/60 outline-none transition-all";

const labelClass =
  "flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5";

const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  subjectId,
  editingCategory,
}) => {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setFormData({
          name: editingCategory.name,
          description: editingCategory.description || "",
          color: editingCategory.color,
        });
      } else {
        setFormData({ name: "", description: "", color: "#3B82F6" });
      }
      setErrors({});
    }
  }, [isOpen, editingCategory]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (formData.name.length > 150) e.name = "Name must be ≤150 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      let res: any;
      if (editingCategory) {
        res = await subjectDocCategoriesApi.update(
          editingCategory.category_id,
          formData,
        );
      } else {
        res = await subjectDocCategoriesApi.create(subjectId, formData);
      }
      onSaved(res.data.data);
      showToast(
        editingCategory ? "Category updated" : "Category created",
        "success",
      );
      onClose();
    } catch {
      showToast("Failed to save category", "error");
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
            <FolderOpen className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span>{editingCategory ? "Edit Category" : "New Document Category"}</span>
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>
            <Tag className="w-3.5 h-3.5" />
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Notes, Exercises, Books"
            maxLength={150}
            className={fieldClass}
          />
          {errors.name && (
            <p className="text-xs text-red-500 mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>
            <AlignLeft className="w-3.5 h-3.5" />
            Description
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Short description..."
            className={fieldClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            <Palette className="w-3.5 h-3.5" />
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(({ color, label }) => (
              <button
                key={color}
                type="button"
                title={label}
                onClick={() => setFormData({ ...formData, color })}
                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ${
                  formData.color === color ? "ring-2 ring-gray-400 dark:ring-gray-500" : ""
                }`}
                style={{ backgroundColor: color }}
              >
                {formData.color === color && (
                  <span className="flex items-center justify-center h-full w-full">
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
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
            {saving ? "Saving..." : editingCategory ? "Save Changes" : "Create Category"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CategoryFormModal;
