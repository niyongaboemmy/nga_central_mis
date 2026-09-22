import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import {
  createCourseFromScheme,
  getCourseForScheme,
  listMyCourses,
  listMySchemesForCourses,
  getCourseBuilder,
  updateCourse,
  reseedCourse,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
  setItemCriteriaHandler,
  pickLessonNotes,
  pickSubjectDocuments,
  pickCriteria,
} from "../controllers/courseController";
import {
  listMyLearningCourses,
  getMyLearningCourse,
  openMyItem,
  streamMyItemFile,
  heartbeatMyItem,
  markMyItemDone,
  findMySectionForDate,
} from "../controllers/learnerCourseController";
import {
  getCourseAnalytics,
  getCourseCoverage,
  buildJourney,
  getCourseQuestions,
  overrideItemProgress,
  nudgeStudents,
  setSectionPrerequisites,
  getSectionPrerequisites,
} from "../controllers/courseAnalyticsController";
import {
  checkKnowledgeAnswer,
  submitKnowledgeCheck,
  knowledgeCheckStats,
  generateKnowledgeCheck,
  generatePageDraft,
  getItemContext,
  suggestItemCriteria,
  getMyLearningPrefs,
  updateMyLearningPrefs,
} from "../controllers/courseInteractiveController";
import {
  listCoursesRegister,
  adminCourseAnalytics,
  adminCourseMastery,
  adminCourseCoverage,
  teacherCourseMastery,
  myMastery,
  myStreak,
  exportRegisterCsv,
  courseProgressReportCsv,
} from "../controllers/courseAdminController";
import { askCourseTutor, suggestedTutorQuestions } from "../controllers/courseTutorController";

/**
 * E-learning module (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md §3.3).
 *
 *   /elearning/courses/...   teacher course builder   (MANAGE_COURSE_CONTENT, scoped per course)
 *   /elearning/my/...        student learner surface  (VIEW_MY_COURSES, membership derived)
 *   /elearning/admin/...     oversight                (VIEW_ALL_COURSES, scoped via userScope)
 */
const router = Router();
router.use(authenticate);

// ---- Learner ---------------------------------------------------------------
const learner = authorize(Permissions.VIEW_MY_COURSES);
router.get("/my/courses", learner, listMyLearningCourses);
router.get("/my/courses/:id", learner, getMyLearningCourse);
router.get("/my/section-for-date", learner, findMySectionForDate);
router.get("/my/items/:id", learner, openMyItem);
router.get("/my/items/:id/file", learner, streamMyItemFile);
router.post("/my/items/:id/heartbeat", learner, heartbeatMyItem);
router.post("/my/items/:id/done", learner, markMyItemDone);
router.post("/my/items/:id/knowledge-check/check", learner, checkKnowledgeAnswer);
router.post("/my/items/:id/knowledge-check", learner, submitKnowledgeCheck);
router.post("/my/courses/:id/ask", learner, askCourseTutor);
router.get("/my/courses/:id/ask/suggestions", learner, suggestedTutorQuestions);
router.get("/my/mastery", learner, myMastery);
router.get("/my/streak", learner, myStreak);
router.get("/my/prefs", learner, getMyLearningPrefs);
router.patch("/my/prefs", learner, updateMyLearningPrefs);

// ---- Builder ---------------------------------------------------------------
const builder = authorize(Permissions.MANAGE_COURSE_CONTENT);
router.get("/courses/mine", builder, listMyCourses);
router.get("/courses/schemes", builder, listMySchemesForCourses);
router.get("/courses/by-scheme/:schemeId", builder, getCourseForScheme);
router.post("/courses/from-scheme/:schemeId", builder, createCourseFromScheme);
router.get("/courses/:id", builder, getCourseBuilder);
router.patch("/courses/:id", builder, updateCourse);
router.post("/courses/:id/reseed", builder, reseedCourse);
router.post("/courses/:id/sections", builder, createSection);
router.put("/courses/:id/sections/order", builder, reorderSections);
router.get("/courses/:id/pickers/lesson-notes", builder, pickLessonNotes);
router.get("/courses/:id/pickers/subject-documents", builder, pickSubjectDocuments);
router.get("/courses/:id/pickers/criteria", builder, pickCriteria);

router.patch("/sections/:id", builder, updateSection);
router.delete("/sections/:id", builder, deleteSection);
router.post("/sections/:id/items", builder, createItem);
router.put("/sections/:id/items/order", builder, reorderItems);

router.get("/courses/:id/analytics", builder, getCourseAnalytics);
router.get("/courses/:id/mastery", builder, teacherCourseMastery);
router.get("/courses/:id/coverage", builder, getCourseCoverage);
router.get("/courses/:id/report.csv", authorize([Permissions.MANAGE_COURSE_CONTENT, Permissions.VIEW_ALL_COURSES]), courseProgressReportCsv);
router.post("/sections/:id/build-journey", builder, buildJourney);
router.get("/courses/:id/questions", builder, getCourseQuestions);
router.get("/courses/:id/prerequisites", builder, getSectionPrerequisites);
router.post("/courses/:id/nudge", builder, nudgeStudents);
router.put("/sections/:id/prerequisites", builder, setSectionPrerequisites);
router.post("/items/:id/progress/:userId/complete", authorize(Permissions.OVERRIDE_COURSE_PROGRESS), overrideItemProgress);

router.patch("/items/:id", builder, updateItem);
router.delete("/items/:id", builder, deleteItem);
router.put("/items/:id/criteria", builder, setItemCriteriaHandler);
router.post("/items/:id/suggest-criteria", builder, suggestItemCriteria);
router.post("/items/:id/generate-check", builder, generateKnowledgeCheck);
router.post("/items/:id/generate-page", builder, generatePageDraft);
router.get("/items/:id/context", builder, getItemContext);
router.get("/items/:id/knowledge-check/stats", builder, knowledgeCheckStats);

// ---- Admin / oversight ----------------------------------------------------
const oversight = authorize(Permissions.VIEW_ALL_COURSES);
router.get("/admin/courses", oversight, listCoursesRegister);
router.get("/admin/courses/export.csv", oversight, exportRegisterCsv);
router.get("/admin/courses/:id/analytics", oversight, adminCourseAnalytics);
router.get("/admin/courses/:id/mastery", oversight, adminCourseMastery);
router.get("/admin/courses/:id/coverage", oversight, adminCourseCoverage);

export default router;
