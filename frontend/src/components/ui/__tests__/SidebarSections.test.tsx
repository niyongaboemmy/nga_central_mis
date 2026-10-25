import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "../Sidebar";
import { Permissions } from "../../../constants/permissions";
import { OPEN_APPS_EVENT } from "../../apps/openAppsDialog";

/**
 * The menu is grouped into sections under headings, each shown only when the
 * viewer can open something in it, so one role never wades through another's links.
 */
let legacyPerms: string[] = [];

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { user: { user_id: 1 }, roles: [{ permissions: legacyPerms.map((name) => ({ name })) }] }, logout: vi.fn() }),
}));
vi.mock("../../../hooks/useAccess", () => ({
  useAccess: () => ({ loading: false, can: () => false }),
}));

const renderSidebar = (props: { isCollapsed?: boolean } = {}) =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <Sidebar {...props} />
    </MemoryRouter>,
  );

const headings = () => screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);

beforeEach(() => {
  legacyPerms = [];
  localStorage.clear();
});

describe("sidebar sections", () => {
  it("gives a student Learning, Workspace and You, and no staff sections", () => {
    legacyPerms = [Permissions.VIEW_MY_ENROLLED_SUBJECTS, Permissions.VIEW_SHARED_LESSON_NOTES, Permissions.VIEW_ACADEMIC_CALENDAR];
    renderSidebar();
    expect(headings()).toEqual(["Learning", "Workspace", "You"]);
    const learning = screen.getByRole("list", { name: "Learning" });
    expect(within(learning).getByRole("button", { name: "My Subjects" })).toBeInTheDocument();
    expect(within(learning).getByRole("button", { name: "Shared Notes" })).toBeInTheDocument();
  });

  it("keeps a teacher's work together under Teaching", () => {
    legacyPerms = [Permissions.VIEW_MY_ASSIGNED_SUBJECTS, Permissions.MANAGE_LESSON_NOTES, Permissions.TEACHER_DASHBOARD];
    renderSidebar();
    expect(headings()).toEqual(["Teaching", "Workspace", "You"]);
    const teaching = screen.getByRole("list", { name: "Teaching" });
    expect(within(teaching).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "My Subjects",
      "Scheme Of Work",
      "Lesson Notes",
    ]);
  });

  it("moves personal links out of the way, beside Profile at the foot", () => {
    renderSidebar();
    const you = screen.getByRole("list", { name: "You" });
    expect(within(you).getAllByRole("button").map((b) => b.textContent)).toEqual(["Reminders", "Get the apps", "My activity"]);
  });

  it("draws dividers instead of headings in the collapsed rail", () => {
    legacyPerms = [Permissions.MANAGE_USERS];
    renderSidebar({ isCollapsed: true });
    expect(headings()).toEqual([]);
    expect(screen.getByRole("separator", { name: "Administration" })).toBeInTheDocument();
  });
});

describe("sidebar links", () => {
  it("shows links main added, each in its section (none dropped for lack of one)", () => {
    legacyPerms = [Permissions.SAFEGUARDING_MANAGE, Permissions.MANAGE_USERS];
    renderSidebar();
    expect(within(screen.getByRole("list", { name: "Oversight" })).getByRole("button", { name: "Safeguarding" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Administration" })).getByRole("button", { name: "Import parents" })).toBeInTheDocument();
    expect(headings()).not.toContain("More");
  });

  it("calls the timetable page Schedule, for everyone", () => {
    legacyPerms = [Permissions.TEACHER_DASHBOARD];
    renderSidebar();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My Timetable" })).not.toBeInTheDocument();
  });

  it("keeps Academic Calendar for the people who build the timetable only", () => {
    legacyPerms = [Permissions.VIEW_ACADEMIC_CALENDAR];
    const { unmount } = renderSidebar();
    expect(screen.queryByRole("button", { name: "Academic Calendar" })).not.toBeInTheDocument();
    unmount();

    legacyPerms = [Permissions.MANAGE_ACADEMIC_CALENDAR];
    renderSidebar();
    expect(screen.getByRole("button", { name: "Academic Calendar" })).toBeInTheDocument();
  });

  it("opens Get the apps over the current page instead of navigating away", () => {
    const opened = vi.fn((e: Event) => e.preventDefault());
    window.addEventListener(OPEN_APPS_EVENT, opened);
    try {
      renderSidebar();
      fireEvent.click(screen.getByRole("button", { name: "Get the apps" }));
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_APPS_EVENT, opened);
    }
  });
});
