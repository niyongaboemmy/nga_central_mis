import React, { useMemo, useState } from "react";
import {
  ClassGroup,
  AcademicYear,
  Grade,
  ClassGroupDependencyReport,
  classGroupsApi,
} from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Input from "../ui/Input";
import PromoteStudentsModal from "./PromoteStudentsModal";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import SelectField from "../ui/SelectField";

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
  onDelete: (id: number, force?: boolean) => Promise<void>;
  onPromote: (
    sourceClassGroupId: number,
    sourceAcademicYearId: number,
    targetClassGroupId: number,
    targetAcademicYearId: number,
  ) => Promise<{ promoted: number; skipped: number; total: number }>;
}

interface ClassGroupFormData {
  name: string;
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
  onPromote,
}) => {
  const { hasPermission } = usePermissions();
  const canPromoteStudents = hasPermission(
    Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
  );

  const currentYearId = useMemo(
    () => academicYears.find((y) => y.is_current === 1)?.academic_year_id || 0,
    [academicYears],
  );

  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showPromoteByGradeModal, setShowPromoteByGradeModal] =
    useState(false);
  const [promoteSourceId, setPromoteSourceId] = useState<number>(0);
  const [promoteSourceYearId, setPromoteSourceYearId] = useState<number>(0);
  const [promoteTargetId, setPromoteTargetId] = useState<number>(0);
  const [promoteTargetYearId, setPromoteTargetYearId] = useState<number>(0);
  const [promoteSubmitting, setPromoteSubmitting] = useState(false);
  const [promoteError, setPromoteError] = useState("");
  const [promoteResultMessage, setPromoteResultMessage] = useState("");

  const openPromoteModal = () => {
    setPromoteSourceId(0);
    setPromoteTargetId(0);
    const sortedYears = [...academicYears].sort(
      (a, b) => b.academic_year_id - a.academic_year_id,
    );
    const previousYear = sortedYears.find(
      (y) => y.academic_year_id !== currentYearId,
    );
    setPromoteTargetYearId(currentYearId || sortedYears[0]?.academic_year_id || 0);
    setPromoteSourceYearId(previousYear?.academic_year_id || 0);
    setPromoteError("");
    setPromoteResultMessage("");
    setShowPromoteModal(true);
  };

  const handlePromote = async () => {
    if (
      !promoteSourceId ||
      !promoteSourceYearId ||
      !promoteTargetId ||
      !promoteTargetYearId
    ) {
      setPromoteError(
        "Select a source year/class group and a target year/class group",
      );
      return;
    }
    if (
      promoteSourceId === promoteTargetId &&
      promoteSourceYearId === promoteTargetYearId
    ) {
      setPromoteError("Source and target must be different");
      return;
    }
    setPromoteSubmitting(true);
    setPromoteError("");
    try {
      const result = await onPromote(
        promoteSourceId,
        promoteSourceYearId,
        promoteTargetId,
        promoteTargetYearId,
      );
      setPromoteResultMessage(
        result.skipped > 0
          ? `Promoted ${result.promoted} student(s); ${result.skipped} were already in the target class group`
          : `Promoted ${result.promoted} student(s) successfully`,
      );
    } catch (error: any) {
      setPromoteError(
        error?.response?.data?.message || "Failed to promote students",
      );
    } finally {
      setPromoteSubmitting(false);
    }
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedClassGroup, setSelectedClassGroup] =
    useState<ClassGroup | null>(null);
  const [formData, setFormData] = useState<ClassGroupFormData>({
    name: "",
    grade_id: 0,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // A class group is referenced by rosters, timetables, schemes and reports.
  // The delete modal preflights those so the admin sees exactly what goes and
  // what is merely unlinked before confirming, instead of the delete failing
  // on a foreign key with nothing shown.
  const [deleteReport, setDeleteReport] =
    useState<ClassGroupDependencyReport | null>(null);
  const [deleteReportLoading, setDeleteReportLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const resetForm = () => {
    setFormData({
      name: "",
      grade_id: 0,
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Class group name is required";
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

  const handleDelete = async (classGroup: ClassGroup) => {
    setSelectedClassGroup(classGroup);
    setDeleteReport(null);
    setDeleteError("");
    setShowDeleteModal(true);
    setDeleteReportLoading(true);
    try {
      const response = await classGroupsApi.dependencies(
        classGroup.class_group_id,
      );
      setDeleteReport(response.data.data);
    } catch (error: any) {
      setDeleteError(
        error?.response?.data?.message ||
          "Could not check what this class group is linked to",
      );
    } finally {
      setDeleteReportLoading(false);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setSelectedClassGroup(null);
    setDeleteReport(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!selectedClassGroup) return;

    setSubmitting(true);
    setDeleteError("");
    try {
      // The backend refuses an unconfirmed delete that would clear links, so
      // pass force once the modal has shown the admin exactly what they are.
      await onDelete(selectedClassGroup.class_group_id, true);
      closeDeleteModal();
      onRefresh();
    } catch (error: any) {
      console.error("Failed to delete class group:", error);
      setDeleteError(
        error?.response?.data?.message || "Failed to delete class group",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const getGradeName = (gradeId: number) => {
    const grade = grades.find((g) => g.grade_id === gradeId);
    return grade?.name || "Unknown";
  };
  const getGradeLevelOrder = (gradeId: number) =>
    grades.find((g) => g.grade_id === gradeId)?.level_order;

  const promoteSourceLevelOrder = useMemo(() => {
    const sourceGroup = data.find((cg) => cg.class_group_id === promoteSourceId);
    return sourceGroup ? getGradeLevelOrder(sourceGroup.grade_id) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoteSourceId, data, grades]);

  return (
    <div className="">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Class Groups
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Manage class groups by grade
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={loading}
            className="whitespace-nowrap"
          >
            Refresh
          </Button>
          {canPromoteStudents && (
            <Button
              variant="secondary"
              onClick={openPromoteModal}
              disabled={loading || data.length === 0}
              className="whitespace-nowrap"
            >
              Promote a Class
            </Button>
          )}
          {canPromoteStudents && (
            <Button
              variant="secondary"
              onClick={() => setShowPromoteByGradeModal(true)}
              disabled={loading || data.length === 0}
              className="whitespace-nowrap"
            >
              Promote Students by Grade
            </Button>
          )}
          <Button
            onClick={() => setShowCreateModal(true)}
            className="whitespace-nowrap"
          >
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
                      colSpan={3}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      No class groups found. Use "Add Class Group" to create one.
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

      {/* Promote a Class Modal (manual, single class-group pair) */}
      <Modal
        isOpen={showPromoteModal}
        onClose={() => {
          setShowPromoteModal(false);
          setPromoteError("");
          setPromoteResultMessage("");
        }}
        title="Promote a Class"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            Move every active student from one class group into another --
            e.g. promoting last year's Grade 5 class into this year's Grade 6
            class. Pick the source year/class group students are currently in
            and the target year/class group to move them into. Students keep
            their prior class group as history; they aren't removed from it.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                Source Year
              </label>
              <SelectField
                value={promoteSourceYearId}
                onChange={(e) =>
                  setPromoteSourceYearId(parseInt(e.target.value))
                }
                className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
              >
                <option value={0}>Select source year</option>
                {academicYears.map((year) => (
                  <option
                    key={year.academic_year_id}
                    value={year.academic_year_id}
                  >
                    {year.name}
                    {year.is_current === 1 ? " (Current)" : ""}
                  </option>
                ))}
              </SelectField>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
                Target Year
              </label>
              <SelectField
                value={promoteTargetYearId}
                onChange={(e) =>
                  setPromoteTargetYearId(parseInt(e.target.value))
                }
                className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
              >
                <option value={0}>Select target year</option>
                {academicYears.map((year) => (
                  <option
                    key={year.academic_year_id}
                    value={year.academic_year_id}
                  >
                    {year.name}
                    {year.is_current === 1 ? " (Current)" : ""}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Promote from
            </label>
            <SelectField
              value={promoteSourceId}
              onChange={(e) => setPromoteSourceId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select source class group</option>
              {data.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {cg.name} ({getGradeName(cg.grade_id)})
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Promote to
            </label>
            <SelectField
              value={promoteTargetId}
              onChange={(e) => setPromoteTargetId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select target class group</option>
              {data.map((cg) => {
                const targetLevelOrder = getGradeLevelOrder(cg.grade_id);
                const isBackward =
                  promoteSourceLevelOrder !== undefined &&
                  targetLevelOrder !== undefined &&
                  targetLevelOrder <= promoteSourceLevelOrder;
                return (
                  <option key={cg.class_group_id} value={cg.class_group_id}>
                    {cg.name} ({getGradeName(cg.grade_id)})
                    {isBackward ? " -- not a later grade" : ""}
                  </option>
                );
              })}
            </SelectField>
            {promoteSourceLevelOrder !== undefined &&
              promoteTargetId !== 0 &&
              (() => {
                const targetGroup = data.find(
                  (cg) => cg.class_group_id === promoteTargetId,
                );
                const targetLevelOrder = targetGroup
                  ? getGradeLevelOrder(targetGroup.grade_id)
                  : undefined;
                return targetLevelOrder !== undefined &&
                  targetLevelOrder <= promoteSourceLevelOrder ? (
                  <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                    This target grade isn't ordered after the source grade
                    (by Level Order in Grade Management). Double check this
                    is the class group you meant to promote into.
                  </p>
                ) : null;
              })()}
          </div>

          {promoteResultMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {promoteResultMessage}
            </p>
          )}

          {promoteError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {promoteError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowPromoteModal(false);
              setPromoteError("");
              setPromoteResultMessage("");
            }}
          >
            Close
          </Button>
          <Button
            onClick={handlePromote}
            disabled={promoteSubmitting}
            isLoading={promoteSubmitting}
          >
            {promoteSubmitting ? "Promoting..." : "Promote Class"}
          </Button>
        </div>
      </Modal>

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
              Grade
            </label>
            <SelectField
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
            </SelectField>
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
              Grade
            </label>
            <SelectField
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
            </SelectField>
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
      <Modal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        title="Delete Class Group"
      >
        <div className="space-y-4">
          <p className="text-text-secondary-light dark:text-text-secondary-dark/70">
            Are you sure you want to delete "{selectedClassGroup?.name}"? This
            action cannot be undone.
          </p>

          {deleteReportLoading && (
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
              Checking what this class group is linked to...
            </p>
          )}

          {deleteReport && deleteReport.deletes.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                This will also permanently delete:
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400">
                {deleteReport.deletes.map((item) => (
                  <li key={item.key}>
                    {item.count} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deleteReport && deleteReport.unlinks.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                These are kept, but will no longer be linked to a class group:
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-600 dark:text-amber-400">
                {deleteReport.unlinks.map((item) => (
                  <li key={item.key}>
                    {item.count} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deleteError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {deleteError}
            </p>
          )}

          <div className="flex justify-end space-x-3">
            <Button
              variant="secondary"
              onClick={closeDeleteModal}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={submitting || deleteReportLoading}
              isLoading={submitting}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Promote Students by Grade Modal (automatic, whole-year rollover) */}
      <PromoteStudentsModal
        isOpen={showPromoteByGradeModal}
        onClose={() => setShowPromoteByGradeModal(false)}
        academicYears={academicYears}
        classGroups={data}
        onPromoted={onRefresh}
      />
    </div>
  );
};

export default ClassGroupsTab;
