import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth";
import {
  uploadAndExtractScheme,
  getSchemeEntries,
  addSchemeEntry,
  updateSchemeEntry,
  deleteSchemeEntry,
} from "../controllers/schemeOfWorkController";

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

export default router;
