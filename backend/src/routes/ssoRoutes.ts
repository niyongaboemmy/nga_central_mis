import express from "express";
import { authorizeSSO, getSSOToken } from "../controllers/ssoController";
import { authenticate } from "../middleware/auth";

const router = express.Router();

// Step 1: Request authorization code (requires being logged in to MIS)
router.get("/authorize", authenticate, authorizeSSO);

// Step 2: Exchange code for token (server-to-server)
router.post("/token", getSSOToken);

export default router;
