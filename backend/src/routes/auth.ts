import express from "express";
import { login, verifyOTP } from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.post("/login", login);
router.post("/verify-otp", authenticate, verifyOTP);

export default router;
