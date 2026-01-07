import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import config from "./config";
import logger from "./utils/logger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import permissionRoutes from "./routes/permissions";
import healthRoutes from "./routes/health";
import documentRoutes from "./routes/documents";

dotenv.config();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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
    `Server running on port ${config.port} in ${config.nodeEnv} mode`
  );
});
