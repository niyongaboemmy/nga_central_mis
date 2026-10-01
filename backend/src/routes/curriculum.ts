import { Router } from "express";
import multer from "multer";
import os from "os";
import path from "path";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import {
  getSubjectDetail,
  getMyEnrolledSubjects,
  getSubjectCompetencies,
  createCompetency,
  reorderCompetencies,
  updateCompetency,
  deleteCompetency,
  createCriteria,
  updateCriteria,
  deleteCriteria,
  getCriteriaSchemeUsage,
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  getSubjectDocuments,
  uploadSubjectDocument,
  deleteSubjectDocument,
  downloadSubjectDocument,
  previewSubjectDocument,
} from "../controllers/curriculumController";
import {
  startCurriculumImport,
  getCurriculumImportStatus,
  confirmCurriculumImport,
} from "../controllers/curriculumImportAIController";

const router = Router();

// Kept in sync with the frontend's subjectDocumentsApi.MAX_UPLOAD_SIZE, the
// file-server's own multer limit, and nginx's client_max_body_size.
export const MAX_SUBJECT_DOCUMENT_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

// Subject documents (Materials tab): streamed to a temp file on disk as
// they're received rather than buffered in memory. The old 50MB
// memoryStorage limit (and the even lower 25MB nginx cap in front of it)
// is what was rejecting larger uploads -- 5GB is a sane ceiling to protect
// disk space rather than a real constraint on legitimate course materials.
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const suffix = Math.random().toString(36).slice(2);
      cb(null, `subject-doc-${Date.now()}-${suffix}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_SUBJECT_DOCUMENT_SIZE },
});

const uploadCurriculumDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(docx|pdf|txt)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only .docx, .pdf, and .txt files are supported"));
    }
  },
});

router.use(authenticate);

// Subject overview
router.get(
  "/my-enrolled-subjects",
  authorize(Permissions.VIEW_MY_ENROLLED_SUBJECTS),
  getMyEnrolledSubjects,
);
router.get("/subjects/:subjectId/detail", getSubjectDetail);

// Competencies
router.get("/subjects/:subjectId/competencies", getSubjectCompetencies);
router.post(
  "/subjects/:subjectId/competencies",
  authorize("MANAGE_CURRICULUM"),
  createCompetency,
);
// Register before the parameterized :competencyId route below, or "reorder" would be matched as an ID
router.put(
  "/subjects/:subjectId/competencies/reorder",
  authorize("MANAGE_CURRICULUM"),
  reorderCompetencies,
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
router.get("/criteria/:criteriaId/scheme-entries", getCriteriaSchemeUsage);

// AI import from an uploaded curriculum document (PDF/DOCX/TXT)
router.post(
  "/subjects/:subjectId/import/ai-generate",
  authorize("MANAGE_CURRICULUM"),
  uploadCurriculumDoc.single("file"),
  startCurriculumImport,
);
router.get(
  "/subjects/:subjectId/import/ai-generate/:jobId/status",
  authorize("MANAGE_CURRICULUM"),
  getCurriculumImportStatus,
);
router.post(
  "/subjects/:subjectId/import/confirm",
  authorize("MANAGE_CURRICULUM"),
  confirmCurriculumImport,
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
router.get("/documents/:documentId/preview", previewSubjectDocument);
router.delete(
  "/documents/:documentId",
  authorize("UPLOAD_SUBJECT_DOCUMENTS"),
  deleteSubjectDocument,
);

export default router;
