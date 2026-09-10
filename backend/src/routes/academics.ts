import express from "express";
import {
  // Academic Years
  getAcademicYears,
  getAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,

  // Academic Terms
  getAcademicTerms,
  getAcademicTerm,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,

  // Programs
  getPrograms,
  getProgram,
  createProgram,
  updateProgram,
  deleteProgram,

  // Grades
  getGrades,
  getGrade,
  createGrade,
  updateGrade,
  deleteGrade,

  // Course Categories
  getCourseCategories,
  getCourseCategoryById,
  createCourseCategory,
  updateCourseCategory,
  deleteCourseCategory,

  // Subjects
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,

  // Grade-Subject Assignments
  getGradeSubjects,
  assignSubjectToGrade,
  removeSubjectFromGrade,

  // Teacher-Subject Assignments
  getTeacherSubjectAssignments,
  getSubjectTeacherAssignments,
  getAllTeacherSubjectAssignments,
  assignTeacherToSubject,
  removeTeacherFromSubject,
  updateTeacherSubjectAssignment,
  copyTeacherSubjectAssignments,
  getMyAssignedSubjects,
  getSubjectEnrolledStudents,
  getSubjectEnrolledStudentsByTerm,
  getMyStudents,

  // Student Subject Enrollment
  getStudentEnrolledSubjects,
  getAvailableSubjectsForStudent,
  enrollStudentInSubject,
  unenrollStudentFromSubject,
  bulkEnrollStudentsInSubjects,

  // Student Class Group Assignment
  getStudentClassGroup,
  assignStudentToClassGroup,
  removeStudentFromClassGroup,
  promoteStudentsToClassGroup,
  getPromotionPreview,
  promoteStudentsForYear,
  bulkAssignStudentsToClassGroup,

  // Class Groups
  getClassGroups,
  getClassGroup,
  getClassGroupStudents,
  getClassGroupEnrollmentRoster,
  createClassGroup,
  updateClassGroup,
  deleteClassGroup,
  getClassGroupDependencyReport,

  // Class Groups Management workspace
  getClassGroupsOverview,
  getUnassignedStudents,
  bulkAssignTeacherToSubjects,
  bulkUnenrollStudentsFromSubjects,

  // Program Users
  getUsersByProgram,
  getAllProgramLeads,
  assignUserToProgram,
  removeUserFromProgram,
  copyProgramLeads,
} from "../controllers/academicController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// Academic Years routes
router.get("/years", authenticate, getAcademicYears);
router.get("/years/:id", authenticate, getAcademicYear);
router.post(
  "/years",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createAcademicYear,
);
router.put(
  "/years/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateAcademicYear,
);
router.delete(
  "/years/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteAcademicYear,
);

// Academic Terms routes
router.get("/terms", authenticate, getAcademicTerms);
router.get(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getAcademicTerm,
);
router.post(
  "/terms",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createAcademicTerm,
);
router.put(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateAcademicTerm,
);
router.delete(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteAcademicTerm,
);

// Programs routes
router.get("/programs", authenticate, getPrograms);
router.get("/programs/:id", authenticate, getProgram);
router.post(
  "/programs",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createProgram,
);
router.put(
  "/programs/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateProgram,
);
router.delete(
  "/programs/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteProgram,
);

// Program Users routes
router.get("/programs/:programId/users", authenticate, getUsersByProgram);
router.get("/program-leads", authenticate, getAllProgramLeads);
router.post(
  "/programs/assign-lead",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignUserToProgram,
);
router.post(
  "/programs/copy-leads",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  copyProgramLeads,
);
router.delete(
  "/programs/:program_id/leads/:user_id/years/:academic_year_id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  removeUserFromProgram,
);

// Grades routes
router.get("/grades", authenticate, getGrades);
router.get("/grades/:id", authenticate, getGrade);
router.post(
  "/grades",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createGrade,
);
router.put(
  "/grades/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateGrade,
);
router.delete(
  "/grades/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteGrade,
);

// Course Categories routes
router.get("/course-categories", authenticate, getCourseCategories);
router.get("/course-categories/:id", authenticate, getCourseCategoryById);
router.post(
  "/course-categories",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createCourseCategory,
);
router.put(
  "/course-categories/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateCourseCategory,
);
router.delete(
  "/course-categories/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteCourseCategory,
);

// Grade-Subject Assignment routes
router.get("/grades/:grade_id/subjects", authenticate, getGradeSubjects);
router.post(
  "/grades/assign-subject",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignSubjectToGrade,
);
router.delete(
  "/grades/:grade_id/subjects/:subject_id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  removeSubjectFromGrade,
);

// Teacher-Subject Assignment routes
router.get(
  "/teachers/:teacherId/subjects",
  authenticate,
  getTeacherSubjectAssignments,
);
router.get(
  "/subjects/:subject_id/teachers",
  authenticate,
  getSubjectTeacherAssignments,
);
router.get(
  "/teacher-assignments",
  authenticate,
  getAllTeacherSubjectAssignments,
);
router.post(
  "/teachers/assign-subject",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignTeacherToSubject,
);
router.put(
  "/teachers/assignment",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateTeacherSubjectAssignment,
);
router.post(
  "/teachers/bulk-assign-subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  bulkAssignTeacherToSubjects,
);
router.post(
  "/teachers/copy-assignments",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  copyTeacherSubjectAssignments,
);
router.delete(
  "/teachers/:user_id/subjects/:subject_id/class-groups/:class_group_id/years/:academic_year_id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  removeTeacherFromSubject,
);

// Subjects routes
router.get("/subjects", authenticate, getSubjects);
router.get("/subjects/:id", authenticate, getSubject);
router.post(
  "/subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createSubject,
);
router.put(
  "/subjects/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateSubject,
);
router.delete(
  "/subjects/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteSubject,
);

// Class Groups routes -- ClassGroup is a permanent label per grade now, not
// year-scoped, so there's no more "copy class groups to a new year" action.
router.get("/class-groups", authenticate, getClassGroups);
// Registered before "/class-groups/:id", otherwise Express matches
// "overview" as :id and calls getClassGroup instead.
router.get(
  "/class-groups/overview",
  authenticate,
  authorize("VIEW_ACADEMICS"),
  getClassGroupsOverview,
);
router.get("/class-groups/:id", authenticate, getClassGroup);
router.get(
  "/class-groups/:class_group_id/students",
  authenticate,
  getClassGroupStudents,
);
router.get(
  "/class-groups/:class_group_id/enrollment-roster",
  authenticate,
  authorize("MANAGE_STUDENT_ENROLLMENTS"),
  getClassGroupEnrollmentRoster,
);
router.post(
  "/class-groups",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createClassGroup,
);
router.put(
  "/class-groups/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateClassGroup,
);
router.get(
  "/class-groups/:id/dependencies",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getClassGroupDependencyReport,
);
router.delete(
  "/class-groups/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteClassGroup,
);

// Teacher Assigned Subjects routes
router.get(
  "/my-assigned-subjects",
  authenticate,
  authorize("VIEW_MY_ASSIGNED_SUBJECTS"),
  getMyAssignedSubjects,
);
router.get(
  "/subjects/:subject_id/years/:academic_year_id/students",
  authenticate,
  authorize("VIEW_SUBJECT_ENROLLED_STUDENTS"),
  getSubjectEnrolledStudents,
);
router.get(
  "/subjects/:subject_id/terms/:term_id/students",
  authenticate,
  authorize("VIEW_SUBJECT_ENROLLED_STUDENTS"),
  getSubjectEnrolledStudentsByTerm,
);
router.get(
  "/my-students",
  authenticate,
  authorize("VIEW_MY_STUDENTS"),
  getMyStudents,
);

// Student Subject Enrollment routes
// Registered before every "/students/:studentId/..." route so Express does not
// match "unassigned" as a student id.
router.get(
  "/students/unassigned",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  getUnassignedStudents,
);
router.get(
  "/students/:studentId/enrolled-subjects",
  authenticate,
  getStudentEnrolledSubjects,
);
router.get(
  "/students/:studentId/available-subjects",
  authenticate,
  getAvailableSubjectsForStudent,
);
router.post(
  "/students/enroll-subject",
  authenticate,
  authorize("MANAGE_STUDENT_ENROLLMENTS"),
  enrollStudentInSubject,
);
router.delete(
  "/students/:user_id/subjects/:subject_id/years/:academic_year_id",
  authenticate,
  authorize("MANAGE_STUDENT_ENROLLMENTS"),
  unenrollStudentFromSubject,
);
router.post(
  "/students/bulk-enroll-subjects",
  authenticate,
  authorize("MANAGE_STUDENT_ENROLLMENTS"),
  bulkEnrollStudentsInSubjects,
);
router.post(
  "/students/bulk-unenroll-subjects",
  authenticate,
  authorize("MANAGE_STUDENT_ENROLLMENTS"),
  bulkUnenrollStudentsFromSubjects,
);

// Student Class Group Assignment routes
router.get(
  "/students/:studentId/class-group",
  authenticate,
  getStudentClassGroup,
);
router.post(
  "/students/assign-class-group",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  assignStudentToClassGroup,
);
router.delete(
  "/students/:user_id/class-groups/:class_group_id/years/:academic_year_id",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  removeStudentFromClassGroup,
);
router.post(
  "/students/promote-class",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  promoteStudentsToClassGroup,
);
router.get(
  "/students/promotion-preview",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  getPromotionPreview,
);
router.post(
  "/students/promote-year",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  promoteStudentsForYear,
);
router.post(
  "/students/bulk-assign-class-group",
  authenticate,
  authorize("ASSIGN_STUDENT_CLASS_GROUPS"),
  bulkAssignStudentsToClassGroup,
);

export default router;
