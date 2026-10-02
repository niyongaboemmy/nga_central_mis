import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentPicker from "../StudentPicker";
import type { CandidatesResponse } from "../../../api/officeHours";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));

const candidates = vi.fn();
const assign = vi.fn();
const requestTransfer = vi.fn();
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return {
    ...actual,
    officeHoursApi: {
      candidates: (...a: unknown[]) => candidates(...a),
      assign: (...a: unknown[]) => assign(...a),
      requestTransfer: (...a: unknown[]) => requestTransfer(...a),
    },
  };
});

const response = (over: Partial<CandidatesResponse> = {}): { data: { data: CandidatesResponse } } => ({
  data: {
    data: {
      capacity: 3,
      assigned_count: 1,
      lock_mode: "TERM",
      class_groups: [5],
      students: [
        { student_id: 1, first_name: "Aline", last_name: "Uwase", registration_number: "R1", class_group_id: 5, class_group_name: "S4 MPC", availability: { status: "FREE" }, eligible: true, not_your_student: false, clash_note: null },
        { student_id: 2, first_name: "Bruno", last_name: "Mugisha", registration_number: "R2", class_group_id: 5, class_group_name: "S4 MPC", availability: { status: "FREE" }, eligible: true, not_your_student: false, clash_note: "Football on Mon 16:20-17:20" },
        {
          student_id: 3,
          first_name: "Chantal",
          last_name: "Iradukunda",
          registration_number: "R3",
          class_group_id: 5,
          class_group_name: "S4 MPC",
          availability: { status: "HELD_BY_OTHER", holders: [{ assignment_id: 70, schedule_id: 8, title: "Physics clinic", teacher_id: 44, teacher_name: "Mr Habimana", days: [2], days_label: "Tue" }] },
          eligible: true,
          not_your_student: false,
          clash_note: null,
        },
        { student_id: 4, first_name: "David", last_name: "Nkusi", registration_number: "R4", class_group_id: 5, class_group_name: "S4 MPC", availability: { status: "WITH_YOU", assignment_id: 71 }, eligible: true, not_your_student: false, clash_note: null },
      ],
      ...over,
    },
  },
});

describe("office-hours student picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    candidates.mockResolvedValue(response());
  });

  it("only lets free students be ticked, and shows who holds the others", async () => {
    render(<StudentPicker scheduleId={12} reasonCodes={["BELOW_STANDARD"]} />);
    await screen.findByText("Aline Uwase");
    expect(screen.getByRole("checkbox", { name: /Aline Uwase/ })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Chantal Iradukunda/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /David Nkusi/ })).toBeDisabled();
    expect(screen.getByText("With Mr Habimana · Tue")).toBeInTheDocument();
    expect(screen.getByText("With you")).toBeInTheDocument();
    expect(screen.getByLabelText("Also scheduled: Football on Mon 16:20-17:20")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 places used")).toBeInTheDocument();
  });

  it("caps the selection at the places left and reports conflicts the server found", async () => {
    assign.mockResolvedValue({
      data: {
        data: {
          assigned: [{ student_id: 1, assignment_id: 90, effective_from: "2026-03-02", clash_note: null }],
          conflicts: [{ student_id: 2, holders: [{ assignment_id: 91, schedule_id: 9, title: "Biology", teacher_id: 45, teacher_name: "Ms Kamikazi", days: [3], days_label: "Wed" }] }],
          already_assigned: [],
          ineligible: [],
          over_capacity: [],
          no_remaining_sessions: false,
        },
      },
    });
    const onAssigned = vi.fn();
    render(<StudentPicker scheduleId={12} reasonCodes={["BELOW_STANDARD"]} onAssigned={onAssigned} />);
    await screen.findByText("Aline Uwase");
    await userEvent.click(screen.getByRole("button", { name: /Select all free/ }));
    expect(screen.getByRole("checkbox", { name: /Aline Uwase/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Bruno Mugisha/ })).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText(/Why these students/), "BELOW_STANDARD");
    await userEvent.click(screen.getByRole("button", { name: "Assign 2 students" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(12, { student_ids: [1, 2], reason_code: "BELOW_STANDARD", reason_note: undefined }));
    expect(onAssigned).toHaveBeenCalled();
    const report = await screen.findByText("Not everyone could be added");
    expect(within(report.parentElement!).getByText(/Bruno Mugisha already has office hours with Ms Kamikazi \(Wed\)/)).toBeInTheDocument();
  });

  it("asks the holding teacher for a transfer", async () => {
    requestTransfer.mockResolvedValue({ data: { data: { request_id: 5 } } });
    render(<StudentPicker scheduleId={12} reasonCodes={[]} />);
    await screen.findByText("Chantal Iradukunda");
    await userEvent.click(screen.getByRole("button", { name: /Ask to transfer/ }));
    await userEvent.type(screen.getByLabelText(/Message/), "Needs physics help");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(requestTransfer).toHaveBeenCalledWith({ student_id: 3, to_schedule_id: 12, message: "Needs physics help" }));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Mr Habimana"), "success");
  });
});
