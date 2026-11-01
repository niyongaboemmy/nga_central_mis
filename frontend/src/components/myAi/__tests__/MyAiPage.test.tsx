import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyAiPage from "../MyAiPage";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../../services/api", () => ({
  default: {
    get: (...a: unknown[]) => http.get(...a),
    post: (...a: unknown[]) => http.post(...a),
    put: (...a: unknown[]) => http.put(...a),
    patch: (...a: unknown[]) => http.patch(...a),
    delete: (...a: unknown[]) => http.delete(...a),
  },
}));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

const provider = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id,
  label,
  keyUrl: `https://${id}.example/keys`,
  keySteps: ["Sign in", "Create a key", "Paste it here"],
  freeTier: false,
  oauth: null,
  privacyNote: `${label} privacy note.`,
  defaultModel: "gpt-4o-mini",
  allowed: true,
  blockedReason: null,
  ...over,
});

const credential = (over: Record<string, unknown> = {}) => ({
  id: 7,
  provider: "openai",
  providerLabel: "OpenAI",
  authType: "api_key",
  label: "OpenAI",
  baseUrl: null,
  keyHint: "x9Qa",
  status: "active",
  statusDetail: null,
  allowedApps: ["mis", "tm", "tupo", "da"],
  dailyRequestCap: null,
  freeOnly: false,
  models: ["gpt-4o-mini"],
  balance: null,
  lastValidatedAt: "2026-11-01T08:00:00Z",
  lastUsedAt: null,
  createdAt: "2026-11-01T08:00:00Z",
  ...over,
});

const view = (over: Record<string, unknown> = {}) => ({
  blocked: null,
  me: { isStudent: false, hasPersonalCap: true },
  policy: { fallbackToSchool: true, inAssessments: "never", studentDailyLimit: null },
  apps: ["mis", "tm", "tupo", "da"],
  tasks: ["assist", "author", "complete", "hint", "translate"],
  providers: [
    provider("openai", "OpenAI"),
    provider("openrouter", "OpenRouter", { freeTier: true, oauth: "openrouter" }),
    provider("gemini", "Google Gemini", { allowed: false, blockedReason: "Google's Gemini API terms require users to be 18 or older." }),
  ],
  credentials: [],
  routes: [],
  catalogDate: "2026-11-01",
  ...over,
});

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });

/** Answers GETs by URL; the AI policy says whether the viewer is a super admin. */
const serve = (myAi: unknown, canManage = false) =>
  http.get.mockImplementation((url: string) => {
    if (url === "/my-ai") return ok(myAi);
    if (url === "/ai-policy") return ok({ policy: { enabled: true, apps: {} }, me: { hasAiUse: true, canManage } });
    if (url.startsWith("/my-ai/credentials/")) return ok([{ id: "gpt-4o-mini", name: "GPT-4o mini", json: true, cost_in: 0.15, cost_out: 0.6 }]);
    if (url === "/my-ai/resolved") return ok({ enabled: true, byTask: {}, choices: [] });
    if (url === "/my-ai/costs")
      return ok({
        month: { inputTokens: 640000, outputTokens: 385000 },
        catalogDate: "2026-11-01",
        models: [
          { provider: "anthropic", providerLabel: "Anthropic", model: "claude-haiku-5-5", name: "Claude Haiku 5.5", cost_in: 0.1, cost_out: 0.5, monthlyUsd: 0.2565 },
          { provider: "anthropic", providerLabel: "Anthropic", model: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", cost_in: 2, cost_out: 10, monthlyUsd: 5.13 },
        ],
      });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <MyAiPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(http).forEach((f) => f.mockReset());
  toast.mockReset();
});

describe("My AI page", () => {
  it("shows why My AI is unavailable, with a Settings link for a super admin", async () => {
    serve(view({ blocked: { code: "PERSONAL_OFF", message: "My AI is turned off for the school." } }), true);
    renderPage();
    expect(await screen.findByText("My AI is turned off for the school.")).toBeInTheDocument();
    expect(screen.getByText(/Everyone uses School AI, which is free/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Settings → AI/ })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: /Add AI/ })).toBeNull();
  });

  it("empty state, then the wizard adds a key and points everything at it", async () => {
    serve(view());
    renderPage();
    expect(await screen.findByText("Add your first AI")).toBeInTheDocument();
    expect(screen.getByText(/School AI \(free\)/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Add AI/ })[0]);
    const dialog = await screen.findByRole("dialog");
    // A provider students can't use is shown disabled, with the reason.
    expect(within(dialog).getByRole("button", { name: /Google Gemini/ })).toBeDisabled();
    expect(within(dialog).getByText(/18 or older/)).toBeInTheDocument();
    // The subscriptions helper says plainly that they can't be used here.
    fireEvent.click(within(dialog).getByRole("button", { name: /ChatGPT Plus/ }));
    expect(within(dialog).getAllByText(/don't include API use/).length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: /^OpenAI/ }));
    const getKey = within(dialog).getByRole("link", { name: /Get a key/ });
    expect(getKey).toHaveAttribute("rel", "noopener noreferrer");
    expect(getKey).toHaveAttribute("target", "_blank");
    const keyInput = within(dialog).getByLabelText("API key");
    expect(keyInput).toHaveAttribute("type", "password");

    http.post.mockImplementation((url: string) => (url === "/my-ai/credentials" ? ok(credential()) : Promise.reject(new Error(url))));
    http.put.mockImplementation(() => ok([]));
    fireEvent.change(keyInput, { target: { value: "sk-test-1234567890" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Check and save/ }));

    await waitFor(() => expect(http.post).toHaveBeenCalledWith("/my-ai/credentials", expect.objectContaining({ provider: "openai", apiKey: "sk-test-1234567890" }), expect.anything()));
    expect(await within(dialog).findByText(/It works, with 1 model available/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Everything/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Finish" }));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith("/my-ai/routes", { routes: [{ app: "*", task: "*", credentialId: 7, model: "gpt-4o-mini", fallback: "school" }] }),
    );
  });

  it("a key card shows its health and deletes only after confirming", async () => {
    serve(
      view({
        credentials: [credential({ status: "no_credit", statusDetail: "The key works but the account has no credit.", balance: { is_available: false, balance_infos: [{ currency: "USD", total_balance: "0.00" }] } })],
      }),
    );
    renderPage();
    const card = await screen.findByRole("article", { name: "OpenAI" });
    expect(within(card).getByText("Out of credit")).toBeInTheDocument();
    expect(within(card).getByText(/has no credit/)).toBeInTheDocument();
    expect(within(card).getByText("0.00 USD balance")).toBeInTheDocument();
    expect(within(card).getByText(/…x9Qa/)).toBeInTheDocument();

    http.delete.mockImplementation(() => Promise.resolve({ data: { success: true } }));
    fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(http.delete).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete key" }));
    await waitFor(() => expect(http.delete).toHaveBeenCalledWith("/my-ai/credentials/7"));
  });

  it("OpenRouter connects in one click with a callback on this site", async () => {
    serve(view());
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, origin: "https://mis.example", assign } });
    http.post.mockImplementation((url: string) => (url === "/my-ai/oauth/openrouter/start" ? ok({ url: "https://openrouter.ai/auth?x=1" }) : Promise.reject(new Error(url))));
    try {
      renderPage();
      fireEvent.click((await screen.findAllByRole("button", { name: /Add AI/ }))[0]);
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /^OpenRouter/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Connect OpenRouter" }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith("https://openrouter.ai/auth?x=1"));
      expect(http.post).toHaveBeenCalledWith("/my-ai/oauth/openrouter/start", { callbackUrl: "https://mis.example/my-ai/openrouter-callback" });
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
  it("'I already pay for…' gives each subscription's honest options and what a key costs", async () => {
    serve(view({ blocked: { code: "PERSONAL_OFF", message: "My AI is turned off for the school." } }));
    renderPage();
    const card = await screen.findByRole("region", { name: /I already pay for/ });
    for (const plan of ["ChatGPT Plus / Pro", "Claude Pro / Max / Team", "Gemini / Google AI Pro", "GitHub Copilot"]) {
      expect(within(card).getByRole("region", { name: plan })).toBeInTheDocument();
    }
    expect(within(card).getByText(/include monthly API credits/)).toBeInTheDocument();
    expect(within(card).getByText(/Gemini and NotebookLM free/)).toBeInTheDocument();
    const table = await within(card).findByRole("table", { name: /heavy month/ });
    expect(within(table).getByRole("row", { name: /Claude Haiku 5.5.*\$0\.26/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Claude Sonnet 5.5.*\$5\.13/ })).toBeInTheDocument();
  });
});
