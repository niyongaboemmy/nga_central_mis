import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyMentor from "../MyMentor";

const submitCheckInMock = vi.fn((_payload: { category: string; message: string }) =>
  Promise.resolve({ data: { data: { checkin_id: 1 } } }),
);
const getMyCheckInsMock = vi.fn(() => Promise.resolve({ data: { data: [] } }));
const getMyMentorMock = vi.fn(() =>
  Promise.resolve({ data: { data: { mentor_id: 9, mentor_name: "Jane Doe", mentor_email: "jane@example.com", assigned_at: "2026-01-01" } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      submitCheckIn: (payload: any) => submitCheckInMock(payload),
      getMyCheckIns: () => getMyCheckInsMock(),
      getMyMentor: () => getMyMentorMock(),
    },
  };
});

vi.mock("../../../api/academics", async () => {
  const actual = await vi.importActual<any>("../../../api/academics");
  return {
    ...actual,
    studentEnrollmentApi: {
      ...actual.studentEnrollmentApi,
      getEnrolledSubjects: () => Promise.resolve({ data: { data: [] } }),
    },
  };
});

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { user: { user_id: 1 } } }),
}));

const mockYear = { academic_year_id: 1, name: "2025-2026", is_current: 1 };
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ years: [mockYear], selectedYearId: mockYear.academic_year_id, selectedYear: mockYear }),
}));

describe("MyMentor — student check-in submission", () => {
  beforeEach(() => {
    submitCheckInMock.mockClear();
    getMyCheckInsMock.mockClear();
    getMyMentorMock.mockClear();
    showToastMock.mockClear();
  });

  it("shows the empty-history state when the student has no prior reports", async () => {
    const user = userEvent.setup();
    render(<MyMentor />);
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /My Reports/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/No reports yet/i),
      ).toBeInTheDocument(),
    );
  });

  it("blocks submission with an error toast when the message is empty", async () => {
    const user = userEvent.setup();
    render(<MyMentor />);
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^Reporting$/i }));

    await user.click(screen.getByRole("button", { name: /Send to Mentor/i }));

    expect(submitCheckInMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringMatching(/write a message/i),
      "error",
    );
  });

  it("submits the selected category, title, and message, then reloads history", async () => {
    const user = userEvent.setup();
    render(<MyMentor />);
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /^Reporting$/i }));

    await user.click(screen.getByRole("button", { name: /General/i }));
    await user.click(screen.getByRole("option", { name: /Concern/i }));
    await user.type(
      screen.getByPlaceholderText(/Subject line \(optional\)/i),
      "Project deadline",
    );
    await user.type(
      screen.getByPlaceholderText(/Write your message/i),
      "I'm struggling with my project deadline.",
    );
    await user.click(screen.getByRole("button", { name: /Send to Mentor/i }));

    await waitFor(() =>
      expect(submitCheckInMock).toHaveBeenCalledWith({
        category: "CONCERN",
        title: "Project deadline",
        academic_year_id: 1,
        message: "I'm struggling with my project deadline.",
      }),
    );
    // History reloads after a successful submit
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalledTimes(2));
  });

  it("shows the approval status badge for a previously submitted report", async () => {
    getMyCheckInsMock.mockResolvedValueOnce({
      data: {
        data: [
          {
            checkin_id: 5,
            student_id: 1,
            mentor_id: 2,
            academic_year_id: 1,
            submitted_at: "2026-02-01",
            category: "CONCERN",
            title: "Deadline extension",
            message: "Can I have more time?",
            linked_session_id: null,
            status: "ADDRESSED",
            validation_status: "APPROVED",
            mentor_response: "Yes, granted.",
            responded_at: "2026-02-02",
          },
        ],
      },
    } as any);

    const user = userEvent.setup();
    render(<MyMentor />);
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /My Reports/i }));

    await waitFor(() => expect(screen.getByText("Deadline extension")).toBeInTheDocument());
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/Yes, granted\./)).toBeInTheDocument();
  });

  it("shows a clear message when the student has no assigned mentor yet", async () => {
    const user = userEvent.setup();
    submitCheckInMock.mockImplementationOnce(() =>
      Promise.reject({
        response: { data: { message: "You don't have an assigned mentor yet for this academic year." } },
      }),
    );
    render(<MyMentor />);
    await waitFor(() => expect(getMyCheckInsMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^Reporting$/i }));

    await user.type(screen.getByPlaceholderText(/Write your message/i), "Hello?");
    await user.click(screen.getByRole("button", { name: /Send to Mentor/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        expect.stringMatching(/don't have an assigned mentor/i),
        "error",
      ),
    );
  });
});
