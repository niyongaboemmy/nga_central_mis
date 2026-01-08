import React, { useState } from "react";
import { ClassGroup, AcademicYear, Grade } from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Input from "../ui/Input";

interface ClassGroupsTabProps {
  data: ClassGroup[];
  academicYears: AcademicYear[];
  grades: Grade[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: Omit<ClassGroup, "class_group_id">) => Promise<void>;
  onUpdate: (
    id: number,
    data: Partial<Omit<ClassGroup, "class_group_id">>
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface ClassGroupFormData {
  name: string;
  academic_year_id: number;
  grade_id: number;
}

const ClassGroupsTab: React.FC<ClassGroupsTabProps> = ({
  data,
  academicYears,
  grades,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedClassGroup, setSelectedClassGroup] =
    useState<ClassGroup | null>(null);
  const [formData, setFormData] = useState<ClassGroupFormData>({
    name: "",
    academic_year_id: 0,
    grade_id: 0,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: "",
      academic_year_id: 0,
      grade_id: 0,
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Class group name is required";
    }

    if (!formData.academic_year_id || formData.academic_year_id === 0) {
      errors.academic_year_id = "Academic year selection is required";
    }

    if (!formData.grade_id || formData.grade_id === 0) {
      errors.grade_id = "Grade selection is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await onCreate(formData);
      setShowCreateModal(false);
      resetForm();
      onRefresh();
    } catch (error) {
      console.error("Failed to create class group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (classGroup: ClassGroup) => {
    setSelectedClassGroup(classGroup);
    setFormData({
      name: classGroup.name,
      academic_year_id: classGroup.academic_year_id,
      grade_id: classGroup.grade_id,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!validateForm() || !selectedClassGroup) return;

    setSubmitting(true);
    try {
      await onUpdate(selectedClassGroup.class_group_id, formData);
      setShowEditModal(false);
      resetForm();
      setSelectedClassGroup(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to update class group:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (classGroup: ClassGroup) => {
    setSelectedClassGroup(classGroup);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedClassGroup) return;

    setSubmitting(true);
    try {
      await onDelete(selectedClassGroup.class_group_id);
      setShowDeleteModal(false);
      setSelectedClassGroup(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete class group:", error);
    } finally {
      setSubmitting(false);
    }
  };
  const getAcademicYearName = (yearId: number) => {
    const year = academicYears.find((y) => y.academic_year_id === yearId);
    return year?.name || "Unknown";
  };

  const getGradeName = (gradeId: number) => {
    const grade = grades.find((g) => g.grade_id === gradeId);
    return grade?.name || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Class Groups
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Manage class groups combining academic years and grades
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            Add Class Group
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800/40 rounded-2xl shadow-sm border border-border-light dark:border-border-dark/30 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-light dark:divide-border-dark/30">
              <thead className="bg-surface-light dark:bg-surface-dark">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Academic Year
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800/30 divide-y divide-border-light dark:divide-border-dark/30">
                {data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      No class groups found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.class_group_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {getAcademicYearName(item.academic_year_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {getGradeName(item.grade_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Create Class Group"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Class A"
            required
          />

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  academic_year_id: parseInt(e.target.value),
                }))
              }
              className={`w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 focus:bg-surface-light dark:focus:bg-surface-dark/40 text-text-primary-light dark:text-text-primary-dark ${
                formErrors.academic_year_id
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : ""
              }`}
            >
              <option value={0}>Select Academic Year</option>
              {academicYears.map((year) => (
                <option
                  key={year.academic_year_id}
                  value={year.academic_year_id}
                >
                  {year.name}
                </option>
              ))}
            </select>
            {formErrors.academic_year_id && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mt-1">
                {formErrors.academic_year_id}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Grade
            </label>
            <select
              value={formData.grade_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  grade_id: parseInt(e.target.value),
                }))
              }
              className={`w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 focus:bg-surface-light dark:focus:bg-surface-dark/40 text-text-primary-light dark:text-text-primary-dark ${
                formErrors.grade_id
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : ""
              }`}
            >
              <option value={0}>Select Grade</option>
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.name}
                </option>
              ))}
            </select>
            {formErrors.grade_id && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mt-1">
                {formErrors.grade_id}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting}
            isLoading={submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          resetForm();
          setSelectedClassGroup(null);
        }}
        title="Edit Class Group"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Class A"
            required
          />

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  academic_year_id: parseInt(e.target.value),
                }))
              }
              className={`w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 focus:bg-surface-light dark:focus:bg-surface-dark/40 text-text-primary-light dark:text-text-primary-dark ${
                formErrors.academic_year_id
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : ""
              }`}
            >
              <option value={0}>Select Academic Year</option>
              {academicYears.map((year) => (
                <option
                  key={year.academic_year_id}
                  value={year.academic_year_id}
                >
                  {year.name}
                </option>
              ))}
            </select>
            {formErrors.academic_year_id && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mt-1">
                {formErrors.academic_year_id}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Grade
            </label>
            <select
              value={formData.grade_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  grade_id: parseInt(e.target.value),
                }))
              }
              className={`w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 focus:bg-surface-light dark:focus:bg-surface-dark/40 text-text-primary-light dark:text-text-primary-dark ${
                formErrors.grade_id
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  : ""
              }`}
            >
              <option value={0}>Select Grade</option>
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.name}
                </option>
              ))}
            </select>
            {formErrors.grade_id && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mt-1">
                {formErrors.grade_id}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowEditModal(false);
              resetForm();
              setSelectedClassGroup(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={submitting}
            isLoading={submitting}
          >
            {submitting ? "Updating..." : "Update"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedClassGroup(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Class Group"
        message={`Are you sure you want to delete "${selectedClassGroup?.name}"? This action cannot be undone.`}
        isLoading={submitting}
      />
    </div>
  );
};

export default ClassGroupsTab;
