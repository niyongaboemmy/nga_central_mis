import { describe, expect, it, vi } from "vitest";

// No server here: the models endpoint fails, so a key's own model list is used.
vi.mock("../../../services/api", () => ({ default: { get: () => Promise.reject(new Error("offline")) } }));
import { answeredByText, aiMetaOf, balanceText, modelDescription } from "../../../api/myAi";
import { gridFromRoutes, inheritedCell, parseCellValue, routesFromGrid, statusSummary } from "../routesModel";
import { routesForUse } from "../AddAiWizard";
import type { AiPersonalRoute, MyAiCredential } from "../../../api/myAi";

const cred = (over: Partial<MyAiCredential> = {}): MyAiCredential => ({
  id: 7,
  provider: "openai",
  providerLabel: "OpenAI",
  authType: "api_key",
  label: "OpenAI",
  baseUrl: null,
  keyHint: "abcd",
  status: "active",
  statusDetail: null,
  allowedApps: ["mis", "tm", "tupo", "da"],
  dailyRequestCap: null,
  freeOnly: false,
  models: ["gpt-4o-mini", "gpt-4.1"],
  balance: null,
  lastValidatedAt: null,
  lastUsedAt: null,
  createdAt: "2026-11-01T08:00:00Z",
  ...over,
});

const route = (over: Partial<AiPersonalRoute>): AiPersonalRoute => ({ app: "*", task: "*", credentialId: 7, provider: "openai", model: "gpt-4o-mini", fallback: "school", status: "active", ...over });

describe("My AI grid", () => {
  it("round-trips routes and keeps a row's fallback", () => {
    const routes = [route({}), route({ app: "tm", task: "author", model: "gpt-4.1", fallback: "none" })];
    const g = gridFromRoutes(routes);
    expect(g.fallback.author).toBe("none");
    expect(routesFromGrid(g)).toEqual([
      { app: "*", task: "*", credentialId: 7, model: "gpt-4o-mini", fallback: "school" },
      { app: "tm", task: "author", credentialId: 7, model: "gpt-4.1", fallback: "none" },
    ]);
  });

  it("an empty cell inherits like the server matches: (app,*) > (*,task) > (*,*)", () => {
    const g = gridFromRoutes([route({}), route({ app: "*", task: "assist", model: "gpt-4.1" })]);
    expect(inheritedCell(g, "mis", "assist")?.model).toBe("gpt-4.1");
    expect(inheritedCell(g, "mis", "author")?.model).toBe("gpt-4o-mini");
    expect(inheritedCell(gridFromRoutes([]), "mis", "author")).toBeNull();
  });

  it("parses picker values whose model ids hold colons", () => {
    expect(parseCellValue("12:meta-llama/llama-3.3-70b-instruct:free")).toEqual({ credentialId: 12, model: "meta-llama/llama-3.3-70b-instruct:free" });
    expect(parseCellValue("")).toBeNull();
  });

  it("summarises what answers what in the MIS", () => {
    expect(statusSummary([], [cred()]).mine).toBe(false);
    const s = statusSummary([route({ task: "author" })], [cred({ label: "Work key" })]);
    expect(s.parts).toEqual([{ who: "Work key", model: "gpt-4o-mini", tasks: ["Writing & generators"], attention: false }]);
    expect(s.restSchool).toBe(true);
  });

  it("'use this key for writing' keeps other choices and adds (*, author)", async () => {
    const existing = [route({ credentialId: 3, task: "assist", model: "x" })];
    // No models endpoint in this test: the key's own list is used.
    const out = await routesForUse(cred(), "author", existing, undefined);
    expect(out).toEqual([
      { app: "*", task: "assist", credentialId: 3, model: "x", fallback: "school" },
      { app: "*", task: "author", credentialId: 7, model: "gpt-4o-mini", fallback: "school" },
    ]);
    expect(await routesForUse(cred(), "later", existing)).toBeNull();
  });
});

describe("My AI labels", () => {
  it("says who answered, or why School AI did", () => {
    expect(answeredByText({ route: "personal", label: "My Claude", provider: "anthropic", model: "claude-haiku-5-5" })?.text).toBe("via My Claude · claude-haiku-5-5");
    expect(answeredByText({ route: "personal", label: "OpenAI", model: "gpt-4.1" })?.text).toBe("via My OpenAI · gpt-4.1");
    expect(answeredByText({ route: "school", fallbackFrom: "AI_KEY_NO_CREDIT", label: "OpenAI" })).toEqual({ text: "Your key was out of credit (OpenAI); School AI answered.", tone: "fallback" });
    expect(answeredByText({ route: "school", reason: "NO_ROUTE" })?.tone).toBe("school");
    expect(answeredByText(null)).toBeNull();
    expect(aiMetaOf({ data: { ai: { route: "school" } } })).toEqual({ route: "school" });
    expect(aiMetaOf({ ai: { route: "personal" } })).toEqual({ route: "personal" });
  });

  it("shows balances and model facts", () => {
    expect(balanceText({ limit_remaining: 4.5 })).toBe("$4.50 left on this key");
    expect(balanceText({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "2.10" }] })).toBe("2.10 USD balance");
    expect(balanceText(null)).toBeNull();
    expect(modelDescription({ id: "a", name: "A", free: true, json: true })).toBe("Free · JSON");
    expect(modelDescription({ id: "b", name: "B", unknown: true })).toBe("capabilities unknown");
    expect(modelDescription({ id: "c", name: "C", cost_in: 0.15, cost_out: 0.6 })).toBe("$0.15 in · $0.60 out per 1M tokens");
  });
});
