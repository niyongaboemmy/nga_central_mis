import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SetupChecklistCard from "../SetupChecklistCard";
import type { SetupItem } from "../../../../api/tenantMgmt";

const api = vi.hoisted(() => ({ setup: vi.fn(), dismissSetup: vi.fn() }));
const who = vi.hoisted(() => ({ isPrimary: false, can: true }));
vi.mock("../../../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../../../api/tenantMgmt")>()), tenantApi: api }));
vi.mock("../../../../hooks/useAccess", () => ({ useAccess: () => ({ loading: false, can: () => who.can }) }));
vi.mock("../../../../contexts/UserContext", () => ({ useUser: () => ({ user: { tenant: { tid: 7, isPrimary: who.isPrimary } } }) }));

const KEYS: SetupItem["key"][] = ["profile", "academic_year", "structure", "periods", "people", "roles", "apps", "parents"];
const items = (done: number): SetupItem[] => KEYS.map((key, i) => ({ key, label: key, done: i < done, link: `/go/${key}` }));

const renderCard = () =>
  render(
    <MemoryRouter>
      <SetupChecklistCard />
    </MemoryRouter>,
  );

beforeEach(() => {
  who.isPrimary = false;
  who.can = true;
  api.setup.mockReset();
  api.dismissSetup.mockReset().mockResolvedValue({ ok: true });
});

describe("SetupChecklistCard", () => {
  it("shows progress and ticks done items, each linking to its screen", async () => {
    api.setup.mockResolvedValue({ items: items(3), dismissed: false });
    renderCard();
    expect(await screen.findByRole("img", { name: "3 of 8 setup steps done" })).toBeInTheDocument();
    expect(screen.getByTestId("setup-done-structure")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-done-periods")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /periods/i })).toHaveAttribute("href", "/go/periods");
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("offers Dismiss once complete", async () => {
    api.setup.mockResolvedValue({ items: items(8), dismissed: false });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(api.dismissSetup).toHaveBeenCalled());
  });

  it("stays hidden when dismissed, for the primary school, or without the capability", async () => {
    api.setup.mockResolvedValue({ items: items(2), dismissed: true });
    const { container, unmount } = renderCard();
    await waitFor(() => expect(api.setup).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    api.setup.mockClear();
    who.isPrimary = true;
    renderCard();
    who.isPrimary = false;
    who.can = false;
    renderCard();
    expect(api.setup).not.toHaveBeenCalled();
  });
});
