import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "../Sidebar";
import { Permissions } from "../../../constants/permissions";
import { OPEN_APPS_EVENT } from "../../apps/openAppsDialog";

/**
 * Rail + panel menu: the rail holds one icon per area the viewer can open (labels on
 * hover), the panel the chosen area's groups and pages, and the account menu the
 * personal links.
 */
let legacyPerms: string[] = [];
let userType = "";

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({
    user: { user: { user_id: 1, username: "sam" }, profile: { user_type: userType }, roles: [{ permissions: legacyPerms.map((name) => ({ name })) }] },
    logout: vi.fn(),
  }),
}));
vi.mock("../../../hooks/useAccess", () => ({
  useAccess: () => ({ loading: false, can: () => false }),
}));

const renderSidebar = (props: { isCollapsed?: boolean; path?: string } = {}) =>
  render(
    <MemoryRouter initialEntries={[props.path ?? "/home"]}>
      <Sidebar isCollapsed={props.isCollapsed} />
    </MemoryRouter>,
  );

const rail = () => screen.getByRole("navigation", { name: "Areas" });
const railLabels = () =>
  Array.from(rail().querySelectorAll("[data-rail]"))
    .map((el) => el.getAttribute("aria-label"))
    .filter((l) => l !== "Account" && l !== "Expand menu");
const panel = () => document.getElementById("nav-panel")!;

beforeEach(() => {
  legacyPerms = [];
  userType = "";
  localStorage.clear();
});

describe("rail", () => {
  it("gives a student Home, Schedule, Learning and Workspace, and no staff areas", () => {
    userType = "STUDENT";
    legacyPerms = [Permissions.VIEW_MY_ENROLLED_SUBJECTS, Permissions.VIEW_SHARED_LESSON_NOTES];
    renderSidebar();
    expect(railLabels()).toEqual(["Home", "Schedule", "Learning", "Workspace"]);
  });

  it("shows each area's label on hover, not as text on the rail", async () => {
    legacyPerms = [Permissions.MANAGE_USERS];
    renderSidebar();
    const admin = within(rail()).getByRole("button", { name: "Administration" });
    expect(admin).not.toHaveTextContent("Administration");
    await userEvent.hover(admin);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Administration");
    await userEvent.unhover(admin);
  });

  it("switches the panel to the clicked area", async () => {
    legacyPerms = [Permissions.MANAGE_USERS, Permissions.SAFEGUARDING_MANAGE];
    renderSidebar();
    await userEvent.click(within(rail()).getByRole("button", { name: "Oversight" }));
    expect(within(panel()).getByRole("heading", { level: 2 })).toHaveTextContent("Oversight");
    expect(within(panel()).getByRole("link", { name: "Safeguarding" })).toBeInTheDocument();
    await userEvent.click(within(rail()).getByRole("button", { name: "Administration" }));
    expect(within(panel()).getByRole("link", { name: "Import parents" })).toBeInTheDocument();
  });

  it("opens the panel over the page when collapsed, and closes it with Escape", async () => {
    legacyPerms = [Permissions.MANAGE_USERS];
    renderSidebar({ isCollapsed: true });
    expect(document.getElementById("nav-panel")).toBeNull();
    await userEvent.click(within(rail()).getByRole("button", { name: "Administration" }));
    expect(within(panel()).getByRole("link", { name: "Users" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(document.getElementById("nav-panel")).toBeNull();
  });
});

describe("panel", () => {
  it("groups a teacher's work under headings in Teaching", () => {
    legacyPerms = [Permissions.VIEW_MY_ASSIGNED_SUBJECTS, Permissions.MANAGE_LESSON_NOTES, Permissions.TEACHER_DASHBOARD, Permissions.VIEW_MY_STUDENTS];
    renderSidebar({ path: "/lesson-notes" });
    const planning = within(panel()).getByRole("list", { name: "Planning" });
    expect(within(planning).getAllByRole("link").map((a) => a.textContent)).toEqual(["Scheme Of Work", "Lesson Notes"]);
    expect(within(planning).getByRole("link", { name: "Lesson Notes" })).toHaveAttribute("aria-current", "page");
    expect(within(panel()).getByRole("list", { name: "My classes" })).toBeInTheDocument();
  });

  it("lights the most specific page for a nested URL", () => {
    legacyPerms = [Permissions.OFFICE_HOURS_MANAGE_ANY];
    renderSidebar({ path: "/office-hours/admin" });
    expect(within(panel()).getByRole("link", { name: "Office Hours Oversight" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Academic Calendar for the people who build the timetable only", () => {
    legacyPerms = [Permissions.VIEW_ACADEMIC_CALENDAR];
    const { unmount } = renderSidebar({ path: "/documents" });
    expect(screen.queryByRole("link", { name: "Academic Calendar" })).not.toBeInTheDocument();
    unmount();
    legacyPerms = [Permissions.MANAGE_ACADEMIC_CALENDAR];
    renderSidebar({ path: "/documents" });
    expect(screen.getByRole("link", { name: "Academic Calendar" })).toBeInTheDocument();
  });

  it("calls the timetable page Schedule", () => {
    renderSidebar();
    expect(within(rail()).getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/dashboard");
  });

  it("searches every area and says where each page lives", async () => {
    legacyPerms = [Permissions.SAFEGUARDING_MANAGE, Permissions.MANAGE_USERS];
    renderSidebar();
    await userEvent.type(screen.getByRole("textbox", { name: "Search menu" }), "safe");
    const results = screen.getByRole("list", { name: "Search results" });
    expect(within(results).getByRole("link", { name: /Safeguarding/ })).toHaveTextContent("Oversight › Student welfare");
  });

  it("pins a page to the top and remembers it", async () => {
    legacyPerms = [Permissions.MANAGE_USERS];
    const { unmount } = renderSidebar({ path: "/users" });
    await userEvent.click(within(panel()).getByRole("button", { name: "Pin Import parents" }));
    expect(within(screen.getByRole("list", { name: "Pinned" })).getByRole("link", { name: "Import parents" })).toBeInTheDocument();
    unmount();
    renderSidebar({ path: "/users" });
    expect(within(screen.getByRole("list", { name: "Pinned" })).getByRole("link", { name: "Import parents" })).toBeInTheDocument();
  });
});

describe("account menu", () => {
  it("holds the personal links instead of the main menu", async () => {
    renderSidebar();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Profile", "My activity", "Reminders", "Get the apps"]);
  });

  it("opens Get the apps over the current page instead of navigating away", async () => {
    const opened = vi.fn((e: Event) => e.preventDefault());
    window.addEventListener(OPEN_APPS_EVENT, opened);
    try {
      renderSidebar();
      await userEvent.click(screen.getByRole("button", { name: "Account" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Get the apps" }));
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_APPS_EVENT, opened);
    }
  });
});
