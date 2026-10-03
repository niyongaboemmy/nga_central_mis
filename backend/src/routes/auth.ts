import express from "express";
import {
  login,
  verifyOTP,
  googleLogin,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  changePassword,
  confirmDbAccess,
  getSession,
  logout,
  verifySession,
  createDesktopHandoff,
  redeemDesktopHandoff,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/login", login);
router.post("/google", googleLogin);
// NGA desktop app: browser sign-in hand-off (utils/desktopHandoff.ts)
router.post("/desktop-handoff", authenticate, createDesktopHandoff);
router.post("/desktop-handoff/redeem", redeemDesktopHandoff);
router.post("/logout", authenticate, logout);
router.get("/session", authenticate, getSession);
// Cheap "is this token still valid" check -- authenticate() already does
// the token_version revocation check, this just returns without the
// heavy profile/roles/systems payload getSession assembles. Meant to be
// polled periodically by spoke apps (TaskMentor, Tendo, ...) so an MIS
// logout ends their session too, not just this one.
router.get("/verify", authenticate, verifySession);
router.post("/verify-otp", authenticate, verifyOTP);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", authenticate, verifyResetOTP);
router.post("/reset-password", authenticate, resetPassword);
router.post("/change-password", authenticate, changePassword);
router.post("/confirm-db-access", authenticate, confirmDbAccess);

export default router;
