import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScheduleDrawer from "../ScheduleDrawer";
import type { OfficeHoursConfig } from "../../../api/officeHours";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../../api/academics", () => ({
  myAssignedSubjectsApi: { getAll: () => Promise.resolve({ data: { data: [{ subject_id: 3, subject_name: "Mathematics", subject_code: "MAT", grades: [] }] } }) },
}));

const createSchedule = vi.fn();
const publishSchedule = vi.fn();
const candidates = vi.fn();
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return {
    ...actual,
    officeHoursApi: {
      createSchedule: (...a: unknown[]) => createSchedule(...a),
      publishSchedule: (...a: unknown[]) => publishSchedule(...a),
      updateSchedule: vi.fn(),
      candidates: (...a: unknown[]) => candidates(...a),
      assign: vi.fn(),
      requestTransfer: vi.fn(),
    },
  };
});

const config: OfficeHoursConfig = {
  band_start: "16:20",
  band_end: "17:20",
  allowed_window_start: "16:00",
  allowed_window_end: "18:00",
  default_capacity: 15,
  max_capacity: 40,
  roster_cutoff_time: "14:00",
  student_lock_mode: "TERM",
  allow_any_student: false,
  late_after_minutes: 10,
  register_edit_days: 7,
  qr_checkin_enabled: false,
  rate_band_consistent: 90,
  rate_band_watch: 80,
  min_sessions_for_rate: 3,
  purposes: ["ACADEMIC_SUPPORT", "CATCH_UP"],
  reason_codes: ["BELOW_STANDARD"],
  end_reason_codes: ["GOAL_MET"],
  cancel_reasons: ["TEACHER_ABSENT"],
  term: { termId: 4, yearId: 2, name: "Term 1", startYmd: "2026-01-05", endYmd: "2026-06-26" },
  today: "2026-03-02",
  capabilities: { manage_own: true, manage_any: false, view: false, view_self: false, configure: false },
};

const draft = {
  schedule_id: 77,
  academic_year_id: 2,
  academic_term_id: 4,
  teacher_id: 1,
  teacher_name: "Ms A",
  subject_id: 3,
  subject_name: "Mathematics",
  subject_color: null,
  title: "Mathematics support",
  purpose: "ACADEMIC_SUPPORT",
  start_time: "16:20",
  end_time: "17:20",
  location: "B4",
  capacity: 15,
  effective_from: "2026-03-02",
  effective_to: "2026-06-26",
  status: "DRAFT" as const,
  notes: null,
  version: 1,
  days: [1, 3],
  days_label: "Mon, Wed",
  assigned_count: 0,
};

describe("office-hours schedule drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSchedule.mockResolvedValue({ data: { data: { schedule: draft, assignment: null } } });
    publishSchedule.mockResolvedValue({ data: { data: { ...draft, status: "ACTIVE" } } });
    candidates.mockResolvedValue({ data: { data: { students: [], class_groups: [], capacity: 15, assigned_count: 0, lock_mode: "TERM" } } });
  });

  it("needs a weekday, saves a draft on the band, then publishes", async () => {
    const onSaved = vi.fn();
    render(<ScheduleDrawer open onClose={() => {}} config={config} termId={4} initialDay={1} onSaved={onSaved} />);
    // Monday is preselected from the timetable's + button.
    expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Monday" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to students" }));
    expect(screen.getByText("Choose at least one day")).toBeInTheDocument();
    expect(createSchedule).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Monday" }));
    await userEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    await userEvent.type(screen.getByLabelText("Room"), "B4");
    await userEvent.click(screen.getByRole("button", { name: "Continue to students" }));
    await waitFor(() =>
      expect(createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ academic_term_id: 4, days: [1, 3], start_time: "16:20", end_time: "17:20", location: "B4", status: "DRAFT", effective_from: "2026-03-02", effective_to: "2026-06-26" }),
      ),
    );
    expect(await screen.findByText("Choose students · 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Mon, Wed · 16:20–17:20 · B4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(publishSchedule).toHaveBeenCalledWith(77));
    expect(onSaved).toHaveBeenCalledWith(77);
  });

  it("refuses times outside the allowed window before calling the server", async () => {
    render(<ScheduleDrawer open onClose={() => {}} config={config} termId={4} initialDay={2} onSaved={() => {}} />);
    const start = screen.getByLabelText("Starts");
    await userEvent.clear(start);
    await userEvent.type(start, "15:00");
    await userEvent.click(screen.getByRole("button", { name: "Continue to students" }));
    expect(screen.getByText(/must fall between 16:00 and 18:00/)).toBeInTheDocument();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it("offers weekends, with quick choices for the usual sets of days", async () => {
    render(<ScheduleDrawer open onClose={() => {}} config={config} termId={4} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Weekend" }));
    expect(screen.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Continue to students" }));
    await waitFor(() => expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({ days: [6, 7] })));
  });
});
