import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import config from "./config";
import logger from "./utils/logger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import permissionRoutes from "./routes/permissions";
import healthRoutes from "./routes/health";
import documentRoutes from "./routes/documents";
import academicRoutes from "./routes/academics";
import dashboardRoutes from "./routes/dashboard";
import parentingRoutes from "./routes/parenting";
import schoolRoutes from "./routes/schoolRoutes";
import systemRoutes from "./routes/systemRoutes";
import ssoRoutes from "./routes/ssoRoutes";
import schemeOfWorkRoutes from "./routes/schemeOfWork";
import lessonPlanRoutes from "./routes/lessonPlan";
import calendarRoutes from "./routes/calendar";
import reportRoutes from "./routes/reportRoutes";

dotenv.config();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  }),
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging
app.use(requestLogger);

// Health check routes (no auth required)
app.use("/health", healthRoutes);

// API routes
app.get("/", (req, res) => {
  res.json({
    message: "NGA Central MIS API",
    version: config.nodeEnv === "production" ? "1.0.0" : "dev",
    status: "running",
  });
});

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/permissions", permissionRoutes);
app.use("/documents", documentRoutes);
app.use("/academics", academicRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/parenting", parentingRoutes);
app.use("/schools", schoolRoutes);
app.use("/systems", systemRoutes);
app.use("/sso", ssoRoutes);
app.use("/scheme-of-work", schemeOfWorkRoutes);
console.log("DEBUG: lessonPlanRoutes type:", typeof lessonPlanRoutes);
console.log("DEBUG: Mounting /lesson-plans routes...");
app.use("/lesson-plans", lessonPlanRoutes);
app.use("/calendar", calendarRoutes);
app.use("/reports", reportRoutes);

app.post("/test-post", (req, res) =>
  res.json({ success: true, message: "Root POST test works" }),
);

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

app.listen(config.port, () => {
  logger.info(
    `Server running on port ${config.port} in ${config.nodeEnv} mode`,
  );
});
