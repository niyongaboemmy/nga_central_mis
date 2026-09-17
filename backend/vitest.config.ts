import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setupEnv.ts"],
    // Tests share one disposable MySQL schema (see scripts/reset-test-db.ts) —
    // run files serially for now to avoid cross-file interference on shared tables.
    fileParallelism: false,
    // Force every test file to share one module registry/process instead of
    // a fresh one each — with isolate left on, intermittent 404s were
    // observed on routes that exist in every registered request (a route
    // file re-imported/re-transformed for one test file's isolated context
    // occasionally raced with a stale dependency-graph snapshot). All tests
    // in this suite already assume a single shared `app`/`db` singleton, so
    // disabling isolation matches the intended execution model.
    isolate: false,
    testTimeout: 15000,
    include: ["src/**/*.test.ts"],
  },
});
