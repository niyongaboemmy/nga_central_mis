import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MentoringHub from "../MentoringHub";
import type { AssignedStudent } from "../../../api/mentorship";

const overdueStudent: AssignedStudent = {
  user_id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
  class_group_name: "Year 2A",
  last_session_date: null,
  days_since_last_session: null,
  wellbeing_status: null,
  follow_up_required: false,
  dishonesty_flagged: false,
  stress_flag: false,
  overdue: true,
};

const getAssignedStudentsMock = vi.fn((_yearId?: number) =>
  Promise.resolve({ data: { data: [overdueStudent] } }),
);
const getCheckInInboxMock = vi.fn((_status?: string) =>
  Promise.resolve({ data: { data: [{ checkin_id: 1, status: "NEW" }, { checkin_id: 2, status: "NEW" }] } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getAssignedStudents: (yearId?: number) => getAssignedStudentsMock(yearId),
      getCheckInInbox: (status?: string) => getCheckInInboxMock(status),
    },
  };
});

// Isolate MentoringHub's own logic (roster/badge/navigation) from its two
// child views, which are already covered by their own test files
// (MentorCheckInInbox.test.tsx and, for StudentSupportProfile, out of scope
// for this pass).
vi.mock("../MentorCheckInInbox", () => ({
  default: ({ onUnreadCountChange }: { onUnreadCountChange?: (n: number) => void }) => {
    onUnreadCountChange?.(0);
    return <div data-testid="mocked-inbox">Mocked Inbox</div>;
  },
}));
vi.mock("../StudentSupportProfile", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <p>Mocked Student Profile</p>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 1 }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("MentoringHub", () => {
  beforeEach(() => {
    getAssignedStudentsMock.mockClear();
    getCheckInInboxMock.mockClear();
    showToastMock.mockClear();
  });

  it("renders the mentee roster with an overdue badge and stat card", async () => {
    render(<MentoringHub />);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(screen.getByText("Never mentored")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    const overdueCard = screen.getByText("Overdue").closest("div")!.parentElement!;
    expect(within(overdueCard).getByText("1")).toBeInTheDocument();
  });

  it("shows the unread check-in count on the Mentee Reports stat card", async () => {
    render(<MentoringHub />);
    await waitFor(() => expect(getCheckInInboxMock).toHaveBeenCalledWith("NEW"));
    const reportsCard = screen.getByRole("button", { name: /Mentee Reports/i });
    expect(within(reportsCard).getByText("2")).toBeInTheDocument();
  });

  it("navigates to the check-in inbox and back", async () => {
    const user = userEvent.setup();
    render(<MentoringHub />);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Mentee Reports/i }));
    expect(screen.getByTestId("mocked-inbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to Mentoring Hub/i }));
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("filters the roster by search text", async () => {
    const user = userEvent.setup();
    render(<MentoringHub />);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Search students/i), "Zzz");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText(/No students match/)).toBeInTheDocument();
  });

  it("opens a student's profile and refetches the roster on return", async () => {
    const user = userEvent.setup();
    render(<MentoringHub />);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());

    await user.click(screen.getByText("Ada Lovelace"));
    expect(screen.getByText("Mocked Student Profile")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    await waitFor(() => expect(getAssignedStudentsMock).toHaveBeenCalledTimes(2));
  });
});
