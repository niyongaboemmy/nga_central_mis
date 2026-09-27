import express from "express";
import { authenticate } from "../middleware/auth";
import { getHomeAppSummary, getHomeOverview } from "../controllers/homeOverviewController";

/**
 * Home -- the post-login overview across every module
 * (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md). Every signed-in user may open their
 * own Home; what it contains is decided per signal by the access engine.
 */
const router = express.Router();

router.use(authenticate);
router.get("/overview", getHomeOverview);
router.post("/apps/:source/summary", getHomeAppSummary);

export default router;
