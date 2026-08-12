import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "./config";
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
import curriculumRoutes from "./routes/curriculum";
import mentorshipRoutes from "./routes/mentorship";
import lessonNoteRoutes from "./routes/lessonNotes";
import databaseRoutes from "./routes/databaseRoutes";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    exposedHeaders: [
      "X-Total-Count",
      "X-Total-Pages",
      "X-Current-Page",
      "X-Per-Page",
    ],
  }),
);

// Body parsing middleware
// 30mb (not the default 100kb, nor the old 10mb) because lesson note images are now
// embedded as base64 data URIs directly in content_json/content_html — a single PATCH
// carries the image twice (both fields) at ~1.33x its raw size once base64-encoded.
app.use(express.json({ limit: "30mb" }));
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
app.use("/lesson-plans", lessonPlanRoutes);
app.use("/calendar", calendarRoutes);
app.use("/reports", reportRoutes);
app.use("/curriculum", curriculumRoutes);
app.use("/mentorship", mentorshipRoutes);
app.use("/lesson-notes", lessonNoteRoutes);
app.use("/database", databaseRoutes);

app.post("/test-post", (req, res) =>
  res.json({ success: true, message: "Root POST test works" }),
);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
