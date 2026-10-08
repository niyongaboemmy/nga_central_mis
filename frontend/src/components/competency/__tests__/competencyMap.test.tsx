import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({ options: vi.fn(), map: vi.fn(), student: vi.fn() }));
vi.mock("../../../api/competency", async (orig) => ({ ...(await orig<object>()), competencyApi: api }));

import CompetencyMap from "../CompetencyMap";

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });
const OPTIONS = {
  oversight: false,
  subjects: [
    { subject_id: 3, name: "Networking", code: "NETW301", criteria: 3, classes: [{ class_group_id: 7, name: "L5 SOD A" }, { class_group_id: 8, name: "L5 SOD B" }] },
    { subject_id: 4, name: "Databases", code: null, criteria: 0, classes: [{ class_group_id: 7, name: "L5 SOD A" }] },
  ],
};
const MAP = {
  subject: { subject_id: 3, name: "Networking", code: "NETW301" },
  class_group: { class_group_id: 7, name: "L5 SOD A" },
  competent_pct: 70,
  outcomes: [
    { competency_id: 1, element_number: 1, title: "Apply networking basics", criteria: [
      { criteria_id: 11, criteria_number: "1.1", description: "Identify network types", elearning_items: 0, tasks: 1, assessed_pct: 100, demonstrated_pct: 50 },
      { criteria_id: 12, criteria_number: "1.2", description: "Draw a topology", elearning_items: 1, tasks: 0, assessed_pct: 50, demonstrated_pct: 50 },
    ] },
    { competency_id: 2, element_number: 2, title: "Configure a router", criteria: [
      { criteria_id: 21, criteria_number: "2.1", description: "Set interface addresses", elearning_items: 0, tasks: 0, assessed_pct: 0, demonstrated_pct: 0 },
    ] },
  ],
  criteria_total: 3,
  criteria_without_evidence: 1,
  students: [
    { user_id: 51, name: "Aline Uwase", states: { 11: "DEMONSTRATED", 12: "DEMONSTRATED", 21: "NOT_COVERED" }, best: { 11: 85, 12: null, 21: null }, outcomes: {}, demonstrated: 2, assessed: 2 },
    { user_id: 52, name: "Eric Mugisha", states: { 11: "COVERED", 12: "NOT_COVERED", 21: "NOT_COVERED" }, best: { 11: 40, 12: null, 21: null }, outcomes: {}, demonstrated: 0, assessed: 1 },
  ],
};

describe("Competency map page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the first class, shows the grid, the gaps, and a student's evidence", async () => {
    api.options.mockReturnValue(ok(OPTIONS));
    api.map.mockReturnValue(ok(MAP));
    api.student.mockReturnValue(ok({
      student: { user_id: 52, name: "Eric Mugisha" }, competent_pct: 70,
      outcomes: [{ competency_id: 1, element_number: 1, title: "Apply networking basics", criteria: [
        { criteria_id: 11, criteria_number: "1.1", description: "Identify network types", state: "COVERED", evidence: [{ kind: "quiz", source: "taskmentor", ref: 9, title: "Network types quiz", score_pct: 40, at: "2026-10-06T09:00:00Z" }] },
        { criteria_id: 12, criteria_number: "1.2", description: "Draw a topology", state: "NOT_COVERED", evidence: [] },
      ] }],
    }));
    render(<MemoryRouter initialEntries={["/competency-map"]}><CompetencyMap /></MemoryRouter>);

    await waitFor(() => expect(api.map).toHaveBeenCalledWith(3, 7));
    expect(await screen.findByTestId("comp-summary")).toHaveTextContent("Criteria with evidence2 of 3");
    expect(screen.getByTestId("comp-summary")).toHaveTextContent("Demonstrated33%"); // 2 of 6 cells
    const rows = screen.getByTestId("comp-rows");
    expect(within(rows).getByRole("button", { name: "Aline Uwase, 1.1: Demonstrated (best 85%)" })).toHaveAttribute("data-state", "DEMONSTRATED");
    expect(within(rows).getByRole("button", { name: "Eric Mugisha, 1.1: Working towards (best 40%)" })).toBeTruthy();
    expect(screen.getByTestId("comp-gaps-list")).toHaveTextContent("2.1 Set interface addresses");

    fireEvent.click(within(rows).getByRole("button", { name: "Eric Mugisha" }));
    const dialog = await screen.findByTestId("comp-student");
    expect(api.student).toHaveBeenCalledWith(52, 3, 7);
    expect(await within(dialog).findByText("Network types quiz")).toBeTruthy();
    expect(dialog).toHaveTextContent("Task Mentor quiz40%2026-10-06");
    expect(dialog).toHaveTextContent("No evidence yet.");
  });

  it("switches class, and explains a subject without learning outcomes", async () => {
    api.options.mockReturnValue(ok(OPTIONS));
    api.map.mockImplementation((s: number, c: number) => ok(s === 4 ? { ...MAP, subject: { subject_id: 4, name: "Databases", code: null }, outcomes: [], criteria_total: 0, criteria_without_evidence: 0 } : { ...MAP, class_group: { class_group_id: c, name: "x" } }));
    render(<MemoryRouter initialEntries={["/competency-map"]}><CompetencyMap /></MemoryRouter>);
    await waitFor(() => expect(api.map).toHaveBeenCalledWith(3, 7));
    await screen.findByTestId("comp-summary");
    fireEvent.change(document.getElementById("comp-class")!, { target: { value: "8" } });
    await waitFor(() => expect(api.map).toHaveBeenLastCalledWith(3, 8));
    fireEvent.change(document.getElementById("comp-subject")!, { target: { value: "4" } });
    await waitFor(() => expect(api.map).toHaveBeenLastCalledWith(4, 7));
    expect(await screen.findByText("No learning outcomes yet")).toBeTruthy();
  });

  it("tells a teacher without classes why the page is empty", async () => {
    api.options.mockReturnValue(ok({ oversight: false, subjects: [] }));
    render(<MemoryRouter initialEntries={["/competency-map"]}><CompetencyMap /></MemoryRouter>);
    expect(await screen.findByText("No classes to show")).toBeTruthy();
    expect(api.map).not.toHaveBeenCalled();
  });
});
