import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import {
  listMyLessonNotes,
  createLessonNote,
  getLessonNote,
  exportLessonNotePdf,
  updateLessonNote,
  deleteLessonNote,
  uploadLessonNoteImage,
  streamLessonNoteImage,
  listLessonNoteVersions,
  restoreLessonNoteVersion,
  shareLessonNote,
  listLessonNoteShares,
  revokeLessonNoteShare,
  listSharedWithMe,
  getSharedLessonNote,
  getSharedCombinedNotes,
  exportSharedCombinedPdf,
  getMyCombinedNotes,
  exportMyCombinedPdf,
  listPromptPresets,
  createPromptPreset,
  deletePromptPreset,
} from "../controllers/lessonNoteController";
import {
  startAINoteGeneration,
  getAINoteGenerationStatus,
  proposeAINoteEdit,
  askAboutSharedNote,
} from "../controllers/lessonNoteAIController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

router.use(authenticate);

// Student-facing (read-only, checked by permission + share resolution in the controller)
router.get("/shared-with-me", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), listSharedWithMe);
router.get("/shared-with-me/combined", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), getSharedCombinedNotes);
router.get("/shared-with-me/combined-pdf", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), exportSharedCombinedPdf);
router.get("/shared-with-me/:id", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), getSharedLessonNote);
// Reader-side AI study assistant. Same permission + share gate as reading the note itself.
router.post("/shared-with-me/:id/ask", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), askAboutSharedNote);

// Image streaming needs to come before the generic teacher gate below since students
// viewing a shared note load images too — access is re-checked inside the controller.
router.get("/images/:imageId/raw", streamLessonNoteImage);

// Teacher authoring surface
router.use(authorize(Permissions.MANAGE_LESSON_NOTES));

router.get("/", listMyLessonNotes);
router.post("/", createLessonNote);

router.get("/prompt-presets", listPromptPresets);
router.post("/prompt-presets", createPromptPreset);
router.delete("/prompt-presets/:presetId", deletePromptPreset);

router.get("/combined", getMyCombinedNotes);
router.get("/combined-pdf", exportMyCombinedPdf);

router.post("/ai-generate", startAINoteGeneration);
router.get("/ai-generate/:jobId/status", getAINoteGenerationStatus);

router.get("/:id", getLessonNote);
router.get("/:id/export-pdf", exportLessonNotePdf);
router.patch("/:id", updateLessonNote);
router.delete("/:id", deleteLessonNote);

router.post("/:id/images", upload.single("image"), uploadLessonNoteImage);

router.post("/:id/ai-edit", proposeAINoteEdit);

router.get("/:id/versions", listLessonNoteVersions);
router.post("/:id/versions/:versionId/restore", restoreLessonNoteVersion);

router.post("/:id/share", shareLessonNote);
router.get("/:id/share", listLessonNoteShares);
router.delete("/:id/share/:shareId", revokeLessonNoteShare);

export default router;
