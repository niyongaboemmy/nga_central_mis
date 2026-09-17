import React, { useEffect, useMemo, useState } from "react";
import { AcademicYear, ClassGroup, Grade } from "../../api/academics";
import {
  AllGradeAssignment,
  getUser,
  getUsers,
  UserWithProfile,
} from "../../api/users";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import UserProfileModal from "../UserProfileModal";

export interface ClassTeacherAssignmentInput {
  user_id: number;
  grade_id: number;
  class_group_id: number;
  academic_year_id: number;
}

interface ClassTeachersTabProps {
  data: AllGradeAssignment[];
  academicYears: AcademicYear[];
  grades: Grade[];
  classGroups: ClassGroup[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: ClassTeacherAssignmentInput) => Promise<void>;
  onUpdate: (
    current: AllGradeAssignment,
    next: ClassTeacherAssignmentInput,
  ) => Promise<void>;
  onDelete: (
    userId: number,
    gradeId: number,
    classGroupId: number,
    academicYearId: number,
  ) => Promise<void>;
  onCopy: (
    sourceAcademicYearId: number,
    targetAcademicYearId: number,
  ) => Promise<{ copied: number; skipped: number; total: number }>;
}

const inputClasses =
  "w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark";

const labelClasses =
  "block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2";

const ClassTeachersTab: React.FC<ClassTeachersTabProps> = ({
  data,
  academicYears,
  grades,
  classGroups,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onCopy,
}) => {
  const currentYearId = useMemo(
    () => academicYears.find((y) => y.is_current === 1)?.academic_year_id || 0,
    [academicYears],
  );
  const [yearFilter, setYearFilter] = useState<number>(0);
  const [yearFilterInitialized, setYearFilterInitialized] = useState(false);

  useEffect(() => {
    if (!yearFilterInitialized && currentYearId) {
      setYearFilterInitialized(true);
      setYearFilter(currentYearId);
    }
  }, [currentYearId, yearFilterInitialized]);

  const filteredData = useMemo(
    () =>
      yearFilter
        ? data.filter((item) => item.academic_year_id === yearFilter)
        : data,
    [data, yearFilter],
  );

  const countByYear = useMemo(() => {
    const counts = new Map<number, number>();
    data.forEach((item) => {
      counts.set(
        item.academic_year_id,
        (counts.get(item.academic_year_id) || 0) + 1,
      );
    });
    return counts;
  }, [data]);

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceYearId, setCopySourceYearId] = useState<number>(0);
  const [copyTargetYearId, setCopyTargetYearId] = useState<number>(0);
  const [copySubmitting, setCopySubmitting] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copyResultMessage, setCopyResultMessage] = useState("");

  const openCopyModal = () => {
    const yearsWithAssignments = academicYears
      .filter((y) => (countByYear.get(y.academic_year_id) || 0) > 0)
      .sort((a, b) => b.academic_year_id - a.academic_year_id);

    const defaultTarget =
      yearFilter && (countByYear.get(yearFilter) || 0) === 0
        ? yearFilter
        : academicYears.find(
            (y) => (countByYear.get(y.academic_year_id) || 0) === 0,
          )?.academic_year_id || 0;

    const defaultSource = yearsWithAssignments.find(
      (y) => y.academic_year_id !== defaultTarget,
    )?.academic_year_id;

    setCopyTargetYearId(defaultTarget);
    setCopySourceYearId(defaultSource || 0);
    setCopyError("");
    setCopyResultMessage("");
    setShowCopyModal(true);
  };

  const handleCopy = async () => {
    if (!copySourceYearId || !copyTargetYearId) {
      setCopyError("Select both a source and target academic year");
      return;
    }
    if (copySourceYearId === copyTargetYearId) {
      setCopyError("Source and target academic years must be different");
      return;
    }
    setCopySubmitting(true);
    setCopyError("");
    try {
      const result = await onCopy(copySourceYearId, copyTargetYearId);
      setCopyResultMessage(
        result.skipped > 0
          ? `Copied ${result.copied} class teacher assignment(s); ${result.skipped} already existed in the target year`
          : `Copied ${result.copied} class teacher assignment(s) successfully`,
      );
      setYearFilter(copyTargetYearId);
    } catch (error: any) {
      setCopyError(
        error?.response?.data?.message ||
          "Failed to copy class teacher assignments",
      );
    } finally {
      setCopySubmitting(false);
    }
  };

  // One piece of form state drives both the Assign and Edit modals -- they
  // collect exactly the same four fields, only the starting values and the
  // submit action differ.
  const [formMode, setFormMode] = useState<"assign" | "edit" | null>(null);
  const [editingAssignment, setEditingAssignment] =
    useState<AllGradeAssignment | null>(null);
  const [formYearId, setFormYearId] = useState<number>(0);
  const [formGradeId, setFormGradeId] = useState<number>(0);
  const [formClassGroupId, setFormClassGroupId] = useState<number>(0);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherResults, setTeacherResults] = useState<UserWithProfile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(
    null,
  );
  // When editing, the current teacher is known by name only (the list endpoint
  // returns no profile object), so keep it separate from `selectedUser` and
  // let picking someone new take precedence.
  const [existingUserLabel, setExistingUserLabel] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setTeacherSearch("");
    setTeacherResults([]);
    setSelectedUser(null);
    setExistingUserLabel("");
    setFormError("");
  };

  const openAssignModal = () => {
    resetForm();
    setEditingAssignment(null);
    setFormYearId(yearFilter || currentYearId);
    setFormGradeId(0);
    setFormClassGroupId(0);
    setFormMode("assign");
  };

  const openEditModal = (assignment: AllGradeAssignment) => {
    resetForm();
    setEditingAssignment(assignment);
    setFormYearId(assignment.academic_year_id);
    setFormGradeId(assignment.grade_id);
    setFormClassGroupId(assignment.class_group_id);
    setExistingUserLabel(`${assignment.user_name} (${assignment.username})`);
    setFormMode("edit");
  };

  const closeFormModal = () => {
    setFormMode(null);
    setEditingAssignment(null);
    resetForm();
  };

  useEffect(() => {
    if (!formMode || teacherSearch.trim().length < 2) {
      setTeacherResults([]);
      return;
    }
    let cancelled = false;
    setSearchingUsers(true);
    const timeout = setTimeout(() => {
      getUsers({ search: teacherSearch.trim(), limit: 20 })
        .then((users) => {
          if (!cancelled && users) setTeacherResults(users);
        })
        .catch(() => {
          if (!cancelled) setTeacherResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingUsers(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [teacherSearch, formMode]);

  // Class groups belong to a grade, so the picker only ever offers the ones
  // under the grade currently selected.
  const classGroupsForGrade = useMemo(
    () =>
      formGradeId
        ? classGroups.filter((cg) => cg.grade_id === formGradeId)
        : [],
    [classGroups, formGradeId],
  );

  const handleGradeChange = (gradeId: number) => {
    setFormGradeId(gradeId);
    const groups = classGroups.filter((cg) => cg.grade_id === gradeId);
    // Keep the current class group only if it still belongs to the new grade;
    // otherwise preselect the only option when there is exactly one.
    setFormClassGroupId((previous) => {
      if (groups.some((cg) => cg.class_group_id === previous)) return previous;
      return groups.length === 1 ? groups[0].class_group_id : 0;
    });
  };

  const formUserId =
    selectedUser?.user.user_id ?? editingAssignment?.user_id ?? 0;

  const handleSubmitForm = async () => {
    if (!formUserId || !formGradeId || !formClassGroupId || !formYearId) {
      setFormError("Select a user, grade, class group, and academic year");
      return;
    }
    setFormSubmitting(true);
    setFormError("");
    try {
      const payload: ClassTeacherAssignmentInput = {
        user_id: formUserId,
        grade_id: formGradeId,
        class_group_id: formClassGroupId,
        academic_year_id: formYearId,
      };
      if (formMode === "edit" && editingAssignment) {
        await onUpdate(editingAssignment, payload);
      } else {
        await onCreate(payload);
      }
      closeFormModal();
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          (formMode === "edit"
            ? "Failed to update class teacher assignment"
            : "Failed to assign class teacher"),
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  // Viewing a teacher reuses the app-wide profile modal, which already covers
  // personal info, roles, programs, subjects and activity. The list endpoint
  // returns only a flattened row, so the full user is fetched on demand.
  const [viewedUser, setViewedUser] = useState<UserWithProfile | null>(null);
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);

  const openUserProfile = async (userId: number) => {
    setViewingUserId(userId);
    try {
      const user = await getUser(userId);
      if (user) setViewedUser(user);
    } catch (error) {
      console.error("Failed to load user profile:", error);
      setViewingUserId(null);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<AllGradeAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (assignment: AllGradeAssignment) => {
    setSelectedAssignment(assignment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedAssignment) return;
    setDeleting(true);
    try {
      await onDelete(
        selectedAssignment.user_id,
        selectedAssignment.grade_id,
        selectedAssignment.class_group_id,
        selectedAssignment.academic_year_id,
      );
      setShowDeleteModal(false);
      setSelectedAssignment(null);
    } catch (error) {
      console.error("Failed to remove class teacher assignment:", error);
    } finally {
      setDeleting(false);
    }
  };

  const getAcademicYearName = (yearId: number) => {
    const year = academicYears.find((y) => y.academic_year_id === yearId);
    return year?.name || "Unknown";
  };

  return (
    <div className="">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Class Teachers
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Everyone assigned as class teacher of a class group, across every
            user
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value))}
            className="px-4 py-2 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-sm text-text-primary-light dark:text-text-primary-dark whitespace-nowrap"
          >
            <option value={0}>All Academic Years</option>
            {academicYears.map((year) => (
              <option key={year.academic_year_id} value={year.academic_year_id}>
                {year.name}
                {year.is_current === 1 ? " (Current)" : ""}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={loading}
            className="whitespace-nowrap"
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={openCopyModal}
            disabled={loading || countByYear.size === 0}
            className="whitespace-nowrap"
          >
            Copy Class Teachers
          </Button>
          <Button onClick={openAssignModal} className="whitespace-nowrap">
            Assign Class Teacher
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
                    User
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Class Group
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Academic Year
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800/30 divide-y divide-border-light dark:divide-border-dark/30">
                {filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      {yearFilter
                        ? `No class teachers found for ${getAcademicYearName(yearFilter)}. Use "Assign Class Teacher" to create one, or "Copy Class Teachers" to reuse another year's.`
                        : "No class teachers found"}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => (
                    <tr
                      key={item.grade_assignment_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => openUserProfile(item.user_id)}
                          className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left"
                        >
                          {item.user_name}
                        </button>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70">
                          {item.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.grade_name} • {item.program_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                          {item.class_group_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.academic_year_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openUserProfile(item.user_id)}
                            disabled={viewingUserId === item.user_id}
                            className="text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                          >
                            {viewingUserId === item.user_id && !viewedUser
                              ? "Loading..."
                              : "View"}
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(item)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
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

      {/* Copy Class Teachers Modal */}
      <Modal
        isOpen={showCopyModal}
        onClose={() => {
          setShowCopyModal(false);
          setCopyError("");
          setCopyResultMessage("");
        }}
        title="Copy Class Teachers"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            Reuse an existing academic year's class teacher assignments
            instead of reassigning them one by one. Pairs that already exist
            in the target year are skipped automatically.
          </p>

          <div>
            <label className={labelClasses}>Copy from</label>
            <select
              value={copySourceYearId}
              onChange={(e) => setCopySourceYearId(parseInt(e.target.value))}
              className={inputClasses}
            >
              <option value={0}>Select source academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  assignment{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClasses}>Copy to</label>
            <select
              value={copyTargetYearId}
              onChange={(e) => setCopyTargetYearId(parseInt(e.target.value))}
              className={inputClasses}
            >
              <option value={0}>Select target academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  assignment{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </select>
          </div>

          {copyResultMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {copyResultMessage}
            </p>
          )}

          {copyError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {copyError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCopyModal(false);
              setCopyError("");
              setCopyResultMessage("");
            }}
          >
            Close
          </Button>
          <Button
            onClick={handleCopy}
            disabled={copySubmitting}
            isLoading={copySubmitting}
          >
            {copySubmitting ? "Copying..." : "Copy Class Teachers"}
          </Button>
        </div>
      </Modal>

      {/* Assign / Edit Class Teacher Modal */}
      <Modal
        isOpen={formMode !== null}
        onClose={closeFormModal}
        title={
          formMode === "edit"
            ? "Edit Class Teacher Assignment"
            : "Assign Class Teacher"
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Academic Year</label>
            <select
              value={formYearId}
              onChange={(e) => setFormYearId(parseInt(e.target.value))}
              className={inputClasses}
            >
              <option value={0}>Select an academic year...</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name}
                  {year.is_current === 1 ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClasses}>User</label>
            {selectedUser || existingUserLabel ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                <span className="text-sm text-text-primary-light dark:text-text-primary-dark">
                  {selectedUser
                    ? `${selectedUser.profile?.first_name} ${selectedUser.profile?.last_name} (${selectedUser.user.username})`
                    : existingUserLabel}
                </span>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setExistingUserLabel("");
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Search by name or username..."
                  className={inputClasses}
                />
                {searchingUsers && (
                  <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
                    Searching...
                  </p>
                )}
                {teacherResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border-light dark:border-border-dark/30 rounded-2xl divide-y divide-border-light dark:divide-border-dark/30">
                    {teacherResults.map((u) => (
                      <button
                        key={u.user.user_id}
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-light dark:hover:bg-surface-dark text-text-primary-light dark:text-text-primary-dark"
                      >
                        {u.profile?.first_name} {u.profile?.last_name} (
                        {u.user.username})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelClasses}>Grade</label>
            <select
              value={formGradeId}
              onChange={(e) => handleGradeChange(parseInt(e.target.value))}
              className={inputClasses}
            >
              <option value={0}>Select a grade...</option>
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClasses}>Class Group</label>
            <select
              value={formClassGroupId}
              onChange={(e) => setFormClassGroupId(parseInt(e.target.value))}
              disabled={!formGradeId || classGroupsForGrade.length === 0}
              className={`${inputClasses} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <option value={0}>
                {formGradeId ? "Select a class group..." : "Select a grade first"}
              </option>
              {classGroupsForGrade.map((classGroup) => (
                <option
                  key={classGroup.class_group_id}
                  value={classGroup.class_group_id}
                >
                  {classGroup.name}
                </option>
              ))}
            </select>
            {formGradeId > 0 && classGroupsForGrade.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                This grade has no class groups yet. Create one in the Class
                Groups tab first.
              </p>
            )}
          </div>

          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {formError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={closeFormModal}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitForm}
            disabled={
              formSubmitting ||
              !formUserId ||
              !formGradeId ||
              !formClassGroupId ||
              !formYearId
            }
            isLoading={formSubmitting}
          >
            {formSubmitting
              ? formMode === "edit"
                ? "Saving..."
                : "Assigning..."
              : formMode === "edit"
                ? "Save Changes"
                : "Assign"}
          </Button>
        </div>
      </Modal>

      {/* User details -- reuses the app-wide profile modal (info, roles,
          programs, subjects, enrolment, grades, activity) */}
      <UserProfileModal
        isOpen={viewedUser !== null}
        onClose={() => {
          setViewedUser(null);
          setViewingUserId(null);
        }}
        user={viewedUser}
        onViewUser={openUserProfile}
        isSwitchingUser={viewingUserId !== null && viewedUser === null}
      />

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedAssignment(null);
        }}
        onConfirm={confirmDelete}
        title="Remove Class Teacher Assignment"
        message={`Are you sure you want to remove "${selectedAssignment?.user_name}" as class teacher of "${selectedAssignment?.grade_name} • ${selectedAssignment?.class_group_name}"? This action cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
};

export default ClassTeachersTab;
