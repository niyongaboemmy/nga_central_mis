import express from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Basic health check
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || "1.0.0",
    };

    successResponse(res, "Health check successful", health);
  })
);

router.get(
  "/db",
  asyncHandler(async (req, res) => {
    // Database health check
    try {
      await db.execute(sql`SELECT 1`);
      successResponse(res, "Database connection healthy", {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw new Error("Database connection failed");
    }
  })
);

export default router;
