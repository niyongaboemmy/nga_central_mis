import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscalationsTab from "../admin/EscalationsTab";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));

const escalations = vi.fn();
const acknowledgeEscalation = vi.fn();
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return {
    ...actual,
    officeHoursApi: {
      escalations: (...a: unknown[]) => escalations(...a),
      acknowledgeEscalation: (...a: unknown[]) => acknowledgeEscalation(...a),
    },
  };
});

const row = (over: Record<string, unknown> = {}) => ({
  escalation_id: 4,
  student_id: 9,
  assignment_id: 3,
  level: 2,
  trigger_code: "RATE_BELOW",
  created_at: "2026-03-09T16:40:00Z",
  acknowledged_at: null,
  acknowledged_by_name: null,
  resolution_note: null,
  notified_user_ids: "[9,2,5]",
  student: { student_id: 9, first_name: "Aline", last_name: "Uwase", registration_number: null, class_group_id: 5, class_group_name: "S4 MPC" },
  title: "Maths support",
  teacher_id: 2,
  teacher_name: "Ms A",
  last_missed: "2026-03-09",
  ...over,
});

describe("office-hours escalations tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    escalations.mockResolvedValue({ data: { data: [row(), row({ escalation_id: 5, level: 1, trigger_code: "CONSECUTIVE_L1", acknowledged_at: "2026-03-10", acknowledged_by_name: "Mr Head", resolution_note: "Met family" })] } });
    acknowledgeEscalation.mockResolvedValue({ data: {} });
  });

  it("explains each escalation and records a follow-up", async () => {
    render(<EscalationsTab termId={4} />);
    expect(await screen.findByText(/Attendance below the watch threshold — Maths support with Ms A/)).toBeInTheDocument();
    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(screen.getByText(/Followed up by Mr Head: “Met family”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark followed up" }));
    await userEvent.type(screen.getByLabelText(/What was done/), "Called home");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(acknowledgeEscalation).toHaveBeenCalledWith(4, "Called home"));
    expect(escalations).toHaveBeenCalledTimes(2);
  });

  it("switches between open and all", async () => {
    render(<EscalationsTab termId={4} />);
    await screen.findByText("Level 2");
    await userEvent.selectOptions(screen.getByLabelText("Show", { selector: "select" }), "all");
    await waitFor(() => expect(escalations).toHaveBeenLastCalledWith({ term_id: 4, status: "all" }));
  });
});
