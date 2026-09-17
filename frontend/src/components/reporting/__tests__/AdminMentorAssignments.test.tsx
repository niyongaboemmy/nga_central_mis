import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminMentorAssignments from "../AdminMentorAssignments";
import type { MentorAssignmentRecord } from "../../../api/mentorship";

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

// window.confirm is used before ending an assignment
vi.stubGlobal("confirm", vi.fn(() => true));

describe("AdminMentorAssignments", () => {
  beforeEach(() => {
    listAssignmentsMock.mockClear();
    getUnassignedStudentsMock.mockClear();
    endAssignmentMock.mockClear();
    getConsolidatedReportMock.mockClear();
    downloadMock.mockClear();
    showToastMock.mockClear();
  });

  it("lists active mentor assignments", async () => {
    render(<AdminMentorAssignments />);
    await waitFor(() => expect(screen.getAllByText("Jean Bosco").length).toBeGreaterThan(0));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/1 active assignment/)).toBeInTheDocument();
  });

  it("shows the unassigned-students gap flag and reveals the panel on click", async () => {
    const user = userEvent.setup();
    render(<AdminMentorAssignments />);

    await waitFor(() => expect(screen.getByText(/1 unassigned/)).toBeInTheDocument());
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();

    await user.click(screen.getByText(/1 unassigned/));
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
  });

  it("ends an assignment after confirming, then refetches the list", async () => {
    const user = userEvent.setup();
    render(<AdminMentorAssignments />);
    await waitFor(() => expect(screen.getAllByText("Jean Bosco").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /End/i }));

    await waitFor(() => expect(endAssignmentMock).toHaveBeenCalledWith(1));
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalledTimes(2));
  });

  it("downloads a mentor's consolidated report from the searchable download menu", async () => {
    const user = userEvent.setup();
    render(<AdminMentorAssignments />);
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
    render(<AdminMentorAssignments />);
    await waitFor(() => expect(listAssignmentsMock).toHaveBeenCalled());

    await user.click(screen.getAllByRole("button", { name: /Assign Mentor/i })[0]);
    expect(screen.getByPlaceholderText(/Search teacher/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search student/i)).toBeInTheDocument();
  });
});
