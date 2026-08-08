import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TeacherSubjectAssignment as TeacherSubjectAssignmentType,
  teacherSubjectAssignmentsApi,
  Subject,
  subjectsApi,
  ClassGroup,
  classGroupsApi,
  AcademicYear,
  academicYearsApi,
} from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import RichSelect from "../ui/RichSelect";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import { useToast } from "../../contexts/ToastContext";
import {
  BookOpen,
  Users,
  Calendar,
  Plus,
  Trash2,
  CheckCircle,
  Sparkles,
} from "lucide-react";

interface TeacherSubjectAssignmentProps {
  teacherId: number;
  teacherName: string;
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

interface AssignmentFormData {
  academic_year_id: number;
  subject_id: number;
  class_group_id: number;
}

const TeacherSubjectAssignment: React.FC<TeacherSubjectAssignmentProps> = ({
  teacherId,
  teacherName,
  isOpen,
  onClose: _onClose,
  onSuccess,
}) => {
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState<
    TeacherSubjectAssignmentType[]
  >([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [loadingClassGroups, setLoadingClassGroups] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<TeacherSubjectAssignmentType | null>(null);
  const [formData, setFormData] = useState<AssignmentFormData>({
    academic_year_id: 0,
    subject_id: 0,
    class_group_id: 0,
  });
  const [formErrors, setFormErrors] = useState<Partial<AssignmentFormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewYearFilter, setViewYearFilter] = useState<number>(0); // 0 = all years
  const loadedTeacherIdRef = useRef<number | null>(null);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && loadedTeacherIdRef.current !== teacherId) {
      loadData();
      loadedTeacherIdRef.current = teacherId;
    }
  }, [isOpen, teacherId]);

  // Reset loaded ref when modal closes
  useEffect(() => {
    if (!isOpen) {
      loadedTeacherIdRef.current = null;
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignmentsRes, subjectsRes, academicYearsRes] =
        await Promise.all([
          teacherSubjectAssignmentsApi.getByTeacher(teacherId),
          subjectsApi.getAll(),
          academicYearsApi.getAll(),
        ]);

      setAssignments(assignmentsRes.data.data || []);
      setSubjects(subjectsRes.data.data || []);

      const years = academicYearsRes.data.data || [];
      setAcademicYears(years);

      const currentYear = years.find((y) => y.is_current === 1) || years[0];
      if (currentYear) {
        setFormData((prev) => ({
          ...prev,
          academic_year_id: currentYear.academic_year_id,
        }));
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      showToast("Failed to load subject assignment data", "error");
    } finally {
      setLoading(false);
    }
  };

  // Load all class groups once — they're no longer scoped to a year
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingClassGroups(true);
    classGroupsApi
      .getAll()
      .then((res) => {
        if (!cancelled) setClassGroups(res.data.data || []);
      })
      .catch((error) => {
        console.error("Failed to load class groups:", error);
        showToast("Failed to load class groups", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingClassGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const resetForm = () => {
    const currentYear =
      academicYears.find((y) => y.is_current === 1) || academicYears[0];
    setFormData({
      academic_year_id: currentYear?.academic_year_id || 0,
      subject_id: 0,
      class_group_id: 0,
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<AssignmentFormData> = {};

    if (!formData.academic_year_id) {
      errors.academic_year_id = 1;
    }
    if (!formData.subject_id) {
      errors.subject_id = 1; // Using number to indicate error
    }
    if (!formData.class_group_id) {
      errors.class_group_id = 1;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAssign = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await teacherSubjectAssignmentsApi.assign({
        user_id: teacherId,
        subject_id: formData.subject_id,
        class_group_id: formData.class_group_id,
        academic_year_id: formData.academic_year_id || undefined,
      });

      setShowAssignModal(false);
      resetForm();
      await loadData();
      onSuccess?.();
      showToast("Subject assigned successfully", "success");
    } catch (error: any) {
      console.error("Failed to assign subject:", error);
      showToast(
        error?.response?.data?.message || "Failed to assign subject",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (assignment: TeacherSubjectAssignmentType) => {
    setSelectedAssignment(assignment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedAssignment) return;

    setSubmitting(true);
    try {
      await teacherSubjectAssignmentsApi.remove(
        selectedAssignment.user_id,
        selectedAssignment.subject_id,
        selectedAssignment.class_group_id,
        selectedAssignment.academic_year_id,
      );

      setShowDeleteModal(false);
      setSelectedAssignment(null);
      await loadData();
      onSuccess?.();
      showToast("Assignment removed successfully", "success");
    } catch (error: any) {
      console.error("Failed to remove assignment:", error);
      showToast(
        error?.response?.data?.message || "Failed to remove assignment",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Years that actually have assignments, most recent first — powers the view filter
  const assignmentYearOptions = useMemo(() => {
    const map = new Map<number, { name: string; isCurrent: boolean }>();
    assignments.forEach((a) => {
      if (!map.has(a.academic_year_id)) {
        map.set(a.academic_year_id, {
          name: a.academic_year_name,
          isCurrent: a.academic_year_is_current === 1,
        });
      }
    });
    return Array.from(map.entries()).sort(([a], [b]) => b - a);
  }, [assignments]);

  // Group assignments by academic year, most recent year first, honoring the view filter
  const groupedAssignments = useMemo(() => {
    const groups = new Map<
      number,
      { name: string; isCurrent: boolean; items: TeacherSubjectAssignmentType[] }
    >();
    assignments
      .filter(
        (assignment) =>
          !viewYearFilter || assignment.academic_year_id === viewYearFilter,
      )
      .forEach((assignment) => {
        const key = assignment.academic_year_id;
        if (!groups.has(key)) {
          groups.set(key, {
            name: assignment.academic_year_name,
            isCurrent: assignment.academic_year_is_current === 1,
            items: [],
          });
        }
        groups.get(key)!.items.push(assignment);
      });
    return Array.from(groups.entries()).sort(
      ([yearA], [yearB]) => yearB - yearA,
    );
  }, [assignments, viewYearFilter]);

  const visibleAssignmentCount = useMemo(
    () => groupedAssignments.reduce((sum, [, g]) => sum + g.items.length, 0),
    [groupedAssignments],
  );

  if (!isOpen) return null;

  return (
    <div className={`${showAssignModal ? "-mt-4" : ""}`}>
      <div className="space-y-6">
        {/* Header with stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Subject Assignments
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400/50">
                {visibleAssignmentCount} active assignment
                {visibleAssignmentCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {assignmentYearOptions.length > 1 && (
              <select
                value={viewYearFilter}
                onChange={(e) => setViewYearFilter(parseInt(e.target.value))}
                className="px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
              >
                <option value={0}>All Academic Years</option>
                {assignmentYearOptions.map(([yearId, { name, isCurrent }]) => (
                  <option key={yearId} value={yearId}>
                    {name}
                    {isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            )}
            {hasPermission(Permissions.ASSIGN_TEACHER_SUBJECTS) && (
              <Button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Assign Subject
              </Button>
            )}
          </div>
        </div>

        {/* Assignments list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No subject assignments
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400/50 mb-6">
              This teacher hasn't been assigned to any subjects yet.
            </p>
            {hasPermission(Permissions.ASSIGN_TEACHER_SUBJECTS) && (
              <Button onClick={() => setShowAssignModal(true)}>
                Assign First Subject
              </Button>
            )}
          </div>
        ) : (
          <div
            key={viewYearFilter}
            className="space-y-6 animate-in fade-in duration-200"
          >
            {groupedAssignments.map(
              ([academicYearId, { name, isCurrent, items }]) => (
                <div key={academicYearId} className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500 dark:text-blue-500" />
                    {name}
                    {isCurrent && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Current
                      </span>
                    )}
                  </h4>
                  <div className="grid gap-3">
                    {items.map((assignment) => (
                      <div
                        key={assignment.assignment_id}
                        className="bg-white dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700/40 p-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-gray-900 dark:text-white text-sm">
                                {assignment.subject_name}
                                {assignment.subject_code && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                    ({assignment.subject_code})
                                  </span>
                                )}
                              </h5>
                              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400/50">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {assignment.class_group_name}
                                </span>
                                <span className="flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {assignment.grade_name} •{" "}
                                  {assignment.program_name}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              Assigned{" "}
                              {new Date(
                                assignment.assigned_at,
                              ).toLocaleDateString()}
                            </span>
                            {hasPermission(
                              Permissions.ASSIGN_TEACHER_SUBJECTS,
                            ) && (
                              <button
                                onClick={() => handleDelete(assignment)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Assign Subject Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          resetForm();
        }}
        title="Assign Subject to Teacher"
        size="xl"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 pb-5 border-b border-gray-100 dark:border-gray-700/40">
            <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Assign New Subject
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose an academic year, subject, and class group for{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {teacherName}
                </span>
                .
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <RichSelect
              label="Academic Year"
              icon={Calendar}
              required
              value={formData.academic_year_id || null}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  academic_year_id: (val as number) || 0,
                  class_group_id: 0,
                }))
              }
              placeholder="Select an academic year..."
              error={formErrors.academic_year_id ? "Academic year is required" : undefined}
              options={academicYears.map((year) => ({
                value: year.academic_year_id,
                label: year.name,
                badge: year.is_current === 1 ? "Current" : undefined,
              }))}
            />

            <RichSelect
              label="Subject"
              icon={BookOpen}
              required
              value={formData.subject_id || null}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  subject_id: (val as number) || 0,
                }))
              }
              placeholder="Search subjects by name or code..."
              error={formErrors.subject_id ? "Subject is required" : undefined}
              options={subjects.map((subject) => ({
                value: subject.subject_id,
                label: subject.name,
                description: subject.code || undefined,
              }))}
            />

            <RichSelect
              label="Class Group"
              icon={Users}
              required
              value={formData.class_group_id || null}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  class_group_id: (val as number) || 0,
                }))
              }
              placeholder="Search class groups..."
              isLoading={loadingClassGroups}
              isDisabled={loadingClassGroups}
              error={
                formErrors.class_group_id
                  ? "Class group is required"
                  : undefined
              }
              noOptionsMessage="No class groups exist yet"
              options={classGroups.map((group) => ({
                value: group.class_group_id,
                label: group.name,
                description: [group.grade_name, group.program_name]
                  .filter(Boolean)
                  .join(" • "),
              }))}
            />
          </div>

          {/* Live preview once every field is chosen */}
          <AnimatePresence>
            {formData.academic_year_id &&
              formData.subject_id &&
              formData.class_group_id && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30"
                >
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <span className="font-semibold">{teacherName}</span> will
                    teach{" "}
                    <span className="font-semibold">
                      {
                        subjects.find(
                          (s) => s.subject_id === formData.subject_id,
                        )?.name
                      }
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold">
                      {
                        classGroups.find(
                          (g) => g.class_group_id === formData.class_group_id,
                        )?.name
                      }
                    </span>{" "}
                    in{" "}
                    <span className="font-semibold">
                      {
                        academicYears.find(
                          (y) =>
                            y.academic_year_id === formData.academic_year_id,
                        )?.name
                      }
                    </span>
                    .
                  </p>
                </motion.div>
              )}
          </AnimatePresence>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowAssignModal(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              submitting ||
              !formData.academic_year_id ||
              !formData.subject_id ||
              !formData.class_group_id
            }
            isLoading={submitting}
          >
            Assign Subject
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedAssignment(null);
        }}
        onConfirm={confirmDelete}
        title="Remove Subject Assignment"
        message={`Are you sure you want to remove "${selectedAssignment?.subject_name}" assignment from ${teacherName}? This action cannot be undone.`}
        isLoading={submitting}
      />
    </div>
  );
};

export default TeacherSubjectAssignment;
