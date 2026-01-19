import React, { useState, useMemo } from "react";
import {
  Subject,
  Grade,
  CourseCategory,
  gradeSubjectsApi,
  gradesApi,
  courseCategoriesApi,
  teacherSubjectAssignmentsApi,
  SubjectTeacherAssignment,
} from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Input from "../ui/Input";
import Select from "../ui/Select";
import { Eye, Users, BookOpen, Calendar, User as UserIcon } from "lucide-react";

interface SubjectsTabProps {
  data: Subject[];
  loading: boolean;
  onRefresh: () => void;
  onCreate: (data: Omit<Subject, "subject_id">) => Promise<void>;
  onUpdate: (
    id: number,
    data: Partial<Omit<Subject, "subject_id">>,
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface SubjectFormData {
  name: string;
  code: string;
  description: string;
  course_category_id: number | null;
  max_marks: number | null;
}

interface GradeAssignment {
  grade_id: number;
  name: string;
  program_name?: string;
  is_assigned: boolean;
  is_selected: boolean;
  is_currently_assigned: boolean;
}

const SubjectsTab: React.FC<SubjectsTabProps> = ({
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
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [subjectTeachers, setSubjectTeachers] = useState<
    SubjectTeacherAssignment[]
  >([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [formData, setFormData] = useState<SubjectFormData>({
    name: "",
    code: "",
    description: "",
    course_category_id: null,
    max_marks: null,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Two-step process states
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [gradeAssignments, setGradeAssignments] = useState<GradeAssignment[]>(
    [],
  );
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Memoized form validity check
  const isFormValid = useMemo(() => {
    return formData.name.trim().length > 0;
  }, [formData.name]);

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
      course_category_id: null,
      max_marks: null,
    });
    setFormErrors({});
    setCurrentStep(1);
    setGradeAssignments([]);
  };

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await courseCategoriesApi.getAll();
      setCategories(response.data.data);
    } catch (error) {
      console.error("Failed to load categories:", error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadGrades = async () => {
    setLoadingGrades(true);
    try {
      const response = await gradesApi.getAll();
      const loadedGrades = response.data.data;
      setGrades(loadedGrades);
      return loadedGrades;
    } catch (error) {
      console.error("Failed to load grades:", error);
      return [];
    } finally {
      setLoadingGrades(false);
    }
  };

  const loadGradeAssignments = async (subjectId?: number) => {
    setLoadingGrades(true);
    try {
      if (subjectId && data) {
        // Load current assignments for editing
        const subject = data.find((s) => s.subject_id === subjectId);
        const currentAssignments = subject?.grades || [];

        const assignments = grades.map((grade) => {
          const isCurrentlyAssigned = currentAssignments.some(
            (ca) => ca.grade_id === grade.grade_id,
          );
          return {
            grade_id: grade.grade_id,
            name: grade.name,
            program_name: grade.program_name,
            is_assigned: isCurrentlyAssigned,
            is_selected: isCurrentlyAssigned,
            is_currently_assigned: isCurrentlyAssigned,
          };
        });

        setGradeAssignments(assignments);
      } else {
        // For creating new subject
        const assignments = grades.map((grade) => ({
          grade_id: grade.grade_id,
          name: grade.name,
          program_name: undefined,
          is_assigned: false,
          is_selected: false,
          is_currently_assigned: false,
        }));

        setGradeAssignments(assignments);
      }
    } catch (error) {
      console.error("Failed to load grade assignments:", error);
    } finally {
      setLoadingGrades(false);
    }
  };

  const handleGradeSelection = (gradeId: number) => {
    setGradeAssignments((prev) =>
      prev.map((assignment) =>
        assignment.grade_id === gradeId
          ? {
              ...assignment,
              is_selected: !assignment.is_selected,
              is_assigned: !assignment.is_selected,
            }
          : assignment,
      ),
    );
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Subject name is required";
    }

    if (formData.code && formData.code.trim().length > 50) {
      errors.code = "Code must be 50 characters or less";
    }

    if (formData.max_marks !== null && formData.max_marks !== undefined) {
      if (formData.max_marks < 0) {
        errors.max_marks = "Max marks must be a positive number";
      }
      if (formData.max_marks > 1000) {
        errors.max_marks = "Max marks cannot exceed 1000";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (currentStep === 1) {
      if (!validateForm()) return;
      setCurrentStep(2);
      const loadedGrades = await loadGrades();
      // Initialize grade assignments as not assigned
      setGradeAssignments(
        loadedGrades.map((grade) => ({
          grade_id: grade.grade_id,
          name: grade.name,
          program_name: grade.program_name,
          is_assigned: false,
          is_selected: false,
          is_currently_assigned: false,
        })),
      );
    } else {
      // Step 2: Assign to grades
      setSubmitting(true);
      try {
        // First create the subject
        const newSubject = await onCreate({
          name: formData.name.trim(),
          code: formData.code.trim() || null,
          description: formData.description.trim() || null,
          course_category_id: formData.course_category_id,
          max_marks: formData.max_marks,
          grades: undefined,
          category_name: undefined,
        });

        // Then assign to selected grades
        const assignmentPromises = gradeAssignments
          .filter((assignment) => assignment.is_assigned)
          .map((assignment) =>
            gradeSubjectsApi.assign({
              grade_id: assignment.grade_id,
              subject_id: (newSubject as any).subject_id,
            }),
          );

        await Promise.all(assignmentPromises);

        setShowCreateModal(false);
        resetForm();
        onRefresh();
      } catch (error) {
        console.error("Failed to create subject and assign to grades:", error);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleEdit = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormData({
      name: subject.name,
      code: subject.code || "",
      description: subject.description || "",
      course_category_id: subject.course_category_id,
      max_marks: subject.max_marks,
    });
    setCurrentStep(1);
    setShowEditModal(true);
    loadCategories();
  };

  const handleUpdate = async () => {
    if (!selectedSubject) return;

    if (currentStep === 1) {
      if (!validateForm()) return;
      setCurrentStep(2);
      await loadGrades();
      await loadGradeAssignments(selectedSubject.subject_id);
    } else {
      // Step 2: Update assignments
      setSubmitting(true);
      try {
        // Update subject details
        await onUpdate(selectedSubject.subject_id, {
          name: formData.name.trim(),
          code: formData.code.trim() || null,
          description: formData.description.trim() || null,
          course_category_id: formData.course_category_id,
          max_marks: formData.max_marks,
        });

        // Handle grade assignment - assign/remove based on selections
        const assignmentPromises: Promise<any>[] = [];

        gradeAssignments.forEach((assignment) => {
          const shouldBeAssigned = assignment.is_selected;
          const isCurrentlyAssigned = assignment.is_currently_assigned;

          if (shouldBeAssigned && !isCurrentlyAssigned) {
            // Assign to grade
            assignmentPromises.push(
              gradeSubjectsApi
                .assign({
                  grade_id: assignment.grade_id,
                  subject_id: selectedSubject.subject_id,
                })
                .catch(() => {}), // Ignore if already assigned
            );
          } else if (!shouldBeAssigned && isCurrentlyAssigned) {
            // Remove from grade
            assignmentPromises.push(
              gradeSubjectsApi
                .remove(assignment.grade_id, selectedSubject.subject_id)
                .catch(() => {}), // Ignore if not assigned
            );
          }
        });

        await Promise.all(assignmentPromises);

        setShowEditModal(false);
        resetForm();
        setSelectedSubject(null);
        onRefresh();
      } catch (error) {
        console.error("Failed to update subject and assignments:", error);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleDelete = (subject: Subject) => {
    setSelectedSubject(subject);
    setShowDeleteModal(true);
  };

  const handleViewDetails = async (subject: Subject) => {
    setSelectedSubject(subject);
    setShowDetailsModal(true);
    setLoadingTeachers(true);

    try {
      const response = await teacherSubjectAssignmentsApi.getBySubject(
        subject.subject_id,
      );
      setSubjectTeachers(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load subject teachers:", error);
      setSubjectTeachers([]);
    } finally {
      setLoadingTeachers(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedSubject) return;

    setSubmitting(true);
    try {
      await onDelete(selectedSubject.subject_id);
      setShowDeleteModal(false);
      setSelectedSubject(null);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete subject:", error);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-text-primary-dark">
            Subjects
          </h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark/70 mt-1">
            Manage course subjects
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button
            onClick={() => {
              setCurrentStep(1);
              setShowCreateModal(true);
              loadCategories();
            }}
          >
            Add Subject
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
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Max Marks
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Grades
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Programs
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
                      No subjects found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.subject_id}
                      className="hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.code || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.description || "No description"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.category_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.max_marks || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.grades && item.grades.length > 0
                          ? item.grades.map((g) => g.grade_name).join(", ")
                          : "No grades assigned"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                        {item.grades && item.grades.length > 0
                          ? [
                              ...new Set(
                                item.grades.map((g) => g.program_name),
                              ),
                            ].join(", ")
                          : "No programs"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleViewDetails(item)}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
        title={`Create Subject - Step ${currentStep} of 2`}
        size="xl"
      >
        {/* Enhanced Step Indicator */}
        <div className="flex items-center mb-8">
          <div
            className={`flex items-center transition-all duration-300 ${
              currentStep >= 1 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                currentStep >= 1
                  ? "bg-blue-600 text-white shadow-lg scale-110"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {currentStep > 1 ? "✓" : "1"}
            </div>
            <span className="ml-3 text-sm font-semibold">Subject Details</span>
          </div>
          <div
            className={`flex-1 h-1 mx-4 rounded-full transition-all duration-500 ${
              currentStep >= 2
                ? "bg-gradient-to-r from-blue-600 to-blue-400"
                : "bg-gray-200"
            }`}
          />
          <div
            className={`flex items-center transition-all duration-300 ${
              currentStep >= 2 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                currentStep >= 2
                  ? "bg-blue-600 text-white shadow-lg scale-110"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              2
            </div>
            <span className="ml-3 text-sm font-semibold">Assign to Grades</span>
          </div>
        </div>

        {currentStep === 1 ? (
          <div className="space-y-4">
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={formErrors.name}
              placeholder="e.g., Mathematics"
              required
            />

            <Input
              label="Code"
              value={formData.code}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, code: e.target.value }))
              }
              placeholder="e.g., MATH101"
            />

            <Input
              label="Description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Optional description"
            />

            <Select
              label="Course Category"
              value={formData.course_category_id?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  course_category_id: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                }))
              }
              disabled={loadingCategories}
              options={
                loadingCategories
                  ? [{ value: "", label: "Loading categories..." }]
                  : [
                      { value: "", label: "No category" },
                      ...categories.map((category) => ({
                        value: category.category_id,
                        label: category.name,
                      })),
                    ]
              }
            />

            <Input
              label="Max Marks"
              type="number"
              value={formData.max_marks?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  max_marks: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              placeholder="e.g., 100"
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                🎯 Assign to Grades
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Choose which grades should include this subject in their
                curriculum
              </p>
            </div>

            {loadingGrades ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-sm text-gray-600 dark:text-gray-300">
                  Loading grades...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Enhanced Summary */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-3xl border border-green-200 dark:border-green-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                      <span className="text-green-600 dark:text-green-400 font-bold text-sm">
                        {gradeAssignments.filter((a) => a.is_assigned).length}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Grades Selected
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {gradeAssignments.filter((a) => a.is_assigned).length}{" "}
                        of {gradeAssignments.length} grades chosen
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {Math.round(
                        (gradeAssignments.filter((a) => a.is_assigned).length /
                          gradeAssignments.length) *
                          100,
                      )}
                      %
                    </div>
                    <div className="text-xs text-gray-500">Coverage</div>
                  </div>
                </div>

                {/* Enhanced Grade Selection Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {gradeAssignments.map((assignment, index) => (
                    <label
                      key={assignment.grade_id}
                      className={`group relative flex items-center p-5 rounded-3xl border-2 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] animate-fade-in ${
                        assignment.is_assigned
                          ? "border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 dark:border-green-500 dark:from-green-900/30 dark:to-emerald-900/30 shadow-lg ring-2 ring-green-200 dark:ring-green-800"
                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 hover:shadow-md"
                      }`}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={assignment.is_selected}
                        onChange={() =>
                          handleGradeSelection(assignment.grade_id)
                        }
                        className="sr-only"
                      />

                      {/* Enhanced Custom Checkbox */}
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center mr-4 transition-all duration-300 ${
                          assignment.is_selected
                            ? "bg-green-600 border-green-600 shadow-lg"
                            : "border-gray-300 dark:border-gray-500 group-hover:border-blue-400 group-hover:shadow-md"
                        }`}
                      >
                        {assignment.is_selected && (
                          <svg
                            className="w-4 h-4 text-white animate-pulse"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Enhanced Grade Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <span
                            className={`text-sm font-bold transition-colors duration-200 ${
                              assignment.is_assigned
                                ? "text-green-900 dark:text-green-100"
                                : "text-gray-900 dark:text-white group-hover:text-blue-900 dark:group-hover:text-blue-100"
                            }`}
                          >
                            {assignment.name}
                          </span>
                          {assignment.is_assigned && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 shadow-sm animate-bounce">
                              ✓ Selected
                            </span>
                          )}
                        </div>
                        {assignment.program_name && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 font-medium">
                            📚 {assignment.program_name}
                          </p>
                        )}
                      </div>

                      {/* Enhanced Hover Effect */}
                      <div
                        className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
                          assignment.is_assigned
                            ? "opacity-0"
                            : "opacity-0 group-hover:opacity-20 bg-gradient-to-r from-blue-500 to-indigo-500"
                        }`}
                      />
                    </label>
                  ))}
                </div>

                {/* Enhanced Quick Actions */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={() => {
                      setGradeAssignments((prev) =>
                        prev.map((a) => ({
                          ...a,
                          is_selected: false,
                          is_assigned: false,
                        })),
                      );
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    🗑️ Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGradeAssignments((prev) =>
                        prev.map((a) => ({
                          ...a,
                          is_selected: true,
                          is_assigned: true,
                        })),
                      );
                    }}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    ✅ Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Select only grades from the same program as the first selected grade
                      const selectedAssignments = gradeAssignments.filter(
                        (a) => a.is_selected,
                      );
                      if (selectedAssignments.length > 0) {
                        const targetProgram =
                          selectedAssignments[0].program_name;
                        setGradeAssignments((prev) =>
                          prev.map((a) => ({
                            ...a,
                            is_selected: a.program_name === targetProgram,
                            is_assigned: a.program_name === targetProgram,
                          })),
                        );
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    🎯 Same Program
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              if (currentStep === 1) {
                setShowCreateModal(false);
                resetForm();
              } else {
                setCurrentStep(1);
              }
            }}
          >
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || (currentStep === 1 && !isFormValid)}
            isLoading={submitting}
          >
            {currentStep === 1
              ? "Next: Assign Grades"
              : submitting
                ? "Creating..."
                : "Create Subject"}
          </Button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          resetForm();
          setSelectedSubject(null);
        }}
        title={`Edit Subject - Step ${currentStep} of 2`}
        size="xl"
      >
        {/* Enhanced Step Indicator */}
        <div className="flex items-center mb-8">
          <div
            className={`flex items-center transition-all duration-300 ${
              currentStep >= 1 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                currentStep >= 1
                  ? "bg-blue-600 text-white shadow-lg scale-110"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {currentStep > 1 ? "✓" : "1"}
            </div>
            <span className="ml-3 text-sm font-semibold">Subject Details</span>
          </div>
          <div
            className={`flex-1 h-1 mx-4 rounded-full transition-all duration-500 ${
              currentStep >= 2
                ? "bg-gradient-to-r from-blue-600 to-blue-400"
                : "bg-gray-200"
            }`}
          />
          <div
            className={`flex items-center transition-all duration-300 ${
              currentStep >= 2 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                currentStep >= 2
                  ? "bg-blue-600 text-white shadow-lg scale-110"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              2
            </div>
            <span className="ml-3 text-sm font-semibold">
              Manage Assignments
            </span>
          </div>
        </div>

        {currentStep === 1 ? (
          <div className="space-y-4">
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={formErrors.name}
              placeholder="e.g., Mathematics"
              required
            />

            <Input
              label="Code"
              value={formData.code}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, code: e.target.value }))
              }
              placeholder="e.g., MATH101"
            />

            <Input
              label="Description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Optional description"
            />

            <Select
              label="Course Category"
              value={formData.course_category_id?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  course_category_id: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                }))
              }
              disabled={loadingCategories}
              options={
                loadingCategories
                  ? [{ value: "", label: "Loading categories..." }]
                  : [
                      { value: "", label: "No category" },
                      ...categories.map((category) => ({
                        value: category.category_id,
                        label: category.name,
                      })),
                    ]
              }
            />

            <Input
              label="Max Marks"
              type="number"
              value={formData.max_marks?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  max_marks: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              placeholder="e.g., 100"
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                🎯 Manage Grade Assignments
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Select the grades where this subject should be taught
              </p>
            </div>

            {loadingGrades ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-sm text-gray-600 dark:text-gray-300">
                  Loading grades...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                        {gradeAssignments.filter((a) => a.is_assigned).length}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Grades Assigned
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {gradeAssignments.filter((a) => a.is_assigned).length}{" "}
                        of {gradeAssignments.length} grades selected
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {Math.round(
                        (gradeAssignments.filter((a) => a.is_assigned).length /
                          gradeAssignments.length) *
                          100,
                      )}
                      %
                    </div>
                    <div className="text-xs text-gray-500">Coverage</div>
                  </div>
                </div>

                {/* Enhanced Grade Selection Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {gradeAssignments.map((assignment, index) => (
                    <label
                      key={assignment.grade_id}
                      className={`group relative flex items-center p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] animate-fade-in ${
                        assignment.is_assigned
                          ? "border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 dark:border-blue-500 dark:from-blue-900/30 dark:to-indigo-900/30 shadow-lg ring-2 ring-blue-200 dark:ring-blue-800"
                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 hover:shadow-md"
                      }`}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={assignment.is_selected}
                        onChange={() =>
                          handleGradeSelection(assignment.grade_id)
                        }
                        className="sr-only"
                      />

                      {/* Enhanced Custom Checkbox */}
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center mr-4 transition-all duration-300 ${
                          assignment.is_selected
                            ? "bg-blue-600 border-blue-600 shadow-lg"
                            : "border-gray-300 dark:border-gray-500 group-hover:border-blue-400 group-hover:shadow-md"
                        }`}
                      >
                        {assignment.is_selected && (
                          <svg
                            className="w-4 h-4 text-white animate-pulse"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Enhanced Grade Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <span
                            className={`text-sm font-bold transition-colors duration-200 ${
                              assignment.is_assigned
                                ? "text-blue-900 dark:text-blue-100"
                                : "text-gray-900 dark:text-white group-hover:text-blue-900 dark:group-hover:text-blue-100"
                            }`}
                          >
                            {assignment.name}
                          </span>
                          {assignment.is_assigned && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200 shadow-sm animate-bounce">
                              ✓ Assigned
                            </span>
                          )}
                        </div>
                        {assignment.program_name && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 font-medium">
                            📚 {assignment.program_name}
                          </p>
                        )}
                      </div>

                      {/* Enhanced Hover Effect */}
                      <div
                        className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
                          assignment.is_assigned
                            ? "opacity-0"
                            : "opacity-0 group-hover:opacity-20 bg-gradient-to-r from-blue-500 to-indigo-500"
                        }`}
                      />
                    </label>
                  ))}
                </div>

                {/* Enhanced Quick Actions */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    onClick={() => {
                      setGradeAssignments((prev) =>
                        prev.map((a) => ({
                          ...a,
                          is_selected: a.is_currently_assigned,
                          is_assigned: a.is_currently_assigned,
                        })),
                      );
                    }}
                    className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    🔄 Reset to Current
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGradeAssignments((prev) =>
                        prev.map((a) => ({
                          ...a,
                          is_selected: false,
                          is_assigned: false,
                        })),
                      );
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    🗑️ Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGradeAssignments((prev) =>
                        prev.map((a) => ({
                          ...a,
                          is_selected: true,
                          is_assigned: true,
                        })),
                      );
                    }}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    ✅ Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Select only grades from the same program as the first selected grade
                      const selectedAssignments = gradeAssignments.filter(
                        (a) => a.is_selected,
                      );
                      if (selectedAssignments.length > 0) {
                        const targetProgram =
                          selectedAssignments[0].program_name;
                        setGradeAssignments((prev) =>
                          prev.map((a) => ({
                            ...a,
                            is_selected: a.program_name === targetProgram,
                            is_assigned: a.program_name === targetProgram,
                          })),
                        );
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 rounded-full transition-all duration-200 hover:shadow-md"
                  >
                    🎯 Same Program
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              if (currentStep === 1) {
                setShowEditModal(false);
                resetForm();
                setSelectedSubject(null);
              } else {
                setCurrentStep(1);
              }
            }}
          >
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={submitting || (currentStep === 1 && !isFormValid)}
            isLoading={submitting}
          >
            {currentStep === 1
              ? "Next: Manage Assignments"
              : submitting
                ? "Updating..."
                : "Update Subject"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedSubject(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Subject"
        message={`Are you sure you want to delete "${selectedSubject?.name}"? This action cannot be undone.`}
        isLoading={submitting}
      />

      {/* Subject Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedSubject(null);
          setSubjectTeachers([]);
        }}
        title={`Subject Details - ${selectedSubject?.name}`}
        size="xl"
      >
        {selectedSubject && (
          <div className="space-y-6">
            {/* Subject Info */}
            <div className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {selectedSubject.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedSubject.code && `Code: ${selectedSubject.code}`}
                  </p>
                </div>
              </div>

              {selectedSubject.description && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    {selectedSubject.description}
                  </p>
                </div>
              )}

              {/* Grades Info */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Grades Assigned
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedSubject.grades?.length || 0}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <UserIcon className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Teachers Assigned
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {subjectTeachers.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Assigned Teachers */}
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Assigned Teachers
              </h4>

              {loadingTeachers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-gray-500">
                    Loading teachers...
                  </span>
                </div>
              ) : subjectTeachers.length === 0 ? (
                <div className="text-center py-8">
                  <UserIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No teachers assigned
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This subject hasn't been assigned to any teachers yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subjectTeachers.map((assignment) => (
                    <div
                      key={assignment.assignment_id}
                      className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <h5 className="font-medium text-gray-900 dark:text-white">
                              {assignment.teacher_name}
                            </h5>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              @{assignment.teacher_username}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1 mb-1">
                            <Users className="w-3 h-3" />
                            {assignment.class_group_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {assignment.academic_term_name}
                          </div>
                          <div className="text-xs mt-1">
                            {assignment.grade_name} • {assignment.program_name}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setShowDetailsModal(false);
              setSelectedSubject(null);
              setSubjectTeachers([]);
            }}
          >
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default SubjectsTab;
