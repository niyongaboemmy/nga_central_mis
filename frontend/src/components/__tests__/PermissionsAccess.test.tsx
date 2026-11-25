import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/** Roles & Permissions when the person may not see every part: a clear message, never a skeleton forever. */

const api = vi.hoisted(() => ({ getRoles: vi.fn(), getPermissions: vi.fn(), getRolePermissions: vi.fn() }));
vi.mock("../../api/users", async (orig) => {
  const m: any = await orig();
  return { ...m, getRoles: api.getRoles, getPermissions: api.getPermissions, getRolePermissions: api.getRolePermissions };
});
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true }) }));

import Permissions from "../Permissions";

const forbidden = () => Promise.reject({ response: { status: 403 } });
const ROLES = [{ role_id: 1, name: "TEACHER", description: "Teaches", status: "ACTIVE" }];
const PERMS = [{ perm_id: 7, name: "VIEW_RESULTS", description: "See results", status: "ACTIVE" }];

const renderPage = () =>
  render(
    <MemoryRouter>
      <Permissions />
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getRolePermissions.mockResolvedValue([]);
});

describe("Roles & Permissions access", () => {
  it("says so when neither list may be seen", async () => {
    api.getRoles.mockImplementation(forbidden);
    api.getPermissions.mockImplementation(forbidden);
    renderPage();
    expect(await screen.findByText("You can't manage roles and permissions here")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /New Role/ })).toBeNull();
  });

  it("shows roles and explains the missing part when only the permission list is refused", async () => {
    api.getRoles.mockResolvedValue(ROLES);
    api.getPermissions.mockImplementation(forbidden);
    renderPage();
    expect(await screen.findByText(/changing what a role can do needs the Manage permissions permission/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Roles/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Permissions/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Dashboard/ })).toBeNull();
    await waitFor(() => expect(screen.getByText("TEACHER")).toBeInTheDocument());
  });

  it("shows every tab when both load", async () => {
    api.getRoles.mockResolvedValue(ROLES);
    api.getPermissions.mockResolvedValue(PERMS);
    renderPage();
    await waitFor(() => expect(screen.getByText("TEACHER")).toBeInTheDocument());
    for (const t of [/Roles/, /^Permissions/, /Dashboard/]) expect(screen.getByRole("tab", { name: t })).toBeInTheDocument();
  });
});
