import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  checkIn: vi.fn(),
  submitCheckIn: vi.fn(),
  report: vi.fn(),
  summary: vi.fn(),
  concerns: vi.fn(),
  concern: vi.fn(),
  act: vi.fn(),
  team: vi.fn(),
}));
vi.mock("../../../api/safeguarding", async (orig) => ({ ...(await orig<object>()), safeguardingApi: api }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

import Wellbeing from "../Wellbeing";
import Safeguarding from "../Safeguarding";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });

describe("Wellbeing (students)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the weekly check-in once both questions are answered", async () => {
    api.checkIn.mockReturnValue(ok({ applies: true, week: "2026-10-05", done: false, checkIn: null }));
    api.submitCheckIn.mockReturnValue(ok({ applies: true, week: "2026-10-05", done: true, checkIn: { mood: 2, safe: 4, wantsTalk: true, at: "x" } }));
    render(<Wellbeing />);
    const send = await screen.findByRole("button", { name: "Send my check-in" });
    expect(send).toBeDisabled();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "How have you been feeling this week?" })).getByRole("radio", { name: /Not good/ }));
    expect(send).toBeDisabled();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Do you feel safe at school?" })).getByRole("radio", { name: "Mostly" }));
    fireEvent.click(screen.getByLabelText("I'd like to talk to someone"));
    fireEvent.click(send);
    await waitFor(() => expect(api.submitCheckIn).toHaveBeenCalledWith({ mood: 2, safe: 4, wantsTalk: true, comment: undefined }));
    expect(await screen.findByTestId("checkin-done")).toHaveTextContent("Done for this week");
    expect(screen.getByText(/a member of staff will find you soon/)).toBeTruthy();
  });

  it("asks for help, and always shows the helplines", async () => {
    api.checkIn.mockReturnValue(ok({ applies: false }));
    api.report.mockReturnValue(Promise.resolve({ data: { success: true } }));
    render(<Wellbeing />);
    const send = await screen.findByRole("button", { name: "Send to the safeguarding team" });
    expect(screen.queryByText("This week's check-in")).toBeNull(); // staff: no check-in
    expect(screen.getByText(/child helpline/)).toHaveTextContent("116");
    fireEvent.click(screen.getByLabelText("I don't feel safe"));
    fireEvent.change(screen.getByLabelText("What is happening?"), { target: { value: "Older students wait for me after school" } });
    fireEvent.click(send);
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({ category: "unsafe", text: "Older students wait for me after school" }));
    expect(await screen.findByTestId("report-sent")).toHaveTextContent("Thank you for telling us");
  });
});

describe("Safeguarding (team)", () => {
  beforeEach(() => vi.clearAllMocks());

  const row = { id: 9, studentId: 5, student: "Aline U.", source: "ai_tutor", category: "self-harm", severity: "high", status: "new", summary: "AI Tutor: the student wrote about self-harm", assignedTo: null, assignee: "", createdAt: "2026-10-07T09:00:00Z", updatedAt: "2026-10-07T09:00:00Z", notes: 0 };
  const concern = { ...row, className: "S2 A", detail: "i want to die", ref: "c1", reportedBy: null, reporter: "", closedAt: null, notes: [], history: [] };

  it("lists concerns, opens one from the notification link, and saves a note with status and assignment", async () => {
    api.concerns.mockReturnValue(ok([row]));
    api.summary.mockReturnValue(ok({ week: "2026-10-05", students: 300, concerns: { open: 1, new: 1, high: 1 }, weeks: [{ week: "2026-10-05", checkIns: 120, mood: 3.8, safe: 4.4, wantsTalk: 3 }] }));
    api.concern.mockReturnValue(ok(concern));
    api.team.mockReturnValue(ok([{ id: 77, name: "Grace Counsellor" }]));
    api.act.mockReturnValue(ok({ ...concern, status: "in_progress", assignedTo: 77, notes: [{ id: 1, action: "note", text: "Met the student", authorId: 77, author: "Grace Counsellor", at: "2026-10-07T10:00:00Z" }] }));
    render(<MemoryRouter initialEntries={["/safeguarding?concern=9"]}><Safeguarding /></MemoryRouter>);

    expect(await screen.findByTestId("sg-summary")).toHaveTextContent("120 / 300");
    const rows = await screen.findByTestId("sg-rows");
    expect(rows).toHaveTextContent("Aline U. · Self-harm");
    expect(rows).toHaveTextContent("Urgent");

    const dialog = await screen.findByTestId("sg-concern");
    expect(dialog).toHaveTextContent("i want to die");
    expect(api.concern).toHaveBeenCalledWith(9);
    fireEvent.change(screen.getByLabelText(/Add a note/), { target: { value: "Met the student" } });
    fireEvent.change(document.getElementById("sg-status")!, { target: { value: "in_progress" } });
    fireEvent.change(document.getElementById("sg-assign")!, { target: { value: "77" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.act).toHaveBeenCalledWith(9, { text: "Met the student", status: "in_progress", assignTo: 77 }));
    expect(await within(dialog).findByText("Met the student")).toBeTruthy();
  });

  it("won't close without a note", async () => {
    api.concerns.mockReturnValue(ok([row]));
    api.summary.mockReturnValue(ok({ week: "2026-10-05", students: 0, concerns: { open: 1, new: 1, high: 1 }, weeks: [] }));
    api.concern.mockReturnValue(ok(concern));
    api.team.mockReturnValue(ok([]));
    render(<MemoryRouter initialEntries={["/safeguarding?concern=9"]}><Safeguarding /></MemoryRouter>);
    const dialog = await screen.findByTestId("sg-concern");
    fireEvent.change(document.getElementById("sg-status")!, { target: { value: "closed" } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(dialog).toHaveTextContent("Add a note saying what was done before closing.");
  });
});
