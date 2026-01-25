import express from "express";
import {
  login,
  verifyOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  changePassword,
  getSession,
  logout,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/login", login);
router.post("/logout", authenticate, logout);
router.get("/session", authenticate, getSession);
router.post("/verify-otp", authenticate, verifyOTP);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", authenticate, verifyResetOTP);
router.post("/reset-password", authenticate, resetPassword);
router.post("/change-password", authenticate, changePassword);

export default router;
