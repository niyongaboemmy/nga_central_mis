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
import integrationRoutes from "./routes/integrationRoutes";
import notificationRoutes from "./routes/notifications";
import accessRoutes from "./routes/access";
import homeRoutes from "./routes/home";
import elearningRoutes from "./routes/elearning";
import { wireFilesModule } from "./services/files/assets";

// File previews + file text for the Lesson Studio (job handlers, context-pack source).
wireFilesModule();
import reminderRoutes from "./routes/reminders";
import activityRoutes from "./routes/activity";
import monitorRoutes from "./routes/monitor";
import officeHoursRoutes from "./routes/officeHours";
import desktopRoutes from "./routes/desktop";
import { jwks, ssoIssuer } from "./services/sso/signingKey";

const app = express();

// nginx terminates TLS on the same box and forwards X-Forwarded-For. Without this,
// req.ip is always 127.0.0.1 (plan G1), and analytics, rate limits and logs all see one client.
app.set("trust proxy", "loopback");

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

// Platform activity collection (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §5). Mounted
// before the 30 MB JSON parser below: it brings its own small parsers (sendBeacon
// posts text/plain, relays post gzip), and it is far too hot to log request bodies.
app.use("/activity", activityRoutes);

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

// NGA Desktop downloads, update checks and release files (public; stats need ANALYTICS_VIEW).
app.use("/desktop", desktopRoutes);

// SSO discovery + signing keys (public). Apps verify single-sign-out
// logout tokens against the JWKS (services/sso/backchannelLogout.ts).
app.get("/.well-known/jwks.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json(jwks());
});
app.get("/.well-known/openid-configuration", (_req, res) => {
  const issuer = ssoIssuer();
  res.set("Cache-Control", "public, max-age=3600");
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/sso/authorize`,
    token_endpoint: `${issuer}/sso/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    backchannel_logout_supported: true,
    backchannel_logout_session_supported: false,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
});

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
app.use("/elearning", elearningRoutes);
app.use("/database", databaseRoutes);
app.use("/notifications", notificationRoutes);
// Access control v2 (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md) -- snapshot,
// Access Studio and app-to-MIS endpoints.
app.use("/access", accessRoutes);
// Home -- the post-login overview across every module (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md).
app.use("/home", homeRoutes);
// Reminder Hub -- timetable/deadline reminders by Web Push, in-app and
// calendar feed (REMINDERS_SOLUTION_PROPOSAL.md).
app.use("/reminders", reminderRoutes);
// Machine-to-machine, IntegrationToken-authenticated, read-only. Mounted last
// among the API routers so it is obvious it shares no middleware with the
// user-session routes above it.
app.use("/integrations", integrationRoutes);
// Usage analytics & live monitoring console (ANALYTICS_* capabilities).
app.use("/monitor", monitorRoutes);
// Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md).
app.use("/office-hours", officeHoursRoutes);

app.post("/test-post", (req, res) =>
  res.json({ success: true, message: "Root POST test works" }),
);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
