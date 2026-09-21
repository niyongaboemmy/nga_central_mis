import { Router, RequestHandler } from "express";
import multer from "multer";
import { ValidationError } from "../errors/CustomError";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import {
  listMyLessonNotes,
  createLessonNote,
  createLessonNoteFromPdf,
  replaceLessonNotePdf,
  streamLessonNotePdf,
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
  listPromptPresets,
  createPromptPreset,
  deletePromptPreset,
} from "../controllers/lessonNoteController";
import { LESSON_NOTE_PDF_MAX_BYTES } from "../utils/lessonNotePdf";
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

// Lesson-note PDFs are a separate upload path from embedded images: bigger, and only
// ever a PDF. The controller re-checks the bytes (magic header) — this filter is just the
// early, cheap rejection.
const uploadPdfMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LESSON_NOTE_PDF_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error("Only PDF files can be uploaded as a lesson note"));
    cb(null, true);
  },
});
// Multer's own errors bypass the controllers' ValidationError path (and the global
// handler's LIMIT_FILE_SIZE message quotes the document module's 5GB cap) — translate
// them here so the teacher sees the right limit for a lesson-note PDF.
const uploadPdf: RequestHandler = (req, res, next) =>
  uploadPdfMulter.single("file")(req, res, (err: any) => {
    if (!err) return next();
    next(
      new ValidationError(
        err.code === "LIMIT_FILE_SIZE"
          ? `That PDF is too large. The maximum is ${Math.round(LESSON_NOTE_PDF_MAX_BYTES / 1024 / 1024)} MB.`
          : err.message || "Upload failed",
      ),
    );
  });

router.use(authenticate);

// Student-facing (read-only, checked by permission + share resolution in the controller)
router.get("/shared-with-me", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), listSharedWithMe);
router.get("/shared-with-me/:id", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), getSharedLessonNote);
// Reader-side AI study assistant. Same permission + share gate as reading the note itself.
router.post("/shared-with-me/:id/ask", authorize(Permissions.VIEW_SHARED_LESSON_NOTES), askAboutSharedNote);

// Image streaming needs to come before the generic teacher gate below since students
// viewing a shared note load images too — access is re-checked inside the controller.
router.get("/images/:imageId/raw", streamLessonNoteImage);
// Same story for a PDF note's file: students read it in the shared viewer.
router.get("/:id/pdf/raw", streamLessonNotePdf);

// Teacher authoring surface
router.use(authorize(Permissions.MANAGE_LESSON_NOTES));

router.get("/", listMyLessonNotes);
router.post("/", createLessonNote);
router.post("/upload-pdf", uploadPdf, createLessonNoteFromPdf);

router.get("/prompt-presets", listPromptPresets);
router.post("/prompt-presets", createPromptPreset);
router.delete("/prompt-presets/:presetId", deletePromptPreset);

router.post("/ai-generate", startAINoteGeneration);
router.get("/ai-generate/:jobId/status", getAINoteGenerationStatus);

router.get("/:id", getLessonNote);
router.get("/:id/export-pdf", exportLessonNotePdf);
router.patch("/:id", updateLessonNote);
router.delete("/:id", deleteLessonNote);

router.post("/:id/images", upload.single("image"), uploadLessonNoteImage);
router.post("/:id/pdf", uploadPdf, replaceLessonNotePdf);

router.post("/:id/ai-edit", proposeAINoteEdit);

router.get("/:id/versions", listLessonNoteVersions);
router.post("/:id/versions/:versionId/restore", restoreLessonNoteVersion);

router.post("/:id/share", shareLessonNote);
router.get("/:id/share", listLessonNoteShares);
router.delete("/:id/share/:shareId", revokeLessonNoteShare);

export default router;
