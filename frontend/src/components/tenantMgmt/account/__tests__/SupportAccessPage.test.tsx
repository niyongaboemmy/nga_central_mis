import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SupportAccessPage from "../SupportAccessPage";
import { iso } from "./fixtures";

const api = vi.hoisted(() => ({ supportSessions: vi.fn(), grantSupport: vi.fn(), revokeSupport: vi.fn() }));
vi.mock("../../../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../../../api/tenantMgmt")>()), tenantApi: api }));
vi.mock("../../../../hooks/useAccess", () => ({ useAccess: () => ({ loading: false, can: () => true }) }));

const ACTIVE = { id: 5, mode: "WRITE" as const, reason: "Fix timetable", startsAt: iso(-0.1), expiresAt: iso(0.2), revokedAt: null, openedBy: "Ana (platform)", openedAt: iso(-0.05), active: true };
const PAST = { id: 4, mode: "READ" as const, reason: null, startsAt: iso(-3), expiresAt: iso(-2.9), revokedAt: null, openedBy: null, openedAt: null, active: false };

const renderPage = () =>
  render(
    <MemoryRouter>
      <SupportAccessPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.supportSessions.mockReset().mockResolvedValue([ACTIVE, PAST]);
  api.grantSupport.mockReset().mockResolvedValue({ ...ACTIVE, id: 6 });
  api.revokeSupport.mockReset().mockResolvedValue({ ...ACTIVE, revokedAt: iso(0) });
});

describe("SupportAccessPage", () => {
  it("grants support access with the chosen hours, mode and reason", async () => {
    renderPage();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    expect(screen.getByTestId("hours-label")).toHaveTextContent(/^6 h · until/);
    fireEvent.click(screen.getByRole("radio", { name: /edit/i }));
    expect(screen.getByRole("note")).toHaveTextContent(/can change data/i);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: " Import help " } });
    fireEvent.click(screen.getByRole("button", { name: /grant access/i }));
    await waitFor(() => expect(api.grantSupport).toHaveBeenCalledWith({ hours: 6, mode: "WRITE", reason: "Import help" }));
    expect(await screen.findByText("Granted")).toBeInTheDocument();
  });

  it("shows the active session with its countdown and revokes it after confirming", async () => {
    renderPage();
    const card = await screen.findByTestId("session-5");
    expect(card).toHaveTextContent("Ana (platform)");
    expect(screen.getByRole("img", { name: /hours left/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
    expect(await screen.findByText("Revoke support access?")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /^revoke$/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.revokeSupport).toHaveBeenCalledWith(5));
  });

  it("keeps past sessions collapsed", async () => {
    renderPage();
    const toggle = await screen.findByRole("button", { name: /past \(1\)/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
