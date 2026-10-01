import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import Sidebar from "../Sidebar";
import { SearchSelect } from "../SearchSelect";
import { ThemeProvider } from "../../../contexts/ThemeContext";

/**
 * Usage & Monitoring refinements: the sidebar groups every analytics page under one
 * expandable menu, gated per page by capability, and selects are searchable.
 */
let caps: string[] = [];
let legacyPerms: string[] = [];

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { user: { user_id: 1 }, roles: [{ permissions: legacyPerms.map((name) => ({ name })) }] }, logout: vi.fn() }),
}));
vi.mock("../../../hooks/useAccess", () => ({
  useAccess: () => ({
    loading: false,
    can: (c: string | string[]) => (Array.isArray(c) ? c : [c]).some((x) => caps.includes(x)),
  }),
}));

const renderSidebar = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );

beforeEach(() => {
  caps = [];
  legacyPerms = [];
  localStorage.clear();
});

describe("Usage & Monitoring sidebar group", () => {
  it("is hidden without any analytics capability", () => {
    renderSidebar("/home");
    expect(screen.queryByRole("button", { name: /Usage & Monitoring/ })).toBeNull();
  });

  it("opens on an analytics page and lists only the pages the viewer may open", () => {
    caps = ["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW"];
    renderSidebar("/analytics/realtime");
    const group = screen.getByRole("button", { name: /Usage & Monitoring/ });
    expect(group).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Usage & Monitoring" });
    expect(within(list).getByRole("button", { name: /Realtime/ })).toHaveAttribute("aria-current", "page");
    expect(within(list).getByRole("button", { name: /Overview/ })).not.toHaveAttribute("aria-current");
    // Person-level and admin pages need more than view rights.
    expect(within(list).queryByRole("button", { name: /Visitors/ })).toBeNull();
    expect(within(list).queryByRole("button", { name: /Watchlist/ })).toBeNull();
    expect(within(list).queryByRole("button", { name: /Settings/ })).toBeNull();
  });

  it("shows every page to a platform owner and toggles closed", async () => {
    caps = ["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW", "ANALYTICS_USER_VIEW", "ANALYTICS_USER_CONTROL", "ANALYTICS_CONFIGURE"];
    renderSidebar("/analytics");
    const list = screen.getByRole("list", { name: "Usage & Monitoring" });
    expect(within(list).getAllByRole("button")).toHaveLength(13);
    await userEvent.click(screen.getByRole("button", { name: /Usage & Monitoring/ }));
    expect(screen.getByRole("button", { name: /Usage & Monitoring/ })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Audit log in the group", () => {
  it("opens the group for someone who may only read the audit log", () => {
    legacyPerms = ["VIEW_ALL_LOGS_HISTORY"];
    renderSidebar("/analytics/audit-log");
    const list = screen.getByRole("list", { name: "Usage & Monitoring" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Audit log");
    expect(items[0]).toHaveAttribute("aria-current", "page");
    // The old top-level entry is gone.
    expect(screen.queryByRole("button", { name: /Logs History/ })).toBeNull();
  });
});

describe("SearchSelect", () => {
  const Harness = () => {
    const [v, setV] = useState<string | null>("day");
    return (
      <ThemeProvider>
        <SearchSelect
          label="Group by"
          value={v}
          onChange={setV}
          options={[
            { value: "day", label: "By day" },
            { value: "week", label: "By week" },
            { value: "month", label: "By month", group: "Long" },
          ]}
        />
        <output data-testid="value">{v}</output>
      </ThemeProvider>
    );
  };

  it("filters options as you type and selects one", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Group by" });
    await userEvent.type(input, "mon");
    expect(screen.queryByText("By week")).toBeNull();
    await userEvent.click(screen.getByText("By month"));
    expect(screen.getByTestId("value")).toHaveTextContent("month");
  });
});
