import dotenv from "dotenv";

dotenv.config();

// Point every test at the disposable `${DB_NAME}_test` schema instead of the
// real dev database — see scripts/reset-test-db.ts for how it's created.
process.env.DB_NAME = `${process.env.DB_NAME || "nga_central_mis"}_test`;
process.env.NODE_ENV = "test";

// The production pool intentionally uses a single connection; the test
// suite fires many rapid sequential Supertest requests against that same
// pool and needs more headroom to avoid connection-acquisition contention.
process.env.DB_CONNECTION_LIMIT = "10";
