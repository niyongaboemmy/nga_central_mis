import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MentorReportsView from "../MentorReportsView";

const getMySessionsReportMock = vi.fn((_params?: any) =>
  Promise.resolve({
    data: {
      data: {
        period: { start_date: "2026-02-01", end_date: "2026-02-28" },
        sessions: [
          {
            mentorship_id: 1,
            student_id: 10,
            student_name: "Ada Lovelace",
            session_date: "2026-02-10",
            topic: "Deadline stress",
            subject_name: null,
            duration_minutes: 30,
            wellbeing_status: "CONCERNED",
            follow_up_required: false,
            dishonesty_flagged: false,
            stress_flag: true,
            session_status: "OPEN",
            notes: null,
          },
        ],
        checkins: [
          {
            checkin_id: 1,
            student_id: 10,
            student_name: "Ada Lovelace",
            submitted_at: "2026-02-05",
            category: "CONCERN",
            title: "Need help",
            message: "Struggling with deadlines.",
            status: "NEW",
            validation_status: "PENDING",
          },
        ],
        summary: { total_sessions: 1, total_checkins: 1, pending_checkins: 1, flagged_sessions: 1 },
      },
    },
  }),
);
const getConsolidatedReportMock = vi.fn((_params?: any) =>
  Promise.resolve({ data: { data: { mentor_name: "Test Mentor", academic_year_id: 1, mentees: [] } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getMySessionsReport: (params?: any) => getMySessionsReportMock(params),
      getConsolidatedReport: (params?: any) => getConsolidatedReportMock(params),
    },
  };
});

const downloadMock = vi.fn();
vi.mock("../../../services/MentorshipReportService", () => ({
  MentorshipReportService: { download: (...args: any[]) => downloadMock(...args) },
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYear: { academic_year_id: 1, name: "2025-2026" } }),
}));

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { profile: { first_name: "Test", last_name: "Mentor" }, user: { username: "tmentor" } } }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("MentorReportsView", () => {
  beforeEach(() => {
    getMySessionsReportMock.mockClear();
    getConsolidatedReportMock.mockClear();
    downloadMock.mockClear();
    showToastMock.mockClear();
  });

  it("loads and shows the summary stat cards for the default (month) period", async () => {
    render(<MentorReportsView onBack={() => {}} />);
    await waitFor(() => expect(getMySessionsReportMock).toHaveBeenCalled());
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("switches to the check-ins tab and shows mentee reports", async () => {
    const user = userEvent.setup();
    render(<MentorReportsView onBack={() => {}} />);
    await waitFor(() => expect(getMySessionsReportMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Mentee Reports" }));
    expect(await screen.findByText(/Struggling with deadlines\./)).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<MentorReportsView onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /Back to Mentoring Hub/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("downloads the consolidated report using the active date range", async () => {
    const user = userEvent.setup();
    render(<MentorReportsView onBack={() => {}} />);
    await waitFor(() => expect(getMySessionsReportMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Download Report/i }));

    await waitFor(() => expect(getConsolidatedReportMock).toHaveBeenCalled());
    expect(showToastMock).toHaveBeenCalledWith(
      "No mentees assigned yet — nothing to generate",
      "error",
    );
  });
});
