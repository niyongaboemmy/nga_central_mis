import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({ mine: vi.fn(), report: vi.fn(), cancel: vi.fn(), board: vi.fn(), decide: vi.fn(), suggestions: vi.fn(), assign: vi.fn(), teachers: vi.fn() }));
vi.mock("../../../api/staffCover", async (orig) => ({ ...(await orig<object>()), coverApi: api }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import StaffCover from "../StaffCover";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });

describe("Staff cover page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a teacher reports an absence and sees the lessons they cover", async () => {
    api.mine.mockReturnValue(ok({
      absences: [{ id: 3, from: "2026-10-12", to: "2026-10-12", reason: "sick", note: null, status: "approved", lessons: 3, covered: 2 }],
      covers: [{ id: 9, date: "2026-10-13", start: "08:00", end: "08:40", subject: "Mathematics", className: "S2 A", location: "B3", note: "Worksheet", forTeacher: "Jean K." }],
      canManage: false,
    }));
    api.report.mockReturnValue(ok({ id: 4 }));
    render(<StaffCover />);
    expect(await screen.findByTestId("cv-my-covers")).toHaveTextContent("08:00 · Mathematics · S2 A · B3 (for Jean K.)");
    expect(screen.getByTestId("cv-my-absences")).toHaveTextContent("Sick · Approved · 2/3 covered");
    expect(screen.queryByText("Cover board")).toBeNull();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-21" } });
    fireEvent.change(document.getElementById("cv-reason")!, { target: { value: "training" } });
    fireEvent.click(screen.getByRole("button", { name: "Report absence" }));
    await waitFor(() => expect(api.report).toHaveBeenCalledWith({ from: "2026-10-20", to: "2026-10-21", reason: "training", note: undefined, teacherId: undefined }));
  });

  it("a cover manager approves an absence and assigns a suggested teacher", async () => {
    api.mine.mockReturnValue(ok({ absences: [], covers: [], canManage: true }));
    api.teachers.mockReturnValue(ok([{ id: 7, name: "Grace M." }]));
    api.board.mockReturnValue(ok({
      from: "2026-10-12", to: "2026-10-18", open: 1,
      pending: [{ id: 5, teacherId: 2, teacher: "Jean K.", from: "2026-10-14", to: "2026-10-14", reason: "family", note: null, lessons: 4 }],
      lessons: [{ id: 11, absenceId: 3, date: "2026-10-13", start: "08:00", end: "08:40", subject: "Mathematics", className: "S2 A", location: "B3", status: "open", note: null, absentTeacher: "Alice U.", coverTeacherId: null, coverTeacher: "" }],
    }));
    api.decide.mockReturnValue(ok({ created: 4 }));
    api.suggestions.mockReturnValue(ok([{ teacherId: 7, name: "Grace M.", score: 5, reasons: ["Teaches this subject", "Teaches this class", "No covers this week"] }]));
    api.assign.mockReturnValue(ok({}));
    render(<StaffCover />);
    const pending = await screen.findByTestId("cv-pending");
    expect(pending).toHaveTextContent("Jean K.");
    expect(pending).toHaveTextContent("Family · 4 lessons");
    fireEvent.click(within(pending).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith(5, true));
    const lessons = screen.getByTestId("cv-lessons");
    expect(lessons).toHaveTextContent("1 lesson still need a teacher.");
    fireEvent.click(within(lessons).getByRole("button", { name: "Find cover" }));
    const sug = await screen.findByTestId("cv-suggestions");
    await waitFor(() => expect(sug).toHaveTextContent("Teaches this subject · Teaches this class · No covers this week"));
    fireEvent.click(within(sug).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(11, 7));
    expect(screen.getByText("Record an absence for a teacher")).toBeTruthy();
  });
});
