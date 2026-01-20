import { Router } from "express";
import {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
} from "../controllers/schoolController";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  createSchool,
);
router.get(
  "/",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  getAllSchools,
);
router.get(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  getSchoolById,
);
router.put(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  updateSchool,
);
router.delete(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  deleteSchool,
);

export default router;
