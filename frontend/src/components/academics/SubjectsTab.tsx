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
import {
  Eye,
  Users,
  BookOpen,
  Calendar,
  User as UserIcon,
  FolderOpen,
  Check,
  GraduationCap,
  Trash2,
  CheckCheck,
  Layers,
  RotateCcw,
} from "lucide-react";
import CurriculumTab from "../curriculum/CurriculumTab";
import SubjectMaterialsTab from "../curriculum/SubjectMaterialsTab";
import { useToast } from "../../contexts/ToastContext";

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
  color: string;
}

interface GradeAssignment {
  grade_id: number;
  name: string;
  program_name?: string;
  is_assigned: boolean;
  is_selected: boolean;
  is_currently_assigned: boolean;
}

/** Compact two-step progress indicator shared by the create/edit modals. */
const StepIndicator: React.FC<{ currentStep: 1 | 2; step2Label: string }> = ({
  currentStep,
  step2Label,
}) => (
  <div className="flex items-center mb-6">
    <div
      className={`flex items-center gap-2 transition-colors duration-200 ${
        currentStep >= 1
          ? "text-blue-600 dark:text-blue-400"
          : "text-gray-400 dark:text-gray-500"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-200 ${
          currentStep >= 1
            ? "bg-blue-600 text-white"
            : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
        }`}
      >
        {currentStep > 1 ? <Check className="w-3.5 h-3.5" /> : "1"}
      </div>
      <span className="text-sm font-medium">Subject Details</span>
    </div>
    <div
      className={`flex-1 h-px mx-3 transition-colors duration-300 ${
        currentStep >= 2
          ? "bg-blue-500"
          : "bg-gray-200 dark:bg-gray-700"
      }`}
    />
    <div
      className={`flex items-center gap-2 transition-colors duration-200 ${
        currentStep >= 2
          ? "text-blue-600 dark:text-blue-400"
          : "text-gray-400 dark:text-gray-500"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-200 ${
          currentStep >= 2
            ? "bg-blue-600 text-white"
            : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
        }`}
      >
        2
      </div>
      <span className="text-sm font-medium">{step2Label}</span>
    </div>
  </div>
);

/** Step 1 form fields shared by the create/edit modals. */
const SubjectDetailsForm: React.FC<{
  formData: SubjectFormData;
  setFormData: React.Dispatch<React.SetStateAction<SubjectFormData>>;
  formErrors: Record<string, string>;
  categories: CourseCategory[];
  loadingCategories: boolean;
}> = ({ formData, setFormData, formErrors, categories, loadingCategories }) => (
  <div className="space-y-3.5">
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
        setFormData((prev) => ({ ...prev, description: e.target.value }))
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

    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
        Subject Color
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={formData.color}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, color: e.target.value }))
          }
          className="w-10 h-10 rounded-lg border border-border-light dark:border-border-dark/30 bg-white dark:bg-gray-700 cursor-pointer p-1 flex-shrink-0"
        />
        <div className="flex-1">
          <Input
            value={formData.color.toUpperCase()}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                color: e.target.value.startsWith("#")
                  ? e.target.value
                  : "#" + e.target.value,
              }))
            }
            placeholder="#3B82F6"
            className="font-mono"
          />
        </div>
      </div>
      <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70">
        This color will identify the subject in the academic calendar
      </p>
    </div>
  </div>
);

/** Step 2 grade-assignment picker shared by the create/edit modals. */
const GradeAssignmentGrid: React.FC<{
  title: string;
  subtitle: string;
  gradeAssignments: GradeAssignment[];
  setGradeAssignments: React.Dispatch<React.SetStateAction<GradeAssignment[]>>;
  loadingGrades: boolean;
  handleGradeSelection: (gradeId: number) => void;
  showResetToCurrent: boolean;
}> = ({
  title,
  subtitle,
  gradeAssignments,
  setGradeAssignments,
  loadingGrades,
  handleGradeSelection,
  showResetToCurrent,
}) => {
  const selectedCount = gradeAssignments.filter((a) => a.is_assigned).length;
  const coverage = gradeAssignments.length
    ? Math.round((selectedCount / gradeAssignments.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="flex items-center justify-center gap-2 text-base font-semibold text-gray-900 dark:text-white mb-1">
          <GraduationCap className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>

      {loadingGrades ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            Loading grades...
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-border-light dark:border-border-dark/30">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">
                  {selectedCount}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {selectedCount} of {gradeAssignments.length} grades selected
              </p>
            </div>
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {coverage}%
            </div>
          </div>

          {/* Grade selection grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {gradeAssignments.map((assignment) => (
              <label
                key={assignment.grade_id}
                className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors duration-150 ${
                  assignment.is_assigned
                    ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                    : "border-border-light dark:border-border-dark/30 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={assignment.is_selected}
                  onChange={() => handleGradeSelection(assignment.grade_id)}
                  className="sr-only"
                />

                <div
                  className={`flex-shrink-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center mr-3 transition-colors duration-150 ${
                    assignment.is_selected
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-300 dark:border-gray-500"
                  }`}
                >
                  {assignment.is_selected && (
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {assignment.name}
                  </span>
                  {assignment.program_name && (
                    <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <BookOpen className="w-3 h-3" />
                      {assignment.program_name}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-border-light dark:border-border-dark/30">
            {showResetToCurrent && (
              <button
                type="button"
                onClick={() =>
                  setGradeAssignments((prev) =>
                    prev.map((a) => ({
                      ...a,
                      is_selected: a.is_currently_assigned,
                      is_assigned: a.is_currently_assigned,
                    })),
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Current
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setGradeAssignments((prev) =>
                  prev.map((a) => ({
                    ...a,
                    is_selected: false,
                    is_assigned: false,
                  })),
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
            <button
              type="button"
              onClick={() =>
                setGradeAssignments((prev) =>
                  prev.map((a) => ({
                    ...a,
                    is_selected: true,
                    is_assigned: true,
                  })),
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Select All
            </button>
            <button
              type="button"
              onClick={() => {
                const selectedAssignments = gradeAssignments.filter(
                  (a) => a.is_selected,
                );
                if (selectedAssignments.length > 0) {
                  const targetProgram = selectedAssignments[0].program_name;
                  setGradeAssignments((prev) =>
                    prev.map((a) => ({
                      ...a,
                      is_selected: a.program_name === targetProgram,
                      is_assigned: a.program_name === targetProgram,
                    })),
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 rounded-lg transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Same Program
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SubjectsTab: React.FC<SubjectsTabProps> = ({
  data,
  loading,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const { showToast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [subjectTeachers, setSubjectTeachers] = useState<
    SubjectTeacherAssignment[]
  >([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"overview" | "curriculum" | "materials">("overview");
  const [formData, setFormData] = useState<SubjectFormData>({
    name: "",
    code: "",
    description: "",
    course_category_id: null,
    max_marks: null,
    color: "#3B82F6",
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
      color: "#3B82F6",
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
      showToast("Failed to load course categories", "error");
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
      showToast("Failed to load grades", "error");
      return [];
    } finally {
      setLoadingGrades(false);
    }
  };

  const loadGradeAssignments = async (
    subjectId?: number,
    gradesData?: Grade[],
  ) => {
    setLoadingGrades(true);
    const gradesSource = gradesData ?? grades;
    try {
      if (subjectId && data) {
        // Load current assignments for editing
        const subject = data.find((s) => s.subject_id === subjectId);
        const currentAssignments = subject?.grades || [];

        const assignments = gradesSource.map((grade) => {
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
        const assignments = gradesSource.map((grade) => ({
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
      showToast("Failed to load grade assignments", "error");
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
          color: formData.color,
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
        showToast("Failed to create subject. Please try again.", "error");
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
      color: subject.color || "#3B82F6",
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
      const loadedGrades = await loadGrades();
      await loadGradeAssignments(selectedSubject.subject_id, loadedGrades);
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
          color: formData.color,
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
        showToast("Failed to update subject. Please try again.", "error");
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
    setDetailsTab("overview");
    setLoadingTeachers(true);

    try {
      const response = await teacherSubjectAssignmentsApi.getBySubject(
        subject.subject_id,
      );
      setSubjectTeachers(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load subject teachers:", error);
      setSubjectTeachers([]);
      showToast("Failed to load assigned teachers", "error");
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
      showToast("Failed to delete subject. Please try again.", "error");
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary-light dark:text-text-secondary-dark/70 uppercase tracking-wider">
                    Color
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
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: item.color || "#3B82F6" }}
                            title={item.color || "#3B82F6"}
                          />
                          <span className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 font-mono">
                            {item.color || "#3B82F6"}
                          </span>
                        </div>
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
        <StepIndicator currentStep={currentStep} step2Label="Assign to Grades" />

        {currentStep === 1 ? (
          <SubjectDetailsForm
            formData={formData}
            setFormData={setFormData}
            formErrors={formErrors}
            categories={categories}
            loadingCategories={loadingCategories}
          />
        ) : (
          <GradeAssignmentGrid
            title="Assign to Grades"
            subtitle="Choose which grades should include this subject in their curriculum"
            gradeAssignments={gradeAssignments}
            setGradeAssignments={setGradeAssignments}
            loadingGrades={loadingGrades}
            handleGradeSelection={handleGradeSelection}
            showResetToCurrent={false}
          />
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
        <StepIndicator currentStep={currentStep} step2Label="Manage Assignments" />

        {currentStep === 1 ? (
          <SubjectDetailsForm
            formData={formData}
            setFormData={setFormData}
            formErrors={formErrors}
            categories={categories}
            loadingCategories={loadingCategories}
          />
        ) : (
          <GradeAssignmentGrid
            title="Manage Grade Assignments"
            subtitle="Select the grades where this subject should be taught"
            gradeAssignments={gradeAssignments}
            setGradeAssignments={setGradeAssignments}
            loadingGrades={loadingGrades}
            handleGradeSelection={handleGradeSelection}
            showResetToCurrent
          />
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
          setDetailsTab("overview");
        }}
        title={`Subject Details - ${selectedSubject?.name}`}
        size="2xl"
      >
        {selectedSubject && (
          <div className="space-y-4">
            {/* Subject header */}
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${selectedSubject.color || "#3B82F6"}20` }}
              >
                <BookOpen className="w-6 h-6" style={{ color: selectedSubject.color || "#3B82F6" }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {selectedSubject.name}
                </h3>
                {selectedSubject.code && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Code: {selectedSubject.code}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-4 text-center flex-shrink-0">
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{selectedSubject.grades?.length || 0}</p>
                  <p className="text-xs text-gray-500">Grades</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{subjectTeachers.length}</p>
                  <p className="text-xs text-gray-500">Teachers</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              {(
                [
                  { id: "overview", label: "Overview", icon: <UserIcon className="w-3.5 h-3.5" /> },
                  { id: "curriculum", label: "Curriculum", icon: <BookOpen className="w-3.5 h-3.5" /> },
                  { id: "materials", label: "Materials", icon: <FolderOpen className="w-3.5 h-3.5" /> },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailsTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    detailsTab === tab.id
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-[280px]">
              {detailsTab === "overview" && (
                <div className="space-y-4">
                  {selectedSubject.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                      {selectedSubject.description}
                    </p>
                  )}

                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Assigned Teachers
                  </h4>

                  {loadingTeachers ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-sm text-gray-500">Loading teachers...</span>
                    </div>
                  ) : subjectTeachers.length === 0 ? (
                    <div className="text-center py-8">
                      <UserIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No teachers assigned yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {subjectTeachers.map((assignment) => (
                        <div
                          key={assignment.assignment_id}
                          className="bg-white dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                <UserIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                              </div>
                              <div>
                                <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                                  {assignment.teacher_name}
                                </h5>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  @{assignment.teacher_username}
                                </p>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                              <div className="flex items-center gap-1 mb-0.5 justify-end">
                                <Users className="w-3 h-3" />
                                {assignment.class_group_name}
                              </div>
                              <div className="flex items-center gap-1 justify-end">
                                <Calendar className="w-3 h-3" />
                                {assignment.academic_year_name}
                              </div>
                              <div className="mt-0.5">
                                {assignment.grade_name} • {assignment.program_name}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailsTab === "curriculum" && (
                <CurriculumTab subjectId={selectedSubject.subject_id} />
              )}

              {detailsTab === "materials" && (
                <SubjectMaterialsTab subjectId={selectedSubject.subject_id} />
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setShowDetailsModal(false);
              setSelectedSubject(null);
              setSubjectTeachers([]);
              setDetailsTab("overview");
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
