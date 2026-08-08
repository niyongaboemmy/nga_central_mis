import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import AdminMentorshipDashboard from "../AdminMentorshipDashboard";

const getAdminMentorshipDashboardMock = vi.fn((_params?: any) =>
  Promise.resolve({
    data: {
      data: {
        period: { start_date: null, end_date: null },
        totals: {
          total_mentees: 12,
          total_mentors: 4,
          total_sessions: 30,
          flagged_sessions: 2,
          follow_ups_open: 3,
          overdue_mentees: 5,
          total_checkins: 8,
          pending_checkins: 3,
          approved_checkins: 4,
          rejected_checkins: 1,
        },
        wellbeing_distribution: [
          { status: "GOOD", count: 10 },
          { status: "STRUGGLING", count: 2 },
        ],
        top_mentors: [
          { mentor_id: 1, mentor_name: "Jean Bosco", session_count: 15 },
          { mentor_id: 2, mentor_name: "Ada Lovelace", session_count: 15 },
        ],
      },
    },
  }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getAdminMentorshipDashboard: (params?: any) => getAdminMentorshipDashboardMock(params),
    },
  };
});

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    years: [{ academic_year_id: 1, name: "2025-2026" }],
    selectedYearId: 1,
  }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("AdminMentorshipDashboard", () => {
  beforeEach(() => {
    getAdminMentorshipDashboardMock.mockClear();
    showToastMock.mockClear();
  });

  it("renders school-wide stat cards from the API response", async () => {
    render(<AdminMentorshipDashboard />);

    await waitFor(() => expect(getAdminMentorshipDashboardMock).toHaveBeenCalled());

    const menteesCard = screen.getByText("Mentees").closest("div")!.parentElement!;
    expect(within(menteesCard).getByText("12")).toBeInTheDocument();

    const mentorsCard = screen.getByText("Mentors").closest("div")!.parentElement!;
    expect(within(mentorsCard).getByText("4")).toBeInTheDocument();

    const overdueCard = screen.getByText("Overdue Mentees").closest("div")!.parentElement!;
    expect(within(overdueCard).getByText("5")).toBeInTheDocument();
  });

  it("renders the wellbeing distribution and top mentors list", async () => {
    render(<AdminMentorshipDashboard />);
    await waitFor(() => expect(getAdminMentorshipDashboardMock).toHaveBeenCalled());

    expect(screen.getByText("GOOD")).toBeInTheDocument();
    expect(screen.getByText("STRUGGLING")).toBeInTheDocument();
    expect(screen.getByText("Jean Bosco")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows an error toast if the dashboard fails to load", async () => {
    getAdminMentorshipDashboardMock.mockRejectedValueOnce(new Error("boom"));
    render(<AdminMentorshipDashboard />);
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Failed to load the mentorship dashboard", "error"),
    );
  });
});
