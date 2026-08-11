import path from "path";

const config = {
  port: parseInt(process.env.PORT || "5004", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  apiKey: process.env.FILE_SERVER_API_KEY || "",
  storageRoot: path.resolve(process.env.STORAGE_ROOT || "./storage"),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "52428800", 10), // 50MB
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : [],
};

if (config.nodeEnv === "production" && !config.apiKey) {
  throw new Error(
    "FILE_SERVER_API_KEY must be set in production — this service has no other access control.",
  );
}

export default config;
