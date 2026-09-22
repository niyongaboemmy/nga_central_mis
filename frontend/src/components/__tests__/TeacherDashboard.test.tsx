import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TeacherDashboard from "../teacher/TeacherDashboard";
import type { TeacherOverview } from "../../api/dashboard";

const getTeacherOverview = vi.fn();

vi.mock("../../api/dashboard", () => ({
  getTeacherOverview: (...args: any[]) => getTeacherOverview(...args),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { profile: { first_name: "Nadia" } } }),
}));

vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 4, selectedTermId: 6 }),
}));

let notificationsMock: any;
vi.mock("../../contexts/NotificationContext", () => ({
  useNotifications: () => notificationsMock,
}));

const lesson = (over: Partial<any> = {}) => ({
  slot_id: 1,
  subject_id: 10,
  subject_name: "Web3 Applications",
  subject_code: "W3",
  class_group_name: "L4. Class A",
  start_time: "10:00:00",
  end_time: "11:40:00",
  location: "Lab 2",
  color: "#A855F7",
  ...over,
});

const overview = (over: Partial<TeacherOverview> = {}): TeacherOverview =>
  ({
    teacher: { first_name: "Nadia", last_name: "E" },
    period: {
      academic_year_id: 4,
      academic_year_name: "2026 - 2027",
      academic_term_id: 6,
      academic_term_name: "Term 1",
      term_start_date: "2026-09-07",
      term_end_date: "2026-12-18",
      days_remaining_in_term: 87,
    },
    kpis: {
      assignedSubjects: 4,
      totalStudents: 29,
      assignedClassGroups: 2,
      weeklyPeriods: 6,
      weeklyMinutes: 400,
    },
    schedule: {
      server_day_of_week: 1,
      today: [
        lesson({ slot_id: 9, start_time: "08:00:00", end_time: "08:50:00" }),
        lesson(),
      ],
      today_activities: [],
      current_lesson: null,
      next_lesson_today: null,
      next_teaching_day: null,
      week_load: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        day_of_week: d,
        periods: d === 1 ? 2 : 0,
      })),
    },
    classes: [],
    schemes: {
      total: 4,
      submitted: 3,
      pending: 1,
      approved: 2,
      rejected: 1,
      awaiting_validation: 0,
      rows: [
        {
          subject_id: 10,
          subject_name: "Web3 Applications",
          subject_code: "W3",
          subject_color: "#A855F7",
          class_group_id: 11,
          class_group_name: "L4. Class A",
          scheme_id: null,
          status: "pending",
          entries_count: 0,
          validation_status: "PENDING",
          validation_comment: null,
          updated_at: null,
        },
        {
          subject_id: 11,
          subject_name: "Web Application Development",
          subject_code: "WAD",
          subject_color: "#84CC16",
          class_group_id: 12,
          class_group_name: "L3. Class A",
          scheme_id: 5,
          status: "submitted",
          entries_count: 12,
          validation_status: "REJECTED",
          validation_comment: "Add assessment weeks",
          updated_at: null,
        },
      ],
    },
    lessonNotes: { total: 3, drafts: 0, published: 3, recent_drafts: [] },
    courses: { total: 1, drafts: 0, published: 1, recent: [] },
    ...over,
  }) as TeacherOverview;

const allClear = () =>
  overview({
    schemes: {
      total: 1,
      submitted: 1,
      pending: 0,
      approved: 1,
      rejected: 0,
      awaiting_validation: 0,
      rows: [
        {
          subject_id: 10,
          subject_name: "Web3 Applications",
          subject_code: "W3",
          subject_color: "#A855F7",
          class_group_id: 11,
          class_group_name: "L4. Class A",
          scheme_id: 5,
          status: "submitted",
          entries_count: 12,
          validation_status: "APPROVED",
          validation_comment: null,
          updated_at: null,
        },
      ],
    },
  });

const renderPage = () =>
  render(
    <MemoryRouter>
      <TeacherDashboard />
    </MemoryRouter>,
  );

describe("TeacherDashboard", () => {
  beforeEach(() => {
    // shouldAdvanceTime keeps testing-library's waitFor polling while the
    // clock is pinned for the "in class now" assertions.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Monday 21 Sep 2026, 10:30 — inside the 10:00–11:40 lesson, and week 3
    // of a term that started 7 Sep.
    vi.setSystemTime(new Date(2026, 8, 21, 10, 30, 0));
    notificationsMock = {
      notifications: [],
      unreadCount: 0,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
    getTeacherOverview.mockResolvedValue(overview());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("scopes the request to the selected academic year and term", async () => {
    renderPage();
    await waitFor(() =>
      expect(getTeacherOverview).toHaveBeenCalledWith({
        academic_year_id: 4,
        academic_term_id: 6,
      }),
    );
  });

  it("shows the lesson in progress, not the payload's stale snapshot", async () => {
    // The payload says no current lesson (it was built a moment earlier); the
    // wall clock says otherwise, and the wall clock wins.
    renderPage();
    expect(await screen.findByText("In class now")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Web3 Applications" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 hr 10 min remaining/)).toBeInTheDocument();
  });

  it("raises a blocking item into an alert bar, dismissible for the session", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const alert = await screen.findByRole("alert");
    // A rejected scheme is blocking; the bar leads with it and names the rest
    // rather than stacking a second banner.
    expect(
      within(alert).getByText(/scheme sent back for revision/),
    ).toBeInTheDocument();
    expect(within(alert).getByText("Add assessment weeks")).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("filters the attention list by severity", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    // Week 3 of term, so the missing scheme is blocking too — and with
    // nothing in the tidy tier that segment is not offered at all.
    const blockingTab = await screen.findByRole("button", {
      name: /^Blocking 2$/,
    });
    expect(
      screen.queryByRole("button", { name: /^Tidy up/ }),
    ).not.toBeInTheDocument();

    await user.click(blockingTab);
    expect(blockingTab).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getAllByText(/scheme sent back for revision/).length,
    ).toBeGreaterThan(0);
  });

  it("hides finished periods until asked for them", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const toggle = await screen.findByRole("button", { name: /1 completed/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("08:00 – 08:50")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("08:00 – 08:50")).toBeInTheDocument();
  });

  it("labels the day rail with the weekday it actually draws", async () => {
    // Mid-morning, a lesson still ahead: the rail is today's.
    renderPage();
    expect(await screen.findByText("Today · Monday")).toBeInTheDocument();
  });

  it("moves the rail to the next teaching day once today is finished", async () => {
    // The heading has already moved on to Wednesday; a rail still drawing a
    // finished Monday underneath it reads as Wednesday's and misinforms.
    getTeacherOverview.mockResolvedValue(
      overview({
        schedule: {
          server_day_of_week: 1,
          today: [
            lesson({
              slot_id: 9,
              start_time: "08:00:00",
              end_time: "08:50:00",
            }),
          ],
          today_activities: [],
          current_lesson: null,
          next_lesson_today: null,
          next_teaching_day: {
            day_of_week: 3,
            lessons: [
              lesson({
                slot_id: 21,
                start_time: "08:00:00",
                end_time: "09:40:00",
              }),
            ],
          },
          week_load: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            day_of_week: d,
            periods: d === 1 ? 1 : 0,
          })),
        },
      } as Partial<TeacherOverview>),
    );
    renderPage();

    expect(
      await screen.findByText("Wednesday at a glance"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Today · /)).not.toBeInTheDocument();
    // …and the figures under it describe that same day.
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("1 lesson")).toBeInTheDocument();
  });

  it("reports term progress from the term's own dates", async () => {
    renderPage();
    expect(await screen.findByText(/Week 3 of 15/)).toBeInTheDocument();
    expect(screen.getByText("87 days left")).toBeInTheDocument();
  });

  it("renders the headline figures", async () => {
    renderPage();
    expect(await screen.findByText("Assigned Subjects")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("1 sent back")).toBeInTheDocument();
  });

  it("says so when nothing is outstanding, and raises no alert", async () => {
    getTeacherOverview.mockResolvedValue(allClear());
    renderPage();
    expect(
      await screen.findByText("You're all caught up."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry when the overview fails to load", async () => {
    getTeacherOverview.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Try again")).toBeInTheDocument();
  });

  it("keeps the figures on screen when a background refresh fails", async () => {
    renderPage();
    await screen.findByText("Assigned Subjects");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    getTeacherOverview.mockRejectedValueOnce(new Error("dropped"));
    await user.click(screen.getByRole("button", { name: /Refresh/ }));

    // Blanking the page over a dropped poll is worse than showing figures a
    // few minutes old.
    await waitFor(() =>
      expect(screen.getByText("Assigned Subjects")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });
});
