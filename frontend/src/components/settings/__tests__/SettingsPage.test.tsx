import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "../SettingsPage";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";

const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());

// The HTTP layer under api/aiPolicy.ts: GET and PUT /ai-policy.
vi.mock("../../../services/api", () => ({ default: { get: (...a: unknown[]) => api.get(...a), put: (...a: unknown[]) => api.save(...a) } }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

const policy = (over: Record<string, unknown> = {}) => ({
  v: 4,
  enabled: true,
  apps: { mis: true, tm: true, tmcode: true, desktop: true, tupo: true, da: true },
  features: { grading: false },
  assessments: "teacher",
  thirdPartyExtensions: false,
  updated_at: "2026-10-25T08:00:00Z",
  updated_by: 1,
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <SettingsPage />
      </ConfirmProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  api.get.mockReset();
  api.save.mockReset();
  toast.mockReset();
});

describe("Settings -> AI", () => {
  it("a super admin turning AI off is asked first, with the list of what turns off, then saves", async () => {
    api.get.mockResolvedValue({ data: { data: { policy: policy(), me: { hasAiUse: true, canManage: true }, updatedByName: "Ada Owner" } } });
    api.save.mockResolvedValue({ data: { data: { policy: policy({ enabled: false, v: 5 }), updatedByName: "Ada Owner" } } });
    renderPage();

    expect(await screen.findByText(/Last changed/)).toHaveTextContent("Ada Owner");
    expect(screen.getByRole("switch", { name: "Third-party AI tools for students" })).toHaveAttribute("aria-checked", "false");
    // The fixture predates the staff switch: it reads as on.
    expect(screen.getByRole("switch", { name: "Third-party AI tools for staff (grading)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("link", { name: /Access Studio/ })).toHaveAttribute("href", "/access-studio?tab=roles&cap=AI_USE");

    fireEvent.click(screen.getByRole("switch", { name: "AI for the whole school" }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Turn AI off for the whole school/)).toBeInTheDocument();
    expect(within(dialog).getByText(/for students and for staff, including grading \(Claude Code, Codex, Gemini CLI, Copilot\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn AI off" }));

    await waitFor(() => expect(api.save).toHaveBeenCalledWith("/ai-policy", expect.objectContaining({ enabled: false })));
    expect(await screen.findByText(/AI is turned off for the school/)).toBeInTheDocument();
  });

  it("the staff third-party switch saves thirdPartyExtensionsStaff without a confirm", async () => {
    api.get.mockResolvedValue({ data: { data: { policy: policy({ thirdPartyExtensionsStaff: true }), me: { hasAiUse: true, canManage: true } } } });
    api.save.mockResolvedValue({ data: { data: { policy: policy({ thirdPartyExtensionsStaff: false, v: 5 }), updatedByName: null } } });
    renderPage();

    const staff = await screen.findByRole("switch", { name: "Third-party AI tools for staff (grading)" });
    expect(screen.getByText(/draft grades for their review/)).toBeInTheDocument();
    fireEvent.click(staff);
    expect(staff).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith("/ai-policy", expect.objectContaining({ thirdPartyExtensionsStaff: false, thirdPartyExtensions: false })),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("anyone else sees whether AI is available to them, not the controls", async () => {
    api.get.mockResolvedValue({ data: { data: { policy: policy({ enabled: false }), me: { hasAiUse: false, canManage: false } } } });
    renderPage();
    expect(await screen.findByText("AI is turned off for the school.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("My AI rules: turning it on and limiting students' providers saves policy.personal; Gemini/DeepSeek are never offered to students", async () => {
    api.get.mockResolvedValue({ data: { data: { policy: policy(), me: { hasAiUse: true, canManage: true } } } });
    api.save.mockResolvedValue({ data: { data: { policy: policy({ v: 5 }), updatedByName: null } } });
    renderPage();

    fireEvent.click(await screen.findByRole("switch", { name: "My AI for the school" }));
    fireEvent.click(screen.getByRole("switch", { name: "Students may add their own keys" }));
    const students = screen.getByRole("group", { name: "Providers for students" });
    expect(within(students).getByRole("checkbox", { name: "Google Gemini" })).toBeDisabled();
    expect(within(students).getByRole("checkbox", { name: "DeepSeek" })).toBeDisabled();
    expect(within(students).getByText(/18 or older/)).toBeInTheDocument();
    fireEvent.click(within(students).getByRole("checkbox", { name: "Groq" }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        "/ai-policy",
        expect.objectContaining({
          personal: expect.objectContaining({ enabled: true, students: expect.objectContaining({ allowed: true, providers: ["openrouter", "groq"] }) }),
        }),
      ),
    );
  });

  it("an unchanged My AI section is not sent, and the usage board shows aggregates when the server allows it", async () => {
    api.get.mockImplementation((url: string) =>
      url === "/my-ai/admin/usage"
        ? Promise.resolve({
            data: {
              data: {
                days: 30,
                byRoute: [
                  { app: "mis", route: "school", calls: 40, failures: 1 },
                  { app: "mis", route: "personal", calls: 12, failures: 0 },
                ],
                byProvider: [{ provider: "openai", route: "personal", calls: 12, failures: 0, tokens: 3400 }],
                keys: [{ provider: "openai", status: "active", count: 3 }],
                peopleWithKeys: 2,
                schoolQuotas: [{ provider: "gemini", daily_limit: 250, used_today: 10, remaining: 240, bulk_remaining: 200, resets_at: "2026-11-02T00:00:00Z" }],
                vaultConfigured: true,
              },
            },
          })
        : Promise.resolve({ data: { data: { policy: policy(), me: { hasAiUse: true, canManage: true } } } }),
    );
    api.save.mockResolvedValue({ data: { data: { policy: policy({ v: 5 }), updatedByName: null } } });
    renderPage();

    const board = await screen.findByRole("region", { name: /Providers & usage/ });
    expect(within(board).getByText("People with keys").nextSibling).toHaveTextContent("2");
    const byApp = within(board).getByRole("table", { name: /Calls by app/ });
    expect(within(byApp).getByRole("row", { name: /MIS 40 12 1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "AI grading on submit" }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("personal");
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("external");
  });

  it("Your own Claude / ChatGPT: off by default, explained, and saved as policy.external", async () => {
    api.get.mockResolvedValue({ data: { data: { policy: policy(), me: { hasAiUse: true, canManage: true } } } });
    api.save.mockResolvedValue({ data: { data: { policy: policy({ v: 5 }), updatedByName: null } } });
    renderPage();

    const card = await screen.findByRole("region", { name: /Your own Claude \/ ChatGPT/ });
    const handoff = within(card).getByRole("switch", { name: "Open in my AI + paste back" });
    const connector = within(card).getByRole("switch", { name: "NGA connector for Claude / ChatGPT" });
    // A policy saved before these existed reads as all off; pupil names default to consent-only.
    expect(handoff).toHaveAttribute("aria-checked", "false");
    expect(connector).toHaveAttribute("aria-checked", "false");
    expect(within(card).getByText(/nothing is sent automatically/)).toBeInTheDocument();
    const pupils = within(card).getByLabelText("Pupil names and records", { selector: "select" }) as HTMLSelectElement;
    expect(pupils.value).toBe("with_consent");

    fireEvent.click(handoff);
    fireEvent.change(pupils, { target: { value: "never" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith("/ai-policy", expect.objectContaining({ external: { connector: false, handoff: true, pupilNames: "never" } })),
    );
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("personal");
  });
});
