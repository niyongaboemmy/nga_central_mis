import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import MenteesQuickAccess from "../MenteesQuickAccess";
import type { AssignedStudent } from "../../../api/mentorship";

const mentee = (over: Partial<AssignedStudent>): AssignedStudent => ({
  user_id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
  registration_number: "R1",
  class_group_name: "Year 2A",
  last_session_date: "2026-10-01",
  days_since_last_session: 11,
  wellbeing_status: null,
  follow_up_required: false,
  dishonesty_flagged: false,
  stress_flag: false,
  overdue: false,
  new_checkins: 0,
  ...over,
});

let role: any = { is_mentor: true, mentee_count: 2, has_mentor: false, new_checkins: 3 };
let roster: AssignedStudent[] = [];
const getAssignedStudentsMock = vi.fn(() => Promise.resolve({ data: { data: roster } }));

vi.mock("../../../hooks/useMentorshipRole", () => ({
  useMentorshipRole: () => role,
  refreshMentorshipRole: vi.fn(),
}));
vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return { ...actual, mentorshipApi: { ...actual.mentorshipApi, getAssignedStudents: () => getAssignedStudentsMock() } };
});
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 9 } } }) }));
vi.mock("../../../contexts/AcademicPeriodContext", () => ({ useAcademicPeriod: () => ({ selectedYearId: 4 }) }));

const MenteePage = () => <p>Mentee {useParams().id}</p>;
const renderBar = () =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <MenteesQuickAccess />
      <Routes>
        <Route path="/home" element={<p>Home</p>} />
        <Route path="/my-mentees/inbox" element={<p>Inbox page</p>} />
        <Route path="/my-mentees/:id" element={<MenteePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("MenteesQuickAccess", () => {
  beforeEach(() => {
    role = { is_mentor: true, mentee_count: 2, has_mentor: false, new_checkins: 3 };
    roster = [
      mentee({ user_id: 1, first_name: "Ada", last_name: "Lovelace" }),
      mentee({ user_id: 2, first_name: "Zed", last_name: "Mutoni", new_checkins: 3 }),
    ];
    getAssignedStudentsMock.mockClear();
  });

  it("is not shown to someone who mentors nobody", () => {
    role = { is_mentor: false, mentee_count: 0, has_mentor: true, new_checkins: 0 };
    renderBar();
    expect(screen.queryByRole("button", { name: /My mentees/i })).not.toBeInTheDocument();
  });

  it("shows the unread count on the button", () => {
    renderBar();
    const button = screen.getByRole("button", { name: "My mentees — 3 unread messages" });
    expect(within(button).getByText("3")).toBeInTheDocument();
  });

  it("lists mentees, who wrote first, and opens one from anywhere", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: /My mentees/i }));
    const panel = await screen.findByRole("dialog", { name: "My mentees" });
    await waitFor(() => expect(within(panel).getByText("Zed Mutoni")).toBeInTheDocument());

    const links = within(panel).getAllByRole("link").filter((a) => a.getAttribute("href")?.match(/\/my-mentees\/\d+$/));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/my-mentees/2", "/my-mentees/1"]);
    expect(within(panel).getByText("3 unread")).toBeInTheDocument();

    await user.click(within(panel).getByText("Ada Lovelace"));
    expect(await screen.findByText("Mentee 1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers search once the list is long, and Enter opens the first match", async () => {
    roster = Array.from({ length: 7 }, (_, i) => mentee({ user_id: 10 + i, first_name: `Student${i}`, last_name: "X" }));
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: /My mentees/i }));
    const search = await screen.findByRole("searchbox", { name: "Find a mentee" });
    await waitFor(() => expect(screen.getByText("Student6 X")).toBeInTheDocument());
    await user.type(search, "student4{Enter}");
    expect(await screen.findByText("Mentee 14")).toBeInTheDocument();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    const user = userEvent.setup();
    renderBar();
    const button = screen.getByRole("button", { name: /My mentees/i });
    await user.click(button);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("reaches the inbox from the panel", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: /My mentees/i }));
    await user.click(await screen.findByRole("link", { name: /Check-in inbox/i }));
    expect(await screen.findByText("Inbox page")).toBeInTheDocument();
  });
});
