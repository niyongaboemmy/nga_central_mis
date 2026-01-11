import React, { useState } from "react";
import { Program } from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Alert from "../ui/Alert";

interface ProgramsTabProps {
  data: Program[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: Omit<Program, "program_id">) => Promise<void>;
  onUpdate: (
    id: number,
    data: Partial<Omit<Program, "program_id">>
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const ProgramsTab: React.FC<ProgramsTabProps> = ({
  data,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Program | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await onCreate({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      });
      setShowCreateModal(false);
      resetForm();
    } catch (error: any) {
      console.error("Create error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: Program) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!validateForm() || !selectedItem) return;

    setSubmitting(true);
    try {
      await onUpdate(selectedItem.program_id, {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
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

  const handleDelete = (item: Program) => {
    setSelectedItem(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem) return;

    setSubmitting(true);
    try {
      await onDelete(selectedItem.program_id);
      setShowDeleteModal(false);
      setSelectedItem(null);
    } catch (error: any) {
      console.error("Delete error:", error);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Programs
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Manage educational programs
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>Add Program</Button>
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
                    Description
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
                      colSpan={3}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      No programs found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.program_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.description || "No description"}
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
        title="Create Program"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Primary School"
            required
          />

          <Input
            label="Description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Optional description"
          />
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
        title="Edit Program"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g., Primary School"
            required
          />

          <Input
            label="Description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Optional description"
          />
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
        title="Delete Program"
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

export default ProgramsTab;
