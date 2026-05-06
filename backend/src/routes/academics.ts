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
  assignTeacherToSubject,
  removeTeacherFromSubject,
  getMyAssignedSubjects,
  getSubjectEnrolledStudents,

  // Student Subject Enrollment
  getStudentEnrolledSubjects,
  getAvailableSubjectsForStudent,
  enrollStudentInSubject,
  unenrollStudentFromSubject,

  // Student Class Group Assignment
  getStudentClassGroup,
  assignStudentToClassGroup,
  removeStudentFromClassGroup,

  // Class Groups
  getClassGroups,
  getClassGroup,
  createClassGroup,
  updateClassGroup,
  deleteClassGroup,

  // Program Users
  getUsersByProgram,
  assignUserToProgram,
  removeUserFromProgram,
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
router.post(
  "/programs/assign-lead",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignUserToProgram,
);
router.delete(
  "/programs/:program_id/leads/:user_id",
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
router.post("/grades/assign-subject", authenticate, assignSubjectToGrade);
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
router.post(
  "/teachers/assign-subject",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignTeacherToSubject,
);
router.delete(
  "/teachers/:user_id/subjects/:subject_id/class-groups/:class_group_id",
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

// Class Groups routes
router.get("/class-groups", authenticate, getClassGroups);
router.get("/class-groups/:id", authenticate, getClassGroup);
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
  getSubjectEnrolledStudents,
);

// Student Subject Enrollment routes
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
  authorize("MANAGE_USERS"),
  enrollStudentInSubject,
);
router.delete(
  "/students/:user_id/subjects/:subject_id/years/:academic_year_id",
  authenticate,
  authorize("MANAGE_USERS"),
  unenrollStudentFromSubject,
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
  authorize("MANAGE_USERS"),
  assignStudentToClassGroup,
);
router.delete(
  "/students/:user_id/class-groups/:class_group_id",
  authenticate,
  authorize("MANAGE_USERS"),
  removeStudentFromClassGroup,
);

export default router;
