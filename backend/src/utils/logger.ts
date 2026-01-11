import winston from "winston";
import fs from "fs";
import path from "path";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Check if file system access is available (not in serverless environments like Vercel)
const canWriteFiles = () => {
  try {
    // Try to create logs directory
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Try to write a test file
    const testFile = path.join(logsDir, "test.log");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    return false;
  }
};

const transports: winston.transport[] = [];

// Only add file transports if file system access is available
if (canWriteFiles()) {
  transports.push(
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: "logs/combined.log" })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "nga-central-mis" },
  transports,
});

// Always add console transport for development and when file logging is not available
if (process.env.NODE_ENV !== "production" || transports.length === 0) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;
