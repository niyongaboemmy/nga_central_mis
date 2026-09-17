import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MentorshipDashboardWidgets from "../MentorshipDashboardWidgets";

const getAssignedStudentsMock = vi.fn((_yearId?: number) =>
  Promise.resolve({
    data: {
      data: [
        { user_id: 1, overdue: true, wellbeing_status: "STRUGGLING" },
        { user_id: 2, overdue: false, wellbeing_status: "GOOD" },
        { user_id: 3, overdue: false, wellbeing_status: "GOOD" },
      ],
    },
  }),
);
const getCheckInInboxMock = vi.fn((_status?: string) =>
  Promise.resolve({
    data: {
      data: [
        { checkin_id: 1, status: "NEW" },
        { checkin_id: 2, status: "NEW" },
        { checkin_id: 3, status: "ADDRESSED" },
      ],
    },
  }),
);
const getConsolidatedReportMock = vi.fn((_params?: any) =>
  Promise.resolve({ data: { data: { mentor_name: "Jean Bosco", academic_year_id: 1, mentees: [] } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getAssignedStudents: (yearId?: number) => getAssignedStudentsMock(yearId),
      getCheckInInbox: (status?: string) => getCheckInInboxMock(status),
      getConsolidatedReport: (params?: any) => getConsolidatedReportMock(params),
    },
  };
});

const downloadMock = vi.fn();
vi.mock("../../../services/MentorshipReportService", () => ({
  MentorshipReportService: {
    download: (...args: any[]) => downloadMock(...args),
  },
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    selectedYearId: 1,
    selectedYear: { academic_year_id: 1, name: "2025-2026" },
  }),
}));

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({
    user: { profile: { first_name: "Jean", last_name: "Bosco" }, user: { username: "jbosco" } },
  }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("MentorshipDashboardWidgets", () => {
  beforeEach(() => {
    getAssignedStudentsMock.mockClear();
    getCheckInInboxMock.mockClear();
    getConsolidatedReportMock.mockClear();
    downloadMock.mockClear();
    showToastMock.mockClear();
  });

  it("computes overdue count, open check-in count, and wellbeing distribution from the loaded data", async () => {
    render(<MentorshipDashboardWidgets />);

    await waitFor(() =>
      expect(screen.getByText(/Overdue Mentees/i).closest("div")?.parentElement).toBeTruthy(),
    );

    const overdueCard = screen.getByText(/Overdue Mentees/i).closest("div")!.parentElement!;
    expect(within(overdueCard).getByText("1")).toBeInTheDocument();

    const checkInCard = screen.getByText(/Open Check-ins/i).closest("div")!.parentElement!;
    expect(within(checkInCard).getByText("2")).toBeInTheDocument();
    expect(checkInCard.textContent).toContain("0 acknowledged · 1 addressed");

    expect(screen.getByText("STRUGGLING")).toBeInTheDocument();
    expect(screen.getByText("GOOD")).toBeInTheDocument();
  });

  it("downloads the consolidated report with the mentor's name and academic year", async () => {
    const user = userEvent.setup();
    getConsolidatedReportMock.mockResolvedValueOnce({
      data: {
        data: {
          mentor_name: "Jean Bosco",
          academic_year_id: 1,
          mentees: [{ student_id: 1, name: "Ada", date_of_birth: null, scores: [], sessions: [], comments: [], recommend_follow_up: false }],
        },
      },
    } as any);

    render(<MentorshipDashboardWidgets schoolName="Rwanda Coding Academy" />);
    await waitFor(() => expect(getAssignedStudentsMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Download My Consolidated Report/i }));

    await waitFor(() =>
      expect(downloadMock).toHaveBeenCalledWith(
        expect.objectContaining({ mentor_name: "Jean Bosco" }),
        expect.objectContaining({
          schoolName: "Rwanda Coding Academy",
          academicYearName: "2025-2026",
          generatedBy: "Jean Bosco",
        }),
      ),
    );
  });

  it("shows an error toast instead of generating a PDF when there are no mentees", async () => {
    const user = userEvent.setup();
    getConsolidatedReportMock.mockResolvedValueOnce({
      data: { data: { mentor_name: "Jean Bosco", academic_year_id: 1, mentees: [] } },
    } as any);

    render(<MentorshipDashboardWidgets />);
    await waitFor(() => expect(getAssignedStudentsMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Download My Consolidated Report/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(expect.stringMatching(/nothing to generate/i), "error"),
    );
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
