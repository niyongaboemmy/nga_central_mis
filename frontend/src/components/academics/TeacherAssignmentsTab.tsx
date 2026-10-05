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
import SelectField from "../ui/SelectField";

interface AssignmentKey {
  user_id: number;
  subject_id: number;
  class_group_id: number;
  academic_year_id: number;
}

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
  onUpdate: (current: AssignmentKey, next: AssignmentKey) => Promise<void>;
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

/** A teacher as held by the assignment form -- either picked from search or
 *  seeded from the row being edited (where only id + display name are known). */
interface PickedTeacher {
  user_id: number;
  label: string;
}

type SortColumn = "teacher" | "subject" | "class_group" | "academic_year";
type SortDirection = "asc" | "desc";

const selectClasses =
  "px-4 py-2 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-sm text-text-primary-light dark:text-text-primary-dark";

const modalFieldClasses =
  "w-full px-4 py-3 border-2 border-border-light dark:border-border-dark/30 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 bg-surface-light dark:bg-surface-dark/30 text-text-primary-light dark:text-text-primary-dark";

const TeacherAssignmentsTab: React.FC<TeacherAssignmentsTabProps> = ({
  data,
  academicYears,
  subjects,
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

  // --- Browsing: search, filters, sorting -----------------------------------
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState<number>(0);
  const [subjectFilter, setSubjectFilter] = useState<number>(0);
  const [classGroupFilter, setClassGroupFilter] = useState<number>(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("teacher");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Filter options come from the rows themselves so they never offer a choice
  // that yields an empty table.
  const yearScopedData = useMemo(
    () =>
      yearFilter
        ? data.filter((item) => item.academic_year_id === yearFilter)
        : data,
    [data, yearFilter],
  );

  const teacherOptions = useMemo(() => {
    const map = new Map<number, string>();
    yearScopedData.forEach((item) => map.set(item.user_id, item.teacher_name));
    return Array.from(map, ([user_id, name]) => ({ user_id, name })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }, [yearScopedData]);

  const subjectOptions = useMemo(() => {
    const map = new Map<number, string>();
    yearScopedData.forEach((item) =>
      map.set(
        item.subject_id,
        item.subject_code
          ? `${item.subject_name} (${item.subject_code})`
          : item.subject_name,
      ),
    );
    return Array.from(map, ([subject_id, name]) => ({ subject_id, name })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }, [yearScopedData]);

  const classGroupOptions = useMemo(() => {
    const map = new Map<number, string>();
    yearScopedData.forEach((item) =>
      map.set(
        item.class_group_id,
        `${item.class_group_name} • ${item.grade_name}`,
      ),
    );
    return Array.from(map, ([class_group_id, name]) => ({
      class_group_id,
      name,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [yearScopedData]);

  // Drop filters that no longer exist once the academic year changes
  useEffect(() => {
    if (
      teacherFilter &&
      !teacherOptions.some((t) => t.user_id === teacherFilter)
    ) {
      setTeacherFilter(0);
    }
  }, [teacherOptions, teacherFilter]);

  useEffect(() => {
    if (
      subjectFilter &&
      !subjectOptions.some((s) => s.subject_id === subjectFilter)
    ) {
      setSubjectFilter(0);
    }
  }, [subjectOptions, subjectFilter]);

  useEffect(() => {
    if (
      classGroupFilter &&
      !classGroupOptions.some((c) => c.class_group_id === classGroupFilter)
    ) {
      setClassGroupFilter(0);
    }
  }, [classGroupOptions, classGroupFilter]);

  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = yearScopedData.filter((item) => {
      if (teacherFilter && item.user_id !== teacherFilter) return false;
      if (subjectFilter && item.subject_id !== subjectFilter) return false;
      if (classGroupFilter && item.class_group_id !== classGroupFilter)
        return false;
      if (!term) return true;
      return [
        item.teacher_name,
        item.teacher_username,
        item.subject_name,
        item.subject_code || "",
        item.class_group_name,
        item.grade_name,
        item.program_name,
        item.academic_year_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    const value = (item: AllTeacherSubjectAssignment) => {
      switch (sortColumn) {
        case "subject":
          return item.subject_name;
        case "class_group":
          return `${item.grade_name} ${item.class_group_name}`;
        case "academic_year":
          return item.academic_year_name;
        default:
          return item.teacher_name;
      }
    };

    return [...rows].sort((a, b) => {
      const comparison = value(a).localeCompare(value(b));
      if (comparison !== 0) return sortDirection === "asc" ? comparison : -comparison;
      // Stable secondary ordering so equal keys don't jump around
      return `${a.teacher_name}${a.subject_name}${a.class_group_name}`.localeCompare(
        `${b.teacher_name}${b.subject_name}${b.class_group_name}`,
      );
    });
  }, [
    yearScopedData,
    search,
    teacherFilter,
    subjectFilter,
    classGroupFilter,
    sortColumn,
    sortDirection,
  ]);

  const hasActiveFilters =
    !!search.trim() || !!teacherFilter || !!subjectFilter || !!classGroupFilter;

  const clearFilters = () => {
    setSearch("");
    setTeacherFilter(0);
    setSubjectFilter(0);
    setClassGroupFilter(0);
  };

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortIndicator = (column: SortColumn) =>
    sortColumn === column ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

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

  // --- Copy assignments -----------------------------------------------------
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

  // --- Assign / edit form ---------------------------------------------------
  // One modal drives both flows: `editingAssignment` is null when assigning.
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<AllTeacherSubjectAssignment | null>(null);
  const [formYearId, setFormYearId] = useState<number>(0);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherResults, setTeacherResults] = useState<UserWithProfile[]>([]);
  const [searchingTeachers, setSearchingTeachers] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<PickedTeacher | null>(
    null,
  );
  const [formSubjectId, setFormSubjectId] = useState<number>(0);
  const [formClassGroupId, setFormClassGroupId] = useState<number>(0);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const openAssignModal = () => {
    setEditingAssignment(null);
    setFormYearId(yearFilter || currentYearId);
    setTeacherSearch("");
    setTeacherResults([]);
    setSelectedTeacher(null);
    setFormSubjectId(0);
    setFormClassGroupId(0);
    setFormError("");
    setShowFormModal(true);
  };

  const openEditModal = (assignment: AllTeacherSubjectAssignment) => {
    setEditingAssignment(assignment);
    setFormYearId(assignment.academic_year_id);
    setTeacherSearch("");
    setTeacherResults([]);
    setSelectedTeacher({
      user_id: assignment.user_id,
      label: `${assignment.teacher_name} (${assignment.teacher_username})`,
    });
    setFormSubjectId(assignment.subject_id);
    setFormClassGroupId(assignment.class_group_id);
    setFormError("");
    setShowFormModal(true);
  };

  useEffect(() => {
    if (!showFormModal || teacherSearch.trim().length < 2) {
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
  }, [teacherSearch, showFormModal]);

  const isDirty = useMemo(() => {
    if (!editingAssignment) return true;
    return (
      selectedTeacher?.user_id !== editingAssignment.user_id ||
      formSubjectId !== editingAssignment.subject_id ||
      formClassGroupId !== editingAssignment.class_group_id ||
      formYearId !== editingAssignment.academic_year_id
    );
  }, [
    editingAssignment,
    selectedTeacher,
    formSubjectId,
    formClassGroupId,
    formYearId,
  ]);

  // Warn about a clash before hitting the API -- the same duplicate is also
  // rejected server-side, this just makes it visible while editing.
  const duplicateWarning = useMemo(() => {
    if (!selectedTeacher || !formSubjectId || !formClassGroupId || !formYearId) {
      return "";
    }
    const clash = data.find(
      (item) =>
        item.user_id === selectedTeacher.user_id &&
        item.subject_id === formSubjectId &&
        item.class_group_id === formClassGroupId &&
        item.academic_year_id === formYearId &&
        !(
          editingAssignment &&
          item.user_id === editingAssignment.user_id &&
          item.subject_id === editingAssignment.subject_id &&
          item.class_group_id === editingAssignment.class_group_id &&
          item.academic_year_id === editingAssignment.academic_year_id
        ),
    );
    return clash ? "This exact assignment already exists." : "";
  }, [
    data,
    selectedTeacher,
    formSubjectId,
    formClassGroupId,
    formYearId,
    editingAssignment,
  ]);

  const handleSubmitForm = async () => {
    if (!selectedTeacher || !formSubjectId || !formClassGroupId) {
      setFormError("Select a teacher, subject, and class group");
      return;
    }
    if (editingAssignment && !formYearId) {
      setFormError("Select an academic year");
      return;
    }
    setFormSubmitting(true);
    setFormError("");
    try {
      if (editingAssignment) {
        await onUpdate(
          {
            user_id: editingAssignment.user_id,
            subject_id: editingAssignment.subject_id,
            class_group_id: editingAssignment.class_group_id,
            academic_year_id: editingAssignment.academic_year_id,
          },
          {
            user_id: selectedTeacher.user_id,
            subject_id: formSubjectId,
            class_group_id: formClassGroupId,
            academic_year_id: formYearId,
          },
        );
      } else {
        await onCreate({
          user_id: selectedTeacher.user_id,
          subject_id: formSubjectId,
          class_group_id: formClassGroupId,
          academic_year_id: formYearId || undefined,
        });
      }
      setShowFormModal(false);
      setEditingAssignment(null);
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          (editingAssignment
            ? "Failed to update teacher assignment"
            : "Failed to assign teacher"),
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Delete ---------------------------------------------------------------
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

  const classGroupLabel = (cg: ClassGroup) =>
    cg.grade_name ? `${cg.name} • ${cg.grade_name}` : cg.name;

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
          <SelectField
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value))}
            className={`${selectClasses} whitespace-nowrap`}
          >
            <option value={0}>All Academic Years</option>
            {academicYears.map((year) => (
              <option key={year.academic_year_id} value={year.academic_year_id}>
                {year.name}
                {year.is_current === 1 ? " (Current)" : ""}
              </option>
            ))}
          </SelectField>
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

      {/* Search + filters */}
      <div className="flex flex-col gap-3 mb-4 xl:flex-row xl:items-center">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher, subject, class group..."
            className={`${selectClasses} w-full pr-10`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary-light dark:text-text-secondary-dark/70 hover:text-text-primary-light dark:hover:text-text-primary-dark"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <SelectField
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(parseInt(e.target.value))}
            className={selectClasses}
          >
            <option value={0}>All Teachers</option>
            {teacherOptions.map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(parseInt(e.target.value))}
            className={selectClasses}
          >
            <option value={0}>All Subjects</option>
            {subjectOptions.map((s) => (
              <option key={s.subject_id} value={s.subject_id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            value={classGroupFilter}
            onChange={(e) => setClassGroupFilter(parseInt(e.target.value))}
            className={selectClasses}
          >
            <option value={0}>All Class Groups</option>
            {classGroupOptions.map((c) => (
              <option key={c.class_group_id} value={c.class_group_id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 mb-2">
          Showing {filteredData.length} of {yearScopedData.length} assignment
          {yearScopedData.length === 1 ? "" : "s"}
          {yearFilter ? ` in ${getAcademicYearName(yearFilter)}` : ""}
        </p>
      )}

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
                  {(
                    [
                      ["teacher", "Teacher"],
                      ["subject", "Subject"],
                      ["class_group", "Class Group"],
                      ["academic_year", "Academic Year"],
                    ] as Array<[SortColumn, string]>
                  ).map(([column, label]) => (
                    <th
                      key={column}
                      className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="uppercase tracking-wider hover:text-text-primary-light dark:hover:text-text-primary-dark transition-colors"
                      >
                        {label}
                        {sortIndicator(column)}
                      </button>
                    </th>
                  ))}
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
                      {hasActiveFilters
                        ? "No teacher assignments match the current search and filters."
                        : yearFilter
                          ? `No teacher assignments found for ${getAcademicYearName(yearFilter)}. Use "Assign Teacher" to create one, or "Copy Teacher Assignments" to reuse another year's.`
                          : "No teacher assignments found"}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => (
                    <tr
                      key={item.assignment_id}
                      onDoubleClick={() => openEditModal(item)}
                      title="Double-click to edit this assignment"
                      className="hover:bg-surface-light dark:hover:bg-surface-dark cursor-pointer"
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
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => openEditModal(item)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
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
            <SelectField
              value={copySourceYearId}
              onChange={(e) => setCopySourceYearId(parseInt(e.target.value))}
              className={modalFieldClasses}
            >
              <option value={0}>Select source academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  assignment{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Copy to
            </label>
            <SelectField
              value={copyTargetYearId}
              onChange={(e) => setCopyTargetYearId(parseInt(e.target.value))}
              className={modalFieldClasses}
            >
              <option value={0}>Select target academic year</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name} ({countByYear.get(year.academic_year_id) || 0}{" "}
                  assignment{countByYear.get(year.academic_year_id) === 1 ? "" : "s"}
                  {year.is_current === 1 ? ", Current" : ""})
                </option>
              ))}
            </SelectField>
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

      {/* Assign / Edit Teacher Assignment Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingAssignment(null);
        }}
        title={
          editingAssignment
            ? "Edit Teacher Assignment"
            : "Assign Teacher to Subject"
        }
      >
        <div className="space-y-4">
          {editingAssignment && (
            <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
              Editing{" "}
              <span className="font-medium text-text-primary-light dark:text-text-primary-dark">
                {editingAssignment.teacher_name}
              </span>{" "}
              — {editingAssignment.subject_name} ·{" "}
              {editingAssignment.class_group_name} ·{" "}
              {editingAssignment.academic_year_name}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Academic Year
            </label>
            <SelectField
              value={formYearId}
              onChange={(e) => setFormYearId(parseInt(e.target.value))}
              className={modalFieldClasses}
            >
              <option value={0}>Select an academic year...</option>
              {academicYears.map((year) => (
                <option key={year.academic_year_id} value={year.academic_year_id}>
                  {year.name}
                  {year.is_current === 1 ? " (Current)" : ""}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Teacher
            </label>
            {selectedTeacher ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                <span className="text-sm text-text-primary-light dark:text-text-primary-dark">
                  {selectedTeacher.label}
                </span>
                <button
                  onClick={() => {
                    setSelectedTeacher(null);
                    setTeacherSearch("");
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
                  placeholder="Search teacher by name or username..."
                  className={modalFieldClasses}
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
                        onClick={() =>
                          setSelectedTeacher({
                            user_id: u.user.user_id,
                            label: `${u.profile?.first_name} ${u.profile?.last_name} (${u.user.username})`,
                          })
                        }
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
            <SelectField
              value={formSubjectId}
              onChange={(e) => setFormSubjectId(parseInt(e.target.value))}
              className={modalFieldClasses}
            >
              <option value={0}>Select a subject...</option>
              {subjects.map((subject) => (
                <option key={subject.subject_id} value={subject.subject_id}>
                  {subject.name} {subject.code && `(${subject.code})`}
                </option>
              ))}
            </SelectField>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark mb-2">
              Class Group
            </label>
            <SelectField
              value={formClassGroupId}
              onChange={(e) => setFormClassGroupId(parseInt(e.target.value))}
              className={modalFieldClasses}
            >
              <option value={0}>Select a class group...</option>
              {classGroups.map((cg) => (
                <option key={cg.class_group_id} value={cg.class_group_id}>
                  {classGroupLabel(cg)}
                </option>
              ))}
            </SelectField>
          </div>

          {duplicateWarning && (
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              {duplicateWarning}
            </p>
          )}

          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {formError}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowFormModal(false);
              setEditingAssignment(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitForm}
            disabled={
              formSubmitting ||
              !selectedTeacher ||
              !formSubjectId ||
              !formClassGroupId ||
              !!duplicateWarning ||
              !isDirty ||
              (!!editingAssignment && !formYearId)
            }
            isLoading={formSubmitting}
          >
            {editingAssignment
              ? formSubmitting
                ? "Saving..."
                : "Save Changes"
              : formSubmitting
                ? "Assigning..."
                : "Assign"}
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
