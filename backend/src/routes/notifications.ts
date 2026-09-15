import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../controllers/notificationController";

const router = Router();

router.use(authenticate);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadNotificationCount);
router.post("/read-all", markAllNotificationsRead);
router.post("/:notificationId/read", markNotificationRead);
router.delete("/:notificationId", deleteNotification);

export default router;
