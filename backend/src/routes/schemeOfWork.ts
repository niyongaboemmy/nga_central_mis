import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../middleware/auth";
import {
  uploadAndExtractScheme,
  getSchemeEntries,
  addSchemeEntry,
  updateSchemeEntry,
  deleteSchemeEntry,
  getAllTeachersSchemeOfWork,
  validateScheme,
} from "../controllers/schemeOfWorkController";
import { Permissions } from "../utils/permissions";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes are protected
router.use(authenticate);

// Upload and extract scheme from DOCX
router.post("/upload", upload.single("file"), uploadAndExtractScheme);

// Get scheme entries by subject/group/term
router.get("/entries", getSchemeEntries);

// Add a single scheme entry
router.post("/entries", addSchemeEntry);

// Update a single scheme entry
router.patch("/entries/:id", updateSchemeEntry);

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
