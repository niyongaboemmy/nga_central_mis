import { Router } from "express";
import multer from "multer";
import {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  uploadSchoolLogo,
} from "../controllers/schoolController";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = Router();

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpe?g|svg|webp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, SVG, and WEBP images are supported"));
    }
  },
});

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
router.post(
  "/:id/logo",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  uploadLogo.single("file"),
  uploadSchoolLogo,
);
router.delete(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  deleteSchool,
);

export default router;
