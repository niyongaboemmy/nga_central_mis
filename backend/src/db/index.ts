import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // A single shared connection is deliberately conservative for the
  // production host's connection cap. The test suite fires many rapid
  // sequential Supertest requests (each opening its own ephemeral server)
  // against this same pool, and a limit of 1 caused intermittent flaky
  // failures under load — bump it via DB_CONNECTION_LIMIT for tests only
  // (see src/test/setupEnv.ts) without changing the production default.
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "1", 10),
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export const db = drizzle(connection, { schema, mode: "default" });
