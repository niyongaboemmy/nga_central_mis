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
} from "../controllers/academicController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// Academic Years routes
router.get(
  "/years",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getAcademicYears
);
router.get(
  "/years/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getAcademicYear
);
router.post(
  "/years",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createAcademicYear
);
router.put(
  "/years/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateAcademicYear
);
router.delete(
  "/years/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteAcademicYear
);

// Academic Terms routes
router.get(
  "/terms",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getAcademicTerms
);
router.get(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getAcademicTerm
);
router.post(
  "/terms",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createAcademicTerm
);
router.put(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateAcademicTerm
);
router.delete(
  "/terms/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteAcademicTerm
);

// Programs routes
router.get(
  "/programs",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getPrograms
);
router.get(
  "/programs/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getProgram
);
router.post(
  "/programs",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createProgram
);
router.put(
  "/programs/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateProgram
);
router.delete(
  "/programs/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteProgram
);

// Grades routes
router.get("/grades", authenticate, authorize("MANAGE_ACADEMICS"), getGrades);
router.get(
  "/grades/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getGrade
);
router.post(
  "/grades",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createGrade
);
router.put(
  "/grades/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateGrade
);
router.delete(
  "/grades/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteGrade
);

// Grade-Subject Assignment routes
router.get(
  "/grades/:grade_id/subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getGradeSubjects
);
router.post(
  "/grades/assign-subject",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignSubjectToGrade
);
router.delete(
  "/grades/:grade_id/subjects/:subject_id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  removeSubjectFromGrade
);

// Teacher-Subject Assignment routes
router.get(
  "/teachers/:teacherId/subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getTeacherSubjectAssignments
);
router.get(
  "/subjects/:subject_id/teachers",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getSubjectTeacherAssignments
);
router.post(
  "/teachers/assign-subject",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  assignTeacherToSubject
);
router.delete(
  "/teachers/:user_id/subjects/:subject_id/class-groups/:class_group_id/terms/:academic_term_id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  removeTeacherFromSubject
);

// Subjects routes
router.get(
  "/subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getSubjects
);
router.get(
  "/subjects/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getSubject
);
router.post(
  "/subjects",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createSubject
);
router.put(
  "/subjects/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateSubject
);
router.delete(
  "/subjects/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteSubject
);

// Class Groups routes
router.get(
  "/class-groups",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getClassGroups
);
router.get(
  "/class-groups/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  getClassGroup
);
router.post(
  "/class-groups",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  createClassGroup
);
router.put(
  "/class-groups/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  updateClassGroup
);
router.delete(
  "/class-groups/:id",
  authenticate,
  authorize("MANAGE_ACADEMICS"),
  deleteClassGroup
);

// Teacher Assigned Subjects routes
router.get(
  "/my-assigned-subjects",
  authenticate,
  authorize("VIEW_MY_ASSIGNED_SUBJECTS"),
  getMyAssignedSubjects
);
router.get(
  "/subjects/:subject_id/terms/:academic_term_id/students",
  authenticate,
  authorize("VIEW_MY_ASSIGNED_SUBJECTS"),
  getSubjectEnrolledStudents
);

// Student Subject Enrollment routes
router.get(
  "/students/:studentId/enrolled-subjects",
  authenticate,
  authorize("MANAGE_USERS"),
  getStudentEnrolledSubjects
);
router.get(
  "/students/:studentId/available-subjects",
  authenticate,
  authorize("MANAGE_USERS"),
  getAvailableSubjectsForStudent
);
router.post(
  "/students/enroll-subject",
  authenticate,
  authorize("MANAGE_USERS"),
  enrollStudentInSubject
);
router.delete(
  "/students/:user_id/subjects/:subject_id/terms/:academic_term_id",
  authenticate,
  authorize("MANAGE_USERS"),
  unenrollStudentFromSubject
);

// Student Class Group Assignment routes
router.get(
  "/students/:studentId/class-group",
  authenticate,
  authorize("MANAGE_USERS"),
  getStudentClassGroup
);
router.post(
  "/students/assign-class-group",
  authenticate,
  authorize("MANAGE_USERS"),
  assignStudentToClassGroup
);
router.delete(
  "/students/:user_id/class-groups/:class_group_id",
  authenticate,
  authorize("MANAGE_USERS"),
  removeStudentFromClassGroup
);

export default router;
