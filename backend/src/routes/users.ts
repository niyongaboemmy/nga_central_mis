import express from "express";
import multer from "multer";
import {
  getCurrentUser,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  updateCurrentUserProfile,
  updateUserProfile,
  bulkCreateUsers,
  downloadTemplate,
  searchUsers,
} from "../controllers/userController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

router.get("/me", authenticate, getCurrentUser);
router.put("/me/profile", authenticate, updateCurrentUserProfile);
router.get("/", authenticate, authorize("MANAGE_USERS"), getUsers);
router.get(
  "/template",
  authenticate,
  authorize("MANAGE_USERS"),
  downloadTemplate
);
router.get("/:id", authenticate, getUser);
router.put("/:id/profile", authenticate, updateUserProfile);
router.post("/", authenticate, authorize("MANAGE_USERS"), createUser);
router.post(
  "/bulk",
  authenticate,
  authorize("MANAGE_USERS"),
  upload.single("file"),
  bulkCreateUsers
);
router.put("/:id", authenticate, authorize("MANAGE_USERS"), updateUser);
router.delete("/:id", authenticate, authorize("MANAGE_USERS"), deleteUser);

// Search users (for document sharing) - available to all authenticated users
router.get("/search", authenticate, searchUsers);

export default router;
