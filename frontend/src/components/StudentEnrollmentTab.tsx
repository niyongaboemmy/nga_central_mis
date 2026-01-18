import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Plus,
  X,
  AlertCircle,
  ChevronDown,
  GraduationCap,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Users,
} from "lucide-react";
import {
  studentEnrollmentApi,
  StudentEnrolledSubject,
  AvailableSubject,
  academicTermsApi,
  AcademicTerm,
  studentClassGroupApi,
  StudentClassGroup,
  classGroupsApi,
  ClassGroup,
} from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { Permissions } from "../constants/permissions";

interface StudentEnrollmentTabProps {
  studentId: number;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
  showHeader?: boolean;
}

const StudentEnrollmentTab: React.FC<StudentEnrollmentTabProps> = ({
  studentId,
  studentName,
  isOpen,
  onClose,
  showHeader = true,
}) => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const [enrolledSubjects, setEnrolledSubjects] = useState<
    StudentEnrolledSubject[]
  >([]);
  const [availableSubjects, setAvailableSubjects] = useState<
    AvailableSubject[]
  >([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<AcademicTerm | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<number | null>(null);
  const [unenrolling, setUnenrolling] = useState<string | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [studentClassGroup, setStudentClassGroup] =
    useState<StudentClassGroup | null>(null);
  const [availableClassGroups, setAvailableClassGroups] = useState<
    ClassGroup[]
  >([]);
  const [assigningClassGroup, setAssigningClassGroup] = useState(false);
  const [removingClassGroup, setRemovingClassGroup] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const loadingInitialRef = useRef(false);
  const lastFetchedEnrolled = useRef<{
    studentId: number;
    termId: number;
  } | null>(null);
  const lastFetchedAvailable = useRef<{
    studentId: number;
    termId: number;
  } | null>(null);
  const fetchingEnrolledRef = useRef(false);
  const fetchingAvailableRef = useRef(false);

  // Load academic terms and student class group
  useEffect(() => {
    const loadInitialData = async () => {
      if (loadingInitialRef.current) return;
      loadingInitialRef.current = true;

      try {
        // Load academic terms
        const termsResponse = await academicTermsApi.getAll();
        const terms = termsResponse.data.data;
        setAcademicTerms(terms);

        // Set current term as default
        const currentTerm = terms.find((term) => term.is_current === 1);
        if (currentTerm) {
          setSelectedTerm(currentTerm);
        } else if (terms.length > 0) {
          setSelectedTerm(terms[0]);
        }

        // Load student class group
        const classGroupResponse =
          await studentClassGroupApi.getByStudent(studentId);
        const classGroup = classGroupResponse.data.data;
        setStudentClassGroup(classGroup);
        setCurrentStep(classGroup ? 2 : 1);
      } catch (error) {
        console.error("Failed to load initial data:", error);
        showToast("Failed to load data", "error");
      } finally {
        loadingInitialRef.current = false;
      }
    };

    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen, studentId]);

  // Unified data loading effect (Strictly Enrolled Subjects)
  useEffect(() => {
    if (selectedTerm && isOpen) {
      loadEnrolledSubjects();
    }
  }, [selectedTerm?.academic_term_id, isOpen, currentStep, studentId]);

  const loadEnrolledSubjects = async (force = false) => {
    if (!selectedTerm) return;

    // Prevent redundant calls and race conditions
    if (
      fetchingEnrolledRef.current ||
      (!force &&
        lastFetchedEnrolled.current?.studentId === studentId &&
        lastFetchedEnrolled.current?.termId === selectedTerm.academic_term_id)
    ) {
      return;
    }

    fetchingEnrolledRef.current = true;
    setLoading(true);
    try {
      const response = await studentEnrollmentApi.getEnrolledSubjects(
        studentId,
        selectedTerm.academic_term_id,
      );
      setEnrolledSubjects(response.data.data);
      lastFetchedEnrolled.current = {
        studentId,
        termId: selectedTerm.academic_term_id,
      };
    } catch (error) {
      console.error("Failed to load enrolled subjects:", error);
      showToast("Failed to load enrolled subjects", "error");
    } finally {
      setLoading(false);
      fetchingEnrolledRef.current = false;
    }
  };

  const loadAvailableSubjects = async (force = false) => {
    if (!selectedTerm) return;

    // Prevent redundant calls and race conditions
    if (
      fetchingAvailableRef.current ||
      (!force &&
        lastFetchedAvailable.current?.studentId === studentId &&
        lastFetchedAvailable.current?.termId === selectedTerm.academic_term_id)
    ) {
      return;
    }

    fetchingAvailableRef.current = true;
    setLoadingAvailable(true);
    try {
      const response = await studentEnrollmentApi.getAvailableSubjects(
        studentId,
        selectedTerm.academic_term_id,
      );
      setAvailableSubjects(response.data.data);
      lastFetchedAvailable.current = {
        studentId,
        termId: selectedTerm.academic_term_id,
      };
    } catch (error) {
      console.error("Failed to load available subjects:", error);
      showToast("Failed to load available subjects", "error");
    } finally {
      setLoadingAvailable(false);
      fetchingAvailableRef.current = false;
    }
  };

  const handleEnroll = async (subjectId: number) => {
    if (!selectedTerm) return;

    setEnrolling(subjectId);
    try {
      await studentEnrollmentApi.enroll({
        user_id: studentId,
        subject_id: subjectId,
        academic_term_id: selectedTerm.academic_term_id,
      });
      showToast("Student enrolled successfully", "success");
      loadEnrolledSubjects(true);
      setShowEnrollModal(false);
    } catch (error) {
      console.error("Failed to enroll student:", error);
      showToast("Failed to enroll student", "error");
    } finally {
      setEnrolling(null);
    }
  };

  const handleUnenroll = async (subjectId: number) => {
    if (!selectedTerm) return;

    const enrollmentId = `${studentId}-${subjectId}-${selectedTerm.academic_term_id}`;
    setUnenrolling(enrollmentId);
    try {
      await studentEnrollmentApi.unenroll(
        studentId,
        subjectId,
        selectedTerm.academic_term_id,
      );
      showToast("Student unenrolled successfully", "success");
      loadEnrolledSubjects(true);
    } catch (error) {
      console.error("Failed to unenroll student:", error);
      showToast("Failed to unenroll student", "error");
    } finally {
      setUnenrolling(null);
    }
  };

  const openEnrollModal = () => {
    loadAvailableSubjects(true);
    setShowEnrollModal(true);
  };

  // Load available class groups when entering step 1
  useEffect(() => {
    if (isOpen && currentStep === 1 && availableClassGroups.length === 0) {
      const loadClassGroups = async () => {
        try {
          const currentYear =
            academicTerms.find((term) => term.is_current === 1)
              ?.academic_year_id || academicTerms[0]?.academic_year_id;
          if (currentYear) {
            const response = await classGroupsApi.getAll(currentYear);
            setAvailableClassGroups(response.data.data);
          }
        } catch (error) {
          console.error("Failed to load class groups:", error);
          showToast("Failed to load class groups", "error");
        }
      };
      loadClassGroups();
    }
  }, [isOpen, currentStep, academicTerms, availableClassGroups.length]);

  const handleAssignClassGroup = async (classGroupId: number) => {
    setAssigningClassGroup(true);
    try {
      // If student already has a class group, remove it and unenroll from subjects
      if (studentClassGroup && selectedTerm) {
        // Unenroll from all subjects first
        if (enrolledSubjects.length > 0) {
          await Promise.all(
            enrolledSubjects.map((subject) =>
              studentEnrollmentApi.unenroll(
                studentId,
                subject.subject_id,
                selectedTerm.academic_term_id,
              ),
            ),
          );
        }

        // Remove existing class group assignment
        await studentClassGroupApi.remove(
          studentId,
          studentClassGroup.class_group_id,
        );
      }

      // Assign to new class group
      await studentClassGroupApi.assign({
        user_id: studentId,
        class_group_id: classGroupId,
      });

      showToast("Student assigned to class group successfully", "success");

      // Reload student class group
      const response = await studentClassGroupApi.getByStudent(studentId);
      const classGroup = response.data.data;
      setStudentClassGroup(classGroup);

      // Clear subject data since class group changed
      setEnrolledSubjects([]);
      setAvailableSubjects([]);

      setCurrentStep(2);
    } catch (error) {
      console.error("Failed to assign class group:", error);
      showToast("Failed to assign class group", "error");
    } finally {
      setAssigningClassGroup(false);
    }
  };

  const handleRemoveClassGroup = async () => {
    if (!studentClassGroup) return;

    setRemovingClassGroup(true);
    try {
      // First, unenroll from all subjects if any are enrolled
      if (enrolledSubjects.length > 0 && selectedTerm) {
        await Promise.all(
          enrolledSubjects.map((subject) =>
            studentEnrollmentApi.unenroll(
              studentId,
              subject.subject_id,
              selectedTerm.academic_term_id,
            ),
          ),
        );
      }

      // Remove class group assignment
      await studentClassGroupApi.remove(
        studentId,
        studentClassGroup.class_group_id,
      );

      showToast(
        "Student removed from class group and unenrolled from all subjects",
        "success",
      );

      // Clear all front-end variables
      setStudentClassGroup(null);
      setEnrolledSubjects([]);
      setAvailableSubjects([]);
      setCurrentStep(1);
    } catch (error) {
      console.error("Failed to remove class group:", error);
      showToast("Failed to remove class group", "error");
    } finally {
      setRemovingClassGroup(false);
    }
  };

  const nextStep = () => setCurrentStep(2);
  const prevStep = () => setCurrentStep(1);

  if (!isOpen) return null;

  if (academicTerms.length === 0 && isOpen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">
          Initializing enrollment wizard...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Student Enrollment Wizard
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Complete enrollment setup for {studentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="min-h-[400px]"
        >
          {currentStep === 1 && (
            <div className="space-y-6">
              {!studentClassGroup && (
                <div className="text-center -mb-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </motion.div>
                  <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Assign to Class Group
                  </h4>
                </div>
              )}

              {studentClassGroup ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/20 rounded-3xl p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="text-green-700 dark:text-green-300">
                          <strong>{studentClassGroup.class_group_name}</strong>
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {studentClassGroup.grade_name} -{" "}
                          {studentClassGroup.program_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                      >
                        Continue to Subjects
                      </button>
                      {hasPermission(
                        Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
                      ) && (
                        <button
                          onClick={handleRemoveClassGroup}
                          disabled={removingClassGroup}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {removingClassGroup ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            "Remove"
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-green-200 dark:border-green-700/30 pt-4">
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      Want to change class groups? Select a different one below:
                    </p>
                    <div className="grid gap-3 max-h-96 overflow-y-auto">
                      {availableClassGroups
                        .filter(
                          (cg) =>
                            cg.class_group_id !==
                            studentClassGroup.class_group_id,
                        )
                        .map((classGroup) => (
                          <motion.div
                            key={classGroup.class_group_id}
                            className="bg-white dark:bg-gray-900/30 border border-gray-200 dark:border-slate-700/30 rounded-2xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() =>
                              handleAssignClassGroup(classGroup.class_group_id)
                            }
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                  <h5 className="font-medium text-gray-900 dark:text-white">
                                    {classGroup.name}
                                  </h5>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {classGroup.grade_name} -{" "}
                                    {classGroup.program_name}
                                  </p>
                                </div>
                              </div>
                              {hasPermission(
                                Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
                              ) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAssignClassGroup(
                                      classGroup.class_group_id,
                                    );
                                  }}
                                  disabled={assigningClassGroup}
                                  className="flex items-center gap-2 px-4 py-2 border border-blue-500 hover:border-blue-700 text-blue-600 dark:text-white hover:bg-blue-600 hover:text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                                >
                                  {assigningClassGroup ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  ) : (
                                    <>
                                      <ArrowRight className="w-4 h-4" />
                                      Change To This
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center mb-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Select a class group from the current academic year
                    </p>
                  </div>

                  {availableClassGroups.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">
                        No class groups available for the current academic year
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 max-h-96 overflow-y-auto">
                      {availableClassGroups.map((classGroup) => (
                        <motion.div
                          key={classGroup.class_group_id}
                          className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-slate-700/40 rounded-2xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() =>
                            handleAssignClassGroup(classGroup.class_group_id)
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div>
                                <h5 className="font-medium text-gray-900 dark:text-white">
                                  {classGroup.name}
                                </h5>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {classGroup.grade_name} -{" "}
                                  {classGroup.program_name}
                                </p>
                              </div>
                            </div>
                            {hasPermission(
                              Permissions.ASSIGN_STUDENT_CLASS_GROUPS,
                            ) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignClassGroup(
                                    classGroup.class_group_id,
                                  );
                                }}
                                disabled={assigningClassGroup}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                              >
                                {assigningClassGroup ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                  <>
                                    <Plus className="w-4 h-4" />
                                    Assign
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && studentClassGroup && (
            <div className="space-y-6">
              {/* Class Group Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-normal font-medium text-black dark:text-white">
                        Class Group: {studentClassGroup.class_group_name}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {studentClassGroup.grade_name} -{" "}
                        {studentClassGroup.program_name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-normal rounded-full transition-colors"
                  >
                    Change Group
                  </button>
                </div>
              </div>

              {/* Academic Term Selector */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Academic Term:
                </label>
                <div className="relative">
                  <select
                    value={selectedTerm?.academic_term_id || ""}
                    onChange={(e) => {
                      const termId = parseInt(e.target.value);
                      const term = academicTerms.find(
                        (t) => t.academic_term_id === termId,
                      );
                      setSelectedTerm(term || null);
                    }}
                    className="appearance-none bg-white dark:bg-gray-900 border-2 border-blue-400 dark:border-blue-600 dark:text-white rounded-xl px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold"
                  >
                    {academicTerms.map((term) => (
                      <option
                        key={term.academic_term_id}
                        value={term.academic_term_id}
                      >
                        {term.name} ({term.is_current ? "Current" : "Past"})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Enrolled Subjects */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-md font-bold text-gray-900 dark:text-white">
                    Enrolled Subjects ({enrolledSubjects.length})
                  </h5>
                  {hasPermission(Permissions.MANAGE_STUDENT_ENROLLMENTS) && (
                    <button
                      onClick={openEnrollModal}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Subject
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : enrolledSubjects.length === 0 ? (
                  <div className="text-center py-8">
                    <GraduationCap className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No subjects enrolled for this term
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {enrolledSubjects.map((subject) => (
                      <motion.div
                        key={subject.enrollment_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3 px-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                              <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <h6 className="font-medium text-gray-900 dark:text-white">
                                {subject.subject_name}
                              </h6>
                              {subject.subject_code && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Code: {subject.subject_code}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                Enrolled:{" "}
                                {new Date(
                                  subject.enrolled_at,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {hasPermission(
                            Permissions.MANAGE_STUDENT_ENROLLMENTS,
                          ) && (
                            <button
                              onClick={() => handleUnenroll(subject.subject_id)}
                              disabled={unenrolling === subject.enrollment_id}
                              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                            >
                              {unenrolling === subject.enrollment_id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                              Remove
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-slate-700/30">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex gap-3">
          {currentStep === 1 && studentClassGroup && (
            <button
              onClick={nextStep}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
            >
              Next Step
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 2 && (
            <button
              onClick={() => {
                showToast("Enrollment completed successfully!", "success");
                onClose();
              }}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-base font-normal rounded-full transition-colors"
            >
              Complete Enrollment
            </button>
          )}
        </div>
      </div>

      {/* Enroll Modal */}
      <AnimatePresence>
        {showEnrollModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed -top-6 bottom-0 left-0 right-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowEnrollModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Add Subject
                  </h3>
                  <button
                    onClick={() => setShowEnrollModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto min-h-[200px] flex flex-col">
                  {loadingAvailable ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                      <p className="text-gray-500 dark:text-gray-400 animate-pulse">
                        Finding available subjects...
                      </p>
                    </div>
                  ) : availableSubjects.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-8">
                      <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No available subjects for enrollment
                      </p>
                    </div>
                  ) : (
                    availableSubjects.map((subject) => (
                      <div
                        key={subject.subject_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"
                      >
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white">
                            {subject.name}
                          </h5>
                          {(subject.code ||
                            (subject.grades && subject.grades.length > 0)) && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {subject.code && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-md">
                                  {subject.code}
                                </span>
                              )}
                              {subject.grades &&
                                subject.grades.map((g) => (
                                  <span
                                    key={g.grade_id}
                                    className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md border border-blue-100 dark:border-blue-800/20"
                                  >
                                    {g.grade_name}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        {hasPermission(
                          Permissions.MANAGE_STUDENT_ENROLLMENTS,
                        ) && (
                          <button
                            onClick={() => handleEnroll(subject.subject_id)}
                            disabled={enrolling === subject.subject_id}
                            className="flex items-center gap-2 px-3 py-1.5 pr-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors disabled:opacity-50"
                          >
                            {enrolling === subject.subject_id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                            Add
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentEnrollmentTab;
