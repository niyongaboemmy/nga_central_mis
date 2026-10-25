import { Router } from "express";
import { requireServiceToken } from "../middleware/serviceAuth";
import {
  ping,
  syncAcademics,
  syncPeople,
  syncReference,
} from "../controllers/integrationController";
import { ingestLearningEvents, syncCourses } from "../controllers/courseAnalyticsController";
import { getAiPolicy } from "../services/ai/policy";

/**
 * Machine-to-machine integration surface.
 *
 * Every route here is authenticated by an IntegrationToken, never by a user
 * session. The sync routes are read-only under the `sync:read` scope. The one
 * write is the e-learning event inbox (`learning-events:write`): an append-only
 * log of "student X completed quiz Y" statements that only ever adds progress
 * for the course items that reference the partner's own objects — it cannot
 * touch the MIS system of record (roster, curriculum, notes).
 */
const router = Router();

const readOnly = requireServiceToken("sync:read");

router.get("/ping", readOnly, ping);
router.get("/sync/reference", readOnly, syncReference);
router.get("/sync/people", readOnly, syncPeople);
router.get("/sync/academics", readOnly, syncAcademics);

// E-learning (ELEARNING_MODULE_IMPLEMENTATION_PLAN.md §3.3 Integrations)
router.get("/sync/courses", readOnly, syncCourses);
router.post("/learning-events", requireServiceToken("learning-events:write"), ingestLearningEvents);

// School AI policy for Task Mentor, Tupo and Tendo (AI_USAGE_CONTROL_PLAN.md §4.2). Spokes
// call it with their SSO client id/secret as HTTP Basic and refetch when the
// ai_policy_v on GET /auth/verify changes.
router.get("/ai-policy", requireServiceToken("ai-policy:read"), async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, data: { policy: await getAiPolicy() } });
  } catch (e) {
    next(e);
  }
});

export default router;
