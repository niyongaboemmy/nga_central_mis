import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CheckInPage, CheckInPanel, checkInUrl } from "../CheckIn";
import AbsenceNoticeButton from "../AbsenceNoticeButton";
import StudentPicker from "../StudentPicker";
import { disciplineReferralUrl } from "../admin/EscalationsTab";

const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));

const api = {
  checkInToken: vi.fn(),
  checkIn: vi.fn(),
  me: vi.fn(),
  sendAbsenceNotice: vi.fn(),
  withdrawAbsenceNotice: vi.fn(),
  candidates: vi.fn(),
  suggestions: vi.fn(),
  assign: vi.fn(),
  requestTransfer: vi.fn(),
};
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return { ...actual, officeHoursApi: new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => (api as any)[k](...a) }) };
});

const session = (over: Record<string, unknown> = {}) => ({
  session_id: 7,
  schedule_id: 3,
  session_date: "2026-03-04",
  start_time: "16:20",
  end_time: "17:20",
  location: "B4",
  title: "Maths support",
  teacher_name: "Ms A",
  state: "upcoming" as const,
  cancel_reason: null,
  status: null,
  arrived_at: null,
  notice: null,
  ...over,
});

describe("office hours phase 6 (frontend)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a rotating QR code and the 6-digit code to the host", async () => {
    api.checkInToken.mockResolvedValue({ data: { data: { token: "7.123.abc", code: "042517", session_id: 7, expires_in: 25, rotates_every: 30 } } });
    render(<CheckInPanel sessionId={7} checkedIn={3} onClose={() => {}} />);
    expect(await screen.findByText("042517")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Check-in QR code" }).innerHTML).toContain("<svg");
    expect(screen.getByText(/3 checked in so far/)).toBeInTheDocument();
    expect(checkInUrl("7.123.abc")).toMatch(/\/office-hours\/checkin\?t=7\.123\.abc$/);
  });

  it("checks a student in straight from a scanned link", async () => {
    api.checkIn.mockResolvedValue({ data: { data: { status: "LATE", already: false, drop_in: false, title: "Maths support" } } });
    render(
      <MemoryRouter initialEntries={["/office-hours/checkin?t=7.123.abc"]}>
        <CheckInPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Checked in — late to Maths support.")).toBeInTheDocument();
    expect(api.checkIn).toHaveBeenCalledWith({ token: "7.123.abc" });
  });

  it("lets a student type the code instead", async () => {
    const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
    api.me.mockResolvedValue({ data: { data: { upcoming: [session({ session_date: today })] } } });
    api.checkIn.mockRejectedValue({ response: { data: { message: "That code has expired or is wrong." } } });
    render(
      <MemoryRouter initialEntries={["/office-hours/checkin"]}>
        <CheckInPage />
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByLabelText("Code on the screen"), "12a3456");
    await userEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(api.checkIn).toHaveBeenCalledWith({ session_id: 7, code: "123456" }));
    expect(await screen.findByText("That code has expired or is wrong.")).toBeInTheDocument();
  });

  it("sends and withdraws an 'I can't come' notice", async () => {
    api.sendAbsenceNotice.mockResolvedValue({ data: {} });
    const onSent = vi.fn();
    const { rerender } = render(<AbsenceNoticeButton session={session()} onSent={onSent} />);
    await userEvent.click(screen.getByRole("button", { name: /I can't come/ }));
    await userEvent.selectOptions(screen.getByLabelText("Why?", { selector: "select" }), "SCHOOL_ACTIVITY");
    await userEvent.type(screen.getByLabelText(/Message/), "Match");
    await userEvent.click(screen.getByRole("button", { name: "Tell my teacher" }));
    await waitFor(() => expect(api.sendAbsenceNotice).toHaveBeenCalledWith(7, "SCHOOL_ACTIVITY", "Match"));
    expect(onSent).toHaveBeenCalled();
    api.withdrawAbsenceNotice.mockResolvedValue({ data: {} });
    rerender(<AbsenceNoticeButton session={session({ notice: { reason: "SCHOOL_ACTIVITY", note: "Match" } })} onSent={onSent} />);
    expect(screen.getByText(/school activity/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "I can come after all" }));
    expect(api.withdrawAbsenceNotice).toHaveBeenCalledWith(7);
  });

  it("lists suggested students with the evidence for each", async () => {
    const base = { registration_number: null, class_group_id: 5, class_group_name: "S4", eligible: true, not_your_student: false, clash_note: null };
    api.candidates.mockResolvedValue({
      data: {
        data: {
          capacity: 10,
          assigned_count: 0,
          lock_mode: "TERM",
          class_groups: [5],
          students: [
            { ...base, student_id: 1, first_name: "Aline", last_name: "U", availability: { status: "FREE" } },
            { ...base, student_id: 2, first_name: "Bruno", last_name: "N", availability: { status: "FREE" } },
          ],
        },
      },
    });
    api.suggestions.mockResolvedValue({
      data: { data: { task_mentor: "ok", students: [{ ...base, student_id: 2, first_name: "Bruno", last_name: "N", score: 5, signals: [{ source: "taskmentor", label: "Task Mentor average 38% (pass 50%)", weight: 3 }] }] } },
    });
    render(<StudentPicker scheduleId={4} reasonCodes={[]} />);
    await screen.findByText("Aline U");
    await userEvent.click(screen.getByRole("tab", { name: "Suggested" }));
    expect(await screen.findByText("Task Mentor average 38% (pass 50%)")).toBeInTheDocument();
    expect(screen.queryByText("Aline U")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Bruno N/ })).toBeEnabled();
  });

  it("builds a prefilled discipline referral for serious escalations", () => {
    const url = disciplineReferralUrl({
      escalation_id: 1,
      student_id: 9,
      assignment_id: 3,
      level: 2,
      trigger_code: "CONSECUTIVE_L2",
      created_at: "",
      acknowledged_at: null,
      acknowledged_by_name: null,
      resolution_note: null,
      notified_user_ids: null,
      student: { student_id: 9, first_name: "Aline", last_name: "U", registration_number: null, class_group_id: 5, class_group_name: "S4" },
      title: "Maths support",
      teacher_id: 2,
      teacher_name: "Ms A",
      last_missed: "2026-03-09",
    })!;
    const u = new URL(url);
    expect(u.pathname).toBe("/discipline/log");
    expect(u.searchParams.get("student_id")).toBe("9");
    expect(u.searchParams.get("class_id")).toBe("5");
    expect(u.searchParams.get("description")).toContain("Maths support with Ms A: kept missing sessions");
  });
});
