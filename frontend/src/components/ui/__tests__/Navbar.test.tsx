import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../Navbar";
import { ToastProvider } from "../../../contexts/ToastContext";
import { ThemeProvider } from "../../../contexts/ThemeContext";

const mockUser: any = {
  user: { user_id: 1, username: "jdoe", email: "jane.doe@example.com" },
  profile: { first_name: "Jane", last_name: "Doe" },
  roles: [],
  systems: [],
};

const logoutMock = vi.fn();

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({
    user: mockUser,
    logout: logoutMock,
  }),
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    years: [
      { academic_year_id: 1, name: "2024-2025", is_current: 0 },
      { academic_year_id: 2, name: "2025-2026", is_current: 1 },
    ],
    terms: [
      { academic_term_id: 21, academic_year_id: 2, name: "Term A", is_current: 1 },
    ],
    selectedYearId: 2,
    selectedTermId: 21,
    selectedYear: { academic_year_id: 2, name: "2025-2026", is_current: 1 },
    selectedTerm: { academic_term_id: 21, name: "Term A", is_current: 1 },
    setSelectedYearId: vi.fn(),
    setSelectedTermId: vi.fn(),
    loading: false,
  }),
}));

// The navbar renders NotificationBell, whose useNotifications() throws outside a provider.
// Mocked rather than wrapped in the real NotificationProvider: that one fetches on mount and
// polls, which this test has no business exercising — the same approach the rest of the
// contexts above take.
vi.mock("../../../contexts/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    refresh: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: vi.fn(),
    isSubjectUnread: () => false,
    markSubjectRead: vi.fn(),
  }),
}));

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <Navbar showUserCard={true} showNavigation={false} showAuthButtons={false} />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

describe("Navbar", () => {
  it("does not render a Website link", () => {
    renderNavbar();
    expect(screen.queryByText(/website/i)).not.toBeInTheDocument();
  });

  it("shows only an icon (initials) for the logged-in user in the collapsed bar, not the name or email", () => {
    renderNavbar();
    const accountButton = screen.getByRole("button", { name: /account menu/i });
    expect(accountButton).toBeInTheDocument();
    expect(accountButton.textContent).toContain("JD");
    // The desktop dropdown trigger's own container must not reveal the name
    // or email until it's clicked open — the mobile slide-out menu (present
    // in the DOM but visually clipped) is a separate, expected exception.
    const desktopAccountContainer = accountButton.closest(".relative") as HTMLElement;
    expect(within(desktopAccountContainer).queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(
      within(desktopAccountContainer).queryByText("jane.doe@example.com"),
    ).not.toBeInTheDocument();
  });

  it("reveals the user's name and email inside the dropdown after clicking the account icon", async () => {
    const user = userEvent.setup();
    renderNavbar();
    const accountButton = screen.getByRole("button", { name: /account menu/i });
    const desktopAccountContainer = accountButton.closest(".relative") as HTMLElement;
    await user.click(accountButton);
    expect(within(desktopAccountContainer).getByText("Jane Doe")).toBeInTheDocument();
    expect(
      within(desktopAccountContainer).getByText("jane.doe@example.com"),
    ).toBeInTheDocument();
  });

  it("shows the central profile picture in the account button and dropdown", async () => {
    mockUser.avatar = {
      version: 1790000000,
      sm: "https://api.example/avatars/1/1790000000/sm.webp?s=x",
      md: "https://api.example/avatars/1/1790000000/md.webp?s=x",
      lg: "https://api.example/avatars/1/1790000000/lg.webp?s=x",
    };
    try {
      const user = userEvent.setup();
      renderNavbar();
      const accountButton = screen.getByRole("button", { name: /account menu/i });
      const img = within(accountButton).getByRole("img", { name: "Jane Doe" });
      expect(img.getAttribute("src")).toBe(mockUser.avatar.sm);
      expect(accountButton.textContent).not.toContain("JD");

      await user.click(accountButton);
      const container = accountButton.closest(".relative") as HTMLElement;
      expect(within(container).getAllByRole("img", { name: "Jane Doe" })).toHaveLength(2);
    } finally {
      delete mockUser.avatar;
    }
  });

  it("renders a search icon that opens a search dropdown", async () => {
    const user = userEvent.setup();
    renderNavbar();
    const searchButtons = screen.getAllByRole("button", { name: /^search$/i });
    expect(searchButtons.length).toBeGreaterThan(0);
    await user.click(searchButtons[0]);
    expect(
      screen.getAllByPlaceholderText(/search pages/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the global academic year/term selector", () => {
    renderNavbar();
    expect(screen.getAllByLabelText("Academic Year").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Academic Term").length).toBeGreaterThan(0);
  });
});
