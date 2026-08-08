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

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.get("/test", (req, res) =>
  res.json({ message: "Lesson plan router is active" }),
);

router.get("/entry/:entryId", getLessonPlansByEntry);
router.post("/", createOrUpdateLessonPlan);
router.delete("/:id", deleteLessonPlan);
router.post("/extract", upload.single("file"), extractLessonPlan);

// AI-generate a lesson plan from the selected scheme-of-work entry (no upload needed)
router.post("/ai-generate", startAILessonGeneration);
router.get("/ai-generate/:jobId/status", getAILessonGenerationStatus);

export default router;
