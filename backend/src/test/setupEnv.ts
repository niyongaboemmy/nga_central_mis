import dotenv from "dotenv";

dotenv.config();

// Point every test at the disposable `${DB_NAME}_test` schema instead of the
// real dev database — see scripts/reset-test-db.ts for how it's created.
// TEST_DB_NAME lets a second worktree run the suite against its own clone
// without dropping the schema another checkout is testing against.
// Idempotent: with isolate:false this file runs again for every test file in the same
// process, and the database pool is created lazily, so "_test" must not pile up.
const baseDbName = process.env.DB_NAME || "nga_central_mis";
process.env.DB_NAME = process.env.TEST_DB_NAME || (baseDbName.endsWith("_test") ? baseDbName : `${baseDbName}_test`);
process.env.NODE_ENV = "test";
// The multi-tenancy control plane of the test run (tenancy/registry.ts). Never the
// dev one; while it isn't provisioned the registry answers "tenant 1 only".
process.env.PLATFORM_DB_NAME = process.env.TEST_PLATFORM_DB_NAME || `${process.env.DB_NAME}_platform`;

// The production pool intentionally uses a single connection; the test
// suite fires many rapid sequential Supertest requests against that same
// pool and needs more headroom to avoid connection-acquisition contention.
process.env.DB_CONNECTION_LIMIT = "10";

// Tests must never reach a real AI vendor: a stray real call is slow, flaky (free-tier
// rate limits) and spends the school's quota. Tests that need AI install deterministic
// providers with installFakeAI() (src/test/fakeAI.ts). TEST_ALLOW_REAL_AI=1 opts out.
if (process.env.TEST_ALLOW_REAL_AI !== "1") {
  for (const key of ["GEMINI_API_KEY", "GROQ_API_KEY", "GLM_API_KEY", "OPENAI_API_KEY"]) delete process.env[key];
}
