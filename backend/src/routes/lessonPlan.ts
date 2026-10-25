import { Router } from "express";
import {
  getLessonPlansByEntry,
  createOrUpdateLessonPlan,
  deleteLessonPlan,
  extractLessonPlan,
} from "../controllers/lessonPlanController";
import {
  startAILessonGeneration,
  getAILessonGenerationStatus,
} from "../controllers/lessonPlanAIController";
import multer from "multer";
import { authenticate } from "../middleware/auth";
import { requireAi } from "../services/ai/gate";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.get("/test", (req, res) =>
  res.json({ message: "Lesson plan router is active" }),
);

router.get("/entry/:entryId", getLessonPlansByEntry);
router.post("/", createOrUpdateLessonPlan);
router.delete("/:id", deleteLessonPlan);
// Uses AI only when the school policy allows it for this user; otherwise the
// deterministic parser reads the document (lessonPlanController.extractLessonPlan).
router.post("/extract", upload.single("file"), extractLessonPlan);

// AI-generate a lesson plan from the selected scheme-of-work entry (no upload needed)
router.post("/ai-generate", requireAi("author"), startAILessonGeneration);
router.get("/ai-generate/:jobId/status", getAILessonGenerationStatus);

export default router;
