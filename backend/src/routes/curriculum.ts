import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../middleware/auth";
import {
  getSubjectDetail,
  getSubjectCompetencies,
  createCompetency,
  updateCompetency,
  deleteCompetency,
  createCriteria,
  updateCriteria,
  deleteCriteria,
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  getSubjectDocuments,
  uploadSubjectDocument,
  deleteSubjectDocument,
  downloadSubjectDocument,
} from "../controllers/curriculumController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(authenticate);

// Subject overview
router.get("/subjects/:subjectId/detail", getSubjectDetail);

// Competencies
router.get("/subjects/:subjectId/competencies", getSubjectCompetencies);
router.post(
  "/subjects/:subjectId/competencies",
  authorize("MANAGE_CURRICULUM"),
  createCompetency,
);
router.put(
  "/subjects/:subjectId/competencies/:competencyId",
  authorize("MANAGE_CURRICULUM"),
  updateCompetency,
);
router.delete(
  "/subjects/:subjectId/competencies/:competencyId",
  authorize("MANAGE_CURRICULUM"),
  deleteCompetency,
);

// Performance criteria (register specific path before parameterized)
router.post(
  "/competencies/:competencyId/criteria",
  authorize("MANAGE_CURRICULUM"),
  createCriteria,
);
router.put("/criteria/:criteriaId", authorize("MANAGE_CURRICULUM"), updateCriteria);
router.delete(
  "/criteria/:criteriaId",
  authorize("MANAGE_CURRICULUM"),
  deleteCriteria,
);

// Document categories
router.get("/subjects/:subjectId/document-categories", getDocumentCategories);
router.post(
  "/subjects/:subjectId/document-categories",
  authorize("MANAGE_CURRICULUM"),
  createDocumentCategory,
);
router.put(
  "/document-categories/:categoryId",
  authorize("MANAGE_CURRICULUM"),
  updateDocumentCategory,
);
router.delete(
  "/document-categories/:categoryId",
  authorize("MANAGE_CURRICULUM"),
  deleteDocumentCategory,
);

// Subject documents — upload must be before /:documentId to avoid "upload" matching as an ID
router.get("/subjects/:subjectId/documents", getSubjectDocuments);
router.post(
  "/subjects/:subjectId/documents/upload",
  authorize("UPLOAD_SUBJECT_DOCUMENTS"),
  upload.single("file"),
  uploadSubjectDocument,
);
router.get("/documents/:documentId/download", downloadSubjectDocument);
router.delete(
  "/documents/:documentId",
  authorize("UPLOAD_SUBJECT_DOCUMENTS"),
  deleteSubjectDocument,
);

export default router;
