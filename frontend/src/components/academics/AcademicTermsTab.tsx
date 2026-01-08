import React, { useState } from "react";
import { AcademicTerm, AcademicYear } from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Alert from "../ui/Alert";

interface AcademicTermsTabProps {
  data: AcademicTerm[];
  academicYears: AcademicYear[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: Omit<AcademicTerm, "academic_term_id">) => Promise<void>;
  onUpdate: (
    id: number,
    data: Partial<Omit<AcademicTerm, "academic_term_id">>
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const AcademicTermsTab: React.FC<AcademicTermsTabProps> = ({
  data,
  academicYears,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AcademicTerm | null>(null);
  const [formData, setFormData] = useState({
    academic_year_id: "",
    name: "",
    start_date: "",
    end_date: "",
    is_current: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      academic_year_id: "",
      name: "",
      start_date: "",
      end_date: "",
      is_current: false,
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.academic_year_id) {
      errors.academic_year_id = "Academic year is required";
    }

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.start_date) {
      errors.start_date = "Start date is required";
    }

    if (!formData.end_date) {
      errors.end_date = "End date is required";
    }

    if (
      formData.start_date &&
      formData.end_date &&
      formData.start_date >= formData.end_date
    ) {
      errors.end_date = "End date must be after start date";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await onCreate({
        academic_year_id: parseInt(formData.academic_year_id),
        name: formData.name.trim(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_current: formData.is_current ? 1 : 0,
      });
      setShowCreateModal(false);
      resetForm();
    } catch (error: any) {
      console.error("Create error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: AcademicTerm) => {
    setSelectedItem(item);
    setFormData({
      academic_year_id: item.academic_year_id.toString(),
      name: item.name,
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      is_current: item.is_current === 1,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!validateForm() || !selectedItem) return;

    setSubmitting(true);
    try {
      await onUpdate(selectedItem.academic_term_id, {
        academic_year_id: parseInt(formData.academic_year_id),
        name: formData.name.trim(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_current: formData.is_current ? 1 : 0,
      });
      setShowEditModal(false);
      resetForm();
      setSelectedItem(null);
    } catch (error: any) {
      console.error("Update error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item: AcademicTerm) => {
    setSelectedItem(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem) return;

    setSubmitting(true);
    try {
      await onDelete(selectedItem.academic_term_id);
      setShowDeleteModal(false);
      setSelectedItem(null);
    } catch (error: any) {
      console.error("Delete error:", error);
    } finally {
      setSubmitting(false);
    }
  };
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString();
  };

  const getAcademicYearName = (yearId: number) => {
    const year = academicYears.find((y) => y.academic_year_id === yearId);
    return year?.name || "Unknown";
  };

  return (
    <div className="">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Academic Terms
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Manage terms within academic years
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>Add Term</Button>
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
                    Start Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    End Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Status
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
                      colSpan={6}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      No academic terms found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.academic_term_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {getAcademicYearName(item.academic_year_id)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {formatDate(item.start_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {formatDate(item.end_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            item.is_current === 1
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {item.is_current === 1 ? "Current" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-red-600 hover:text-red-900"
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
        title="Create Academic Term"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  academic_year_id: e.target.value,
                }))
              }
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                formErrors.academic_year_id
                  ? "border-red-500 dark:border-red-500"
                  : "border-gray-300 dark:border-gray-600"
              }`}
              required
            >
              <option value="">Select an academic year</option>
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
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {formErrors.academic_year_id}
              </p>
            )}
          </div>

          <Input
            label="Term Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Term 1, Semester 1"
            required
          />

          <Input
            label="Start Date"
            type="date"
            value={formData.start_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, start_date: e.target.value }))
            }
            error={formErrors.start_date}
            required
          />

          <Input
            label="End Date"
            type="date"
            value={formData.end_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, end_date: e.target.value }))
            }
            error={formErrors.end_date}
            required
          />

          <div className="flex items-center">
            <input
              id="is_current_create"
              type="checkbox"
              checked={formData.is_current}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_current: e.target.checked,
                }))
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label
              htmlFor="is_current_create"
              className="ml-2 block text-sm text-text-primary-light dark:text-text-primary-dark"
            >
              Set as current academic term
            </label>
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
          <Button onClick={handleCreate} disabled={submitting}>
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
          setSelectedItem(null);
        }}
        title="Edit Academic Term"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <select
              value={formData.academic_year_id}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  academic_year_id: e.target.value,
                }))
              }
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                formErrors.academic_year_id
                  ? "border-red-500 dark:border-red-500"
                  : "border-gray-300 dark:border-gray-600"
              }`}
              required
            >
              <option value="">Select an academic year</option>
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
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {formErrors.academic_year_id}
              </p>
            )}
          </div>

          <Input
            label="Term Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Term 1, Semester 1"
            required
          />

          <Input
            label="Start Date"
            type="date"
            value={formData.start_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, start_date: e.target.value }))
            }
            error={formErrors.start_date}
            required
          />

          <Input
            label="End Date"
            type="date"
            value={formData.end_date}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, end_date: e.target.value }))
            }
            error={formErrors.end_date}
            required
          />

          <div className="flex items-center">
            <input
              id="is_current_edit"
              type="checkbox"
              checked={formData.is_current}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_current: e.target.checked,
                }))
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label
              htmlFor="is_current_edit"
              className="ml-2 block text-sm text-text-primary-light dark:text-text-primary-dark"
            >
              Set as current academic term
            </label>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowEditModal(false);
              resetForm();
              setSelectedItem(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={submitting}>
            {submitting ? "Updating..." : "Update"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedItem(null);
        }}
        title="Delete Academic Term"
      >
        <Alert
          type="warning"
          message={`Are you sure you want to delete "${selectedItem?.name}"? This action cannot be undone.`}
          className="mb-4"
        />

        <div className="flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShowDeleteModal(false);
              setSelectedItem(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            disabled={submitting}
          >
            {submitting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AcademicTermsTab;
