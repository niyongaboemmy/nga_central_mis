import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Edit, Trash2 } from "lucide-react";
import { Grade, Program } from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import Alert from "../ui/Alert";

interface GradesTabProps {
  data: Grade[];
  programs: Program[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: any) => Promise<void>;
  onUpdate: (id: number, data: any) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface GradeFormData {
  name: string;
  program_id: number;
  level_order: number;
}

const GradesTab: React.FC<GradesTabProps> = ({
  data,
  programs,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [formData, setFormData] = useState<GradeFormData>({
    name: "",
    program_id: 0,
    level_order: 1,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: "",
      program_id: 0,
      level_order: 1,
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Grade name is required";
    }

    if (!formData.program_id || formData.program_id === 0) {
      errors.program_id = "Program selection is required";
    }

    if (formData.level_order < 1) {
      errors.level_order = "Level order must be at least 1";
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
      console.error("Failed to create grade:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (grade: Grade) => {
    setSelectedGrade(grade);
    setFormData({
      name: grade.name,
      program_id: grade.program_id,
      level_order: grade.level_order,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!validateForm() || !selectedGrade) return;

    setSubmitting(true);
    try {
      await onUpdate(selectedGrade.grade_id, formData);
      setShowEditModal(false);
      resetForm();
      setSelectedGrade(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to update grade:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (grade: Grade) => {
    setSelectedGrade(grade);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedGrade) return;

    setSubmitting(true);
    try {
      await onDelete(selectedGrade.grade_id);
      setShowDeleteModal(false);
      setSelectedGrade(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete grade:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const getProgramName = (programId: number) => {
    const program = programs.find((p) => p.program_id === programId);
    return program ? program.name : "Unknown Program";
  };

  return (
    <div className="">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            Grade Management
          </h2>
          <p className="text-sm text-gray-600/70 dark:text-gray-300/40">
            Organize and manage grade levels within academic programs
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="secondary"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-600/50 text-sm"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Grade
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Grades Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white dark:bg-slate-800/70 rounded-3xl border border-white dark:border-slate-700/40 overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-12 h-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-500 rounded-full"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700/50">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-700/50 dark:to-slate-600/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Grade Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Academic Program
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Level Order
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800/30 divide-y divide-gray-200 dark:divide-slate-700/30">
                {data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-4 text-center text-gray-500 dark:text-gray-400"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                          <Plus className="w-8 h-8 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-lg font-medium">No grades found</p>
                          <p className="text-sm">
                            Get started by adding your first grade
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((item, index) => (
                    <motion.tr
                      key={item.grade_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      whileHover={{
                        backgroundColor: "rgba(59, 130, 246, 0.05)",
                        scale: 1.01,
                      }}
                      className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-200"
                    >
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-extrabold text-sm">
                              {item.name.charAt(0)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-normal text-gray-900 dark:text-white">
                              {item.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex px-3 py-1 text-sm font-normal bg-blue-100/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                          {getProgramName(item.program_id)}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        Level {item.level_order}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleEdit(item)}
                            className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(item)}
                            className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Create New Grade"
        size="lg"
      >
        <div className="">
          <div className="space-y-5">
            <Input
              label="Grade Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={formErrors.name}
              placeholder="e.g., Grade 1, Primary 1"
              required
              className="text-lg"
            />

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Academic Program
              </label>
              <select
                value={formData.program_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    program_id: parseInt(e.target.value),
                  }))
                }
                className={`w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  formErrors.program_id
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                    : ""
                }`}
                required
              >
                <option value={0}>Choose an academic program</option>
                {programs.map((program) => (
                  <option key={program.program_id} value={program.program_id}>
                    {program.name}
                  </option>
                ))}
              </select>
              {formErrors.program_id && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-medium">
                  {formErrors.program_id}
                </p>
              )}
            </div>

            <Input
              label="Level Order"
              type="number"
              value={formData.level_order}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  level_order: parseInt(e.target.value) || 1,
                }))
              }
              error={formErrors.level_order}
              placeholder="1"
              min="1"
              required
              className="text-lg"
            />
          </div>

          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white disabled:opacity-50"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                  Creating...
                </div>
              ) : (
                "Create Grade"
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          resetForm();
          setSelectedGrade(null);
        }}
        title="Edit Grade"
        size="lg"
      >
        <div className="">
          <div className="space-y-5">
            <Input
              label="Grade Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={formErrors.name}
              placeholder="e.g., Grade 1, Primary 1"
              required
              className="text-lg"
            />

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Academic Program
              </label>
              <select
                value={formData.program_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    program_id: parseInt(e.target.value),
                  }))
                }
                className={`w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  formErrors.program_id
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                    : ""
                }`}
                required
              >
                <option value={0}>Choose an academic program</option>
                {programs.map((program) => (
                  <option key={program.program_id} value={program.program_id}>
                    {program.name}
                  </option>
                ))}
              </select>
              {formErrors.program_id && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-medium">
                  {formErrors.program_id}
                </p>
              )}
            </div>

            <Input
              label="Level Order"
              type="number"
              value={formData.level_order}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  level_order: parseInt(e.target.value) || 1,
                }))
              }
              error={formErrors.level_order}
              placeholder="1"
              min="1"
              required
              className="text-lg"
            />
          </div>

          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
            <Button
              variant="secondary"
              onClick={() => {
                setShowEditModal(false);
                resetForm();
                setSelectedGrade(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={submitting}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white disabled:opacity-50"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                  Updating...
                </div>
              ) : (
                "Update Grade"
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedGrade(null);
        }}
        title="Delete Grade"
        size="md"
      >
        <div className="">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Grade
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This action cannot be undone
            </p>
          </div>

          <Alert
            type="warning"
            message={`Are you sure you want to permanently delete "${selectedGrade?.name}"? This will remove the grade and cannot be undone.`}
            className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          />

          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedGrade(null);
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={submitting}
              className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white disabled:opacity-50"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                  Deleting...
                </div>
              ) : (
                "Delete Grade"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GradesTab;
