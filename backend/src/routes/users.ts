import express from "express";
import {
  getCurrentUser,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/userController";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

router.get("/me", authenticate, getCurrentUser);
router.get("/", authenticate, authorize("MANAGE_USERS"), getUsers);
router.get("/:id", authenticate, getUser);
router.post("/", authenticate, authorize("MANAGE_USERS"), createUser);
router.put("/:id", authenticate, authorize("MANAGE_USERS"), updateUser);
router.delete("/:id", authenticate, authorize("MANAGE_USERS"), deleteUser);

export default router;
