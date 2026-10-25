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
});
