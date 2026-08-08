import React, { useEffect, useMemo, useState } from "react";
import {
  AllTeacherSubjectAssignment,
  AcademicYear,
  Subject,
  ClassGroup,
} from "../../api/academics";
import { getUsers, UserWithProfile } from "../../api/users";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

interface TeacherAssignmentsTabProps {
  data: AllTeacherSubjectAssignment[];
  academicYears: AcademicYear[];
  subjects: Subject[];
  classGroups: ClassGroup[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: {
    user_id: number;
    subject_id: number;
    class_group_id: number;
    academic_year_id?: number;
  }) => Promise<void>;
  onDelete: (
    userId: number,
    subjectId: number,
    classGroupId: number,
    academicYearId: number,
  ) => Promise<void>;
  onCopy: (
    sourceAcademicYearId: number,
    targetAcademicYearId: number,
  ) => Promise<{
    copied: number;
    skipped: number;
  }>;
}

const TeacherAssignmentsTab: React.FC<TeacherAssignmentsTabProps> = ({
  data,
  academicYears,
  subjects,
  classGroups,
  loading,
  onRefresh,
  onCreate,
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

  // How many assignments already exist per academic year, for the copy picker
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
      const parts = [`Copied ${result.copied} assignment(s)`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} already existed`);
      }
      setCopyResultMessage(parts.join(" · "));
      setYearFilter(copyTargetYearId);
    } catch (error: any) {
      setCopyError(
        error?.response?.data?.message || "Failed to copy teacher assignments",
      );
    } finally {
      setCopySubmitting(false);
    }
  };

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignYearId, setAssignYearId] = useState<number>(0);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherResults, setTeacherResults] = useState<UserWithProfile[]>([]);
  const [searchingTeachers, setSearchingTeachers] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<UserWithProfile | null>(
    null,
  );
  const [assignSubjectId, setAssignSubjectId] = useState<number>(0);
  const [assignClassGroupId, setAssignClassGroupId] = useState<number>(0);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState("");

  const openAssignModal = () => {
    setAssignYearId(yearFilter || currentYearId);
    setTeacherSearch("");
    setTeacherResults([]);
    setSelectedTeacher(null);
    setAssignSubjectId(0);
    setAssignClassGroupId(0);
    setAssignError("");
    setShowAssignModal(true);
  };

  useEffect(() => {
    if (!showAssignModal || teacherSearch.trim().length < 2) {
      setTeacherResults([]);
      return;
    }
    let cancelled = false;
    setSearchingTeachers(true);
    const timeout = setTimeout(() => {
      getUsers({ search: teacherSearch.trim(), limit: 20 })
        .then((users) => {
          if (cancelled || !users) return;
          setTeacherResults(
            users.filter((u) => u.profile?.user_type === "TEACHER"),
          );
        })
        .catch(() => {
          if (!cancelled) setTeacherResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingTeachers(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [teacherSearch, showAssignModal]);

  const handleAssign = async () => {
    if (!selectedTeacher || !assignSubjectId || !assignClassGroupId) {
      setAssignError("Select a teacher, subject, and class group");
      return;
    }
    setAssignSubmitting(true);
    setAssignError("");
    try {
      await onCreate({
        user_id: selectedTeacher.user.user_id,
        subject_id: assignSubjectId,
        class_group_id: assignClassGroupId,
        academic_year_id: assignYearId || undefined,
      });
      setShowAssignModal(false);
    } catch (error: any) {
      setAssignError(
        error?.response?.data?.message || "Failed to assign teacher",
      );
    } finally {
      setAssignSubmitting(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<AllTeacherSubjectAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (assignment: AllTeacherSubjectAssignment) => {
    setSelectedAssignment(assignment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedAssignment) return;
    setDeleting(true);
    try {
      await onDelete(
        selectedAssignment.user_id,
        selectedAssignment.subject_id,
        selectedAssignment.class_group_id,
        selectedAssignment.academic_year_id,
      );
      setShowDeleteModal(false);
      setSelectedAssignment(null);
    } catch (error) {
      console.error("Failed to remove teacher assignment:", error);
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
            Teacher Assignments
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            All teacher-to-subject assignments across every teacher
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
            Copy Teacher Assignments
          </Button>
          <Button onClick={openAssignModal} className="whitespace-nowrap">
            Assign Teacher
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
                    Teacher
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Subject
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
                        ? `No teacher assignments found for ${getAcademicYearName(yearFilter)}. Use "Assign Teacher" to create one, or "Copy Teacher Assignments" to reuse another year's.`
                        : "No teacher assignments found"}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => (
                    <tr
                      key={item.assignment_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.teacher_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.subject_name}
                        {item.subject_code && ` (${item.subject_code})`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.class_group_name} • {item.grade_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.academic_year_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Copy Teacher Assignments Modal */}
      <Modal
        isOpen={showCopyModal}
        onClose={() => {
          setShowCopyModal(false);
          setCopyError("");
          setCopyResultMessage("");
        }}
        title="Copy Teacher Assignments"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            Reuse an existing academic year's teacher-subject assignments
            instead of enrolling every teacher one by one. Assignments that
            already exist in the target year are skipped automatically.
          </p>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Copy from
            </label>
            <select
              value={copySourceYearId}
              onChange={(e) => setCopySourceYearId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
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
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Copy to
            </label>
            <select
              value={copyTargetYearId}
              onChange={(e) => setCopyTargetYearId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
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
            {copySubmitting ? "Copying..." : "Copy Teacher Assignments"}
          </Button>
        </div>
      </Modal>

      {/* Assign Teacher Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign Teacher to Subject"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <select
              value={assignYearId}
              onChange={(e) => {
                setAssignYearId(parseInt(e.target.value));
                setAssignClassGroupId(0);
              }}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
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
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Teacher
            </label>
            {selectedTeacher ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                <span className="text-sm text-text-primary-light dark:text-text-primary-dark">
                  {selectedTeacher.profile?.first_name}{" "}
                  {selectedTeacher.profile?.last_name} (
                  {selectedTeacher.user.username})
                </span>
                <button
                  onClick={() => setSelectedTeacher(null)}
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
                  placeholder="Search teacher by name or username..."
                  className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
                />
                {searchingTeachers && (
                  <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
                    Searching...
                  </p>
                )}
                {teacherResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border-light dark:border-border-dark/30 rounded-2xl divide-y divide-border-light dark:divide-border-dark/30">
                    {teacherResults.map((u) => (
                      <button
                        key={u.user.user_id}
                        onClick={() => setSelectedTeacher(u)}
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
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Subject
            </label>
            <select
              value={assignSubjectId}
              onChange={(e) => setAssignSubjectId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select a subject...</option>
              {subjects.map((subject) => (
                <option key={subject.subject_id} value={subject.subject_id}>
                  {subject.name} {subject.code && `(${subject.code})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Class Group
            </label>
            <select
              value={assignClassGroupId}
              onChange={(e) => setAssignClassGroupId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark"
            >
              <option value={0}>Select a class group...</option>
              {classGroups.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>

          {assignError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {assignError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={() => setShowAssignModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              assignSubmitting ||
              !selectedTeacher ||
              !assignSubjectId ||
              !assignClassGroupId
            }
            isLoading={assignSubmitting}
          >
            {assignSubmitting ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedAssignment(null);
        }}
        onConfirm={confirmDelete}
        title="Remove Teacher Assignment"
        message={`Are you sure you want to remove "${selectedAssignment?.teacher_name}" from "${selectedAssignment?.subject_name}" (${selectedAssignment?.class_group_name})? This action cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
};

export default TeacherAssignmentsTab;
