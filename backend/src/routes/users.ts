import express from "express";
import {
  getCurrentUser,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  updateCurrentUserProfile,
  updateUserProfile,
} from "../controllers/userController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

router.get("/me", authenticate, getCurrentUser);
router.put("/me/profile", authenticate, updateCurrentUserProfile);
router.get("/", authenticate, authorize("MANAGE_USERS"), getUsers);
router.get("/:id", authenticate, getUser);
router.put("/:id/profile", authenticate, updateUserProfile);
router.post("/", authenticate, authorize("MANAGE_USERS"), createUser);
router.put("/:id", authenticate, authorize("MANAGE_USERS"), updateUser);
router.delete("/:id", authenticate, authorize("MANAGE_USERS"), deleteUser);

export default router;
