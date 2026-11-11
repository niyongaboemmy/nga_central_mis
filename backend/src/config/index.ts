import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
  imap?: {
    host: string;
    port: number;
  };
  pop3?: {
    host: string;
    port: number;
  };
  from: string;
  fromName: string;
}

interface Config {
  port: number;
  nodeEnv: string;
  envType: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  database: DatabaseConfig;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  cookieDomain: string;
  logLevel: string;
  email: EmailConfig;
  otp: {
    length: number;
    expiryMinutes: number;
  };
  google: {
    clientId: string;
  };
}

/**
 * Secrets never have a fallback in code (MIS-A18). In production a missing one stops the
 * process at startup with the list of what is missing; development and tests get
 * harmless local placeholders only (MAMP's root/root, no SMTP password).
 */
const PRODUCTION_SECRETS = ["JWT_SECRET", "DB_PASSWORD", "SMTP_PASS"] as const;

type Env = Record<string, string | undefined>;

export function isProductionEnv(env: Env = process.env): boolean {
  return (env.ENV_TYPE || "development") === "production" || env.NODE_ENV === "production";
}

/** The secrets this environment must provide but doesn't (empty = fine). */
export function missingRequiredSecrets(env: Env = process.env): string[] {
  const required: string[] = ["JWT_SECRET"];
  if (isProductionEnv(env)) required.push(...PRODUCTION_SECRETS.filter((k) => k !== "JWT_SECRET"));
  else if ((env.DB_CONNECTION || "local") === "remote") required.push("DB_PASSWORD_REMOTE");
  return [...new Set(required)].filter((k) => !String(env[k] ?? "").trim());
}

/** Throws (startup) when a required secret is missing. */
export function assertRequiredSecrets(env: Env = process.env): void {
  const missing = missingRequiredSecrets(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}` +
        (isProductionEnv(env) ? " (production never falls back to built-in secrets)" : ""),
    );
  }
}

// Database configuration - supports local and remote switching
const dbConnection = process.env.DB_CONNECTION || "local";

const databaseConfig: DatabaseConfig =
  dbConnection === "remote"
    ? {
        host: process.env.DB_HOST_REMOTE || "mysql.uk.cloudlogin.co",
        port: parseInt(process.env.DB_PORT_REMOTE || "3306", 10),
        username: process.env.DB_USERNAME_REMOTE || "ngarw_mis",
        password: process.env.DB_PASSWORD_REMOTE || "",
        name: process.env.DB_NAME_REMOTE || "ngarw_mis",
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "8889", 10),
        username: process.env.DB_USERNAME || "root",
        password: process.env.DB_PASSWORD || "root",
        name: process.env.DB_NAME || "nga_central_mis",
      };

// Development configuration
const developmentConfig: Config = {
  port: parseInt(process.env.PORT || "5001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  envType: "development",
  jwtSecret: process.env.JWT_SECRET || "dev_secret_key_change_in_production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  database: databaseConfig,
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5001",
          "https://nga.ac.rw",
          "https://www.nga.ac.rw",
        ],
    credentials: process.env.CORS_CREDENTIALS === "true",
  },
  cookieDomain: process.env.COOKIE_DOMAIN || "localhost",
  logLevel: process.env.LOG_LEVEL || "debug",
  email: {
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "",
    fromName: process.env.EMAIL_FROM_NAME || "NGA MIS Dev",
  },
  otp: {
    length: parseInt(process.env.OTP_LENGTH || "6"),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10"),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },
};

// Production configuration - uses remote database and mail server
const productionConfig: Config = {
  port: parseInt(process.env.PORT || "5001", 10),
  nodeEnv: process.env.NODE_ENV || "production",
  envType: "production",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  database: {
    host: process.env.DB_HOST || "mysql.uk.cloudlogin.co",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    username: process.env.DB_USERNAME || "ngarw_mis",
    password: process.env.DB_PASSWORD || "", // required: assertRequiredSecrets()
    name: process.env.DB_NAME || "ngarw_nga_central_mis",
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : [
          "https://mis.nga.ac.rw",
          "https://www.nga.ac.rw",
          "http://localhost:5001",
        ],
    credentials: true,
  },
  cookieDomain: process.env.COOKIE_DOMAIN || ".nga.ac.rw",
  logLevel: process.env.LOG_LEVEL || "info",
  email: {
    smtp: {
      host: process.env.SMTP_HOST || "mail.hackflix.net",
      port: parseInt(process.env.SMTP_PORT || "465"),
      user: process.env.SMTP_USER || "mis@nga.ac.rw",
      pass: process.env.SMTP_PASS || "", // required: assertRequiredSecrets()
    },
    imap: {
      host: process.env.IMAP_HOST || "mail.hackflix.net",
      port: parseInt(process.env.IMAP_PORT || "993"),
    },
    pop3: {
      host: process.env.POP3_HOST || "mail.hackflix.net",
      port: parseInt(process.env.POP3_PORT || "995"),
    },
    from: process.env.EMAIL_FROM || "mis@nga.ac.rw",
    fromName: process.env.EMAIL_FROM_NAME || "NGA Central MIS",
  },
  otp: {
    length: parseInt(process.env.OTP_LENGTH || "6"),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10"),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },
};

// Determine which configuration to use based on ENV_TYPE
const envType = process.env.ENV_TYPE || "development";

const config = envType === "production" ? productionConfig : developmentConfig;

// Validate required environment variables (fail fast).
assertRequiredSecrets(process.env);

// Log environment info
console.log(`🚀 Running in ${config.envType} mode`);
console.log(
  `📦 Database: ${config.database.host}:${config.database.port}/${config.database.name} (${dbConnection} connection)`,
);
console.log(`📧 Email: ${config.email.smtp.host}:${config.email.smtp.port}`);

export default config;
export { DatabaseConfig, EmailConfig };
