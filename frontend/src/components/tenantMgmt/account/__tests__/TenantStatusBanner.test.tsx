import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TenantStatusBanner, { isSupportToken, readTokenClaims } from "../TenantStatusBanner";
import { __resetPackageStore } from "../usePackage";
import { METERS } from "./fixtures";

const api = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../../../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../../../api/tenantMgmt")>()), tenantApi: api }));

const ENT = { pkg: "gold", unrestricted: false, apps: [], features: [], limits: {} };
const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.s`;

const renderBanner = () =>
  render(
    <MemoryRouter>
      <TenantStatusBanner />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("token", jwt({ sub: 1, tid: 7 }));
  __resetPackageStore();
  api.status.mockReset();
});

describe("TenantStatusBanner", () => {
  it("renders nothing for an ACTIVE school without warnings", async () => {
    api.status.mockResolvedValue({ status: "ACTIVE", graceUntil: null, daysLeft: null, warnings: [], entitlements: ENT });
    const { container } = renderBanner();
    await waitFor(() => expect(api.status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("GRACE: amber bar with the days-left ring and a Pay link", async () => {
    api.status.mockResolvedValue({ status: "GRACE", graceUntil: "2026-11-20", daysLeft: 9, warnings: [], entitlements: ENT });
    renderBanner();
    expect(await screen.findByRole("alert")).toHaveTextContent("Subscription expired");
    expect(screen.getByRole("img", { name: /9 days left/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pay/i })).toHaveAttribute("href", "/settings/subscription");
  });

  it("limit chips at >= 90 %, dismissible for the day", async () => {
    api.status.mockResolvedValue({ status: "ACTIVE", graceUntil: null, daysLeft: null, warnings: METERS, entitlements: ENT });
    renderBanner();
    expect(await screen.findByText(/Meeting minutes almost at its limit/)).toBeInTheDocument();
    expect(screen.queryByText(/Students almost at its limit/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide meeting minutes warning/i }));
    await waitFor(() => expect(screen.queryByText(/Meeting minutes almost at its limit/)).not.toBeInTheDocument());
    expect(localStorage.getItem("nga.tenant.limitWarnings.dismissed")).toContain("limit.tupo_meeting_minutes_month");
  });

  it("ignores status errors silently", async () => {
    api.status.mockRejectedValue(new Error("offline"));
    const { container } = renderBanner();
    await waitFor(() => expect(api.status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("detects a support token from the unverified JWT payload", () => {
    localStorage.setItem("token", jwt({ sub: 1, act: { sub: 9, tid: 1 }, support: true }));
    expect(isSupportToken(readTokenClaims())).toBe(true);
    localStorage.setItem("token", jwt({ sub: 1 }));
    expect(isSupportToken(readTokenClaims())).toBe(false);
  });
});
