import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterSheet from "../RegisterSheet";
import type { RegisterData } from "../../../api/officeHours";
import { flushRegisterQueue, pendingRegisters, queueRegister } from "../offlineQueue";

const showToast = vi.fn();
const confirmMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => confirmMock }));

const register = vi.fn();
const saveRegister = vi.fn();
vi.mock("../../../api/officeHours", async (orig) => {
  const actual = await orig<typeof import("../../../api/officeHours")>();
  return {
    ...actual,
    officeHoursApi: {
      register: (...a: unknown[]) => register(...a),
      saveRegister: (...a: unknown[]) => saveRegister(...a),
      registerHistory: () => Promise.resolve({ data: { data: [] } }),
      searchStudents: () => Promise.resolve({ data: { data: [{ student_id: 9, first_name: "Walk", last_name: "In", registration_number: null, class_group_id: 5, class_group_name: "S4" }] } }),
    },
  };
});

const row = (id: number, first: string, over: Record<string, unknown> = {}) => ({
  student_id: id,
  assignment_id: 100 + id,
  is_drop_in: false,
  status: null,
  excuse_reason: null,
  arrived_at: null,
  note: null,
  outcome: null,
  follow_up: false,
  source: "TEACHER",
  marked_at: null,
  first_name: first,
  last_name: "Test",
  registration_number: null,
  class_group_name: "S4 MPC",
  notice: null,
  ...over,
});

const data = (over: Partial<RegisterData> = {}): RegisterData => ({
  session: {
    session_id: 7,
    schedule_id: 3,
    session_date: "2026-03-02",
    start_time: "16:20",
    end_time: "17:20",
    host_teacher_id: 1,
    host_name: "Ms A",
    location: "B4",
    status: "SCHEDULED",
    cancel_reason: null,
    cancel_note: null,
    topic: null,
    title: "Maths support",
    teacher_id: 1,
    subject_id: null,
    state: "running",
    expected: 3,
    marked: 0,
    attended: 0,
    version: 4,
    register_saved_by_name: null,
    register_last_saved_at: null,
  },
  roster: [row(1, "Aline"), row(2, "Bruno", { notice: { reason: "SICK", note: "Clinic" } }), row(3, "Chantal")] as any,
  can_edit: true,
  window: { opens_at: "16:05", not_yet: false, closed: false, last_edit_day: "2026-03-09" },
  late_after_minutes: 10,
  excuse_reasons: ["SICK", "OTHER"],
  ...over,
});

describe("office-hours register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    register.mockResolvedValue({ data: { data: data() } });
    saveRegister.mockImplementation((_id: number, body: any) =>
      Promise.resolve({ data: { data: data({ session: { ...data().session, status: "HELD", version: 5 }, roster: data().roster.map((r: any) => ({ ...r, ...(body.records.find((x: any) => x.student_id === r.student_id) ?? {}) })) as any }) } }),
    );
  });

  it("marks everyone present, then one exception by keyboard, and saves only what changed", async () => {
    const onSaved = vi.fn();
    render(<RegisterSheet sessionId={7} onClose={() => {}} onSaved={onSaved} />);
    await screen.findByText("Aline Test");
    expect(screen.getByText(/Said they can't come: Sick — “Clinic”/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark all present" }));
    expect(screen.getByText("3 present")).toBeInTheDocument();

    // Focus Bruno's row and press 3 (Absent).
    const bruno = screen.getByRole("listitem", { name: /Bruno Test/ });
    bruno.focus();
    fireEvent.keyDown(bruno, { key: "3" });
    expect(within(screen.getByRole("radiogroup", { name: "Attendance for Bruno Test" })).getByRole("radio", { name: /Absent/ })).toHaveAttribute("aria-checked", "true");

    // Late asks for an arrival time.
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Attendance for Chantal Test" })).getByRole("radio", { name: /Late/ }));
    expect(screen.getByLabelText("Arrived")).toBeInTheDocument();

    fireEvent.keyDown(bruno, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(saveRegister).toHaveBeenCalled());
    const [, body] = saveRegister.mock.calls[0];
    expect(body.version).toBe(4);
    expect(body.records.map((r: any) => [r.student_id, r.status])).toEqual([
      [1, "PRESENT"],
      [2, "ABSENT"],
      [3, "LATE"],
    ]);
    expect(body.records[2].arrived_at).toMatch(/^\d{2}:\d{2}$/);
    expect(onSaved).toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("offers to mark unmarked students absent before saving", async () => {
    confirmMock.mockResolvedValue(true);
    render(<RegisterSheet sessionId={7} onClose={() => {}} />);
    await screen.findByText("Aline Test");
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Attendance for Aline Test" })).getByRole("radio", { name: /Present/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save register" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: "2 students are not marked" })));
    const [, body] = saveRegister.mock.calls[0];
    expect(body.records.map((r: any) => r.status)).toEqual(["PRESENT", "ABSENT", "ABSENT"]);
  });

  it("explains a clash and keeps the teacher's marks on reload", async () => {
    saveRegister.mockRejectedValueOnce({ response: { status: 409, data: { message: "changed", errors: [{ code: "REGISTER_CHANGED", version: 5 }] } } });
    render(<RegisterSheet sessionId={7} onClose={() => {}} />);
    await screen.findByText("Aline Test");
    await userEvent.click(screen.getByRole("button", { name: "Mark all present" }));
    await userEvent.click(screen.getByRole("button", { name: "Save register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else saved this register");
    register.mockResolvedValueOnce({ data: { data: data({ session: { ...data().session, version: 5 }, roster: [row(1, "Aline", { status: "ABSENT" }), row(2, "Bruno"), row(3, "Chantal")] as any }) } });
    await userEvent.click(screen.getByRole("button", { name: "Load their marks, keep mine" }));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    // Mine (PRESENT) wins over theirs (ABSENT) for Aline.
    expect(within(screen.getByRole("radiogroup", { name: "Attendance for Aline Test" })).getByRole("radio", { name: /Present/ })).toHaveAttribute("aria-checked", "true");
  });

  it("is read-only outside the window and says why", async () => {
    register.mockResolvedValue({ data: { data: data({ can_edit: false, window: { opens_at: "16:05", not_yet: false, closed: true, last_edit_day: "2026-03-09" } }) } });
    render(<RegisterSheet sessionId={7} onClose={() => {}} />);
    expect(await screen.findByText(/Registers can be changed until/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all present" })).toBeNull();
    expect(within(screen.getByRole("radiogroup", { name: "Attendance for Aline Test" })).getByRole("radio", { name: /Present/ })).toBeDisabled();
  });

  it("adds a walk-in as a present drop-in", async () => {
    render(<RegisterSheet sessionId={7} onClose={() => {}} />);
    await screen.findByText("Aline Test");
    await userEvent.type(screen.getByLabelText("Add a student who came"), "Wa");
    await userEvent.click(await screen.findByRole("button", { name: /Walk In/ }));
    expect(screen.getByText("Drop-in")).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Attendance for Walk In" })).getByRole("radio", { name: /Absent/ })).toBeDisabled();
  });
});

describe("offline register queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("keeps one pending save per session and sends it when back online", async () => {
    await queueRegister(7, { records: [{ student_id: 1, status: "ABSENT" }], version: 4 });
    await queueRegister(7, { records: [{ student_id: 1, status: "PRESENT" }], version: 4 });
    expect(pendingRegisters()).toHaveLength(1);
    saveRegister.mockResolvedValueOnce({ data: { data: {} } });
    expect(await flushRegisterQueue()).toEqual({ sent: 1, conflicts: 0 });
    expect(saveRegister).toHaveBeenCalledWith(7, { records: [{ student_id: 1, status: "PRESENT" }], version: 4 });
    expect(pendingRegisters()).toHaveLength(0);
  });

  it("keeps a clashing save for the teacher instead of forcing it", async () => {
    await queueRegister(8, { records: [{ student_id: 1, status: "PRESENT" }], version: 1 });
    saveRegister.mockRejectedValueOnce({ response: { status: 409 } });
    expect(await flushRegisterQueue()).toEqual({ sent: 0, conflicts: 1 });
    expect(pendingRegisters()[0].conflict).toBe(true);
    // Still offline: kept as is.
    await queueRegister(9, { records: [{ student_id: 2, status: "LATE" }] });
    saveRegister.mockRejectedValueOnce(new Error("Network Error"));
    await flushRegisterQueue();
    expect(pendingRegisters().map((p) => p.sessionId).sort()).toEqual([8, 9]);
  });
});
