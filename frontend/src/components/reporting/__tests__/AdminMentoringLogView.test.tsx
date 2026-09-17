import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminMentoringLogView from "../AdminMentoringLogView";

const sessionEntry = {
  mentorship_id: 1,
  student_id: 10,
  student_name: "Ada Lovelace",
  mentor_id: 5,
  mentor_name: "Jean Bosco",
  session_date: "2026-01-21",
  topic: "Weekly check-in",
  subject_name: null,
  duration_minutes: 30,
  assignment_completion: null,
  assignment_notes: null,
  punctuality_attendance: null,
  discipline_notes: null,
  discipline_progress: null,
  academic_planning: null,
  academic_personal_notes: null,
  dishonesty_flagged: false,
  stress_flag: false,
  challenges_identified: null,
  guidance_notes: null,
  wellbeing_status: null,
  wellbeing_score: null,
  wellbeing_notes: null,
  action_items: null,
  next_steps: null,
  follow_up_required: false,
  is_completed: true,
  session_status: "RESOLVED" as const,
  notes: null,
};

const checkInEntry = {
  checkin_id: 1,
  student_id: 10,
  student_name: "Ada Lovelace",
  mentor_id: 5,
  mentor_name: "Jean Bosco",
  academic_year_id: 1,
  submitted_at: "2026-02-01",
  category: "CONCERN" as const,
  title: "Deadline help",
  message: "I'm struggling with my project deadline.",
  linked_session_id: null,
  status: "NEW" as const,
  validation_status: "PENDING" as const,
  mentor_response: null,
  responded_at: null,
};

const getAdminLogMock = vi.fn((_params?: any) => Promise.resolve({ data: { data: [sessionEntry] } }));
const getAdminCheckInsMock = vi.fn((_params?: any) => Promise.resolve({ data: { data: [checkInEntry] } }));
const adminUpdateCheckInMock = vi.fn((_id: number, _payload: any) =>
  Promise.resolve({ data: { data: { checkin_id: 1 } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getAdminLog: (params?: any) => getAdminLogMock(params),
      getAdminCheckIns: (params?: any) => getAdminCheckInsMock(params),
      adminUpdateCheckIn: (id: number, payload: any) => adminUpdateCheckInMock(id, payload),
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

describe("AdminMentoringLogView — Mentor Sessions / Mentee Check-ins toggle", () => {
  beforeEach(() => {
    getAdminLogMock.mockClear();
    getAdminCheckInsMock.mockClear();
    adminUpdateCheckInMock.mockClear();
    showToastMock.mockClear();
  });

  it("defaults to the Mentor Sessions view and loads it", async () => {
    render(<AdminMentoringLogView />);
    await waitFor(() => expect(getAdminLogMock).toHaveBeenCalled());
    expect(getAdminCheckInsMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Weekly check-in")).toBeInTheDocument();
  });

  it("switches to Mentee Check-ins and loads that data instead", async () => {
    const user = userEvent.setup();
    render(<AdminMentoringLogView />);
    await waitFor(() => expect(getAdminLogMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Mentee Check-ins/i }));

    await waitFor(() => expect(getAdminCheckInsMock).toHaveBeenCalled());
    expect(await screen.findByText("I'm struggling with my project deadline.")).toBeInTheDocument();
  });

  it("filters both views by the selected mentor once sessions have loaded a mentor name", async () => {
    const user = userEvent.setup();
    render(<AdminMentoringLogView />);
    await waitFor(() => expect(getAdminLogMock).toHaveBeenCalled());

    const mentorSelect = await screen.findByDisplayValue("All Mentors");
    await user.selectOptions(mentorSelect, "5");

    await waitFor(() =>
      expect(getAdminLogMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ mentor_id: 5 }),
      ),
    );
  });

  it("lets an admin approve a pending mentee report directly from the check-ins tab", async () => {
    const user = userEvent.setup();
    render(<AdminMentoringLogView />);
    await waitFor(() => expect(getAdminLogMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Mentee Check-ins/i }));
    await waitFor(() => expect(getAdminCheckInsMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Approve/i }));

    await waitFor(() =>
      expect(adminUpdateCheckInMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ validation_status: "APPROVED" }),
      ),
    );
  });

  it("requires a comment before an admin can confirm a rejection", async () => {
    const user = userEvent.setup();
    render(<AdminMentoringLogView />);
    await waitFor(() => expect(getAdminLogMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Mentee Check-ins/i }));
    await waitFor(() => expect(getAdminCheckInsMock).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /^Reject$/i }));
    await user.click(screen.getByRole("button", { name: /Confirm Reject/i }));

    expect(adminUpdateCheckInMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(
      "A comment is required when rejecting a report",
      "error",
    );
  });
});
