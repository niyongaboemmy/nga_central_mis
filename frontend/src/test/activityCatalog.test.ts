import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import catalog from "../activity/mis.catalog.json";
import { _resetActivityForTests, initActivity, resolveRoute, _trackerForTests } from "../vendor/nga-activity";

/**
 * Every MIS route must resolve to a named feature (plan §5.4), and the frontend copy of
 * the catalog must equal the backend's (which is what gets published to AnalyticsFeature).
 */
describe("MIS activity catalog", () => {
  it("matches the backend source of truth", () => {
    const backend = fs.readFileSync(path.resolve(__dirname, "../../../backend/src/services/activity/catalogs/mis.json"), "utf8");
    const front = fs.readFileSync(path.resolve(__dirname, "../activity/mis.catalog.json"), "utf8");
    expect(front).toBe(backend);
  });

  it("names every <Route path> in App.tsx", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
    const paths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*" && !p.startsWith("/details") && p !== "/");
    // Nested under /all-teachers-sow/* — resolve as children.
    const resolved = [...new Set(paths)].map((p) => p.replace(/\/\*$/, ""));
    _resetActivityForTests();
    initActivity({ app: "mis", endpoint: "/x", configUrl: "/x", catalog: (catalog as any).features });
    const t = _trackerForTests()!;
    const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, "123");
    const missing = resolved.filter((p) => resolveRoute("mis", t.compiled, concrete(p)).feature === "mis.other");
    _resetActivityForTests();
    expect(missing).toEqual([]);
  });

  it("has unique feature keys", () => {
    const keys = (catalog as any).features.map((f: any) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
