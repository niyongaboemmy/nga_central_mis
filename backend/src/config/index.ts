import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  logLevel: string;
  email: {
    smtp: {
      host: string;
      port: number;
      user: string;
      pass: string;
    };
    from: string;
    fromName: string;
  };
  otp: {
    length: number;
    expiryMinutes: number;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || "5001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "default_secret_change_in_production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "8889", 10),
    username: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "root",
    name: process.env.DB_NAME || "nga_central_mis",
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:3000", "http://localhost:5173"],
    credentials: process.env.CORS_CREDENTIALS === "true",
  },
  logLevel: process.env.LOG_LEVEL || "info",
  email: {
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "",
    fromName: process.env.EMAIL_FROM_NAME || "NGA MIS",
  },
  otp: {
    length: parseInt(process.env.OTP_LENGTH || "6"),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10"),
  },
};

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

export default config;
