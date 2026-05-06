import express from "express";
import {
  authorizeSSO,
  getSSOToken,
  registerSSOClient,
} from "../controllers/ssoController";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = express.Router();

// Step 1: Request authorization code (requires being logged in to MIS)
router.get("/authorize", authenticate, authorizeSSO);

// Step 2: Exchange code for token (server-to-server)
router.post("/token", getSSOToken);

// Admin: Register a new SSO client
router.post(
  "/clients",
  authenticate,
  authorize([Permissions.MANAGE_SSO_CLIENTS]),
  registerSSOClient,
);

export default router;
