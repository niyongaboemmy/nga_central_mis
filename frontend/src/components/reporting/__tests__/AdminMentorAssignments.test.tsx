import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminMentorAssignments from "../AdminMentorAssignments";
import type { MentorAssignmentRecord } from "../../../api/mentorship";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";

const activeAssignment: MentorAssignmentRecord = {
  assignment_id: 1,
  mentor_id: 5,
  mentor_name: "Jean Bosco",
  student_id: 10,
  student_name: "Ada Lovelace",
  academic_year_id: 1,
  academic_year_name: "2025-2026",
  status: "ACTIVE",
  assigned_at: "2026-01-10",
  ended_at: null,
  notes: null,
};

const listAssignmentsMock = vi.fn((_params?: any) =>
  Promise.resolve({ data: { data: [activeAssignment] } }),
);
const getUnassignedStudentsMock = vi.fn((_yearId?: number) =>
  Promise.resolve({
    data: { data: [{ student_id: 20, student_name: "Grace Hopper", class_group_name: "Year 2A" }] },
  }),
);
const endAssignmentMock = vi.fn((_id: number) =>
  Promise.resolve({ data: { data: { assignment_id: 1 } } }),
);
const getConsolidatedReportMock = vi.fn((_params?: any) =>
  Promise.resolve({
    data: {
      data: {
        mentor_name: "Jean Bosco",
        academic_year_id: 1,
        mentees: [{ student_id: 10, name: "Ada Lovelace", date_of_birth: null, scores: [], sessions: [], comments: [], recommend_follow_up: false }],
      },
    },
  }),
);

const searchCandidatesMock = vi.fn((params: any) =>
  Promise.resolve({
    data: {
      data:
        params.role === "mentor"
          ? [
              { user_id: 30, username: "assadou", email: "assadou@nga.ac.rw", first_name: "Assadou", last_name: "Nzigamasabo", user_type: "STAFF", name: "Assadou Nzigamasabo", mentee_count: 2 },
              { user_id: 5, username: "jb", email: "jb@nga.ac.rw", first_name: "Jean", last_name: "Bosco", user_type: "TEACHER", name: "Jean Bosco", mentee_count: 1 },
            ]
          : [
              { user_id: 10, username: "ada", email: null, first_name: "Ada", last_name: "Lovelace", user_type: "STUDENT", name: "Ada Lovelace", registration_number: "R-10", class_group_name: "Year 1A", current_mentor_id: 5, current_mentor_name: "Jean Bosco" },
              { user_id: 11, username: "alan", email: null, first_name: "Alan", last_name: "Turing", user_type: "STUDENT", name: "Alan Turing", registration_number: "R-11", class_group_name: "Year 1A", current_mentor_id: null, current_mentor_name: null },
            ],
    },
  }),
);
const bulkAssignMock = vi.fn((_data: any) =>
  Promise.resolve({ data: { data: { assigned: 1, moved: 1, unchanged: 0, assignment_ids: [7, 8] } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      listAssignments: (params?: any) => listAssignmentsMock(params),
      getUnassignedStudents: (yearId?: number) => getUnassignedStudentsMock(yearId),
      endAssignment: (id: number) => endAssignmentMock(id),
      getConsolidatedReport: (params?: any) => getConsolidatedReportMock(params),
      searchCandidates: (params: any) => searchCandidatesMock(params),
      bulkAssignMentor: (data: any) => bulkAssignMock(data),
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
    years: [{ academic_year_id: 1, name: "2025-2026" }],
    selectedYearId: 1,
  }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

// Ending an assignment now goes through the app's own ConfirmDialog (ConfirmProvider),
// not window.confirm — the test clicks through the real dialog.

describe("AdminMentorAssignments", () => {
  beforeEach(() => {
    listAssignmentsMock.mockClear();
    getUnassignedStudentsMock.mockClear();
    endAssignmentMock.mockClear();
    getConsolidatedReportMock.mockClear();
    downloadMock.mockClear();
    showToastMock.mockClear();
    searchCandidatesMock.mockClear();
    bulkAssignMock.mockClear();
  });

  it("lists active mentor assignments", async () => {
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(screen.getAllByText("Jean Bosco").length).toBeGreaterThan(0));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/1 active assignment/)).toBeInTheDocument();
  });

  it("shows the unassigned-students gap flag and reveals the panel on click", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);

    await waitFor(() => expect(screen.getByText(/1 unassigned/)).toBeInTheDocument());
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();

    await user.click(screen.getByText(/1 unassigned/));
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
  });

  it("ends an assignment after confirming, then refetches the list", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(screen.getAllByText("Jean Bosco").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /^End$/i }));

    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "End assignment" }));

    await waitFor(() => expect(endAssignmentMock).toHaveBeenCalledWith(1));
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalledTimes(2));
  });

  it("downloads a mentor's consolidated report from the searchable download menu", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: /Download Report/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Download Report/i }));
    await user.click(screen.getByRole("button", { name: /Jean Bosco.*\(1\)/i }));

    await waitFor(() =>
      expect(getConsolidatedReportMock).toHaveBeenCalledWith(
        expect.objectContaining({ mentor_id: 5 }),
      ),
    );
    await waitFor(() =>
      expect(downloadMock).toHaveBeenCalledWith(
        expect.objectContaining({ mentor_name: "Jean Bosco" }),
        expect.objectContaining({ generatedBy: "Admin" }),
      ),
    );
  });

  it("opens the Assign Mentor modal", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalled());

    await user.click(screen.getAllByRole("button", { name: /Assign Mentor/i })[0]);
    expect(screen.getByRole("dialog", { name: "Assign Mentor" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search staff/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search students/i)).toBeInTheDocument();
    // The OS autocorrect bubble must not cover the results.
    expect(screen.getByPlaceholderText(/Search staff/i)).toHaveAttribute("spellcheck", "false");
  });

  it("offers non-teacher staff as mentors and assigns, spelling out a student who moves", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: /Assign Mentor/i })[0]);

    // The mentor list opens on focus, without typing, and asks for role=mentor.
    const staffOption = await screen.findByRole("option", { name: /Assadou Nzigamasabo/ });
    expect(searchCandidatesMock).toHaveBeenCalledWith(expect.objectContaining({ role: "mentor", academic_year_id: 1 }));
    expect(staffOption).toHaveTextContent("Staff");
    expect(staffOption).toHaveTextContent("2 mentees");
    await user.click(staffOption);

    // Students: one already mentored by Jean Bosco, one without a mentor.
    const ada = await screen.findByRole("option", { name: /Ada Lovelace/ });
    expect(ada).toHaveTextContent("Mentor: Jean Bosco");
    expect(screen.getByRole("option", { name: /Alan Turing/ })).toHaveTextContent("No mentor");
    await user.click(screen.getByRole("button", { name: "Select all shown" }));

    expect(screen.getByText(/will mentor 2 more students \(1 new, 1 moving\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ada Lovelace \(from Jean Bosco\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assign 2 students" }));
    await waitFor(() =>
      expect(bulkAssignMock).toHaveBeenCalledWith({ mentor_id: 30, student_ids: [10, 11], academic_year_id: 1, reassign: true }),
    );
    expect(showToastMock).toHaveBeenCalledWith(
      "Assadou Nzigamasabo: 1 assigned, 1 moved from their previous mentor",
      "success",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not let a student already with the chosen mentor be re-assigned", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Change mentor/i }));

    // Preloaded with Ada; choosing her current mentor changes nothing.
    await user.click(await screen.findByRole("option", { name: /Jean Bosco/ }));
    expect(screen.getByText(/already mentored by Jean Bosco — skipped/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose students" })).toBeDisabled();
  });

  it("opens the modal pre-filled from an unassigned student", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(screen.getByText(/1 unassigned/)).toBeInTheDocument());
    await user.click(screen.getByText(/1 unassigned/));
    await user.click(screen.getByRole("button", { name: /Grace Hopper/ }));

    const dialog = screen.getByRole("dialog", { name: "Assign Mentor" });
    expect(dialog).toHaveTextContent("Grace Hopper");
    expect(screen.getByRole("button", { name: "Remove Grace Hopper" })).toBeInTheDocument();
  });

  it("filters the assignment table", async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><AdminMentorAssignments /></ConfirmProvider>);
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Filter assignments"), "zzz");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText(/No assignment matches/)).toBeInTheDocument();
  });
});
