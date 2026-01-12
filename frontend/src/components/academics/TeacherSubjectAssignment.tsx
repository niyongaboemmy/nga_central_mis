import React, { useState, useEffect, useMemo } from "react";
import {
  TeacherSubjectAssignment as TeacherSubjectAssignmentType,
  teacherSubjectAssignmentsApi,
  Subject,
  subjectsApi,
  ClassGroup,
  classGroupsApi,
  AcademicTerm,
  academicTermsApi,
} from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import {
  BookOpen,
  Users,
  Calendar,
  Plus,
  Trash2,
  CheckCircle,
} from "lucide-react";

interface TeacherSubjectAssignmentProps {
  teacherId: number;
  teacherName: string;
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

interface AssignmentFormData {
  subject_id: number;
  class_group_id: number;
  academic_term_id: number;
}

const TeacherSubjectAssignment: React.FC<TeacherSubjectAssignmentProps> = ({
  teacherId,
  teacherName,
  isOpen,
  onClose: _onClose,
  onSuccess,
}) => {
  const [assignments, setAssignments] = useState<
    TeacherSubjectAssignmentType[]
  >([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<TeacherSubjectAssignmentType | null>(null);
  const [formData, setFormData] = useState<AssignmentFormData>({
    subject_id: 0,
    class_group_id: 0,
    academic_term_id: 0,
  });
  const [formErrors, setFormErrors] = useState<Partial<AssignmentFormData>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, teacherId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignmentsRes, subjectsRes, classGroupsRes, termsRes] =
        await Promise.all([
          teacherSubjectAssignmentsApi.getByTeacher(teacherId),
          subjectsApi.getAll(),
          classGroupsApi.getAll(),
          academicTermsApi.getAll(),
        ]);

      setAssignments(assignmentsRes.data.data || []);
      setSubjects(subjectsRes.data.data || []);
      setClassGroups(classGroupsRes.data.data || []);
      setAcademicTerms(termsRes.data.data || []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      subject_id: 0,
      class_group_id: 0,
      academic_term_id: 0,
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<AssignmentFormData> = {};

    if (!formData.subject_id) {
      errors.subject_id = 1; // Using number to indicate error
    }
    if (!formData.class_group_id) {
      errors.class_group_id = 1;
    }
    if (!formData.academic_term_id) {
      errors.academic_term_id = 1;
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
        academic_term_id: formData.academic_term_id,
      });

      setShowAssignModal(false);
      resetForm();
      await loadData();
      onSuccess?.();
    } catch (error) {
      console.error("Failed to assign subject:", error);
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
        selectedAssignment.academic_term_id
      );

      setShowDeleteModal(false);
      setSelectedAssignment(null);
      await loadData();
      onSuccess?.();
    } catch (error) {
      console.error("Failed to remove assignment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Group assignments by academic term for better organization
  const groupedAssignments = useMemo(() => {
    const groups: Record<string, TeacherSubjectAssignmentType[]> = {};
    assignments.forEach((assignment) => {
      const key = `${assignment.academic_year_name} - ${assignment.academic_term_name}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(assignment);
    });
    return groups;
  }, [assignments]);

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
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {assignments.length} active assignment
                {assignments.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Assign Subject
          </Button>
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This teacher hasn't been assigned to any subjects yet.
            </p>
            <Button onClick={() => setShowAssignModal(true)}>
              Assign First Subject
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAssignments).map(
              ([termKey, termAssignments]) => (
                <div key={termKey} className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {termKey}
                  </h4>
                  <div className="grid gap-3">
                    {termAssignments.map((assignment) => (
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
                              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
                                assignment.assigned_at
                              ).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => handleDelete(assignment)}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
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
        size="md"
      >
        <div className="space-y-4">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Assign New Subject
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Select a subject, class group, and academic term for this
              assignment.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Subject
              </label>
              <select
                value={formData.subject_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    subject_id: parseInt(e.target.value),
                  }))
                }
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  formErrors.subject_id
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Class Group
              </label>
              <select
                value={formData.class_group_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    class_group_id: parseInt(e.target.value),
                  }))
                }
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  formErrors.class_group_id
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                <option value={0}>Select a class group...</option>
                {classGroups.map((group) => (
                  <option
                    key={group.class_group_id}
                    value={group.class_group_id}
                  >
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Academic Term
              </label>
              <select
                value={formData.academic_term_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    academic_term_id: parseInt(e.target.value),
                  }))
                }
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  formErrors.academic_term_id
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                <option value={0}>Select an academic term...</option>
                {academicTerms.map((term) => (
                  <option
                    key={term.academic_term_id}
                    value={term.academic_term_id}
                  >
                    {term.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
            disabled={submitting}
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
