import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MentoringHub from "../MentoringHub";
import type { AssignedStudent } from "../../../api/mentorship";

const base: AssignedStudent = {
  user_id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
  registration_number: "NGA-2026-00001",
  class_group_name: "Year 2A",
  last_session_date: null,
  days_since_last_session: null,
  wellbeing_status: null,
  follow_up_required: false,
  dishonesty_flagged: false,
  stress_flag: false,
  overdue: true,
  can_log: true,
  new_checkins: 0,
  from_other_year: false,
};
const seenRecently: AssignedStudent = {
  ...base,
  user_id: 2,
  first_name: "Grace",
  last_name: "Hopper",
  registration_number: "NGA-2026-00002",
  class_group_name: "Year 3B",
  last_session_date: "2026-10-05",
  days_since_last_session: 7,
  overdue: false,
};
const wroteToMentor: AssignedStudent = {
  ...seenRecently,
  user_id: 3,
  first_name: "Zed",
  last_name: "Mutoni",
  new_checkins: 2,
};

let roster: AssignedStudent[] = [base];
const getAssignedStudentsMock = vi.fn((_yearId?: number) => Promise.resolve({ data: { data: roster } }));

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getAssignedStudents: (yearId?: number) => getAssignedStudentsMock(yearId),
    },
  };
});

let role = { is_mentor: true, mentee_count: 1, has_mentor: false, new_checkins: 3 };
vi.mock("../../../hooks/useMentorshipRole", () => ({
  useMentorshipRole: () => role,
  refreshMentorshipRole: vi.fn(),
}));
vi.mock("../MentorReportsView", () => ({ default: () => <div>Mocked Reports</div> }));
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 1, selectedYear: { name: "2025-2026" } }),
}));
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 9 } } }) }));
const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));

const renderHub = () =>
  render(
    <MemoryRouter initialEntries={["/my-mentees"]}>
      <Routes>
        <Route path="/my-mentees" element={<MentoringHub />} />
        <Route path="/my-mentees/inbox" element={<p>Inbox page</p>} />
        <Route path="/my-mentees/:id" element={<p>Mentee page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("MentoringHub", () => {
  beforeEach(() => {
    roster = [base];
    role = { is_mentor: true, mentee_count: 1, has_mentor: false, new_checkins: 3 };
    getAssignedStudentsMock.mockClear();
    showToastMock.mockClear();
  });

  it("renders the mentee roster with a 'never met' badge and the due-a-session count", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(screen.getByText("Never met")).toBeInTheDocument();
    const due = screen.getByRole("button", { name: /Due a session/i });
    expect(within(due).getByText("1")).toBeInTheDocument();
    expect(getAssignedStudentsMock).toHaveBeenCalledWith(1);
  });

  it("shows the unread check-in count and opens the inbox page", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    const unread = screen.getByRole("button", { name: /Unread messages/i });
    expect(within(unread).getByText("3")).toBeInTheDocument();
    await userEvent.click(unread);
    expect(await screen.findByText("Inbox page")).toBeInTheDocument();
  });

  it("puts mentees who wrote to the mentor first, then the overdue ones", async () => {
    roster = [seenRecently, base, wroteToMentor];
    renderHub();
    await waitFor(() => expect(screen.getByText("Zed Mutoni")).toBeInTheDocument());
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Zed Mutoni");
    expect(names[0]).toContain("2 new");
    expect(names[1]).toContain("Ada Lovelace");
    expect(names[2]).toContain("Grace Hopper");
  });

  it("filters by search text and by the 'due a session' card", async () => {
    roster = [base, seenRecently];
    renderHub();
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());

    await userEvent.type(screen.getByRole("searchbox", { name: /Search mentees/i }), "3B");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox", { name: /Search mentees/i }));

    await userEvent.click(screen.getByRole("button", { name: /Due a session/i }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("opens a mentee's own page (a real URL) when clicked", async () => {
    renderHub();
    await userEvent.click(await screen.findByText("Ada Lovelace"));
    expect(await screen.findByText("Mentee page")).toBeInTheDocument();
  });

  it("explains when it shows this year's mentees because the selected year has none", async () => {
    roster = [{ ...base, from_other_year: true, academic_year_name: "2026-2027" }];
    renderHub();
    expect(await screen.findByText(/You have no mentees in 2025-2026/)).toBeInTheDocument();
    expect(screen.getByText(/Showing the students you mentor now \(2026-2027\)/)).toBeInTheDocument();
  });

  it("marks a past year's mentee as read-only", async () => {
    roster = [{ ...base, can_log: false, overdue: false }];
    renderHub();
    expect(await screen.findByText("Past year")).toBeInTheDocument();
  });
});
