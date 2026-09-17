import { Router } from "express";
import { requireServiceToken } from "../middleware/serviceAuth";
import {
  ping,
  syncAcademics,
  syncPeople,
  syncReference,
} from "../controllers/integrationController";

/**
 * Machine-to-machine integration surface.
 *
 * Every route here is authenticated by an IntegrationToken, never by a user
 * session, and every route is read-only. Nothing under /integrations may write
 * to the MIS — a partner pulling a copy should not be able to change the
 * system of record, and keeping that a property of the whole router (rather
 * than a per-handler promise) makes it hard to break by accident later.
 */
const router = Router();

const readOnly = requireServiceToken("sync:read");

router.get("/ping", readOnly, ping);
router.get("/sync/reference", readOnly, syncReference);
router.get("/sync/people", readOnly, syncPeople);
router.get("/sync/academics", readOnly, syncAcademics);

export default router;
