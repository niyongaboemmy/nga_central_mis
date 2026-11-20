import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  uploadSchoolLogo,
  removeSchoolLogo,
  getSchoolLogo,
  getSchoolProfile,
  updateSchoolProfile,
} from "../controllers/schoolController";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = Router();

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_TYPE_ERROR = "Only PNG, JPG, SVG, and WEBP images are supported";
const logoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // A first check on the name; the controller checks the bytes themselves.
    if (/\.(png|jpe?g|svg|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error(LOGO_TYPE_ERROR));
  },
});
/** multer's refusals (too big, wrong type) as a 400 with a plain message, not a 500. */
const uploadLogo = (req: Request, res: Response, next: NextFunction) =>
  logoMulter.single("file")(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ message: "The image is larger than 5 MB" });
    return res.status(400).json({ message: err.message === LOGO_TYPE_ERROR ? LOGO_TYPE_ERROR : "That upload couldn't be read" });
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
// The tenant's school identity block (report cards etc.): read by any signed-in
// user, edited with MANAGE_SCHOOLS. Before "/:id" so "profile" isn't taken as an id.
router.get("/profile", authenticate, getSchoolProfile);
router.put("/profile", authenticate, authorize([Permissions.MANAGE_SCHOOLS]), updateSchoolProfile);
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
  uploadLogo,
  uploadSchoolLogo,
);
router.delete(
  "/:id/logo/:slot",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  removeSchoolLogo,
);
// Public image proxy (no auth) so a plain <img src> can load it -- logos are institutional
// branding, not sensitive data. Registered before the authenticated ":id" routes above only
// matters for path specificity, which Express already resolves correctly by method+pattern.
router.get("/:id/logo/:slot", getSchoolLogo);
router.delete(
  "/:id",
  authenticate,
  authorize([Permissions.MANAGE_SCHOOLS]),
  deleteSchool,
);

export default router;
