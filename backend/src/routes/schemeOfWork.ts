import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../middleware/auth";
import {
  uploadAndExtractScheme,
  getSchemeEntries,
  addSchemeEntry,
  insertSchemeEntry,
  updateSchemeEntry,
  deleteSchemeEntry,
  deleteScheme,
  getAllTeachersSchemeOfWork,
  validateScheme,
  assignEntryCompetency,
  updateSchemeCoverDetails,
  getSchemePdf,
} from "../controllers/schemeOfWorkController";
import {
  startAIGeneration,
  getAIGenerationStatus,
  suggestEntryContent,
  getCurriculumStructure,
} from "../controllers/schemeAIController";
import {
  replaceEntryCriteria,
  suggestEntryCriteria,
  linkSchemeCriteria,
  bulkSuggestCriteria,
} from "../controllers/schemeEntryCriteriaController";
import { Permissions } from "../utils/permissions";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const uploadCurriculum = multer({
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

// All routes are protected
router.use(authenticate);

// Upload and extract scheme from DOCX
router.post("/upload", upload.single("file"), uploadAndExtractScheme);

// Detect Learning Outcome sections in an uploaded curriculum document (fast, no AI call) so the
// UI can confirm which content applies to the selected term before generating
router.post(
  "/ai-generate/structure",
  uploadCurriculum.single("file"),
  getCurriculumStructure,
);

// AI-generate scheme of work from an uploaded curriculum document
router.post(
  "/ai-generate",
  uploadCurriculum.single("file"),
  startAIGeneration,
);
router.get("/ai-generate/:jobId/status", getAIGenerationStatus);

// Get scheme entries by subject/group/term
router.get("/entries", getSchemeEntries);

// Add a single scheme entry (appended, uses caller-supplied week/dates)
router.post("/entries", addSchemeEntry);

// Insert a new entry at any position, auto-renumbering/rescheduling the rest
router.post("/entries/insert", insertSchemeEntry);

// Generate a single entry's content from a custom AI prompt (for review, not auto-saved)
router.post("/entries/ai-suggest", suggestEntryContent);

// AI-powered Performance Criteria matching for a scheme entry's free-text content (stateless —
// not auto-saved; register before the parameterized /entries/:id below)
router.post("/entries/suggest-criteria", suggestEntryCriteria);

// Replace the full set of Performance Criteria linked to a scheme entry
router.put("/entries/:id/criteria", replaceEntryCriteria);

// Bulk-resolve criteria_numbers proposed at AI-generation time into real links, once the
// subject's Curriculum has been confirmed/saved
router.post("/schemes/:schemeId/link-criteria", linkSchemeCriteria);

// On-demand bulk AI matching for an already-existing scheme (content and/or curriculum that
// predates this feature, or entries not covered by generation-time auto-tagging)
router.post("/schemes/:schemeId/bulk-suggest-criteria", bulkSuggestCriteria);

// Delete an entire scheme of work (all weekly entries, their lesson plans, and criteria links) so
// the teacher can start over from the 3-option chooser
router.delete("/schemes/:schemeId", deleteScheme);

// Update a scheme's cover-page metadata (sector, trade, qualification, RQF level, etc.)
router.put("/schemes/:schemeId/cover-details", updateSchemeCoverDetails);

// Render/download the Scheme of Work PDF (?mode=preview|download)
router.get("/schemes/:schemeId/pdf", getSchemePdf);

// Update a single scheme entry
router.patch("/entries/:id", updateSchemeEntry);

// Manually set/clear a single entry's Learning Outcome (competency) link
router.post("/entries/:id/assign-competency", assignEntryCompetency);

// Delete a single scheme entry
router.delete("/entries/:id", deleteSchemeEntry);

// Admin: get all teachers with their scheme of work status
router.get(
  "/all-teachers",
  authorize(Permissions.VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST),
  getAllTeachersSchemeOfWork,
);

// Admin: validate a scheme of work
router.post(
  "/validate",
  authorize(Permissions.VALIDATE_SCHEME_OF_WORK),
  validateScheme,
);

export default router;
