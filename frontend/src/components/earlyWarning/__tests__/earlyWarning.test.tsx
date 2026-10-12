import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({ list: vi.fn(), student: vi.fn(), addIntervention: vi.fn(), close: vi.fn() }));
vi.mock("../../../api/earlyWarning", async (orig) => ({ ...(await orig<object>()), earlyWarningApi: api }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import EarlyWarning from "../EarlyWarning";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });
const student = {
  studentId: 5, name: "Aline U.", classGroupId: 7, className: "S2 A", level: "at_risk", score: 7,
  reasons: [{ source: "tendo", text: "Missed 6 lessons in the last 2 weeks", points: 3 }, { source: "taskmentor", text: "3 pieces of work missed in the last 2 weeks", points: 2 }],
  asOf: { tendo: "2026-10-07", taskmentor: "2026-10-07" }, openInterventions: 0, nextReview: null,
};
const detail = { ...student, signals: { tendo: { absences_14d: 6 }, taskmentor: { avg_pct_30d: 51.4 } }, officeHoursAbsent30d: 0, interventions: [] };

describe("Early warning page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists students with reasons, filters, opens one and records an action", async () => {
    api.list.mockReturnValue(ok({ students: [student], counts: { at_risk: 1, watch: 0, none: 12, withSignals: 13 }, classes: [{ id: 7, name: "S2 A" }, { id: 8, name: "S2 B" }] }));
    api.student.mockReturnValue(ok(detail));
    api.addIntervention.mockReturnValue(ok({ ...detail, interventions: [{ id: 1, action: "call_parent", notes: "About absences", ownerId: 2, owner: "Grace", reviewDate: "2026-10-20", status: "open", outcome: null, createdAt: "" }] }));
    render(<MemoryRouter initialEntries={["/early-warning"]}><EarlyWarning /></MemoryRouter>);

    expect(await screen.findByTestId("ew-counts")).toHaveTextContent("At risk1");
    const rows = screen.getByTestId("ew-rows");
    expect(rows).toHaveTextContent("Aline U. · S2 A");
    expect(rows).toHaveTextContent("Missed 6 lessons in the last 2 weeks");

    fireEvent.click(screen.getByRole("tab", { name: "At risk" }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ level: "at_risk", classGroupId: null }));

    fireEvent.click(within(rows).getByRole("button"));
    const dialog = await screen.findByTestId("ew-student");
    expect(api.student).toHaveBeenCalledWith(5);
    expect(dialog).toHaveTextContent("Average mark (month)51%");
    fireEvent.change(document.getElementById("ew-action")!, { target: { value: "call_parent" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "About absences" } });
    fireEvent.change(screen.getByLabelText("Review on (optional)"), { target: { value: "2026-10-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record action" }));
    await waitFor(() => expect(api.addIntervention).toHaveBeenCalledWith(5, { action: "call_parent", notes: "About absences", reviewDate: "2026-10-20" }));
    expect(await within(dialog).findByText("About absences", { selector: "p" })).toBeTruthy();
    expect(dialog).toHaveTextContent("Grace · review 2026-10-20");
  });

  it("explains when there's no data yet", async () => {
    api.list.mockReturnValue(ok({ students: [{ ...student, level: "none", reasons: [], asOf: {} }], counts: { at_risk: 0, watch: 0, none: 1, withSignals: 0 }, classes: [] }));
    render(<MemoryRouter><EarlyWarning /></MemoryRouter>);
    expect(await screen.findByText("No data from Tendo or Task Mentor yet")).toBeTruthy();
  });
});
