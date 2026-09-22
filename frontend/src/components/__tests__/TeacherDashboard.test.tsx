import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
      term_start_date: null,
      term_end_date: null,
      days_remaining_in_term: 42,
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
      today: [lesson()],
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <TeacherDashboard />
    </MemoryRouter>,
  );

describe("TeacherDashboard", () => {
  beforeEach(() => {
    // shouldAdvanceTime keeps testing-library's waitFor polling while the
    // clock is frozen for the "in class now" assertions below.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A Monday, 10:30 — inside the 10:00–11:40 lesson above.
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
    expect(screen.getByText("1 hr 10 min remaining")).toBeInTheDocument();
  });

  it("raises a scheme sent back for revision before one merely missing", async () => {
    renderPage();
    const rejected = await screen.findByText("1 scheme sent back for revision");
    const missing = screen.getByText("1 scheme of work not submitted");
    // compareDocumentPosition: 4 === missing follows rejected in the DOM.
    expect(
      rejected.compareDocumentPosition(missing) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the headline figures", async () => {
    renderPage();
    expect(await screen.findByText("Assigned Subjects")).toBeInTheDocument();
    expect(screen.getByText("29")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("1 sent back")).toBeInTheDocument();
  });

  it("says so when nothing is outstanding", async () => {
    getTeacherOverview.mockResolvedValue(
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
      }),
    );
    renderPage();
    expect(
      await screen.findByText("You're all caught up."),
    ).toBeInTheDocument();
  });

  it("offers a retry when the overview fails to load", async () => {
    getTeacherOverview.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Try again")).toBeInTheDocument();
  });
});
