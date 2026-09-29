import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { requireServiceToken } from "../middleware/serviceAuth";
import { Permissions } from "../utils/permissions";
import {
  ackMyJob,
  cancelSource,
  createFeed,
  deleteFeed,
  getAdminOverview,
  getAgenda,
  getMyReminders,
  getReminderConfig,
  notificationAction,
  pushHeartbeat,
  sendTest,
  serveFeed,
  snoozeMyJob,
  subscribePush,
  unsubscribePush,
  updatePreferences,
  upsertSource,
} from "../controllers/reminderController";

/**
 * Reminder Hub (REMINDERS_SOLUTION_PROPOSAL.md).
 *
 * Three audiences, three credentials:
 * - people: the usual session (authenticate) -- settings, devices, agenda;
 * - calendars and notification buttons: a secret in the URL (feed token, or
 *   the per-reminder action signature) because neither can send a session;
 * - other NGA apps: a service token/client credentials (Source API).
 */
const router = Router();

// Public, token-in-URL routes -- registered before authenticate.
router.get("/feed/:token", serveFeed);
router.post("/actions/:id/:action", notificationAction);

// Source API for Task Mentor, Tupo, ... (scope reminders:write).
router.put("/sources", requireServiceToken("reminders:write"), upsertSource);
router.delete("/sources/:app/:type/:externalId", requireServiceToken("reminders:write"), cancelSource);

router.use(authenticate);

router.get("/config", getReminderConfig);
router.get("/me", getMyReminders);
router.put("/preferences", updatePreferences);
router.get("/agenda", getAgenda);

router.post("/push/subscriptions", subscribePush);
router.delete("/push/subscriptions/:id", unsubscribePush);
router.delete("/push/subscriptions", unsubscribePush);
router.post("/push/heartbeat", pushHeartbeat);
router.post("/test", sendTest);

router.post("/jobs/:id/ack", ackMyJob);
router.post("/jobs/:id/snooze", snoozeMyJob);

router.post("/feed", createFeed);
router.delete("/feed", deleteFeed);

router.get("/admin/overview", authorize(Permissions.MANAGE_SYSTEMS), getAdminOverview);

export default router;
